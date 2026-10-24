"""Find and verify missing GTIN barcodes through an authorized HTTPS provider."""

import argparse
import csv
import json
import os
import time
from datetime import datetime, timezone
from urllib.parse import urlencode
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from enrichment_common import REPORT_DIR, backup_table, close_connection, connect, require_provider


def valid_gtin(value: str) -> bool:
    digits = str(value).strip()
    if len(digits) not in {8, 12, 13, 14} or not digits.isdigit():
        return False
    total = 0
    for index, digit in enumerate(reversed(digits)):
        total += int(digit) * (3 if index % 2 else 1)
    return total % 10 == 0


def fetch(provider: str, product: dict, timeout: int) -> list[dict]:
    params = urlencode({key: product.get(key) or "" for key in ("name", "brand", "category")})
    request = Request(f"{provider}?{params}", headers={
        "Accept": "application/json",
        "User-Agent": "NutraScore/1.0 (barcode verification)",
    })
    token = os.environ.get("NUTRASCORE_ENRICHMENT_API_KEY")
    if token:
        request.add_header("Authorization", f"Bearer {token}")
    with urlopen(request, timeout=timeout) as response:
        payload = json.load(response)
    return payload if isinstance(payload, list) else payload.get("results", [])


def fetch_open_food_facts(product: dict, timeout: int) -> list[dict]:
    terms = " ".join(filter(None, [product["brand"], product["name"]]))
    params = urlencode({
        "search_terms": terms,
        "search_simple": "1",
        "action": "process",
        "fields": "code,product_name,brands,url",
        "page_size": "10",
        "json": "1",
    })
    request = Request(
        f"https://world.openfoodfacts.org/cgi/search.pl?{params}",
        headers={"Accept": "application/json", "User-Agent": "NutraScore/1.0 (contact required)"},
    )
    for attempt in range(3):
        try:
            with urlopen(request, timeout=timeout) as response:
                return json.load(response).get("products", [])
        except (HTTPError, URLError) as error:
            status = getattr(error, "code", None)
            if attempt == 2 or (status is not None and status not in {429, 500, 502, 503, 504}):
                raise RuntimeError(f"Open Food Facts lookup failed: {status or error}") from error
            time.sleep(min(30, 2 ** (attempt + 1)))


def identity_matches(product: dict, candidate: dict) -> bool:
    name = str(candidate.get("name", "")).casefold()
    brand = str(candidate.get("brand", "")).casefold()
    return bool(name) and product["name"].casefold() in name and (
        not product["brand"] or product["brand"].casefold() in brand
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--provider-url")
    parser.add_argument("--provider", choices=("configured", "openfoodfacts"), default="configured")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--delay", type=float, default=1.0)
    parser.add_argument("--timeout", type=int, default=10)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    connection = connect()
    report = []
    try:
        if not args.dry_run:
            backup_table(connection, '"Products"', "barcode_enrichment_preflight")
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS postgres_db.product_barcode_sources (
              product_id uuid PRIMARY KEY,
              source_name text NOT NULL,
              lookup_date timestamptz NOT NULL,
              matched_name text,
              matched_brand text,
              confidence numeric,
              verification_status text NOT NULL,
              source_url text
            )
            """
        )
        products = connection.execute(
            """
            SELECT p.id, p.name, p.brand,
              string_agg(c.name, ', ' ORDER BY c.name) AS category
            FROM postgres_db."Products" p
            LEFT JOIN postgres_db.product_categories pc ON pc.product_id = p.id
            LEFT JOIN postgres_db.categories c ON c.id = pc.category_id
            WHERE p.barcode IS NULL
            GROUP BY p.id, p.name, p.brand
            ORDER BY p.id
            """
        ).fetchall()
        provider = args.provider_url or os.environ.get("NUTRASCORE_ENRICHMENT_PROVIDER_URL")
        provider_error = None if provider or args.provider == "openfoodfacts" else (
            "No barcode provider configured. Use --provider openfoodfacts or configure an authorized HTTPS provider."
        )

        if not args.dry_run:
            connection.execute("BEGIN TRANSACTION")
        for row in products[:args.limit or None]:
            product = {"id": row[0], "name": row[1], "brand": row[2], "category": row[3]}
            if provider_error:
                report.append({**product, "status": "unmatched", "reason": provider_error})
                continue
            try:
                raw_candidates = (
                    fetch_open_food_facts(product, args.timeout)
                    if args.provider == "openfoodfacts"
                    else fetch(require_provider(provider, "barcode"), product, args.timeout)
                )
                candidates = [
                    {
                        **item,
                        "name": item.get("name") or item.get("product_name"),
                        "brand": item.get("brand") or item.get("brands"),
                        "barcode": item.get("barcode") or item.get("code"),
                        "source_name": item.get("source_name") or (
                            "Open Food Facts" if args.provider == "openfoodfacts" else "configured provider"
                        ),
                        "source_url": item.get("source_url") or item.get("url"),
                    }
                    for item in raw_candidates
                    if identity_matches(product, {
                        **item,
                        "name": item.get("name") or item.get("product_name"),
                        "brand": item.get("brand") or item.get("brands"),
                    })
                ]
                valid = [item for item in candidates if valid_gtin(str(item.get("barcode", "")))]
                if len(valid) != 1:
                    status = "invalid" if candidates and not valid else "ambiguous"
                    report.append({**product, "status": status, "reason": "no unique validated identity match"})
                else:
                    candidate = valid[0]
                    barcode = str(candidate["barcode"]).strip()
                    conflict = connection.execute(
                        'SELECT 1 FROM postgres_db."Products" WHERE barcode = ? AND id <> ?',
                        [barcode, product["id"]],
                    ).fetchone()
                    if conflict:
                        status = "conflicting"
                        report.append({**product, "status": status, "reason": "barcode already belongs to another product"})
                    else:
                        if not args.dry_run:
                            connection.execute(
                            'UPDATE postgres_db."Products" SET barcode = ?, updated_at = now() '
                            'WHERE id = ? AND barcode IS NULL',
                            [barcode, product["id"]],
                        )
                            connection.execute(
                            "INSERT INTO postgres_db.product_barcode_sources "
                            "(product_id, source_name, lookup_date, matched_name, matched_brand, confidence, verification_status, source_url) "
                            "VALUES (?, ?, ?, ?, ?, ?, ?, ?) "
                            "ON CONFLICT (product_id) DO UPDATE SET source_name=excluded.source_name, "
                            "lookup_date=excluded.lookup_date, matched_name=excluded.matched_name, "
                            "matched_brand=excluded.matched_brand, confidence=excluded.confidence, "
                            "verification_status=excluded.verification_status, source_url=excluded.source_url",
                            [product["id"], candidate.get("source_name", "configured provider"),
                             datetime.now(timezone.utc), candidate.get("name"), candidate.get("brand"),
                             float(candidate.get("confidence", 0)), "verified", candidate.get("source_url")],
                        )
                        report.append({**product, "status": "matched", "reason": "dry-run" if args.dry_run else ""})
            except Exception as error:
                report.append({**product, "status": "invalid", "reason": str(error)})
            time.sleep(max(args.delay, 0))
        if not args.dry_run:
            connection.commit()
    finally:
        close_connection(connection)

    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    path = REPORT_DIR / f"barcode_enrichment_{datetime.now().strftime('%Y%m%dT%H%M%S')}.csv"
    with path.open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=["id", "name", "brand", "category", "status", "reason"])
        writer.writeheader()
        writer.writerows(report)
    print(f"Processed: {len(report)}; matched: {sum(r['status'] == 'matched' for r in report)}")
    print(f"Report: {path}")


if __name__ == "__main__":
    main()
