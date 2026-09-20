import duckdb

INPUT_FILE = "data/raw/food.parquet"
OUTPUT_FILE = "data/raw/india_products.parquet"

con = duckdb.connect()

print("Filtering India products...")

con.execute(f"""
    COPY (
        SELECT *
        FROM read_parquet('{INPUT_FILE}')
        WHERE list_contains(countries_tags, 'en:india')
    )
    TO '{OUTPUT_FILE}'
    (FORMAT PARQUET);
""")

count = con.execute(f"""
    SELECT COUNT(*)
    FROM read_parquet('{OUTPUT_FILE}')
""").fetchone()[0]

print(f"India products: {count:,}")
print(f"Saved to: {OUTPUT_FILE}")

con.close()