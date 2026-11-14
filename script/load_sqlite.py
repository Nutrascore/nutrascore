"""Validate the cleaned CSV and add missing products to the local SQLite database."""

import argparse
import csv
import os
from decimal import Decimal, InvalidOperation
from pathlib import Path
import sqlite3
import sys
from uuid import UUID, uuid5

from dotenv import load_dotenv

ROOT_DIR = Path(__file__).resolve().parents[1]
CSV_PATH = ROOT_DIR / "data" / "processed" / "packaged_foods_india_cleaned.csv"
load_dotenv(ROOT_DIR / "apps" / "api" / ".env")
ID_NAMESPACE = UUID("7f9d7a36-4d7b-4f8d-9a3a-8d8a75f94f0b")
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
PRODUCT_COLUMNS = (
    "id", "name", "brand", "ingredients", "price_inr", *NUMERIC_FIELDS.values(),
    "serving_size", "serving_unit", "vitamins", "nutrition_basis",
)


def clean(value: str | None) -> str | None:
    value = (value or "").strip()
    return value if value and value.casefold() not in {"nan", "none", "null", "n/a"} else None


def stable_id(kind: str, key: str) -> str:
    return str(uuid5(ID_NAMESPACE, f"nutrascore:{kind}:{key}"))


def normalized(value: str) -> str:
    return " ".join(value.split()).casefold()


def decimal_text(
    value: str | None,
    row_number: int,
    column: str,
    *,
    allow_zero: bool = True,
) -> str | None:
    value = clean(value)
    if value is None:
        return None
    try:
        number = Decimal(value)
    except InvalidOperation:
        print(
            f"Warning: CSV row {row_number} has non-numeric {column} value "
            f"{value!r}; importing it as NULL.",
            file=sys.stderr,
        )
        return None
    if not number.is_finite() or number < 0 or (not allow_zero and number == 0):
        print(
            f"Warning: CSV row {row_number} has invalid {column} value "
            f"{value!r}; importing it as NULL.",
            file=sys.stderr,
        )
        return None
    return format(number, "f")


def read_csv() -> list[dict[str, str]]:
    if not CSV_PATH.is_file():
        raise FileNotFoundError(f"Cleaned dataset not found: {CSV_PATH}")
    with CSV_PATH.open(encoding="utf-8-sig", newline="") as source:
        reader = csv.DictReader(source)
        required = {"S.No", "Item name", "Brand_Name", "Ingredients", "Category",
                    "Sub_Category", "Serving_Size_g", "Price_INR", "Vitamin", *NUMERIC_FIELDS}
        missing = required - set(reader.fieldnames or ())
        if missing:
            raise ValueError(f"CSV is missing columns: {', '.join(sorted(missing))}")
        rows = list(reader)
    if not rows:
        raise ValueError("CSV contains no product rows")
    return rows


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Write missing rows to SQLite.")
    parser.add_argument(
        "--nutrition-basis",
        choices=("per_serving", "per_100g"),
        help="Verified basis for nutrient values; required with --apply.",
    )
    args = parser.parse_args()
    if args.apply and not args.nutrition_basis:
        parser.error("--apply requires a verified --nutrition-basis")

    rows = read_csv()
    products: list[tuple[object, ...]] = []
    categories: dict[str, str] = {}
    links: set[tuple[str, str]] = set()
    product_ids: set[str] = set()

    for row_number, row in enumerate(rows, start=2):
        name = clean(row.get("Item name"))
        serial = clean(row.get("S.No"))
        if not name or not serial:
            raise ValueError(f"CSV row {row_number} needs both Item name and S.No")
        brand = clean(row.get("Brand_Name"))
        product_id = stable_id("product", f"{serial}|{name}|{brand or ''}")
        if product_id in product_ids:
            raise ValueError(f"CSV row {row_number} duplicates product ID {product_id}")
        product_ids.add(product_id)

        serving_size = decimal_text(
            row.get("Serving_Size_g"), row_number, "Serving_Size_g", allow_zero=False
        )
        values: dict[str, object] = {
            "id": product_id,
            "name": name,
            "brand": brand,
            "ingredients": clean(row.get("Ingredients")),
            "price_inr": decimal_text(row.get("Price_INR"), row_number, "Price_INR"),
            "serving_size": serving_size,
            "serving_unit": "g" if serving_size else None,
            "vitamins": clean(row.get("Vitamin")),
            "nutrition_basis": args.nutrition_basis,
        }
        for csv_column, db_column in NUMERIC_FIELDS.items():
            values[db_column] = decimal_text(row.get(csv_column), row_number, csv_column)
        products.append(tuple(values[column] for column in PRODUCT_COLUMNS))

        for field in ("Category", "Sub_Category"):
            category_name = clean(row.get(field))
            if category_name:
                category_name = " ".join(category_name.split())
                category_key = normalized(category_name)
                categories.setdefault(category_key, category_name)
                links.add((product_id, category_key))

    print(f"Validated {len(products)} CSV products and {len(categories)} category names.")
    if not args.apply:
        print("Dry run only; no database was opened or modified.")
        return

    database_path = Path(os.environ.get(
        "NUTRASCORE_DB_PATH", str(ROOT_DIR / "data" / "nutrascore.sqlite")
    ))
    if not database_path.is_absolute():
        database_path = ROOT_DIR / "apps" / "api" / database_path
    connection = sqlite3.connect(database_path)
    connection.execute("PRAGMA foreign_keys = ON")
    added_products = 0
    try:
        connection.execute("BEGIN IMMEDIATE")
        existing_names: dict[str, list[str]] = {}
        for category_id, name in connection.execute("SELECT id, name FROM categories"):
            existing_names.setdefault(normalized(name), []).append(category_id)
        ambiguous = [name for name, ids in existing_names.items() if len(ids) > 1 and name in categories]
        if ambiguous:
            raise ValueError(f"Multiple existing categories normalize to: {', '.join(ambiguous)}")

        category_ids: dict[str, str] = {}
        for key, name in categories.items():
            matched = existing_names.get(key, [])
            if matched:
                category_ids[key] = matched[0]
            else:
                category_id = stable_id("category", key)
                connection.execute(
                    "INSERT INTO categories (id, name) VALUES (?, ?)", (category_id, name)
                )
                category_ids[key] = category_id

        placeholders = ", ".join("?" for _ in PRODUCT_COLUMNS)
        insert_product = (
            f"INSERT OR IGNORE INTO \"Products\" "
            f"({', '.join(PRODUCT_COLUMNS)}) VALUES ({placeholders})"
        )
        for values in products:
            added_products += connection.execute(insert_product, values).rowcount

        for product_id, category_key in links:
            connection.execute(
                "INSERT OR IGNORE INTO product_categories (product_id, category_id) VALUES (?, ?)",
                (product_id, category_ids[category_key]),
            )
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()

    print(f"Added {added_products} new products; existing products were not overwritten.")
    print(f"Database: {database_path}")


if __name__ == "__main__":
    main()
