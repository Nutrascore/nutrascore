
from pathlib import Path
from getpass import getpass

import duckdb


# ============================================================
# Configuration
# ============================================================

DATA_DIR = Path("data/processed/india_v1")

PG_HOST = "localhost"
PG_PORT = 5432
PG_DATABASE = "nutrascore"
PG_USER = "postgres"


# ============================================================
# Expected files
# ============================================================

FILES = {
    "Products": DATA_DIR / "products.parquet",
    "ProductImages": DATA_DIR / "product_images.parquet",
    "Nutrition": DATA_DIR / "nutrition.parquet",
    "categories": DATA_DIR / "categories.parquet",
    "product_categories": DATA_DIR / "product_categories.parquet",
    "allergens": DATA_DIR / "allergens.parquet",
    "product_allergens": DATA_DIR / "product_allergens.parquet",
}


# ============================================================
# Helpers
# ============================================================

def quote_connection_value(value: str) -> str:
    """Escape a PostgreSQL connection-string value."""
    return value.replace("\\", "\\\\").replace("'", "\\'")


def check_files():
    print("=" * 70)
    print("NutraScore PostgreSQL Data Loader")
    print("=" * 70)
    print(f"Data directory: {DATA_DIR}")
    print()

    if not DATA_DIR.exists():
        raise FileNotFoundError(
            f"Processed dataset directory not found: {DATA_DIR}"
        )

    missing = []

    for table_name, path in FILES.items():
        if not path.exists():
            missing.append(str(path))
        else:
            print(f"[OK] {table_name:<22} {path}")

    if missing:
        print()
        raise FileNotFoundError(
            "Missing processed files:\n" + "\n".join(missing)
        )

    print()


def get_row_count(con, table_name: str) -> int:
    result = con.execute(
        f'SELECT COUNT(*) FROM postgres_db."{table_name}"'
    ).fetchone()

    return int(result[0])


def get_parquet_count(con, path: Path) -> int:
    result = con.execute(
        "SELECT COUNT(*) FROM read_parquet(?)",
        [str(path)],
    ).fetchone()

    return int(result[0])


def parquet_path(path: Path) -> str:
    return path.as_posix().replace("'", "''")


def verify_counts(con):
    print()
    print("=" * 70)
    print("Verifying PostgreSQL row counts")
    print("=" * 70)

    success = True

    for table_name, path in FILES.items():
        expected = get_parquet_count(con, path)
        actual = get_row_count(con, table_name)

        if expected == actual:
            print(
                f"[OK] {table_name:<22} "
                f"Parquet={expected:,}  PostgreSQL={actual:,}"
            )
        else:
            success = False
            print(
                f"[ERROR] {table_name:<22} "
                f"Parquet={expected:,}  PostgreSQL={actual:,}"
            )

    print()

    if not success:
        raise RuntimeError(
            "Row-count verification failed. "
            "PostgreSQL does not match india_v1."
        )

    print("All row counts match.")
    return True


# ============================================================
# Main
# ============================================================

def main():
    check_files()

    password = getpass(
        f"PostgreSQL password for {PG_USER}@{PG_HOST}: "
    )

    connection_string = (
        f"host={quote_connection_value(PG_HOST)} "
        f"port={PG_PORT} "
        f"dbname={quote_connection_value(PG_DATABASE)} "
        f"user={quote_connection_value(PG_USER)} "
        f"password={quote_connection_value(password)}"
    )

    con = duckdb.connect()

    try:
        print("Loading DuckDB PostgreSQL extension...")

        con.execute("INSTALL postgres")
        con.execute("LOAD postgres")

        print("[OK] PostgreSQL extension loaded.")
        print()

        print("Connecting to PostgreSQL...")

        con.execute(
            f"""
            ATTACH '{connection_string}'
            AS postgres_db (TYPE postgres)
            """
        )

        print("[OK] Connected to PostgreSQL.")
        print()

        # ----------------------------------------------------
        # Check that all expected PostgreSQL tables exist
        # ----------------------------------------------------

        print("=" * 70)
        print("Checking PostgreSQL tables")
        print("=" * 70)

        expected_tables = [
            "Products",
            "ProductImages",
            "Nutrition",
            "categories",
            "product_categories",
            "allergens",
            "product_allergens",
        ]

        existing_tables = {
            row[0]
            for row in con.execute(
                """
                SELECT table_name
                FROM postgres_db.information_schema.tables
                WHERE table_schema = 'public'
                """
            ).fetchall()
        }

        for table_name in expected_tables:
            if table_name not in existing_tables:
                raise RuntimeError(
                    f'PostgreSQL table "{table_name}" does not exist.'
                )

            print(f"[OK] {table_name}")

        print()

        # ----------------------------------------------------
        # Show current database state
        # ----------------------------------------------------

        print("=" * 70)
        print("Current PostgreSQL data")
        print("=" * 70)

        for table_name in expected_tables:
            print(
                f"{table_name:<22} "
                f"{get_row_count(con, table_name):,} rows"
            )

        print()

        # ----------------------------------------------------
        # Start transaction
        # ----------------------------------------------------

        print("=" * 70)
        print("Starting database refresh")
        print("=" * 70)

        con.execute("BEGIN")

        # ----------------------------------------------------
        # Upsert parent tables first.
        # Products are matched by their unique barcode. The generated
        # product id is deterministic and therefore remains stable.
        # ----------------------------------------------------

        print("=" * 70)
        print("Loading parent tables")
        print("=" * 70)

        con.execute(
            f"""
            INSERT INTO postgres_db."Products" (
                id, name, brand, barcode, ingredients, nutri_score,
                nova_group, created_at, updated_at
            )
            SELECT id, name, brand, barcode, ingredients, nutri_score,
                nova_group, created_at, updated_at
            FROM read_parquet('{parquet_path(FILES["Products"])}')
            ON CONFLICT (barcode) DO UPDATE SET
                name = EXCLUDED.name,
                brand = EXCLUDED.brand,
                ingredients = EXCLUDED.ingredients,
                nutri_score = EXCLUDED.nutri_score,
                nova_group = EXCLUDED.nova_group,
                created_at = EXCLUDED.created_at,
                updated_at = EXCLUDED.updated_at
            """
        )

        print(
            f'[LOADED] Products '
            f'({get_row_count(con, "Products"):,} rows)'
        )

        con.execute(
            f"""
            INSERT INTO postgres_db."categories" (id, name, description)
            SELECT id, name, description
            FROM read_parquet('{parquet_path(FILES["categories"])}')
            ON CONFLICT (id) DO UPDATE SET
                name = EXCLUDED.name,
                description = EXCLUDED.description
            """
        )

        print(
            f'[LOADED] categories '
            f'({get_row_count(con, "categories"):,} rows)'
        )

        con.execute(
            f"""
            INSERT INTO postgres_db."allergens" (id, name)
            SELECT id, name
            FROM read_parquet('{parquet_path(FILES["allergens"])}')
            ON CONFLICT (id) DO UPDATE SET
                name = EXCLUDED.name
            """
        )

        print(
            f'[LOADED] allergens '
            f'({get_row_count(con, "allergens"):,} rows)'
        )

        print()

        # ----------------------------------------------------
        # Upsert ProductImages and Nutrition.
        # ----------------------------------------------------

        print("=" * 70)
        print("Loading product data")
        print("=" * 70)

        con.execute(
            f"""
            INSERT INTO postgres_db."ProductImages" (
                id, product_id, image_url, image_type, is_primary
            )
            SELECT id, product_id, image_url, image_type, is_primary
            FROM read_parquet('{parquet_path(FILES["ProductImages"])}')
            ON CONFLICT (id) DO UPDATE SET
                product_id = EXCLUDED.product_id,
                image_url = EXCLUDED.image_url,
                image_type = EXCLUDED.image_type,
                is_primary = EXCLUDED.is_primary
            """
        )

        print(
            f'[LOADED] ProductImages '
            f'({get_row_count(con, "ProductImages"):,} rows)'
        )

        con.execute(
            f"""
            INSERT INTO postgres_db."Nutrition" (
                id, product_id, kcal_per_100g, fat_g, saturated_fat_g,
                trans_fat_g, carbohydrates_g, sugars_g, fibre_g, protein_g,
                sodium_mg, salt_g
            )
            SELECT id, product_id, kcal_per_100g, fat_g, saturated_fat_g,
                trans_fat_g, carbohydrates_g, sugars_g, fibre_g, protein_g,
                sodium_mg, salt_g
            FROM read_parquet('{parquet_path(FILES["Nutrition"])}')
            ON CONFLICT (product_id) DO UPDATE SET
                id = EXCLUDED.id,
                kcal_per_100g = EXCLUDED.kcal_per_100g,
                fat_g = EXCLUDED.fat_g,
                saturated_fat_g = EXCLUDED.saturated_fat_g,
                trans_fat_g = EXCLUDED.trans_fat_g,
                carbohydrates_g = EXCLUDED.carbohydrates_g,
                sugars_g = EXCLUDED.sugars_g,
                fibre_g = EXCLUDED.fibre_g,
                protein_g = EXCLUDED.protein_g,
                sodium_mg = EXCLUDED.sodium_mg,
                salt_g = EXCLUDED.salt_g
            """
        )

        print(
            f'[LOADED] Nutrition '
            f'({get_row_count(con, "Nutrition"):,} rows)'
        )

        print()

        # ----------------------------------------------------
        # Upsert relationship tables.
        # ----------------------------------------------------

        print("=" * 70)
        print("Loading relationship tables")
        print("=" * 70)

        con.execute(
            f"""
            INSERT INTO postgres_db."product_categories" (product_id, category_id)
            SELECT product_id, category_id
            FROM read_parquet('{parquet_path(FILES["product_categories"])}')
            ON CONFLICT (product_id, category_id) DO NOTHING
            """
        )

        print(
            f'[LOADED] product_categories '
            f'({get_row_count(con, "product_categories"):,} rows)'
        )

        con.execute(
            f"""
            INSERT INTO postgres_db."product_allergens" (product_id, allergen_id)
            SELECT product_id, allergen_id
            FROM read_parquet('{parquet_path(FILES["product_allergens"])}')
            ON CONFLICT (product_id, allergen_id) DO NOTHING
            """
        )

        print(
            f'[LOADED] product_allergens '
            f'({get_row_count(con, "product_allergens"):,} rows)'
        )

        print()

        # ----------------------------------------------------
        # Verify everything before committing
        # ----------------------------------------------------

        print("=" * 70)
        print("Pre-commit verification")
        print("=" * 70)

        verify_counts(con)

        # ----------------------------------------------------
        # Commit
        # ----------------------------------------------------

        con.execute("COMMIT")

        print()
        print("=" * 70)
        print("DATABASE REFRESH COMPLETE")
        print("=" * 70)
        print()
        print("india_v1 has been loaded into PostgreSQL successfully.")
        print()

    except Exception:
        print()
        print("=" * 70)
        print("ERROR - ROLLING BACK")
        print("=" * 70)

        try:
            con.execute("ROLLBACK")
            print("Database changes rolled back.")
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
