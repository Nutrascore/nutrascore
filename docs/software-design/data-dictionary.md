# NutraScore data dictionary

This reference describes the tables used by the current application.
Sources of truth are the
[Drizzle schema](../../apps/api/src/db/schema.ts), SQL migrations in
[`apps/api/drizzle/`](../../apps/api/drizzle/), API queries and response types,
and [`script/load_postgres.py`](../../script/load_postgres.py).

## Current application tables

### `"Products"`

One row per packaged product.

| Column        | PostgreSQL type                            | Nullability / constraints | Purpose                                                                                          |
| ------------- | ------------------------------------------ | ------------------------- | ------------------------------------------------------------------------------------------------ |
| `id`          | `uuid`                                     | NOT NULL, primary key     | Stable product identifier; CSV IDs are generated deterministically from the source row identity. |
| `name`        | `varchar`                                  | NOT NULL                  | Product name.                                                                                    |
| `brand`       | `varchar`                                  | Nullable                  | Brand name.                                                                                      |
| `ingredients` | `text`                                     | Nullable                  | Ingredient statement.                                                                            |
| `nutri_score` | `varchar`                                  | Nullable                  | Optional Nutri-Score label.                                                                      |
| `nova_group`  | `smallint`                                 | Nullable                  | Optional NOVA group.                                                                             |
| `price_inr`   | `numeric`                                  | Nullable                  | Product price in Indian rupees (INR), sourced from `Price_INR` by the CSV importer.              |
| `created_at`  | `timestamp with time zone` (`timestamptz`) | NOT NULL                  | Creation time. The initial `"Products"` migration does not define a database default.            |
| `updated_at`  | `timestamptz`                              | NOT NULL                  | Last update time; importer and moderator operations set it explicitly.                           |

### `"Nutrition"`

Zero or one nutrition row per product. `product_id` is unique and references
`"Products".id` with `ON DELETE CASCADE`. The importer supplies a row for each
CSV product; API reads use a left join, so missing nutrition data can still be
returned as `null`.

| Column            | PostgreSQL type | Nullability / constraints                                              | Purpose and interpretation                                                                                            |
| ----------------- | --------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `id`              | `uuid`          | NOT NULL, primary key                                                  | Nutrition-row identifier.                                                                                             |
| `product_id`      | `uuid`          | NOT NULL, unique, FK to `"Products".id`                                | Owning product.                                                                                                       |
| `kcal_per_100g`   | `numeric`       | Nullable                                                               | Energy value. Despite the column name, the source basis is not established by the column name; use `nutrition_basis`. |
| `fat_g`           | `numeric`       | Nullable                                                               | Total fat, grams.                                                                                                     |
| `saturated_fat_g` | `numeric`       | Nullable                                                               | Saturated fat, grams.                                                                                                 |
| `trans_fat_g`     | `numeric`       | Nullable                                                               | Trans fat, grams.                                                                                                     |
| `carbohydrates_g` | `numeric`       | Nullable                                                               | Carbohydrates, grams.                                                                                                 |
| `sugars_g`        | `numeric`       | Nullable                                                               | Sugars, grams.                                                                                                        |
| `fibre_g`         | `numeric`       | Nullable                                                               | Dietary fibre, grams.                                                                                                 |
| `protein_g`       | `numeric`       | Nullable                                                               | Protein, grams.                                                                                                       |
| `sodium_mg`       | `numeric`       | Nullable                                                               | Sodium, milligrams.                                                                                                   |
| `salt_g`          | `numeric`       | Nullable                                                               | Salt, grams.                                                                                                          |
| `cholesterol_mg`  | `numeric`       | Nullable                                                               | Cholesterol, milligrams.                                                                                              |
| `calcium_mg`      | `numeric`       | Nullable                                                               | Calcium, milligrams.                                                                                                  |
| `iron_mg`         | `numeric`       | Nullable                                                               | Iron, milligrams.                                                                                                     |
| `vitamins`        | `text`          | Nullable                                                               | Vitamin text from the source.                                                                                         |
| `serving_size`    | `numeric`       | Nullable                                                               | Serving quantity. For this dataset it maps from `Serving_Size_g`.                                                     |
| `serving_unit`    | `varchar(20)`   | Nullable                                                               | Serving unit; the importer sets `g` when a serving size is present.                                                   |
| `nutrition_basis` | `varchar(20)`   | NOT NULL, default `'per_100g'`, CHECK in `('per_serving', 'per_100g')` | Declares the basis for the nutrient amounts. The default is a schema default, not proof of the dataset's basis.       |

The cleaned CSV does not contain a nutrition-basis column. The importer leaves
the basis unspecified for a dry run and requires the operator to explicitly
provide a verified `--nutrition-basis` for `--apply`. Do not infer the basis
from `Serving_Size_g` or column names. Values from missing CSV fields are
imported as SQL `NULL` for the corresponding CSV-owned field. Nutrient numeric
columns are nullable, so missing source measurements are represented without
fabricating values.

### `categories` and `product_categories`

`categories` stores category names; `product_categories` is the many-to-many
link between `"Products"` and `categories`.

#### `categories`

| Column        | PostgreSQL type | Nullability / constraints | Purpose                        |
| ------------- | --------------- | ------------------------- | ------------------------------ |
| `id`          | `uuid`          | NOT NULL, primary key     | Category identifier.           |
| `name`        | `varchar`       | NOT NULL, unique          | Category name.                 |
| `description` | `text`          | Nullable                  | Optional category description. |

#### `product_categories`

| Column        | PostgreSQL type | Nullability / constraints                                                               | Purpose          |
| ------------- | --------------- | --------------------------------------------------------------------------------------- | ---------------- |
| `product_id`  | `uuid`          | NOT NULL, FK to `"Products".id` with `ON DELETE CASCADE`; part of composite primary key | Linked product.  |
| `category_id` | `uuid`          | NOT NULL, FK to `categories.id` with `ON DELETE CASCADE`; part of composite primary key | Linked category. |

The importer creates associations from both `Category` and `Sub_Category`
source columns. API search/category queries join through this table. A product
can therefore have multiple category links; the API's summary response may
choose one category label for display.

### `"ProductImages"`

| Column       | PostgreSQL type | Nullability / constraints                                | Purpose                                                               |
| ------------ | --------------- | -------------------------------------------------------- | --------------------------------------------------------------------- |
| `id`         | `uuid`          | NOT NULL, primary key                                    | Image record identifier.                                              |
| `product_id` | `uuid`          | NOT NULL, FK to `"Products".id` with `ON DELETE CASCADE` | Product owning the image.                                             |
| `image_url`  | `text`          | NOT NULL                                                 | URL returned or reviewed by the application.                          |
| `image_type` | `varchar`       | Nullable                                                 | Optional image type.                                                  |
| `is_primary` | `boolean`       | NOT NULL                                                 | Marks a preferred image; public product queries select primary first. |

The current API can return, set, and remove a moderator-supplied product
image. It does not run automated image discovery.

### `product_image_sources`

Migration-created provenance table used by moderator product/image views.

| Column             | PostgreSQL type | Nullability / constraints                       | Purpose                                                                                         |
| ------------------ | --------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `product_id`       | `uuid`          | NOT NULL, primary key and FK to `"Products".id` | Product whose image provenance is recorded. The migration does not specify `ON DELETE CASCADE`. |
| `source_name`      | `varchar`       | NOT NULL                                        | Name of the image source.                                                                       |
| `source_url`       | `text`          | NOT NULL                                        | Source URL.                                                                                     |
| `match_confidence` | `numeric`       | NOT NULL                                        | Recorded match confidence.                                                                      |
| `license_metadata` | `text`          | Nullable                                        | Source/license notes.                                                                           |
| `verified_at`      | `timestamptz`   | NOT NULL                                        | Verification timestamp.                                                                         |

The route currently writes moderator-provided source name and URL. Confidence,
license metadata, and verification time are migration-defined provenance
fields; they are not part of the current frontend's editable form.

### `product_image_reviews`

| Column          | PostgreSQL type | Nullability / constraints                                                | Default / purpose                                     |
| --------------- | --------------- | ------------------------------------------------------------------------ | ----------------------------------------------------- |
| `product_id`    | `uuid`          | NOT NULL, primary key and FK to `"Products".id` with `ON DELETE CASCADE` | Product whose current image review state is recorded. |
| `review_status` | `varchar(20)`   | NOT NULL, CHECK in `('verified', 'needs_review')`                        | Defaults to `'needs_review'`; moderator review state. |
| `updated_at`    | `timestamptz`   | NOT NULL                                                                 | Defaults to `NOW()`; latest review-state update.      |

### `"Users"`

| Column          | PostgreSQL type | Nullability / constraints                  | Default / purpose                                                                                          |
| --------------- | --------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `id`            | `uuid`          | NOT NULL, primary key                      | User identifier.                                                                                           |
| `name`          | `varchar(120)`  | NOT NULL                                   | Display name.                                                                                              |
| `email`         | `varchar(320)`  | NOT NULL, unique                           | Login email; normalized to lowercase by the API.                                                           |
| `password_hash` | `text`          | NOT NULL                                   | bcrypt password hash; never returned to clients.                                                           |
| `role`          | `varchar(20)`   | NOT NULL, CHECK in `('user', 'moderator')` | Defaults to `'user'`.                                                                                      |
| `created_at`    | `timestamptz`   | NOT NULL                                   | Defaults to `NOW()`.                                                                                       |
| `updated_at`    | `timestamptz`   | NOT NULL                                   | Defaults to `NOW()` on initial insert; update handling is performed by application logic where applicable. |

### `user_sessions`

| Column       | PostgreSQL type | Nullability / constraints                             | Default / purpose                                                     |
| ------------ | --------------- | ----------------------------------------------------- | --------------------------------------------------------------------- |
| `id`         | `uuid`          | NOT NULL, primary key                                 | Session-row identifier.                                               |
| `user_id`    | `uuid`          | NOT NULL, FK to `"Users".id` with `ON DELETE CASCADE` | Session owner.                                                        |
| `token_hash` | `varchar(64)`   | NOT NULL, unique                                      | SHA-256 hash of the opaque cookie token; the raw token is not stored. |
| `expires_at` | `timestamptz`   | NOT NULL                                              | Session expiration.                                                   |
| `created_at` | `timestamptz`   | NOT NULL, default `NOW()`                             | Session creation time.                                                |

Indexes exist on `user_id` and `expires_at`.

## CSV-to-database mapping

The maintained importer reads
[`data/raw/packaged_foods_india_cleaned.csv`](../../data/raw/packaged_foods_india_cleaned.csv);
it does not read the tracked `data/processed/` copy. Required CSV input fields
include `S.No`, `Item name`, `Brand_Name`, `Category`, `Sub_Category`,
`Ingredients`, `Serving_Size_g`, `Price_INR`, `Vitamin`, and the nutrient
columns. The importer maps:

| CSV field(s)                                                                                                                                                                            | Database field(s)                                                                                                                                                         |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Item name`, `Brand_Name`, `Ingredients`                                                                                                                                                | `"Products".name`, `brand`, `ingredients`                                                                                                                                 |
| `Price_INR`                                                                                                                                                                             | `"Products".price_inr` in INR                                                                                                                                             |
| `Serving_Size_g`                                                                                                                                                                        | `"Nutrition".serving_size`; `serving_unit` is set to `g` when present                                                                                                     |
| `Calories_kcal`, `Total_Fat_g`, `Saturated_Fat_g`, `Trans_Fat_g`, `Carbohydrates_g`, `Sugar_g`, `Dietary_Fiber_g`, `Proteins_g`, `Sodium_mg`, `Cholesterol_mg`, `Calcium_mg`, `Iron_mg` | `kcal_per_100g`, `fat_g`, `saturated_fat_g`, `trans_fat_g`, `carbohydrates_g`, `sugars_g`, `fibre_g`, `protein_g`, `sodium_mg`, `cholesterol_mg`, `calcium_mg`, `iron_mg` |
| `Vitamin`                                                                                                                                                                               | `"Nutrition".vitamins`                                                                                                                                                    |
| `Category`, `Sub_Category`                                                                                                                                                              | `categories` and `product_categories`                                                                                                                                     |

Although the database nutrient column names include `kcal_per_100g`, the
dataset does not specify whether nutrient values are per serving or per 100 g.
The importer requires an operator-selected, verified basis on apply. `price_inr`
represents Indian rupees; `serving_size` comes from the gram-valued source
column. Source metadata such as `Source_of_Data`, `Collection_Date`, and
`Collected_By` is present in the CSV but is not currently imported into the
application tables.

## API representation and relationships

Product, search, category, and comparison responses expose price as
`priceInr` and nutrition basis as `perServing`, `per100g`, or (in frontend
types) `unknown`. Nutrition database numeric values are nullable; API types
represent these values as nullable strings. Products are linked to nutrition
through the unique `Nutrition.product_id`; category memberships are
many-to-many through `product_categories`; images and review/provenance records
are product-keyed.

Authentication endpoints are registered under `/api/auth`; moderator product
and image operations are under `/api/moderator`. See
[`authentication.md`](../authentication.md) for session behavior and
[`README.md`](./README.md) for the documentation index.

## Configuration

- [`apps/api/.env.example`](../../apps/api/.env.example): `DATABASE_URL`,
  `PORT`, `WEB_ORIGIN`, and `UPLOAD_DIR`.
- [`apps/web/.env.example`](../../apps/web/.env.example): `PUBLIC_API_URL`.
