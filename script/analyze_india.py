import duckdb


# ============================================================
# CONFIG
# ============================================================

INPUT_FILE = "data/raw/india_products.parquet"


# ============================================================
# CONNECT
# ============================================================

con = duckdb.connect()


# ============================================================
# BASIC DATASET INFO
# ============================================================

print("Analyzing India dataset...\n")

total = con.execute(f"""
    SELECT COUNT(*)
    FROM read_parquet('{INPUT_FILE}')
""").fetchone()[0]

print(f"Total India products: {total:,}")


# ============================================================
# BASIC FIELD COVERAGE
# ============================================================

print("\n" + "=" * 60)
print("BASIC FIELD COVERAGE")
print("=" * 60)

query = f"""
SELECT
    COUNT(*) AS total,

    COUNT(NULLIF(TRIM(code::VARCHAR), '')) AS barcode,

    COUNT(NULLIF(TRIM(ingredients_text::VARCHAR), '')) AS ingredients,

    COUNT(NULLIF(TRIM(brands::VARCHAR), '')) AS brand,

    COUNT(NULLIF(TRIM(categories_tags::VARCHAR), '')) AS categories,

    COUNT(NULLIF(TRIM(allergens_tags::VARCHAR), '')) AS allergens,

    COUNT(NULLIF(TRIM(nutriscore_grade::VARCHAR), '')) AS nutriscore,

    COUNT(nova_group) AS nova

FROM read_parquet('{INPUT_FILE}')
"""

result = con.execute(query).fetchone()

labels = [
    "Total",
    "Barcode",
    "Ingredients",
    "Brand",
    "Categories",
    "Allergens",
    "Nutri-Score",
    "NOVA",
]

for label, count in zip(labels, result):
    percentage = count / total * 100

    print(
        f"{label:20} "
        f"{count:>7,} "
        f"({percentage:6.2f}%)"
    )


# ============================================================
# PRODUCT NAME COVERAGE
# ============================================================

print("\n" + "=" * 60)
print("PRODUCT NAME")
print("=" * 60)

name_result = con.execute(f"""
SELECT COUNT(*)
FROM read_parquet('{INPUT_FILE}')
WHERE product_name IS NOT NULL
  AND product_name != []
""").fetchone()[0]

print(
    f"Product name:         "
    f"{name_result:>7,} "
    f"({name_result / total * 100:6.2f}%)"
)


# ============================================================
# IMAGE COVERAGE
# ============================================================

print("\n" + "=" * 60)
print("IMAGES")
print("=" * 60)

image_result = con.execute(f"""
SELECT COUNT(*)
FROM read_parquet('{INPUT_FILE}')
WHERE images IS NOT NULL
  AND len(images) > 0
""").fetchone()[0]

print(
    f"Products with images: "
    f"{image_result:>7,} "
    f"({image_result / total * 100:6.2f}%)"
)


# ============================================================
# NUTRITION COVERAGE
# ============================================================

print("\n" + "=" * 60)
print("NUTRITION COVERAGE (PER 100g)")
print("=" * 60)

nutrition_fields = {
    "Energy kcal": "energy-kcal",
    "Fat": "fat",
    "Saturated fat": "saturated-fat",
    "Trans fat": "trans-fat",
    "Carbohydrates": "carbohydrates",
    "Sugars": "sugars",
    "Fibre": "fiber",
    "Protein": "proteins",
    "Sodium": "sodium",
    "Salt": "salt",
}

for label, nutrient in nutrition_fields.items():

    result = con.execute(f"""
        SELECT COUNT(*)
        FROM read_parquet('{INPUT_FILE}') p
        WHERE EXISTS (
            SELECT 1
            FROM UNNEST(p.nutriments) AS t(n)
            WHERE n.name = '{nutrient}'
              AND n."100g" IS NOT NULL
        )
    """).fetchone()[0]

    percentage = result / total * 100

    print(
        f"{label:20} "
        f"{result:>7,} "
        f"({percentage:6.2f}%)"
    )


# ============================================================
# NUTRI-SCORE VALUES
# ============================================================

print("\n" + "=" * 60)
print("NUTRI-SCORE VALUES")
print("=" * 60)

nutriscore_values = con.execute(f"""
SELECT
    LOWER(TRIM(nutriscore_grade::VARCHAR)) AS grade,
    COUNT(*) AS count
FROM read_parquet('{INPUT_FILE}')
WHERE nutriscore_grade IS NOT NULL
GROUP BY grade
ORDER BY count DESC
""").fetchall()

for grade, count in nutriscore_values:
    print(
        f"{str(grade):20} "
        f"{count:>7,} "
        f"({count / total * 100:6.2f}%)"
    )


# ============================================================
# VALID NUTRI-SCORE
# ============================================================

print("\n" + "=" * 60)
print("VALID NUTRI-SCORE")
print("=" * 60)

nutriscore_count = con.execute(f"""
SELECT COUNT(*)
FROM read_parquet('{INPUT_FILE}')
WHERE LOWER(TRIM(nutriscore_grade::VARCHAR))
      IN ('a', 'b', 'c', 'd', 'e')
""").fetchone()[0]

print(
    f"Valid Nutri-Score:   "
    f"{nutriscore_count:>7,} "
    f"({nutriscore_count / total * 100:6.2f}%)"
)


# ============================================================
# VALID NOVA
# ============================================================

print("\n" + "=" * 60)
print("NOVA VALIDATION")
print("=" * 60)

nova_count = con.execute(f"""
SELECT COUNT(*)
FROM read_parquet('{INPUT_FILE}')
WHERE nova_group IN (1, 2, 3, 4)
""").fetchone()[0]

print(
    f"Valid NOVA:          "
    f"{nova_count:>7,} "
    f"({nova_count / total * 100:6.2f}%)"
)


# ============================================================
# NUTRI-SCORE + REQUIRED NUTRITION ANALYSIS
#
# Required:
#   - Energy
#   - Fat
#   - Carbohydrates
#   - Sugars
#   - Protein
#   - Sodium OR Salt
#
# Optional:
#   - Saturated fat
#   - Trans fat
#   - Fibre
# ============================================================

print("\n" + "=" * 60)
print("NUTRI-SCORE + REQUIRED NUTRITION")
print("=" * 60)

required_nutrition_query = f"""
WITH base AS (

    SELECT
        p.*,

        -- Required nutrients:
        -- energy, fat, carbohydrates, sugars, protein
        -- plus sodium OR salt.

        (
            SELECT COUNT(*)
            FROM UNNEST(p.nutriments) AS t(n)
            WHERE n.name IN (
                'energy-kcal',
                'fat',
                'carbohydrates',
                'sugars',
                'proteins'
            )
            AND n."100g" IS NOT NULL
        ) AS required_basic_count,

        -- Sodium and salt are alternatives.
        (
            SELECT COUNT(*)
            FROM UNNEST(p.nutriments) AS t(n)
            WHERE n.name IN ('sodium', 'salt')
            AND n."100g" IS NOT NULL
        ) AS sodium_or_salt_count

    FROM read_parquet('{INPUT_FILE}') p
),

quality AS (

    SELECT *
    FROM base

    WHERE product_name IS NOT NULL
      AND product_name != []

      AND code IS NOT NULL
      AND TRIM(code::VARCHAR) != ''

      AND ingredients_text IS NOT NULL
      AND TRIM(ingredients_text::VARCHAR) != ''

      AND categories_tags IS NOT NULL
      AND categories_tags != []

      AND images IS NOT NULL
      AND len(images) > 0

      AND LOWER(TRIM(nutriscore_grade::VARCHAR))
          IN ('a', 'b', 'c', 'd', 'e')
)

SELECT COUNT(*)
FROM quality

WHERE required_basic_count = 5
  AND sodium_or_salt_count >= 1
"""

required_count = con.execute(
    required_nutrition_query
).fetchone()[0]

print(
    f"Products meeting all requirements: "
    f"{required_count:,} "
    f"({required_count / total * 100:.2f}%)"
)


# ============================================================
# SHOW HOW MANY HAVE SODIUM / SALT / BOTH
# ============================================================

print("\n" + "=" * 60)
print("SODIUM / SALT COVERAGE")
print("=" * 60)

sodium_salt_query = f"""
WITH base AS (

    SELECT
        p.*,

        EXISTS (
            SELECT 1
            FROM UNNEST(p.nutriments) AS t(n)
            WHERE n.name = 'sodium'
              AND n."100g" IS NOT NULL
        ) AS has_sodium,

        EXISTS (
            SELECT 1
            FROM UNNEST(p.nutriments) AS t(n)
            WHERE n.name = 'salt'
              AND n."100g" IS NOT NULL
        ) AS has_salt

    FROM read_parquet('{INPUT_FILE}') p
),

quality AS (

    SELECT *
    FROM base

    WHERE product_name IS NOT NULL
      AND product_name != []

      AND code IS NOT NULL
      AND TRIM(code::VARCHAR) != ''

      AND ingredients_text IS NOT NULL
      AND TRIM(ingredients_text::VARCHAR) != ''

      AND categories_tags IS NOT NULL
      AND categories_tags != []

      AND images IS NOT NULL
      AND len(images) > 0

      AND LOWER(TRIM(nutriscore_grade::VARCHAR))
          IN ('a', 'b', 'c', 'd', 'e')
)

SELECT

    COUNT(*) FILTER (
        WHERE has_sodium
        AND NOT has_salt
    ) AS sodium_only,

    COUNT(*) FILTER (
        WHERE has_salt
        AND NOT has_sodium
    ) AS salt_only,

    COUNT(*) FILTER (
        WHERE has_sodium
        AND has_salt
    ) AS both,

    COUNT(*) FILTER (
        WHERE NOT has_sodium
        AND NOT has_salt
    ) AS neither

FROM quality
"""

sodium_salt_result = con.execute(
    sodium_salt_query
).fetchone()

labels = [
    "Sodium only",
    "Salt only",
    "Both",
    "Neither",
]

for label, count in zip(labels, sodium_salt_result):
    print(
        f"{label:20} "
        f"{count:>7,} "
        f"({count / total * 100:6.2f}%)"
    )


# ============================================================
# OPTIONAL NUTRIENT COVERAGE AMONG FINAL-QUALITY PRODUCTS
# ============================================================

print("\n" + "=" * 60)
print("OPTIONAL NUTRIENT COVERAGE")
print("=" * 60)

optional_nutrients = {
    "Saturated fat": "saturated-fat",
    "Trans fat": "trans-fat",
    "Fibre": "fiber",
}

for label, nutrient in optional_nutrients.items():

    result = con.execute(f"""
        WITH quality AS (

            SELECT *
            FROM read_parquet('{INPUT_FILE}') p

            WHERE product_name IS NOT NULL
              AND product_name != []

              AND code IS NOT NULL
              AND TRIM(code::VARCHAR) != ''

              AND ingredients_text IS NOT NULL
              AND TRIM(ingredients_text::VARCHAR) != ''

              AND categories_tags IS NOT NULL
              AND categories_tags != []

              AND images IS NOT NULL
              AND len(images) > 0

              AND LOWER(TRIM(nutriscore_grade::VARCHAR))
                  IN ('a', 'b', 'c', 'd', 'e')

        )

        SELECT COUNT(*)
        FROM quality p

        WHERE EXISTS (
            SELECT 1
            FROM UNNEST(p.nutriments) AS t(n)
            WHERE n.name = '{nutrient}'
              AND n."100g" IS NOT NULL
        )
    """).fetchone()[0]

    print(
        f"{label:20} "
        f"{result:>7,} "
        f"({result / total * 100:6.2f}%)"
    )


# ============================================================
# CLOSE
# ============================================================

con.close()

print("\nAnalysis complete.")