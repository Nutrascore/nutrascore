import duckdb

con = duckdb.connect()

result = con.execute("""
    SELECT
        typeof(images),
        images::VARCHAR
    FROM read_parquet('data/raw/india_products.parquet')
    WHERE images IS NOT NULL
    LIMIT 1
""").fetchone()

print(result)
