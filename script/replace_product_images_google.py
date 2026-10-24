"""Replace existing NutraScore product images using Google Images in a browser.

The script is dry-run by default. It never selects products without a usable
ProductImages.image_url and updates an existing image row through the
authenticated moderator API when --write is supplied.

Examples (PowerShell):
    python script/replace_product_images_google.py --limit 5 --headed
    python script/replace_product_images_google.py --limit 5 --headed --write
    python script/replace_product_images_google.py --max-products 100 --write

For a repeatable run, use --storage-state with a Playwright storage-state JSON
created from an already authenticated moderator browser session. The
headed --login option can bootstrap that file through the existing login page.
The script does not accept or print passwords.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, quote_plus, unquote, urlparse

import psycopg
from dotenv import load_dotenv
from playwright.sync_api import BrowserContext, Page, TimeoutError as PlaywrightTimeoutError, sync_playwright


ROOT = Path(__file__).resolve().parents[1]
REPORT_DIR = ROOT / "data" / "reports"
DEFAULT_API_URL = "http://localhost:3000"
DEFAULT_WEB_URL = "http://localhost:5173"
MAX_CANDIDATES = 5
IMAGE_TIMEOUT_MS = 20_000


class GoogleAccessBlocked(RuntimeError):
    """Google returned a consent, CAPTCHA, or access-block page."""


def load_config() -> tuple[str, str, str]:
    load_dotenv(ROOT / ".env")
    load_dotenv(ROOT / "apps" / "api" / ".env", override=True)
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL not found in .env or apps/api/.env")
    api_url = os.getenv("PUBLIC_API_URL", DEFAULT_API_URL).rstrip("/")
    api_url = re.sub(r"/api$", "", api_url)
    web_url = os.getenv("WEB_ORIGIN", DEFAULT_WEB_URL).rstrip("/")
    return database_url, api_url, web_url


def usable_image_row(conn: psycopg.Connection[Any], product_id: str) -> tuple[str, str] | None:
    row = conn.execute(
        """
        SELECT image.id::text, image.image_url
        FROM public."ProductImages" AS image
        LEFT JOIN public.product_image_reviews AS review
          ON review.product_id = image.product_id
        WHERE image.product_id = %s
          AND image.image_url IS NOT NULL
          AND btrim(image.image_url) <> ''
          AND review.review_status IS DISTINCT FROM 'needs_review'
        ORDER BY image.is_primary DESC, image.id
        LIMIT 1
        """,
        (product_id,),
    ).fetchone()
    return (str(row[0]), row[1]) if row else None


def get_products(conn: psycopg.Connection[Any], limit: int | None) -> list[dict[str, str]]:
    query = """
        SELECT p.id::text, p.name, COALESCE(p.brand, '') AS brand
        FROM public."Products" AS p
        WHERE EXISTS (
            SELECT 1
            FROM public."ProductImages" AS i
            LEFT JOIN public.product_image_reviews AS review
              ON review.product_id = i.product_id
            WHERE i.product_id = p.id
              AND i.image_url IS NOT NULL
              AND btrim(i.image_url) <> ''
              AND review.review_status IS DISTINCT FROM 'needs_review'
        )
        ORDER BY p.id
    """
    params: tuple[int, ...] = ()
    if limit is not None:
        query += " LIMIT %s"
        params = (limit,)
    return [
        {"id": str(row[0]), "name": row[1] or "", "brand": row[2] or ""}
        for row in conn.execute(query, params).fetchall()
    ]


def count_needs_review_products(conn: psycopg.Connection[Any]) -> int:
    row = conn.execute(
        """
        SELECT COUNT(*)::int
        FROM public."Products" AS p
        WHERE EXISTS (
            SELECT 1
            FROM public."ProductImages" AS i
            WHERE i.product_id = p.id
              AND i.image_url IS NOT NULL
              AND btrim(i.image_url) <> ''
        )
        AND EXISTS (
            SELECT 1
            FROM public.product_image_reviews AS review
            WHERE review.product_id = p.id
              AND review.review_status = 'needs_review'
        )
        """
    ).fetchone()
    return int(row[0]) if row else 0


def query_text(product: dict[str, str]) -> str:
    return " ".join(part.strip() for part in (product["brand"], product["name"]) if part.strip())


def words(value: str) -> set[str]:
    return {word.lower() for word in re.findall(r"[a-z0-9]+", value.lower()) if len(word) > 2}


def candidate_score(product: dict[str, str], metadata: str) -> int:
    query_words = words(query_text(product))
    metadata_words = words(metadata)
    score = len(query_words & metadata_words)
    if product["brand"] and words(product["brand"]) & metadata_words:
        score += 3
    packaging_terms = {"pack", "bottle", "box", "packet", "product", "jar", "can", "pouch"}
    if packaging_terms & metadata_words:
        score += 1
    return score




ALLOWED_RETAILER_DOMAINS = (
    "amazon.in",
    "blinkit.com",
    "bigbasket.com",
    "flipkart.com",
)


def is_allowed_retailer_url(url: str) -> bool:
    """Return True only for URLs hosted on an approved retailer domain."""
    try:
        parsed = urlparse(url)
        hostname = (parsed.hostname or "").lower().rstrip(".")
        return (
            parsed.scheme in {"http", "https"}
            and any(
                hostname == domain or hostname.endswith("." + domain)
                for domain in ALLOWED_RETAILER_DOMAINS
            )
        )
    except (TypeError, ValueError):
        return False


def bing_candidates(page: Page, product: dict[str, str]) -> list[dict[str, str]]:
    query = query_text(product)

    # Ask Bing Images to prioritize results from approved retailer domains.
    domain_query = " OR ".join(
        f"site:{domain}" for domain in ALLOWED_RETAILER_DOMAINS
    )
    search_query = f"{query} ({domain_query})"

    page.goto(
        "https://www.bing.com/images/search?q=" + quote_plus(search_query),
        wait_until="domcontentloaded",
        timeout=IMAGE_TIMEOUT_MS,
    )

    try:
        page.locator("a.iusc[m]").first.wait_for(
            state="attached", timeout=8000
        )
    except PlaywrightTimeoutError:
        page.wait_for_timeout(1200)

    if any(
        marker in page.url.lower()
        for marker in ("captcha", "challenge")
    ):
        raise GoogleAccessBlocked(f"Bing blocked the search: {page.url}")

    tiles = page.locator("a.iusc[m]").evaluate_all(
        """els => els.map(a => {
            let m = {};
            try {
                m = JSON.parse(a.getAttribute("m") || "{}");
            } catch (_) {}
            return {
                m,
                text: a.innerText || "",
                alt: a.querySelector("img")?.alt || ""
            };
        })"""
    )

    print(f"Bing image result tiles found: {len(tiles)}")

    candidates = []
    seen = set()

    for tile in tiles:
        metadata = tile.get("m") or {}
        image_url = metadata.get("murl") or ""
        source_url = metadata.get("purl") or ""

        # The product page, not merely the image host, must be an approved retailer.
        if not is_allowed_retailer_url(source_url):
            continue

        if not image_url or image_url in seen:
            continue

        parsed_image = urlparse(image_url)
        if parsed_image.scheme not in {"http", "https"} or not parsed_image.netloc:
            continue

        seen.add(image_url)

        description = " ".join([
            str(metadata.get("t") or ""),
            str(metadata.get("desc") or ""),
            tile.get("text", ""),
            tile.get("alt", ""),
        ])

        score = candidate_score(product, description)

        candidates.append({
            "image_url": image_url,
            "source_url": source_url,
            "metadata": description,
            "score": str(score),
        })

        if len(candidates) >= MAX_CANDIDATES:
            break

    print(f"Approved retailer candidates: {len(candidates)}")
    return candidates




def verify_candidate(
    context: BrowserContext,
    candidate: dict[str, str],
    product: dict[str, str],
) -> tuple[bool, str]:
    image_page = context.new_page()
    try:
        response = image_page.goto(
            candidate["image_url"],
            wait_until="commit",
            timeout=IMAGE_TIMEOUT_MS,
        )
        if response is None:
            return False, "Image tab returned no response"
        if not response.ok:
            return False, f"Image URL returned HTTP {response.status}"
        content_type = (response.headers.get("content-type") or "").lower()
        if not content_type.startswith("image/"):
            return False, f"Image tab returned non-image content type: {content_type}"
        image_page.wait_for_timeout(500)
        if not image_page.locator("img").count() and not image_page.locator("svg").count():
            return False, "Image tab did not render an image element"
        if int(candidate["score"]) < 1:
            return False, "Google result metadata did not match the product query"
        return True, f"Rendered {content_type}; metadata score {candidate['score']}"
    except PlaywrightTimeoutError:
        return False, "Timed out opening image in a new tab"
    except Exception as exc:
        return False, str(exc)[:240]
    finally:
        image_page.close()


def authenticated_api_update(
    app_page: Page,
    api_url: str,
    product_id: str,
    image_url: str,
    source_url: str,
) -> dict[str, Any]:
    result = app_page.evaluate(
        """async ({ apiUrl, productId, imageUrl, sourceUrl }) => {
            const csrfResponse = await fetch(`${apiUrl}/api/auth/csrf`, {
                credentials: 'include'
            });
            if (!csrfResponse.ok) {
                throw new Error(`CSRF initialization failed with HTTP ${csrfResponse.status}`);
            }
            const { csrfToken } = await csrfResponse.json();
            const response = await fetch(`${apiUrl}/api/moderator/products/${encodeURIComponent(productId)}/image`, {
                method: 'PUT',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrfToken
                },
                body: JSON.stringify({
                    imageUrl,
                    sourceUrl,
                    reviewStatus: 'needs_review'
                })
            });
            const body = await response.text();
            let parsed;
            try { parsed = JSON.parse(body); } catch { parsed = { message: body }; }
            if (!response.ok) {
                throw new Error(parsed.message || parsed.error || `Image update failed with HTTP ${response.status}`);
            }
            return parsed;
        }""",
        {"apiUrl": api_url, "productId": product_id, "imageUrl": image_url, "sourceUrl": source_url},
    )
    return result


def save_candidate(
    write: bool,
    app_page: Page,
    api_url: str,
    product_id: str,
    image_url: str,
    source_url: str,
) -> bool:
    if not write:
        return False
    authenticated_api_update(app_page, api_url, product_id, image_url, source_url)
    return True


def ensure_moderator_session(
    app_page: Page,
    api_url: str,
    web_url: str,
    interactive_login: bool,
) -> None:
    app_page.goto(web_url + "/profile", wait_until="domcontentloaded", timeout=IMAGE_TIMEOUT_MS)
    
    def current_user() -> dict[str, Any] | None:
        return app_page.evaluate(
            """async apiUrl => {
            const response = await fetch(`${apiUrl}/api/auth/me`, { credentials: 'include' });
            if (!response.ok) return null;
            return (await response.json()).user;
        }""",
            api_url,
        )

    user = current_user()
    if interactive_login and (not user or user.get("role") != "moderator"):
        app_page.goto(web_url + "/login", wait_until="domcontentloaded", timeout=IMAGE_TIMEOUT_MS)
        print(f"Complete moderator login in the headed browser at {web_url}/login.")
        deadline = time.monotonic() + 180
        while time.monotonic() < deadline:
            user = current_user()
            if user and user.get("role") == "moderator":
                break
            app_page.wait_for_timeout(2000)
    if not user or user.get("role") != "moderator":
        raise RuntimeError(
            "Authenticated moderator session not found. Log in at "
            f"{web_url}/login, save the browser storage state, and pass --storage-state."
        )


def main() -> None:
    parser = argparse.ArgumentParser(description="Replace existing product images from Google Images.")
    parser.add_argument("--limit", type=int, help="Small test limit; defaults to all eligible products.")
    parser.add_argument("--max-products", type=int, help="Maximum eligible products to process.")
    parser.add_argument("--delay", type=float, default=2.0, help="Delay between products.")
    parser.add_argument("--write", action="store_true", help="Persist replacements through the moderator API.")
    parser.add_argument("--headed", action="store_true", help="Show the browser.")
    parser.add_argument("--storage-state", type=Path, help="Playwright storage-state JSON for the moderator session.")
    parser.add_argument("--save-storage-state", type=Path, help="Save the authenticated browser state after startup.")
    parser.add_argument("--login", action="store_true", help="Open the existing login page and wait for interactive moderator login.")
    parser.add_argument("--resume-report", type=Path, help="Skip product IDs already present in this CSV report.")
    parser.add_argument("--retry-failed", action="store_true", help="Retry failed products when resuming a report.")
    args = parser.parse_args()
    if args.limit is not None and args.limit < 1:
        parser.error("--limit must be positive")
    if args.max_products is not None and args.max_products < 1:
        parser.error("--max-products must be positive")
    if args.delay < 0:
        parser.error("--delay cannot be negative")
    if args.write and args.storage_state is None and not args.login:
        parser.error("--write requires --storage-state or --login; do not pass credentials to this script")

    database_url, api_url, web_url = load_config()
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    report_path = args.resume_report or REPORT_DIR / (
        "google_image_replacements_" + datetime.now().strftime("%Y%m%dT%H%M%S") + ".csv"
    )
    processed: set[str] = set()
    if args.resume_report and args.resume_report.exists():
        with args.resume_report.open(newline="", encoding="utf-8-sig") as handle:
            processed = {
                row["product_id"]
                for row in csv.DictReader(handle)
                if row.get("status") in {"saved", "dry_run_valid"}
                or (row.get("status") == "failed" and not args.retry_failed)
            }

    with psycopg.connect(database_url) as conn:
        products = get_products(conn, args.max_products)
        skipped_needs_review = count_needs_review_products(conn)
        if args.limit is not None:
            products = products[: args.limit]
        products = [product for product in products if product["id"] not in processed]
        print(f"Eligible existing-image products: {len(products)}")
        print(f"Skipped needs_review: {skipped_needs_review}")
        print(f"Mode: {'WRITE via authenticated moderator API' if args.write else 'DRY RUN'}")
        print(f"Report: {report_path}")

        fields = [
            "product_id", "product_name", "brand", "original_image_url",
            "candidate_url", "saved_url", "status", "failure_reason",
        ]
        existing_report = report_path.exists() and report_path.stat().st_size > 0
        with report_path.open("a", newline="", encoding="utf-8-sig") as handle:
            writer = csv.DictWriter(handle, fieldnames=fields)
            if not existing_report:
                writer.writeheader()
            with sync_playwright() as playwright:
                browser = playwright.chromium.launch(headless=not args.headed)
                context_args: dict[str, Any] = {}
                if args.storage_state:
                    context_args["storage_state"] = str(args.storage_state)
                context = browser.new_context(**context_args)
                search_page = context.new_page()
                app_page = context.new_page()
                try:
                    if args.write or args.storage_state or args.save_storage_state or args.login:
                        ensure_moderator_session(app_page, api_url, web_url, args.login)
                    if args.save_storage_state:
                        context.storage_state(path=str(args.save_storage_state))
                    for index, product in enumerate(products, start=1):
                        row = {
                            "product_id": product["id"],
                            "product_name": product["name"],
                            "brand": product["brand"],
                            "original_image_url": "",
                            "candidate_url": "",
                            "saved_url": "",
                            "status": "failed",
                            "failure_reason": "",
                        }
                        print(f"[{index}/{len(products)}] {query_text(product)}")
                        try:
                            image_row = usable_image_row(conn, product["id"])
                            if not image_row:
                                row["status"] = "skipped"
                                row["failure_reason"] = "No usable image at processing time"
                                writer.writerow(row)
                                handle.flush()
                                continue
                            row["original_image_url"] = image_row[1]
                            candidates = bing_candidates(search_page, product)
                            if not candidates:
                                raise RuntimeError("Google Images exposed no direct image candidates")
                            failures: list[str] = []
                            for candidate in candidates:
                                row["candidate_url"] = candidate["image_url"]
                                valid, reason = verify_candidate(context, candidate, product)
                                if not valid:
                                    failures.append(reason)
                                    continue
                                if save_candidate(
                                    args.write,
                                    app_page,
                                    api_url,
                                    product["id"],
                                    candidate["image_url"],
                                    candidate["source_url"],
                                ):
                                    row["saved_url"] = candidate["image_url"]
                                    row["status"] = "saved"
                                else:
                                    row["status"] = "dry_run_valid"
                                    row["saved_url"] = candidate["image_url"]
                                break
                            if row["status"] == "failed":
                                row["failure_reason"] = "; ".join(failures) or "All candidates failed validation"
                        except GoogleAccessBlocked as exc:
                            row["failure_reason"] = str(exc)[:500]
                            writer.writerow(row)
                            handle.flush()
                            print(f"    STOPPED: {row['failure_reason']}")
                            break
                        except Exception as exc:
                            row["failure_reason"] = str(exc)[:500]
                        writer.writerow(row)
                        handle.flush()
                        print(f"    {row['status']}: {row['failure_reason'] or row['saved_url']}")
                        time.sleep(args.delay)
                finally:
                    search_page.close()
                    app_page.close()
                    context.close()
                    browser.close()


if __name__ == "__main__":
    main()
