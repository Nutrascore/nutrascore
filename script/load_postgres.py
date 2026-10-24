"""Import product data into the existing NutraScore PostgreSQL schema.

The cleaned Indian packaged-food CSV is the only product source. The script:

1. validates the CSV and the existing PostgreSQL schema,
2. creates logical CSV exports of affected tables,
3. upserts CSV-owned product and nutrition data and synchronizes their category
   links in one transaction,
   and
4. verifies that every CSV product is present.

CSV values, including missing values, are authoritative for fields represented
in the file; a missing value clears the corresponding imported field. Manually
maintained fields absent from the CSV are preserved. Nutrition units are not
declared in the CSV, so database writes require an explicitly verified
``--nutrition-basis``. The default invocation is a local-only dry run.

The CSV backups are logical row exports, not complete PostgreSQL backups or an
automatic restore mechanism. The script never drops tables, recreates the
database, or runs migrations.
"""

import argparse
from datetime import datetime, timezone
from getpass import getpass
import math
from pathlib import Path
from urllib.parse import unquote, urlparse
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
    "Cholesterol_mg": "cholesterol_mg",
    "Calcium_mg": "calcium_mg",
    "Iron_mg": "iron_mg",
}

REQUIRED_COLUMNS = {
    "S.No",
    "Item name",
    "Brand_Name",
    "Category",
    "Sub_Category",
    "Ingredients",
    "Serving_Size_g",
    "Price_INR",
    "Vitamin",
    *NUMERIC_MAP.keys(),
}

PRODUCT_TABLES = (
    '"Products"',
    '"Nutrition"',
    '"ProductImages"',
    "product_categories",
    "categories",
)

REQUIRED_TABLES = {
    "Products",
    "Nutrition",
    "ProductImages",
    "categories",
    "product_categories",
}

REQUIRED_COLUMNS_IN_DATABASE = {
    "Products": {
        "id",
        "name",
        "brand",
        "ingredients",
        "price_inr",
        "created_at",
        "updated_at",
    },
    "Nutrition": {
        "id",
        "product_id",
        *NUMERIC_MAP.values(),
        "serving_size",
        "serving_unit",
        "nutrition_basis",
        "vitamins",
    },
    "categories": {"id", "name", "description"},
    "product_categories": {"product_id", "category_id"},
}


def clean_text(value):
    if pd.isna(value):
        return None

    text = str(value).strip()
    return text if text and text.lower() not in {"nan", "none", "null", "n/a"} else None


def normalize_category_name(value):
    text = clean_text(value)
    return " ".join(text.split()).casefold() if text else None


def is_missing_value(value) -> bool:
    return clean_text(value) is None


def sql_string_literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def parse_numeric(value, *, allow_zero=True):
    number = pd.to_numeric(pd.Series([value]), errors="coerce").iloc[0]
    if pd.isna(number) or not math.isfinite(float(number)):
        return None
    number = float(number)
    if number < 0 or (not allow_zero and number == 0):
        return None
    return number


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
    database = unquote(parsed.path.lstrip("/"))

    if not username or not database:
        raise ValueError("DATABASE_URL must include a PostgreSQL user and database")

    if not password:
        password = getpass(f"Password for PostgreSQL user '{username}': ")
    if not password:
        raise ValueError("A PostgreSQL password is required")

    def quote_connection_value(value: str) -> str:
        escaped = value.replace("\\", "\\\\").replace("'", "\\'")
        return f"'{escaped}'"

    host = quote_connection_value(host)
    port = quote_connection_value(str(port))
    database = quote_connection_value(database)
    username = quote_connection_value(username)
    password = quote_connection_value(password)

    connection_string = (
        f"host={host} port={port} dbname={database} "
        f"user={username} password={password}"
    )
    return connection_string


def load_csv(
    nutrition_basis: str | None = None,
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    if nutrition_basis not in {None, "per_serving", "per_100g"}:
        raise ValueError("Nutrition basis must be per_serving or per_100g")

    if not CSV_PATH.is_file():
        raise FileNotFoundError(f"Cleaned dataset not found: {CSV_PATH}")

    source = pd.read_csv(CSV_PATH)
    missing = REQUIRED_COLUMNS - set(source.columns)
    if missing:
        raise ValueError(f"CSV is missing required columns: {', '.join(sorted(missing))}")
    if source.empty:
        raise ValueError("CSV contains no product rows")

    products = []
    nutrition = []
    product_categories = []
    category_names = {}
    missing_counts = {}
    invalid_numeric = []
    numeric_columns = (*NUMERIC_MAP, "Serving_Size_g", "Price_INR")
    authoritative_columns = (
        "Brand_Name",
        "Ingredients",
        "Category",
        "Sub_Category",
        "Vitamin",
        *numeric_columns,
    )

    for index, row in source.reset_index(drop=True).iterrows():
        row_number = index + 2
        name = clean_text(row["Item name"])
        if not name:
            raise ValueError(f"CSV row {row_number} has no product name")

        brand = clean_text(row["Brand_Name"])
        source_row = clean_text(row["S.No"])
        if not source_row:
            raise ValueError(f"CSV row {row_number} has no stable S.No identity")
        row_key = f"{source_row}|{name}|{brand or ''}"
        product_id = stable_id("product", row_key)

        parsed_numbers = {}
        for column in numeric_columns:
            value = row[column]
            if is_missing_value(value):
                missing_counts[column] = missing_counts.get(column, 0) + 1
                parsed_numbers[column] = None
                continue

            number = parse_numeric(
                value,
                allow_zero=column != "Serving_Size_g",
            )
            if number is None:
                invalid_numeric.append((row_number, column, value))
            parsed_numbers[column] = number

        for column in authoritative_columns:
            if column not in numeric_columns and is_missing_value(row[column]):
                missing_counts[column] = missing_counts.get(column, 0) + 1

        products.append({
            "id": product_id,
            "name": name,
            "brand": brand,
            "ingredients": clean_text(row["Ingredients"]),
            "price_inr": parsed_numbers["Price_INR"],
        })

        nutrition_record = {
            "id": stable_id("nutrition", row_key),
            "product_id": product_id,
        }
        for csv_column, database_column in NUMERIC_MAP.items():
            nutrition_record[database_column] = parsed_numbers[csv_column]
        serving_size = parsed_numbers["Serving_Size_g"]
        nutrition_record["serving_size"] = serving_size
        nutrition_record["serving_unit"] = "g" if serving_size is not None else None
        nutrition_record["vitamins"] = clean_text(row["Vitamin"])
        nutrition_record["nutrition_basis"] = nutrition_basis
        nutrition.append(nutrition_record)

        for column in ("Category", "Sub_Category"):
            category_name = clean_text(row[column])
            if category_name:
                normalized_name = " ".join(category_name.split())
                category_key = normalize_category_name(normalized_name)
                category_names.setdefault(category_key, normalized_name)
                product_categories.append({
                    "product_id": product_id,
                    "category_name": category_names[category_key],
                })

    products_df = pd.DataFrame(products)
    if products_df["id"].duplicated().any():
        raise ValueError("The CSV produces duplicate product IDs")

    if missing_counts:
        missing_summary = ", ".join(
            f"{column}={count}" for column, count in sorted(missing_counts.items())
        )
        print(
            "Missing CSV values (authoritative fields will be cleared, and "
            f"missing categories remove their links): {missing_summary}"
        )
    for row_number, column, value in invalid_numeric:
        print(
            f"Rejected numeric value at CSV row {row_number}, column "
            f"{column}: {value!r}; it will be imported as NULL because the "
            "CSV is authoritative for this field."
        )

    categories_df = pd.DataFrame([
        {"id": stable_id("category", key), "name": name}
        for key, name in sorted(category_names.items())
    ], columns=["id", "name"])
    links_df = pd.DataFrame(
        product_categories,
        columns=["product_id", "category_name"],
    ).drop_duplicates()

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

    columns = con.execute(
        """
        SELECT table_name, column_name
        FROM postgres_db.information_schema.columns
        WHERE table_schema = 'public'
        """
    ).fetchall()
    existing_columns = {}
    for table_name, column_name in columns:
        existing_columns.setdefault(table_name, set()).add(column_name)
    missing_columns = [
        f"{table}.{column}"
        for table, required in REQUIRED_COLUMNS_IN_DATABASE.items()
        for column in sorted(required - existing_columns.get(table, set()))
    ]
    if missing_columns:
        raise RuntimeError(
            "Required public columns are missing; apply the Drizzle migration first: "
            + ", ".join(missing_columns)
        )

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
    }
    if not required_relationships.issubset(set(foreign_keys)):
        raise RuntimeError(
            "Existing foreign keys do not match the expected NutraScore schema; "
            "no data was changed."
        )


def create_backup(con) -> Path:
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    backup_path = BACKUP_DIR / f"nutrascore_product_tables_{timestamp}"
    backup_path.mkdir(parents=True, exist_ok=False)

    for table in PRODUCT_TABLES:
        filename = table.replace('"', "").replace("/", "_")
        output = (backup_path / f"{filename}.csv").as_posix()
        con.execute(
            f"COPY (SELECT * FROM postgres_db.{table}) "
            f"TO {sql_string_literal(output)} (FORMAT CSV, HEADER)"
        )

    return backup_path


def upsert_products(con, products_df, nutrition_df, categories_df, links_df) -> None:
    con.register("incoming_products", products_df)
    con.register("incoming_nutrition", nutrition_df)
    con.register("incoming_categories", categories_df)
    con.register("incoming_category_links", links_df)

    con.execute("BEGIN TRANSACTION")
    try:
        con.execute(
            """
            INSERT INTO postgres_db."Products"
              (id, name, brand, ingredients, price_inr, created_at, updated_at)
            SELECT id, name, brand, ingredients, price_inr, now(), now()
            FROM incoming_products
            ON CONFLICT (id) DO UPDATE SET
              name = EXCLUDED.name,
              brand = EXCLUDED.brand,
              ingredients = EXCLUDED.ingredients,
              price_inr = EXCLUDED.price_inr,
              updated_at = now()
            """
        )
        con.execute(
            """
            INSERT INTO postgres_db."Nutrition"
              (id, product_id, kcal_per_100g, fat_g, saturated_fat_g,
               trans_fat_g, carbohydrates_g, sugars_g, fibre_g,
               protein_g, sodium_mg, cholesterol_mg, calcium_mg, iron_mg,
               vitamins, serving_size, serving_unit, nutrition_basis)
            SELECT id, product_id, kcal_per_100g, fat_g, saturated_fat_g,
              trans_fat_g, carbohydrates_g, sugars_g, fibre_g,
              protein_g, sodium_mg, cholesterol_mg, calcium_mg, iron_mg,
              vitamins, serving_size, serving_unit, nutrition_basis
            FROM incoming_nutrition
            ON CONFLICT (product_id) DO UPDATE SET
              kcal_per_100g = EXCLUDED.kcal_per_100g,
              fat_g = EXCLUDED.fat_g,
              saturated_fat_g = EXCLUDED.saturated_fat_g,
              trans_fat_g = EXCLUDED.trans_fat_g,
              carbohydrates_g = EXCLUDED.carbohydrates_g,
              sugars_g = EXCLUDED.sugars_g,
              fibre_g = EXCLUDED.fibre_g,
              protein_g = EXCLUDED.protein_g,
              sodium_mg = EXCLUDED.sodium_mg,
              cholesterol_mg = EXCLUDED.cholesterol_mg,
              calcium_mg = EXCLUDED.calcium_mg,
              iron_mg = EXCLUDED.iron_mg,
              vitamins = EXCLUDED.vitamins,
              serving_size = EXCLUDED.serving_size,
              serving_unit = EXCLUDED.serving_unit,
              nutrition_basis = EXCLUDED.nutrition_basis
            """
        )
        ambiguous_categories = con.execute(
            """
            SELECT incoming.name, COUNT(existing.id)
            FROM incoming_categories AS incoming
            JOIN postgres_db.categories AS existing
              ON lower(regexp_replace(trim(existing.name), '[[:space:]]+', ' ', 'g'))
               = lower(incoming.name)
            GROUP BY incoming.name
            HAVING COUNT(existing.id) > 1
            """
        ).fetchall()
        if ambiguous_categories:
            names = ", ".join(name for name, _ in ambiguous_categories)
            raise RuntimeError(
                "Multiple existing categories match these CSV names after "
                f"case/whitespace normalization: {names}; rolling back."
            )

        con.execute(
            """
            INSERT INTO postgres_db.categories (id, name, description)
            SELECT incoming.id, incoming.name, NULL
            FROM incoming_categories AS incoming
            WHERE NOT EXISTS (
              SELECT 1
              FROM postgres_db.categories AS existing
              WHERE lower(regexp_replace(trim(existing.name), '[[:space:]]+', ' ', 'g'))
                  = lower(incoming.name)
            )
            ON CONFLICT (name) DO NOTHING
            """
        )
        con.execute(
            """
            DELETE FROM postgres_db.product_categories
            WHERE product_id IN (SELECT id FROM incoming_products)
            """
        )
        con.execute(
            """
            INSERT INTO postgres_db.product_categories (product_id, category_id)
            SELECT DISTINCT links.product_id, categories.id
            FROM incoming_category_links AS links
            JOIN postgres_db.categories AS categories
              ON lower(regexp_replace(trim(categories.name), '[[:space:]]+', ' ', 'g'))
               = lower(links.category_name)
            ON CONFLICT (product_id, category_id) DO NOTHING
            """
        )

        imported_count = con.execute(
            """
            SELECT COUNT(*)
            FROM postgres_db."Products" AS products
            JOIN incoming_products AS incoming USING (id)
            """
        ).fetchone()[0]
        if imported_count != len(products_df):
            raise RuntimeError(
                f"Imported product count {imported_count} does not match CSV count "
                f"{len(products_df)}; rolling back."
            )

        imported_nutrition_count = con.execute(
            """
            SELECT COUNT(*)
            FROM postgres_db."Nutrition" AS nutrition
            JOIN incoming_nutrition AS incoming USING (product_id)
            """
        ).fetchone()[0]
        if imported_nutrition_count != len(nutrition_df):
            raise RuntimeError(
                f"Imported nutrition count {imported_nutrition_count} does not "
                f"match CSV count {len(nutrition_df)}; rolling back."
            )

        imported_link_count = con.execute(
            """
            SELECT COUNT(*)
            FROM postgres_db.product_categories AS links
            JOIN incoming_category_links AS incoming
              ON incoming.product_id = links.product_id
            JOIN postgres_db.categories AS categories
              ON categories.id = links.category_id
             AND lower(regexp_replace(trim(categories.name), '[[:space:]]+', ' ', 'g'))
               = lower(incoming.category_name)
            """
        ).fetchone()[0]
        if imported_link_count != len(links_df):
            raise RuntimeError(
                f"Imported category-link count {imported_link_count} does not "
                f"match CSV count {len(links_df)}; rolling back."
            )

        con.execute("COMMIT")
    except Exception:
        con.execute("ROLLBACK")
        raise


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Back up and apply changes to PostgreSQL; default is a local-only dry run.",
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

    products_df, nutrition_df, categories_df, links_df = load_csv(args.nutrition_basis)
    print(f"CSV rows validated: {len(products_df)}")
    if args.nutrition_basis is None:
        print(
            "Nutrition basis: unspecified by the CSV; nutrient values will not "
            "be written unless a verified --nutrition-basis is supplied."
        )
    else:
        print(f"Nutrition basis selected: {args.nutrition_basis}")

    if not args.apply:
        print("Dry run only; no database connection was opened and no data was changed.")
        return

    database_url = read_database_url()
    connection_string = duckdb_connection_string(database_url)
    con = duckdb.connect()

    try:
        con.execute("INSTALL postgres")
        con.execute("LOAD postgres")
        con.execute(
            f"ATTACH {sql_string_literal(connection_string)} "
            "AS postgres_db (TYPE postgres)"
        )

        validate_schema(con)
        backup_path = create_backup(con)
        print(
            "Logical CSV backup created (not a complete PostgreSQL backup or "
            f"automatic restore): {backup_path}"
        )

        upsert_products(con, products_df, nutrition_df, categories_df, links_df)

        final_count = con.execute(
            'SELECT COUNT(*) FROM postgres_db."Products"'
        ).fetchone()[0]
        nutrition_count = con.execute(
            'SELECT COUNT(*) FROM postgres_db."Nutrition"'
        ).fetchone()[0]
        category_link_count = con.execute(
            "SELECT COUNT(*) FROM postgres_db.product_categories"
        ).fetchone()[0]
        print(f"Import completed. Products in database: {final_count}")
        print(f"Nutrition rows: {nutrition_count}")
        print(f"Product-category links: {category_link_count}")
    finally:
        con.close()


if __name__ == "__main__":
    main()
