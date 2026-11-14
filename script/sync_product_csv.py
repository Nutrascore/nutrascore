"""Synchronize CSV-owned price and per-serving nutrition on matched products."""

import argparse
import csv
from datetime import datetime
from decimal import Decimal, InvalidOperation
import os
import re
from pathlib import Path
import sqlite3
from typing import TypedDict
import unicodedata

from dotenv import load_dotenv

ROOT_DIR = Path(__file__).resolve().parents[1]
CSV_PATH = ROOT_DIR / "data" / "processed" / "packaged_foods_india_cleaned.csv"
REPORT_DIR = ROOT_DIR / "data" / "reports"
load_dotenv(ROOT_DIR / "apps" / "api" / ".env")

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


def validate_schema(connection: sqlite3.Connection) -> None:
    required = {
        "Products": {"id", "name", "brand", "price_inr", *NUTRITION_COLUMNS},
    }
    actual = {
        "Products": {row[1] for row in connection.execute('PRAGMA table_info("Products")')}
    }
    missing = [
        f"{table}.{column}"
        for table, columns in required.items()
        for column in sorted(columns - actual.get(table, set()))
    ]
    if missing:
        raise RuntimeError(f"Required SQLite columns are missing: {', '.join(missing)}")


def fetch_products(connection: sqlite3.Connection) -> list[ExistingProduct]:
    return [
        {"id": product_id, "name": name, "brand": brand}
        for product_id, name, brand in connection.execute('SELECT id, name, brand FROM "Products"')
    ]


def current_nutrition(connection: sqlite3.Connection, product_id: str) -> dict[str, object] | None:
    row = connection.execute(
        f'SELECT {NUTRITION_SELECT} FROM "Products" WHERE id = ?',
        (product_id,),
    ).fetchone()
    if not row:
        return None
    result = dict(zip(NUTRITION_COLUMNS, row))
    for column in (*NUMERIC_FIELDS.values(), "salt_g", "serving_size"):
        result[column] = parse_numeric(result[column])
    return result


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
    connection: sqlite3.Connection,
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
    with connection:
        for match in report:
            if match["status"] != "matched":
                continue
            row = match["csv"]
            product_id = match["product_id"]
            product = match["product"]
            if product is None:
                raise RuntimeError(f"Matched CSV row {match['source_row']} has no product record.")
            source_price = parse_numeric(row.get("Price_INR"))
            existing_price_row = connection.execute(
                'SELECT price_inr FROM "Products" WHERE id = ?', (product_id,)
            ).fetchone()
            if existing_price_row is None:
                raise RuntimeError(f"Matched product {product_id} disappeared during synchronization.")
            old_price = parse_numeric(existing_price_row[0])
            product_changed = False
            if source_price is not None and source_price != old_price:
                connection.execute(
                    'UPDATE "Products" SET price_inr = ? WHERE id = ?',
                    (format(source_price, "f"), product_id),
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
                columns = ", ".join(f'"{column}" = ?' for column in changes)
                values = tuple(
                    format(value, "f") if isinstance(value, Decimal) else value
                    for value in changes.values()
                )
                connection.execute(
                    f'UPDATE "Products" SET {columns} WHERE id = ?',
                    (*values, product_id),
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
    database_path = Path(os.environ.get(
        "NUTRASCORE_DB_PATH", str(ROOT_DIR / "data" / "nutrascore.sqlite")
    ))
    if not database_path.is_absolute():
        database_path = ROOT_DIR / "apps" / "api" / database_path
    if not database_path.is_file():
        raise FileNotFoundError(f"Run pnpm db:migrate first: {database_path}")
    connection = sqlite3.connect(database_path)
    try:
        validate_schema(connection)
        report = match_products(rows, fetch_products(connection))
        report_path = write_report(report)
        counts: dict[str, int] = {}
        if args.apply:
            counts = synchronize(connection, report, args.nutrition_basis)
    finally:
        connection.close()

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
