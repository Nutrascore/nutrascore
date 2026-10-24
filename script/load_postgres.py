"""Replace product data in the existing NutraScore PostgreSQL schema.

The cleaned Indian packaged-food CSV is the only product source. The script:

1. validates the CSV and the existing PostgreSQL schema,
2. creates a logical backup of affected tables,
3. replaces product-specific rows in one transaction, and
4. verifies that the imported product count matches the CSV.

It never drops tables, recreates the database, or runs the stale Drizzle
migration.
"""

from datetime import datetime, timezone
from getpass import getpass
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse
from uuid import UUID, uuid5

import duckdb
import pandas as pd


ROOT_DIR = Path(__file__).resolve().parents[1]
CSV_PATH = ROOT_DIR / "data" / "raw" / "packaged_foods_india_cleaned.csv"
ENV_PATH = ROOT_DIR / "apps" / "api" / ".env"
BACKUP_DIR = ROOT_DIR / "data" / "backups"

ID_NAMESPACE = UUID("7f9d7a36-4d7b-4f8d-9a3a-8d8a75f94f0b")

NUMERIC_MAP = {
    "Calories_kcal": "kcal_per_100g",
    "Total_Fat_g": "fat_g",
    "Saturated_Fat_g": "saturated_fat_g",
    "Trans_Fat_g": "trans_fat_g",
    "Carbohydrates_g": "carbohydrates_g",
    "Sugar_g": "sugars_g",
    "Dietary_Fiber_g": "fibre_g",
    "Proteins_g": "protein_g",
    "Sodium_mg": "sodium_mg",
}

REQUIRED_COLUMNS = {
    "S.No",
    "Item name",
    "Brand_Name",
    "Category",
    "Sub_Category",
    "Ingredients",
    *NUMERIC_MAP.keys(),
}

PRODUCT_TABLES = (
    '"Products"',
    '"Nutrition"',
    '"ProductImages"',
    "product_categories",
    "product_allergens",
    "categories",
    "allergens",
)

REQUIRED_TABLES = {
    "Products",
    "Nutrition",
    "ProductImages",
    "categories",
    "product_categories",
    "allergens",
    "product_allergens",
}


def clean_text(value):
    if pd.isna(value):
        return None

    text = str(value).strip()
    return text if text and text.lower() not in {"nan", "none", "null", "n/a"} else None


def stable_id(kind: str, row_key: str) -> str:
    return str(uuid5(ID_NAMESPACE, f"nutrascore:{kind}:{row_key}"))


def read_database_url() -> str:
    if not ENV_PATH.is_file():
        raise FileNotFoundError(f"Environment file not found: {ENV_PATH}")

    values = {}
    for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip("\"'")

    database_url = values.get("DATABASE_URL")
    if not database_url:
        raise ValueError(f"DATABASE_URL is missing from {ENV_PATH}")

    return database_url


def duckdb_connection_string(database_url: str) -> str:
    parsed = urlparse(database_url)
    if parsed.scheme not in {"postgres", "postgresql"}:
        raise ValueError("DATABASE_URL must use the postgres:// or postgresql:// scheme")

    username = unquote(parsed.username or "")
    password = unquote(parsed.password or "")
    host = parsed.hostname or "localhost"
    port = parsed.port or 5432
    database = parsed.path.lstrip("/")

    if not username or not database:
        raise ValueError("DATABASE_URL must include a PostgreSQL user and database")

    if not password:
        password = getpass(f"Password for PostgreSQL user '{username}': ")
    if not password:
        raise ValueError("A PostgreSQL password is required")

    connection_string = (
        f"host={host} port={port} dbname={database} "
        f"user={username} password={password}"
    )
    return connection_string


def load_csv() -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    if not CSV_PATH.is_file():
        raise FileNotFoundError(f"Cleaned dataset not found: {CSV_PATH}")

    source = pd.read_csv(CSV_PATH)
    missing = REQUIRED_COLUMNS - set(source.columns)
    if missing:
        raise ValueError(f"CSV is missing required columns: {', '.join(sorted(missing))}")

    products = []
    nutrition = []
    product_categories = []
    category_names = set()

    for index, row in source.reset_index(drop=True).iterrows():
        name = clean_text(row["Item name"])
        if not name:
            raise ValueError(f"CSV row {index + 2} has no product name")

        brand = clean_text(row["Brand_Name"])
        source_row = clean_text(row["S.No"]) or str(index + 1)
        row_key = f"{source_row}|{name}|{brand or ''}"
        product_id = stable_id("product", row_key)

        products.append({
            "id": product_id,
            "name": name,
            "brand": brand,
            "ingredients": clean_text(row["Ingredients"]),
        })

        nutrition_record = {
            "id": stable_id("nutrition", row_key),
            "product_id": product_id,
        }
        for csv_column, database_column in NUMERIC_MAP.items():
            value = pd.to_numeric(pd.Series([row[csv_column]]), errors="coerce").iloc[0]
            nutrition_record[database_column] = None if pd.isna(value) else float(value)
        nutrition.append(nutrition_record)

        for column in ("Category", "Sub_Category"):
            category_name = clean_text(row[column])
            if category_name:
                category_names.add(category_name)
                product_categories.append({
                    "product_id": product_id,
                    "category_name": category_name,
                })

    products_df = pd.DataFrame(products)
    if products_df["id"].duplicated().any():
        raise ValueError("The CSV produces duplicate product IDs")

    categories_df = pd.DataFrame([
        {"id": stable_id("category", name.casefold()), "name": name}
        for name in sorted(category_names, key=str.casefold)
    ])
    links_df = pd.DataFrame(product_categories).drop_duplicates()

    return products_df, pd.DataFrame(nutrition), categories_df, links_df


def table_names(con) -> set[str]:
    return {
        row[0]
        for row in con.execute(
            "SELECT table_name FROM postgres_db.information_schema.tables "
            "WHERE table_schema = 'public'"
        ).fetchall()
    }


def validate_schema(con) -> None:
    missing = REQUIRED_TABLES - table_names(con)
    if missing:
        raise RuntimeError(f"Required public tables are missing: {', '.join(sorted(missing))}")

    foreign_keys = con.execute(
        """
        SELECT
          tc.table_name,
          kcu.column_name,
          ccu.table_name AS foreign_table_name,
          ccu.column_name AS foreign_column_name
        FROM postgres_db.information_schema.table_constraints AS tc
        JOIN postgres_db.information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
         AND tc.table_schema = kcu.table_schema
        JOIN postgres_db.information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
         AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_schema = 'public'
        """
    ).fetchall()
    required_relationships = {
        ("Nutrition", "product_id", "Products", "id"),
        ("ProductImages", "product_id", "Products", "id"),
        ("product_categories", "product_id", "Products", "id"),
        ("product_categories", "category_id", "categories", "id"),
        ("product_allergens", "product_id", "Products", "id"),
        ("product_allergens", "allergen_id", "allergens", "id"),
    }
    if not required_relationships.issubset(set(foreign_keys)):
        raise RuntimeError(
            "Existing foreign keys do not match the expected NutraScore schema; "
            "no data was changed."
        )


def create_backup(con) -> Path:
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup_path = BACKUP_DIR / f"nutrascore_product_tables_{timestamp}"
    backup_path.mkdir(parents=True, exist_ok=False)

    for table in PRODUCT_TABLES:
        filename = table.replace('"', "").replace("/", "_")
        output = (backup_path / f"{filename}.parquet").as_posix()
        con.execute(
            f"COPY (SELECT * FROM postgres_db.{table}) "
            f"TO '{output}' (FORMAT PARQUET)"
        )

    return backup_path


def replace_products(con, products_df, nutrition_df, categories_df, links_df) -> None:
    con.register("incoming_products", products_df)
    con.register("incoming_nutrition", nutrition_df)
    con.register("incoming_categories", categories_df)
    con.register("incoming_category_links", links_df)

    con.execute("BEGIN TRANSACTION")
    try:
        con.execute('DELETE FROM postgres_db.product_allergens')
        con.execute('DELETE FROM postgres_db.product_categories')
        con.execute('DELETE FROM postgres_db."ProductImages"')
        con.execute('DELETE FROM postgres_db."Nutrition"')
        con.execute('DELETE FROM postgres_db."Products"')

        con.execute(
            """
            INSERT INTO postgres_db."Products"
              (id, name, brand, barcode, ingredients, nutri_score,
               nova_group, created_at, updated_at)
            SELECT id, name, brand, NULL, ingredients, NULL, NULL, now(), now()
            FROM incoming_products
            """
        )
        con.execute(
            """
            INSERT INTO postgres_db."Nutrition"
              (id, product_id, kcal_per_100g, fat_g, saturated_fat_g,
               trans_fat_g, carbohydrates_g, sugars_g, fibre_g,
               protein_g, sodium_mg, salt_g)
            SELECT id, product_id, kcal_per_100g, fat_g, saturated_fat_g,
              trans_fat_g, carbohydrates_g, sugars_g, fibre_g,
              protein_g, sodium_mg, NULL
            FROM incoming_nutrition
            """
        )
        con.execute(
            """
            INSERT INTO postgres_db.categories (id, name, description)
            SELECT id, name, NULL
            FROM incoming_categories
            ON CONFLICT (name) DO NOTHING
            """
        )
        con.execute(
            """
            INSERT INTO postgres_db.product_categories (product_id, category_id)
            SELECT DISTINCT links.product_id, categories.id
            FROM incoming_category_links AS links
            JOIN postgres_db.categories AS categories
              ON lower(categories.name) = lower(links.category_name)
            """
        )

        imported_count = con.execute(
            'SELECT COUNT(*) FROM postgres_db."Products"'
        ).fetchone()[0]
        if imported_count != len(products_df):
            raise RuntimeError(
                f"Imported product count {imported_count} does not match CSV count "
                f"{len(products_df)}; rolling back."
            )

        con.execute("COMMIT")
    except Exception:
        con.execute("ROLLBACK")
        raise


def main() -> None:
    products_df, nutrition_df, categories_df, links_df = load_csv()
    database_url = read_database_url()
    connection_string = duckdb_connection_string(database_url)
    con = duckdb.connect()

    try:
        con.execute("INSTALL postgres")
        con.execute("LOAD postgres")
        escaped = connection_string.replace("\\", "\\\\").replace("'", "\\'")
        con.execute(f"ATTACH '{escaped}' AS postgres_db (TYPE postgres)")

        validate_schema(con)
        backup_path = create_backup(con)
        print(f"CSV rows validated: {len(products_df)}")
        print(f"Backup created: {backup_path}")

        replace_products(con, products_df, nutrition_df, categories_df, links_df)

        final_count = con.execute(
            'SELECT COUNT(*) FROM postgres_db."Products"'
        ).fetchone()[0]
        nutrition_count = con.execute(
            'SELECT COUNT(*) FROM postgres_db."Nutrition"'
        ).fetchone()[0]
        category_link_count = con.execute(
            "SELECT COUNT(*) FROM postgres_db.product_categories"
        ).fetchone()[0]
        print(f"Replacement completed. Products: {final_count}")
        print(f"Nutrition rows: {nutrition_count}")
        print(f"Product-category links: {category_link_count}")
    finally:
        try:
            con.execute("DETACH postgres_db")
        except Exception:
            pass
        con.close()


if __name__ == "__main__":
    main()
