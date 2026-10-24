
"""Sync cleaned ingredient text into the existing NutraScore PostgreSQL database.

Run from any directory:
    python script/sync_cleaned_ingredients.py

Only Products.ingredients is updated. Other product fields and related tables
are left unchanged.
"""

from getpass import getpass
from pathlib import Path
from uuid import UUID, uuid5

import duckdb
import pandas as pd


ROOT_DIR = (
    Path(__file__).resolve().parents[1]
    if Path(__file__).resolve().parent.name == "script"
    else Path(__file__).resolve().parent
)

CSV_PATH = ROOT_DIR / "data" / "raw" / "packaged_foods_india_cleaned.csv"

PG_HOST = "localhost"
PG_PORT = 5432
PG_DATABASE = "nutrascore"
PG_USER = "postgres"

# Must match the namespace and row-key logic in load_postgres.py.
ID_NAMESPACE = UUID("7f9d7a36-4d7b-4f8d-9a3a-8d8a75f94f0b")


def clean_text(value):
    if pd.isna(value):
        return None

    value = str(value).strip()
    return (
        value
        if value and value.lower() not in {"nan", "none", "null", "n/a"}
        else None
    )


def load_cleaned_ingredients() -> pd.DataFrame:
    if not CSV_PATH.is_file():
        raise FileNotFoundError(
            f"Cleaned dataset not found: {CSV_PATH}\n"
            "Run clean_ingredients.py first."
        )

    df = pd.read_csv(CSV_PATH)

    required_columns = {"S.No", "Item name", "Brand_Name", "Ingredients"}
    missing = required_columns - set(df.columns)

    if missing:
        raise ValueError(
            "Missing required columns: " + ", ".join(sorted(missing))
        )

    records = []

    for index, row in df.iterrows():
        name = clean_text(row["Item name"])

        # The loader skips rows without a product name.
        if not name:
            continue

        brand = clean_text(row["Brand_Name"])
        source_row = clean_text(row["S.No"]) or str(index + 1)
        row_key = f"{source_row}|{name}|{brand or ''}"

        product_id = str(
            uuid5(ID_NAMESPACE, f"nutrascore:product:{row_key}")
        )

        records.append(
            {
                "id": product_id,
                "ingredients": clean_text(row["Ingredients"]),
            }
        )

    if not records:
        raise ValueError("No usable products found in the cleaned CSV.")

    result = pd.DataFrame(records)

    if result["id"].duplicated().any():
        raise ValueError(
            "The cleaned CSV generates duplicate product IDs. "
            "No database changes were made."
        )

    return result


def main() -> None:
    ingredients_df = load_cleaned_ingredients()

    password = getpass(f"Password for PostgreSQL user '{PG_USER}': ")
    connection_string = (
        f"host={PG_HOST} port={PG_PORT} dbname={PG_DATABASE} "
        f"user={PG_USER} password={password}"
    )

    con = duckdb.connect()

    try:
        con.execute("INSTALL postgres")
        con.execute("LOAD postgres")

        escaped_connection_string = (
            connection_string.replace("\\", "\\\\").replace("'", "\\'")
        )

        con.execute(
            f"ATTACH '{escaped_connection_string}' "
            "AS postgres_db (TYPE postgres)"
        )

        con.register("incoming_cleaned", ingredients_df)

        print(f"Cleaned CSV: {CSV_PATH}")
        print(f"Usable products: {len(ingredients_df)}")

        con.execute("BEGIN TRANSACTION")

        # Confirm every cleaned product maps to an existing database product.
        matched_count = con.execute(
            '''
            SELECT COUNT(*)
            FROM postgres_db."Products" AS p
            JOIN incoming_cleaned AS incoming
                ON p.id = CAST(incoming.id AS UUID)
            '''
        ).fetchone()[0]

        if matched_count != len(ingredients_df):
            raise RuntimeError(
                f"Only {matched_count} of {len(ingredients_df)} cleaned "
                "products match database records. Aborting without syncing."
            )

        changed_count = con.execute(
            '''
            SELECT COUNT(*)
            FROM postgres_db."Products" AS p
            JOIN incoming_cleaned AS incoming
                ON p.id = CAST(incoming.id AS UUID)
            WHERE p.ingredients IS DISTINCT FROM incoming.ingredients
            '''
        ).fetchone()[0]

        if changed_count:
            con.execute(
                '''
                UPDATE postgres_db."Products" AS p
                SET ingredients = incoming.ingredients
                FROM incoming_cleaned AS incoming
                WHERE p.id = CAST(incoming.id AS UUID)
                  AND p.ingredients IS DISTINCT FROM incoming.ingredients
                '''
            )

        con.execute("COMMIT")

        print("\nIngredient sync completed successfully.")
        print(f"Products matched: {matched_count}")
        print(f"Products with changed ingredients: {changed_count}")
        print("Other product fields were not modified.")
        print("Nutrition, images, categories, and allergen tables were untouched.")

    except Exception:
        try:
            con.execute("ROLLBACK")
        except Exception:
            pass
        raise

    finally:
        try:
            con.execute("DETACH postgres_db")
        except Exception:
            pass
        con.close()


if __name__ == "__main__":
    main()
