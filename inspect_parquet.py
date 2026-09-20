import duckdb

con = duckdb.connect()

result = con.execute("""
    DESCRIBE SELECT *
    FROM 'data/processed/india_v1/products.parquet'
""").fetchdf()

print(result.to_string(index=False))