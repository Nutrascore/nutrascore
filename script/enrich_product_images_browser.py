
"""Enrich missing NutraScore product images using Google/Bing image search.

Dry-run by default. Use --write to save validated results.

Examples:
    python script/enrich_product_images_browser.py --limit 5
    python script/enrich_product_images_browser.py --limit 5 --write
    python script/enrich_product_images_browser.py --limit 50 --write
"""

import argparse
import csv
import os
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qs, quote_plus, urlparse

import psycopg
from psycopg import sql
from dotenv import load_dotenv
from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
REPORT_DIR = ROOT / "data" / "reports"

IMAGE_TABLE = "ProductImages"
SOURCE_TABLE = "product_image_sources"
MAX_CANDIDATES = 3


def load_config():
    load_dotenv(ROOT / ".env")
    load_dotenv(ROOT / "apps" / "api" / ".env", override=True)

    url = os.getenv("DATABASE_URL")
    if not url:
        raise RuntimeError(
            "DATABASE_URL not found in .env or apps/api/.env"
        )
    return url


def get_columns(conn, table):
    rows = conn.execute(
        """
        SELECT column_name, is_nullable, column_default, data_type
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = %s
        ORDER BY ordinal_position
        """,
        (table,),
    ).fetchall()

    if not rows:
        raise RuntimeError(f"Table public.{table} not found")

    return {
        row[0]: {
            "nullable": row[1] == "YES",
            "default": row[2],
            "type": row[3],
        }
        for row in rows
    }


def insert_dynamic(conn, table, schema, values):
    """Insert supported fields and reject unknown required fields."""
    chosen = {
        key: value
        for key, value in values.items()
        if key in schema
    }

    for name, info in schema.items():
        if (
            name not in chosen
            and not info["nullable"]
            and info["default"] is None
        ):
            if name == "id":
                chosen[name] = str(uuid.uuid4())
            elif name in ("created_at", "updated_at"):
                chosen[name] = datetime.now(timezone.utc)
            else:
                raise RuntimeError(
                    f"Cannot safely populate required column "
                    f"{table}.{name}. Inspect the schema."
                )

    names = list(chosen)
    query = sql.SQL("INSERT INTO {} ({}) VALUES ({})").format(
        sql.Identifier("public", table),
        sql.SQL(", ").join(sql.Identifier(n) for n in names),
        sql.SQL(", ").join(sql.Placeholder() for _ in names),
    )
    conn.execute(query, [chosen[n] for n in names])


def extract_google(page, query):
    """Return image candidates exposed by Google Images."""
    url = "https://www.google.com/search?udm=2&q=" + quote_plus(query)

    try:
        page.goto(url, wait_until="domcontentloaded", timeout=20000)
        page.wait_for_timeout(1200)

        hrefs = page.locator("a").evaluate_all(
            """els => els.map(a => a.href)
                .filter(h => h.includes('imgurl='))"""
        )

        candidates = []
        seen = set()

        for href in hrefs:
            params = parse_qs(urlparse(href).query)
            image_url = (params.get("imgurl") or [None])[0]
            source_url = (params.get("imgrefurl") or [None])[0]

            if image_url and source_url and image_url not in seen:
                seen.add(image_url)
                candidates.append(
                    (image_url, source_url, "Google Images")
                )

        return candidates

    except Exception as exc:
        print(f"    Google search failed: {str(exc)[:160]}")
        return []


def extract_bing(page, query):
    """Return image candidates exposed by Bing Images."""
    url = "https://www.bing.com/images/search?q=" + quote_plus(query)

    try:
        page.goto(url, wait_until="domcontentloaded", timeout=20000)
        page.wait_for_timeout(1500)

        results = page.locator("a.iusc").evaluate_all(
            """els => els.map(a => {
                try {
                    const m = JSON.parse(a.getAttribute('m') || '{}');
                    return {image: m.murl, source: m.purl};
                } catch {
                    return null;
                }
            }).filter(x => x && x.image && x.source)"""
        )

        candidates = []
        seen = set()

        for result in results:
            image_url = result["image"]
            if image_url not in seen:
                seen.add(image_url)
                candidates.append(
                    (image_url, result["source"], "Bing Images")
                )

        return candidates

    except Exception as exc:
        print(f"    Bing search failed: {str(exc)[:160]}")
        return []


def get_candidates(page, query):
    """Collect up to five distinct candidates, Google first then Bing."""
    candidates = []
    seen = set()

    for candidate in (
        extract_google(page, query) + extract_bing(page, query)
    ):
        image_url = candidate[0]
        if image_url in seen:
            continue

        seen.add(image_url)
        candidates.append(candidate)

        if len(candidates) >= MAX_CANDIDATES:
            break

    return candidates


def validate_image(page, image_url):
    """Verify HTTPS and whether the URL returns an image response."""
    parsed = urlparse(image_url)

    if parsed.scheme != "https" or not parsed.hostname:
        return False, "URL is not HTTPS"

    try:
        response = page.goto(
            image_url,
            wait_until="commit",
            timeout=15000,
        )

        if response is None:
            return False, "No HTTP response"

        if not response.ok:
            return False, f"HTTP {response.status}"

        content_type = response.headers.get(
            "content-type", ""
        ).lower()

        if not content_type.startswith("image/"):
            return False, f"Not an image: {content_type}"

        return True, "Image response validated"

    except Exception as exc:
        return False, str(exc)[:180]


def product_has_image(conn, product_id):
    """Treat a non-empty image URL as an existing image."""
    return conn.execute(
        """
        SELECT EXISTS (
            SELECT 1
            FROM public."ProductImages"
            WHERE product_id = %s
              AND image_url IS NOT NULL
              AND btrim(image_url) <> ''
        )
        """,
        (product_id,),
    ).fetchone()[0]


def save_image(conn, image_schema, source_schema, product, candidate):
    """Save image and provenance atomically, skipping existing images."""
    image_url, source_url, provider = candidate

    with conn.transaction():
        # Recheck immediately before writing to avoid overwriting/duplicating
        # an image added since the product was selected.
        if product_has_image(conn, product["id"]):
            return False

        image_values = {
            "product_id": product["id"],
            "image_url": image_url,
            "image_type": "product",
            "is_primary": True,
        }

        source_values = {
            "product_id": product["id"],
            "source_name": provider,
            "source_url": source_url,
            "match_confidence": 1.0,
            "verified_at": datetime.now(timezone.utc),
            "license_metadata": None,
        }

        insert_dynamic(
            conn, IMAGE_TABLE, image_schema, image_values
        )
        insert_dynamic(
            conn, SOURCE_TABLE, source_schema, source_values
        )

    return True


def main():
    parser = argparse.ArgumentParser(
        description="Find and validate missing product images."
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=5,
        help="Maximum number of products to attempt.",
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=1.5,
        help="Delay between products in seconds.",
    )
    parser.add_argument(
        "--write",
        action="store_true",
        help="Write validated results to PostgreSQL.",
    )
    args = parser.parse_args()

    if args.limit < 1:
        parser.error("--limit must be at least 1")
    if args.delay < 0:
        parser.error("--delay cannot be negative")

    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    report_path = REPORT_DIR / (
        "browser_image_enrichment_"
        + datetime.now().strftime("%Y%m%dT%H%M%S")
        + ".csv"
    )

    with psycopg.connect(load_config()) as conn:
        image_schema = get_columns(conn, IMAGE_TABLE)
        source_schema = get_columns(conn, SOURCE_TABLE)

        # Only select products without a usable image URL.
        products = conn.execute(
            """
            SELECT p.id, p.name, p.brand
            FROM public."Products" AS p
            WHERE NOT EXISTS (
                SELECT 1
                FROM public."ProductImages" AS i
                WHERE i.product_id = p.id
                  AND i.image_url IS NOT NULL
                  AND btrim(i.image_url) <> ''
            )
            ORDER BY p.id
            LIMIT %s
            """,
            (args.limit,),
        ).fetchall()

        before = conn.execute(
            'SELECT count(*) FROM public."ProductImages"'
        ).fetchone()[0]

        print(f"Products to attempt: {len(products)}")
        print(f"Existing image rows: {before}")
        print(f"Mode: {'WRITE' if args.write else 'DRY RUN'}")
        print(f"Max candidates per product: {MAX_CANDIDATES}")
        print("Products with an existing non-empty image URL will be skipped.")

        fields = [
            "product_id", "product_name", "brand", "provider",
            "image_url", "source_url", "result", "details",
        ]
        counts = {
            "saved": 0,
            "dry_run_valid": 0,
            "failed": 0,
            "skipped": 0,
        }

        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            context = browser.new_context(
                user_agent=(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/131.0.0.0 Safari/537.36"
                )
            )

            search_page = context.new_page()
            image_page = context.new_page()

            try:
                with report_path.open(
                    "w", newline="", encoding="utf-8-sig"
                ) as handle:
                    writer = csv.DictWriter(
                        handle, fieldnames=fields
                    )
                    writer.writeheader()

                    for index, (product_id, name, brand) in enumerate(
                        products, start=1
                    ):
                        product = {
                            "id": product_id,
                            "name": name or "",
                            "brand": brand or "",
                        }

                        query = " ".join(
                            part.strip()
                            for part in (
                                product["brand"], product["name"]
                            )
                            if part and part.strip()
                        )

                        row = {
                            "product_id": str(product_id),
                            "product_name": product["name"],
                            "brand": product["brand"],
                            "provider": "",
                            "image_url": "",
                            "source_url": "",
                            "result": "failed",
                            "details": "",
                        }

                        print(f"\n[{index}/{len(products)}] {query}")

                        try:
                            # Extra safety check before doing browser searches.
                            if product_has_image(conn, product_id):
                                row["result"] = "skipped"
                                row["details"] = (
                                    "Product already has a non-empty image URL"
                                )
                                counts["skipped"] += 1
                                writer.writerow(row)
                                handle.flush()
                                print("    Skipped: image already exists")
                                continue

                            candidates = get_candidates(
                                search_page, query
                            )

                            if not candidates:
                                row["details"] = (
                                    "No candidates extracted from Google or Bing"
                                )
                            else:
                                print(
                                    f"    Candidates found: {len(candidates)}"
                                )
                                failures = []

                                for attempt, candidate in enumerate(
                                    candidates, start=1
                                ):
                                    image_url, source_url, provider = candidate
                                    print(
                                        f"    Trying candidate "
                                        f"{attempt}/{len(candidates)} "
                                        f"({provider})"
                                    )

                                    valid, reason = validate_image(
                                        image_page, image_url
                                    )

                                    if not valid:
                                        print(f"      Rejected: {reason}")
                                        failures.append(
                                            f"#{attempt}: {reason}"
                                        )
                                        continue

                                    row.update({
                                        "provider": provider,
                                        "image_url": image_url,
                                        "source_url": source_url,
                                    })

                                    if args.write:
                                        saved = save_image(
                                            conn,
                                            image_schema,
                                            source_schema,
                                            product,
                                            candidate,
                                        )

                                        if not saved:
                                            row["result"] = "skipped"
                                            row["details"] = (
                                                "An image was added while "
                                                "this product was being processed"
                                            )
                                            counts["skipped"] += 1
                                            print(
                                                "      Skipped: image now exists"
                                            )
                                        else:
                                            row["result"] = "saved"
                                            row["details"] = (
                                                f"Candidate {attempt} passed "
                                                "HTTP image validation"
                                            )
                                            counts["saved"] += 1
                                            print(f"      Accepted: {reason}")
                                    else:
                                        row["result"] = "dry_run_valid"
                                        row["details"] = (
                                            f"Candidate {attempt} passed "
                                            "validation; dry run only"
                                        )
                                        counts["dry_run_valid"] += 1
                                        print(f"      Accepted: {reason}")

                                    break

                                if row["result"] == "failed":
                                    row["details"] = (
                                        "All candidates failed: "
                                        + "; ".join(failures)
                                    )

                        except Exception as exc:
                            row["result"] = "failed"
                            row["details"] = str(exc)[:500]
                            print(f"    Error: {row['details']}")

                        if row["result"] == "failed":
                            counts["failed"] += 1

                        writer.writerow(row)
                        handle.flush()
                        print(f"    Result: {row['result']}")
                        time.sleep(args.delay)

            finally:
                search_page.close()
                image_page.close()
                browser.close()

        after = conn.execute(
            'SELECT count(*) FROM public."ProductImages"'
        ).fetchone()[0]

        print("\nFinished")
        print(f"Image rows before: {before}")
        print(f"Image rows after:  {after}")
        print(f"New image rows:    {after - before}")
        print(f"Saved:             {counts['saved']}")
        print(f"Dry-run valid:     {counts['dry_run_valid']}")
        print(f"Skipped:           {counts['skipped']}")
        print(f"Failed:            {counts['failed']}")
        print(f"Report: {report_path}")


if __name__ == "__main__":
    main()
