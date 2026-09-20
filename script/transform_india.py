
from pathlib import Path

import duckdb
from duckdb.sqltypes import VARCHAR

from ingredient_cleaner import clean_ingredient_text


INPUT_FILE = Path("data/raw/india_products.parquet")
OUTPUT_DIR = Path("data/processed/india_v1")


def extract_multilingual_text(value):
    """Return the preferred readable value from an OFF multilingual field."""
    if value is None:
        return None
    if isinstance(value, str):
        value = value.strip()
        return value or None
    if isinstance(value, dict):
        if value.get("text"):
            return extract_multilingual_text(value["text"])
        for key in ("en", "en:english", "hi", "hi:hindi"):
            if key in value:
                result = extract_multilingual_text(value[key])
                if result:
                    return result
        for item in value.values():
            result = extract_multilingual_text(item)
            if result:
                return result
        return None
    if isinstance(value, (list, tuple)):
        preferred = []
        other = []
        for item in value:
            if isinstance(item, dict) and item.get("lang") in ("en", "hi"):
                preferred.append(item)
            else:
                other.append(item)
        for item in preferred + other:
            result = extract_multilingual_text(item)
            if result:
                return result
        return None
    return str(value).strip() or None


if not INPUT_FILE.exists():
    raise FileNotFoundError(f"Input parquet file not found: {INPUT_FILE}")

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
con = duckdb.connect()

con.create_function(
    "extract_multilingual_text",
    extract_multilingual_text,
    return_type=VARCHAR,
    null_handling="special",
)

con.create_function(
    "clean_ingredient_text",
    clean_ingredient_text,
    return_type=VARCHAR,
    null_handling="special",
)


def scalar_nutriment(name: str) -> str:
    escaped_name = name.replace("'", "''")
    return (
        "(SELECT n.\"100g\" FROM UNNEST(nutriments) AS u(n) "
        f"WHERE n.name = '{escaped_name}' AND n.\"100g\" IS NOT NULL LIMIT 1)"
    )


def product_id_expression(column: str = "barcode") -> str:
    return (
        "md5('nutrascore-product|' || "
        f"regexp_replace({column}, '[^0-9]', '', 'g'))::UUID"
    )


print("=" * 70)
print("NutraScore India Product Transformer")
print("=" * 70)
print(f"Input : {INPUT_FILE}")
print(f"Output: {OUTPUT_DIR}")
print(f"DuckDB: {duckdb.__version__}")
print()

source_path = INPUT_FILE.as_posix().replace("'", "''")
source = f"read_parquet('{source_path}')"

source_schema = con.execute(
    f"DESCRIBE SELECT * FROM {source}"
).fetchall()

source_columns = {row[0] for row in source_schema}

required_columns = {
    "code",
    "product_name",
    "brands",
    "categories_tags",
    "ingredients_text",
    "allergens_tags",
    "nutriments",
    "nutriscore_grade",
    "nova_group",
    "images",
}

missing_columns = required_columns - source_columns

if missing_columns:
    raise RuntimeError(
        "Missing required source columns: "
        + ", ".join(sorted(missing_columns))
    )

print("Source schema OK.")


nutrition_columns = {
    "kcal_raw": scalar_nutriment("energy-kcal"),
    "fat_raw": scalar_nutriment("fat"),
    "saturated_fat_raw": scalar_nutriment("saturated-fat"),
    "trans_fat_raw": scalar_nutriment("trans-fat"),
    "carbohydrates_raw": scalar_nutriment("carbohydrates"),
    "sugars_raw": scalar_nutriment("sugars"),
    "fibre_raw": scalar_nutriment("fiber"),
    "protein_raw": scalar_nutriment("proteins"),
    "sodium_raw": scalar_nutriment("sodium"),
    "salt_raw": scalar_nutriment("salt"),
}

nutrition_select = ",\n        ".join(
    f"CAST({expression} AS DOUBLE) AS {alias}"
    for alias, expression in nutrition_columns.items()
)


con.execute(
    f"""
    CREATE OR REPLACE TEMP TABLE source AS
    SELECT
        CAST(code AS VARCHAR) AS barcode,
        extract_multilingual_text(product_name) AS product_name_clean,
        NULLIF(TRIM(CAST(brands AS VARCHAR)), '') AS brands_raw,
        categories_tags,
        clean_ingredient_text(
            extract_multilingual_text(ingredients_text)
        ) AS ingredients_clean,
        allergens_tags,
        {nutrition_select},
        NULLIF(
            LOWER(TRIM(CAST(nutriscore_grade AS VARCHAR))),
            ''
        ) AS nutri_score_raw,
        TRY_CAST(nova_group AS SMALLINT) AS nova_group_raw,
        images
    FROM {source}
    """
)

source_count = con.execute(
    "SELECT COUNT(*) FROM source"
).fetchone()[0]

print(f"Source products: {source_count:,}")


con.execute(
    """
    CREATE OR REPLACE TEMP TABLE normalized AS
    SELECT
        barcode,
        product_name_clean AS product_name,

        CASE
            WHEN brands_raw IS NULL THEN NULL
            WHEN LOWER(TRIM(brands_raw)) IN ('unknown', 'null', 'none')
                THEN NULL
            ELSE TRIM(brands_raw)
        END AS brand,

        ingredients_clean AS ingredients,
        nutri_score_raw AS nutri_score,
        nova_group_raw AS nova_group,
        categories_tags,
        allergens_tags,
        images,

        -- Nutrition values rounded to a maximum of 3 decimal places.
        CASE
            WHEN sodium_raw IS NOT NULL
                THEN ROUND(sodium_raw * 1000, 3)
            ELSE NULL
        END AS sodium_mg,

        ROUND(salt_raw, 3) AS salt_g,
        ROUND(kcal_raw, 3) AS kcal_per_100g,
        ROUND(fat_raw, 3) AS fat_g,
        ROUND(saturated_fat_raw, 3) AS saturated_fat_g,
        ROUND(trans_fat_raw, 3) AS trans_fat_g,
        ROUND(carbohydrates_raw, 3) AS carbohydrates_g,
        ROUND(sugars_raw, 3) AS sugars_g,
        ROUND(fibre_raw, 3) AS fibre_g,
        ROUND(protein_raw, 3) AS protein_g

    FROM source
    """
)


# Images stay native STRUCT[] values until the selected front record is used.
con.execute(
    """
    CREATE OR REPLACE TEMP TABLE normalized_with_images AS
    SELECT
        *,
        CASE
            WHEN list_first(
                list_filter(
                    images,
                    lambda img:
                        img."key" = 'front_en'
                        AND img.rev IS NOT NULL
                )
            ).rev IS NOT NULL
            THEN
                'https://images.openfoodfacts.org/images/products/' ||
                regexp_replace(
                    lpad(
                        regexp_replace(barcode, '[^0-9]', '', 'g'),
                        13,
                        '0'
                    ),
                    '^(.{3})(.{3})(.{3})(.*)$',
                    '\\1/\\2/\\3/\\4'
                ) ||
                '/front_en.' ||
                CAST(
                    list_first(
                        list_filter(
                            images,
                            lambda img:
                                img."key" = 'front_en'
                                AND img.rev IS NOT NULL
                        )
                    ).rev AS VARCHAR
                ) ||
                '.400.jpg'

            WHEN list_first(
                list_filter(
                    images,
                    lambda img:
                        img."key" = 'front_fr'
                        AND img.rev IS NOT NULL
                )
            ).rev IS NOT NULL
            THEN
                'https://images.openfoodfacts.org/images/products/' ||
                regexp_replace(
                    lpad(
                        regexp_replace(barcode, '[^0-9]', '', 'g'),
                        13,
                        '0'
                    ),
                    '^(.{3})(.{3})(.{3})(.*)$',
                    '\\1/\\2/\\3/\\4'
                ) ||
                '/front_fr.' ||
                CAST(
                    list_first(
                        list_filter(
                            images,
                            lambda img:
                                img."key" = 'front_fr'
                                AND img.rev IS NOT NULL
                        )
                    ).rev AS VARCHAR
                ) ||
                '.400.jpg'

            ELSE NULL
        END AS image_url
    FROM normalized
    """
)


con.execute(
    """
    CREATE OR REPLACE TEMP TABLE validation AS
    SELECT
        *,
        product_name IS NOT NULL
            AND LENGTH(TRIM(product_name)) > 0 AS valid_name,

        barcode IS NOT NULL
            AND regexp_matches(
                regexp_replace(barcode, '[^0-9]', '', 'g'),
                '^[0-9]{8,14}$'
            ) AS valid_barcode,

        ingredients IS NOT NULL
            AND LENGTH(TRIM(ingredients)) > 0 AS valid_ingredients,

        nutri_score IN ('a', 'b', 'c', 'd', 'e')
            AS valid_nutri_score,

        kcal_per_100g IS NOT NULL
            OR fat_g IS NOT NULL
            OR carbohydrates_g IS NOT NULL
            OR sugars_g IS NOT NULL
            OR protein_g IS NOT NULL
            OR sodium_mg IS NOT NULL
            OR salt_g IS NOT NULL
            AS valid_nutrition

    FROM normalized_with_images
    """
)


for label, column in (
    ("Product name OK", "valid_name"),
    ("Barcode OK", "valid_barcode"),
    ("Ingredients OK", "valid_ingredients"),
    ("Nutri-Score OK", "valid_nutri_score"),
    ("Required nutrition OK", "valid_nutrition"),
):
    count = con.execute(
        f"SELECT COUNT(*) FROM validation WHERE {column}"
    ).fetchone()[0]

    print(f"{label}: {count:,}")


valid_condition = " AND ".join(
    (
        "valid_name",
        "valid_barcode",
        "valid_ingredients",
        "valid_nutri_score",
        "valid_nutrition",
    )
)


con.execute(
    f"""
    CREATE OR REPLACE TEMP TABLE rejected AS
    SELECT
        barcode,
        product_name,
        brand,
        ingredients,
        nutri_score,
        nova_group,
        kcal_per_100g,
        fat_g,
        saturated_fat_g,
        trans_fat_g,
        carbohydrates_g,
        sugars_g,
        fibre_g,
        protein_g,
        sodium_mg,
        salt_g,

        CASE
            WHEN NOT valid_name
                THEN 'missing_product_name'
            WHEN NOT valid_barcode
                THEN 'invalid_barcode'
            WHEN NOT valid_ingredients
                THEN 'missing_ingredients'
            WHEN NOT valid_nutri_score
                THEN 'missing_or_invalid_nutriscore'
            WHEN NOT valid_nutrition
                THEN 'missing_required_nutrition'
            ELSE 'unknown'
        END AS rejection_reason

    FROM validation
    WHERE NOT ({valid_condition})
    """
)


con.execute(
    f"""
    CREATE OR REPLACE TEMP TABLE eligible AS
    SELECT *
    FROM validation
    WHERE {valid_condition}
    """
)

eligible_count = con.execute(
    "SELECT COUNT(*) FROM eligible"
).fetchone()[0]

print(f"Eligible before dedup: {eligible_count:,}")


con.execute(
    """
    CREATE OR REPLACE TEMP TABLE deduplicated AS
    SELECT * EXCLUDE (row_number)
    FROM (
        SELECT
            *,
            ROW_NUMBER() OVER (
                PARTITION BY regexp_replace(
                    barcode,
                    '[^0-9]',
                    '',
                    'g'
                )
                ORDER BY
                    CASE
                        WHEN image_url IS NOT NULL THEN 0
                        ELSE 1
                    END,
                    CASE
                        WHEN brand IS NOT NULL THEN 0
                        ELSE 1
                    END,
                    CASE
                        WHEN ingredients IS NOT NULL THEN 0
                        ELSE 1
                    END
            ) AS row_number
        FROM eligible
    )
    WHERE row_number = 1
    """
)

deduplicated_count = con.execute(
    "SELECT COUNT(*) FROM deduplicated"
).fetchone()[0]

print(
    "Duplicate barcode records removed: "
    f"{eligible_count - deduplicated_count:,}"
)

print(f"Final V1 products: {deduplicated_count:,}")


con.execute(
    f"""
    CREATE OR REPLACE TEMP TABLE products_out AS
    SELECT
        {product_id_expression()} AS id,
        TRIM(product_name) AS name,
        NULLIF(TRIM(brand), '') AS brand,
        regexp_replace(
            barcode,
            '[^0-9]',
            '',
            'g'
        ) AS barcode,
        NULLIF(TRIM(ingredients), '') AS ingredients,
        nutri_score,
        nova_group,
        CURRENT_TIMESTAMP AS created_at,
        CURRENT_TIMESTAMP AS updated_at
    FROM deduplicated
    """
)


con.execute(
    f"""
    CREATE OR REPLACE TEMP TABLE product_images_out AS
    SELECT
        md5(
            'nutrascore-product-image|' ||
            regexp_replace(barcode, '[^0-9]', '', 'g')
        )::UUID AS id,

        {product_id_expression()} AS product_id,

        image_url,

        CASE
            WHEN image_url LIKE '%/front_en.%'
                THEN 'front_en'
            ELSE 'front_fr'
        END AS image_type,

        TRUE AS is_primary

    FROM deduplicated
    WHERE image_url IS NOT NULL
    """
)


con.execute(
    f"""
    CREATE OR REPLACE TEMP TABLE nutrition_out AS
    SELECT
        md5(
            'nutrascore-nutrition|' ||
            regexp_replace(barcode, '[^0-9]', '', 'g')
        )::UUID AS id,

        {product_id_expression()} AS product_id,

        kcal_per_100g,
        fat_g,
        saturated_fat_g,
        trans_fat_g,
        carbohydrates_g,
        sugars_g,
        fibre_g,
        protein_g,
        sodium_mg,
        salt_g

    FROM deduplicated
    """
)


con.execute(
    """
    CREATE OR REPLACE TEMP TABLE category_memberships AS
    SELECT DISTINCT
        md5(
            'nutrascore-product|' ||
            regexp_replace(
                d.barcode,
                '[^0-9]',
                '',
                'g'
            )
        )::UUID AS product_id,

        regexp_replace(
            LOWER(TRIM(category)),
            '^[a-z]{2}:',
            ''
        ) AS category_name

    FROM deduplicated AS d,
        UNNEST(d.categories_tags) AS t(category)

    WHERE category IS NOT NULL
        AND TRIM(category) <> ''
    """
)


con.execute(
    """
    CREATE OR REPLACE TEMP TABLE categories_normalized AS
    SELECT DISTINCT category_name
    FROM category_memberships
    """
)


con.execute(
    """
    CREATE OR REPLACE TEMP TABLE categories_out AS
    SELECT
        md5(
            'nutrascore-category|' ||
            category_name
        )::UUID AS id,

        category_name AS name,
        NULL::VARCHAR AS description

    FROM categories_normalized
    """
)


con.execute(
    """
    CREATE OR REPLACE TEMP TABLE product_categories_out AS
    SELECT DISTINCT
        memberships.product_id,
        categories.id AS category_id

    FROM category_memberships AS memberships

    INNER JOIN categories_out AS categories
        ON categories.name = memberships.category_name
    """
)


con.execute(
    """
    CREATE OR REPLACE TEMP TABLE allergen_memberships AS
    SELECT DISTINCT
        md5(
            'nutrascore-product|' ||
            regexp_replace(
                d.barcode,
                '[^0-9]',
                '',
                'g'
            )
        )::UUID AS product_id,

        regexp_replace(
            LOWER(TRIM(allergen)),
            '^[a-z]{2}:',
            ''
        ) AS allergen_name

    FROM deduplicated AS d,
        UNNEST(d.allergens_tags) AS t(allergen)

    WHERE allergen IS NOT NULL
        AND TRIM(allergen) <> ''
    """
)


con.execute(
    """
    CREATE OR REPLACE TEMP TABLE allergens_normalized AS
    SELECT DISTINCT allergen_name
    FROM allergen_memberships
    """
)


con.execute(
    """
    CREATE OR REPLACE TEMP TABLE allergens_out AS
    SELECT
        md5(
            'nutrascore-allergen|' ||
            allergen_name
        )::UUID AS id,

        allergen_name AS name

    FROM allergens_normalized
    """
)


con.execute(
    """
    CREATE OR REPLACE TEMP TABLE product_allergens_out AS
    SELECT DISTINCT
        memberships.product_id,
        allergens.id AS allergen_id

    FROM allergen_memberships AS memberships

    INNER JOIN allergens_out AS allergens
        ON allergens.name = memberships.allergen_name
    """
)


def export_table(table_name: str, filename: str):
    output_path = OUTPUT_DIR / filename

    con.execute(
        f"""
        COPY {table_name}
        TO '{output_path.as_posix()}'
        (FORMAT PARQUET, COMPRESSION ZSTD)
        """
    )

    count = con.execute(
        f"SELECT COUNT(*) FROM {table_name}"
    ).fetchone()[0]

    print(f"{filename}: {count:,} rows")


print("\n" + "=" * 70)
print("Exporting")
print("=" * 70)

for table_name, filename in (
    ("products_out", "products.parquet"),
    ("product_images_out", "product_images.parquet"),
    ("nutrition_out", "nutrition.parquet"),
    ("categories_out", "categories.parquet"),
    ("product_categories_out", "product_categories.parquet"),
    ("allergens_out", "allergens.parquet"),
    ("product_allergens_out", "product_allergens.parquet"),
    ("rejected", "rejected.parquet"),
):
    export_table(table_name, filename)


print("\nFinal validation")

for table_name, label in (
    ("products_out", "Products"),
    ("product_images_out", "Product images"),
    ("nutrition_out", "Nutrition"),
    ("categories_out", "Categories"),
    ("product_categories_out", "Product categories"),
    ("allergens_out", "Allergens"),
    ("product_allergens_out", "Product allergens"),
    ("rejected", "Rejected"),
):
    row_count = con.execute(
        f"SELECT COUNT(*) FROM {table_name}"
    ).fetchone()[0]

    print(f"{label}: {row_count:,}")


front_en_count = con.execute(
    """
    SELECT COUNT(*)
    FROM product_images_out
    WHERE image_type = 'front_en'
    """
).fetchone()[0]

front_fr_count = con.execute(
    """
    SELECT COUNT(*)
    FROM product_images_out
    WHERE image_type = 'front_fr'
    """
).fetchone()[0]

print(
    f"Image coverage: front_en={front_en_count:,}, "
    f"front_fr={front_fr_count:,}"
)

print("\nSample products:")

for row in con.execute(
    """
    SELECT
        name,
        brand,
        barcode,
        kcal_per_100g,
        sugars_g,
        protein_g,
        sodium_mg,
        salt_g

    FROM products_out p

    JOIN nutrition_out n
        ON p.id = n.product_id

    ORDER BY name
    LIMIT 5
    """
).fetchall():
    print(row)


print("\nTransformation complete.")

con.close()
