"""Synchronize CSV-owned price and per-serving nutrition on matched products."""

import argparse
import csv
from datetime import datetime
from decimal import Decimal, InvalidOperation
import re
from pathlib import Path
from typing import TypedDict
import unicodedata

import psycopg


ROOT_DIR = Path(__file__).resolve().parents[1]
CSV_PATH = ROOT_DIR / "data" / "processed" / "packaged_foods_india_cleaned.csv"
ENV_PATH = ROOT_DIR / "apps" / "api" / ".env"
REPORT_DIR = ROOT_DIR / "data" / "reports"

NUMERIC_FIELDS = {
    "Calories_kcal": "kcal_per_100g",
    "Total_Fat_g": "fat_g",
    "Saturated_Fat_g": "saturated_fat_g",
    "Trans_Fat_g": "trans_fat_g",
    "Carbohydrates_g": "carbohydrates_g",
    "Sugar_g": "sugars_g",
    "Dietary_Fiber_g": "fibre_g",
    "Proteins_g": "protein_g",
    "Sodium_mg": "sodium_mg",
    "Cholesterol_mg": "cholesterol_mg",
    "Calcium_mg": "calcium_mg",
    "Iron_mg": "iron_mg",
}
REQUIRED_COLUMNS = {
    "Item name",
    "Brand_Name",
    "Serving_Size_g",
    "Price_INR",
    "Vitamin",
    *NUMERIC_FIELDS,
}
NUTRITION_COLUMNS = tuple(NUMERIC_FIELDS.values()) + (
    "salt_g",
    "vitamins",
    "serving_size",
    "serving_unit",
    "nutrition_basis",
)
NUTRITION_SELECT = ", ".join(NUTRITION_COLUMNS)


class ExistingProduct(TypedDict):
    id: str
    name: str
    brand: str | None


class ProductMatch(TypedDict):
    source_row: str
    source_serial: str
    item_name: str
    brand: str
    price_inr: str
    serving_size_g: str
    status: str
    product_id: str
    matched_name: str
    reason: str
    csv: dict[str, str]
    product: ExistingProduct | None


def normalize(value: object) -> str:
    text = unicodedata.normalize("NFKD", str(value or "")).casefold()
    text = "".join(char for char in text if not unicodedata.combining(char))
    return " ".join(re.findall(r"[a-z0-9]+", text))


def product_key(name: object, brand: object) -> tuple[str, str]:
    return normalize(name), normalize(brand)


def parse_numeric(value: object, *, positive: bool = False) -> Decimal | None:
    if value is None or not str(value).strip():
        return None
    try:
        number = Decimal(str(value).strip())
    except InvalidOperation:
        return None
    if not number.is_finite() or number < 0 or (positive and number == 0):
        return None
    return number


def clean_text(value: object) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return None if not text or text.casefold() in {"nan", "none", "null", "n/a"} else text


def read_database_url() -> str:
    if not ENV_PATH.is_file():
        raise FileNotFoundError(f"Environment file not found: {ENV_PATH}")
    for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        if key.strip() == "DATABASE_URL":
            database_url = value.strip().strip("\"'")
            if database_url:
                return database_url
    raise ValueError(f"DATABASE_URL is missing from {ENV_PATH}")


def load_csv() -> list[dict[str, str]]:
    if not CSV_PATH.is_file():
        raise FileNotFoundError(f"CSV file not found: {CSV_PATH}")
    with CSV_PATH.open(encoding="utf-8-sig", newline="") as source:
        reader = csv.DictReader(source)
        missing = REQUIRED_COLUMNS - set(reader.fieldnames or ())
        if missing:
            raise ValueError(f"CSV is missing required columns: {', '.join(sorted(missing))}")
        rows = []
        for row_number, row in enumerate(reader, start=2):
            row["_row_number"] = str(row_number)
            rows.append(row)
    return rows


def match_products(
    csv_rows: list[dict[str, str]],
    products: list[ExistingProduct],
) -> list[ProductMatch]:
    csv_by_key: dict[tuple[str, str], list[dict[str, str]]] = {}
    products_by_key: dict[tuple[str, str], list[ExistingProduct]] = {}
    for row in csv_rows:
        csv_by_key.setdefault(product_key(row.get("Item name"), row.get("Brand_Name")), []).append(row)
    for product in products:
        products_by_key.setdefault(product_key(product["name"], product["brand"]), []).append(product)

    report: list[ProductMatch] = []
    for row in csv_rows:
        key = product_key(row.get("Item name"), row.get("Brand_Name"))
        row_group = csv_by_key[key]
        candidates = products_by_key.get(key, [])
        if not candidates:
            status, reason, match = "unmatched", "No existing product has this normalized name and brand.", None
        elif len(row_group) != 1 or len(candidates) != 1:
            status = "ambiguous"
            reason = (
                f"{len(row_group)} CSV rows and {len(candidates)} existing products share this name and brand."
            )
            match = None
        else:
            status, reason, match = "matched", "Unique normalized name-and-brand match.", candidates[0]

        report.append({
            "source_row": row["_row_number"],
            "source_serial": row.get("S.No", ""),
            "item_name": row.get("Item name", ""),
            "brand": row.get("Brand_Name", ""),
            "price_inr": row.get("Price_INR", ""),
            "serving_size_g": row.get("Serving_Size_g", ""),
            "status": status,
            "product_id": match["id"] if match else "",
            "matched_name": match["name"] if match else "",
            "reason": reason,
            "csv": row,
            "product": match,
        })
    return report


def write_report(report: list[dict[str, object]]) -> Path:
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    report_path = REPORT_DIR / f"product_csv_sync_{datetime.now().strftime('%Y%m%d_%H%M%S_%f')}.csv"
    fields = (
        "source_row",
        "source_serial",
        "item_name",
        "brand",
        "price_inr",
        "serving_size_g",
        "status",
        "product_id",
        "matched_name",
        "reason",
    )
    with report_path.open("x", encoding="utf-8", newline="") as output:
        writer = csv.DictWriter(output, fieldnames=fields)
        writer.writeheader()
        writer.writerows({field: row[field] for field in fields} for row in report)
    return report_path


def validate_schema(connection: psycopg.Connection) -> None:
    required = {
        "Products": {"id", "name", "brand", "price_inr", *NUTRITION_COLUMNS},
    }
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT table_name, column_name
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'Products'
            """
        )
        actual: dict[str, set[str]] = {}
        for table, column in cursor.fetchall():
            actual.setdefault(table, set()).add(column)
    missing = [
        f"{table}.{column}"
        for table, columns in required.items()
        for column in sorted(columns - actual.get(table, set()))
    ]
    if missing:
        raise RuntimeError(f"Required PostgreSQL columns are missing: {', '.join(missing)}")


def fetch_products(connection: psycopg.Connection) -> list[ExistingProduct]:
    with connection.cursor() as cursor:
        cursor.execute('SELECT id::text AS id, name, brand FROM "Products"')
        return [
            {"id": product_id, "name": name, "brand": brand}
            for product_id, name, brand in cursor.fetchall()
        ]


def current_nutrition(connection: psycopg.Connection, product_id: str) -> dict[str, object] | None:
    with connection.cursor() as cursor:
        cursor.execute(
            f"""
            SELECT {NUTRITION_SELECT}
            FROM "Products"
            WHERE id = %s::uuid
            FOR UPDATE
            """,
            (product_id,),
        )
        row = cursor.fetchone()
    return dict(zip(NUTRITION_COLUMNS, row)) if row else None


def serving_amounts(
    row: dict[str, str],
    existing: dict[str, object],
    source_basis: str | None,
) -> tuple[dict[str, object] | None, str | None]:
    basis = existing["nutrition_basis"]
    if basis not in {"per_100g", "per_serving"}:
        return None, f"Unsupported existing nutrition basis: {basis!r}"
    if source_basis not in {"per_100g", "per_serving"}:
        return None, "CSV nutrition basis is unspecified; no nutrition values were changed."
    if source_basis != basis:
        return None, f"CSV basis {source_basis} differs from existing basis {basis}; no conversion was attempted."

    values: dict[str, object] = {}
    for csv_column, database_column in NUMERIC_FIELDS.items():
        source_value = parse_numeric(row.get(csv_column))
        values[database_column] = (
            source_value if source_value is not None else existing[database_column]
        )
    values["salt_g"] = existing["salt_g"]
    values["vitamins"] = clean_text(row.get("Vitamin")) or existing["vitamins"]
    serving_size = parse_numeric(row.get("Serving_Size_g"), positive=True)
    values["serving_size"] = serving_size if serving_size is not None else existing["serving_size"]
    values["serving_unit"] = "g" if serving_size is not None else existing["serving_unit"]
    values["nutrition_basis"] = source_basis
    return values, None


def synchronize(
    connection: psycopg.Connection,
    report: list[ProductMatch],
    source_basis: str,
) -> dict[str, int]:
    counts = {
        "updated_products": 0,
        "prices_populated": 0,
        "prices_corrected": 0,
        "serving_sizes_populated": 0,
        "serving_sizes_corrected": 0,
        "nutrition_rows_updated": 0,
        "nutrition_rows_skipped": 0,
    }
    with connection.transaction():
        for match in report:
            if match["status"] != "matched":
                continue
            row = match["csv"]
            product_id = match["product_id"]
            product = match["product"]
            if product is None:
                raise RuntimeError(f"Matched CSV row {match['source_row']} has no product record.")
            source_price = parse_numeric(row.get("Price_INR"))
            with connection.cursor() as cursor:
                cursor.execute(
                    'SELECT price_inr FROM "Products" WHERE id = %s::uuid FOR UPDATE',
                    (product_id,),
                )
                existing_price_row = cursor.fetchone()
            if existing_price_row is None:
                raise RuntimeError(f"Matched product {product_id} disappeared during synchronization.")
            old_price = existing_price_row[0]
            product_changed = False
            if source_price is not None and source_price != old_price:
                with connection.cursor() as cursor:
                    cursor.execute(
                        'UPDATE "Products" SET price_inr = %s WHERE id = %s::uuid',
                        (source_price, product_id),
                    )
                product_changed = True
                if old_price is None:
                    counts["prices_populated"] += 1
                else:
                    counts["prices_corrected"] += 1

            existing = current_nutrition(connection, product_id)
            if existing is None:
                counts["nutrition_rows_skipped"] += 1
                if product_changed:
                    counts["updated_products"] += 1
                continue

            new_values, reason = serving_amounts(row, existing, source_basis)
            if new_values is None:
                counts["nutrition_rows_skipped"] += 1
                print(f"Nutrition skipped for {product['name']} ({product_id}): {reason}")
                if product_changed:
                    counts["updated_products"] += 1
                continue

            old_serving = parse_numeric(existing["serving_size"], positive=True)
            old_unit = str(existing["serving_unit"] or "").strip().casefold()
            if old_serving is None:
                counts["serving_sizes_populated"] += 1
            elif old_serving != new_values["serving_size"] or old_unit != "g":
                counts["serving_sizes_corrected"] += 1

            changes = {
                column: value
                for column, value in new_values.items()
                if value != existing[column]
            }
            if changes:
                columns = ", ".join(f'"{column}" = %s' for column in changes)
                with connection.cursor() as cursor:
                    cursor.execute(
                        f'UPDATE "Products" SET {columns} WHERE id = %s::uuid',
                        (*changes.values(), product_id),
                    )
                product_changed = True
                counts["nutrition_rows_updated"] += 1

            if product_changed:
                counts["updated_products"] += 1
    return counts


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Apply updates. Without this option, only report matches and planned changes.",
    )
    parser.add_argument(
        "--nutrition-basis",
        choices=("per_serving", "per_100g"),
        help="Verified basis of the CSV nutrient amounts; required with --apply.",
    )
    args = parser.parse_args()

    if args.apply and args.nutrition_basis is None:
        parser.error(
            "the CSV has no nutrition-basis column; provide an explicitly "
            "verified --nutrition-basis before applying"
        )

    rows = load_csv()
    with psycopg.connect(read_database_url()) as connection:
        validate_schema(connection)
        report = match_products(rows, fetch_products(connection))
        report_path = write_report(report)
        counts: dict[str, int] = {}
        if args.apply:
            counts = synchronize(connection, report, args.nutrition_basis)

    status_counts = {
        status: sum(row["status"] == status for row in report)
        for status in ("matched", "ambiguous", "unmatched")
    }
    print(f"CSV rows: {len(rows)}")
    print(f"Nutrition basis: {args.nutrition_basis or 'unspecified (nutrition updates will be skipped)'}")
    print(
        "Matching: "
        + ", ".join(f"{status}={count}" for status, count in status_counts.items())
    )
    print(f"Match report: {report_path}")
    if args.apply:
        print("Synchronization: " + ", ".join(f"{key}={value}" for key, value in counts.items()))
    else:
        print("Dry run only; no database rows were changed. Re-run with --apply to synchronize.")


if __name__ == "__main__":
    main()
