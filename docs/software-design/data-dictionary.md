# NutraScore data dictionary

This dictionary describes the active application schema in
[`schema.ts`](../../apps/api/src/db/schema.ts) and the JSON fields returned by
the API.

## Database entities

### `Products`

One row per packaged food product.

| Column | Type | Nullability | Purpose |
|---|---|---|---|
| `id` | `uuid` | Required | Product identifier |
| `name` | `varchar` | Required | Product name |
| `brand` | `varchar` | Nullable | Brand name |
| `ingredients` | `text` | Nullable | Ingredient text |
| `nutri_score` | `varchar` | Nullable | Nutri-Score label |
| `nova_group` | `smallint` | Nullable | NOVA classification |
| `price_inr` | `numeric` | Nullable | Price from the CSV source |
| `created_at` | `timestamptz` | Required | Record creation time |
| `updated_at` | `timestamptz` | Required | Last record update time |

### `Nutrition`

One nutrition record per product. Nutrient columns retain their database names;
`nutrition_basis` identifies whether source values are per serving or per
100 grams.

| Column | Type | Nullability | Purpose |
|---|---|---|---|
| `id` | `uuid` | Required | Nutrition record identifier |
| `product_id` | `uuid` | Required, unique | Related product |
| `kcal_per_100g` | `numeric` | Nullable | Energy |
| `fat_g` | `numeric` | Nullable | Total fat |
| `saturated_fat_g` | `numeric` | Nullable | Saturated fat |
| `trans_fat_g` | `numeric` | Nullable | Trans fat |
| `carbohydrates_g` | `numeric` | Nullable | Carbohydrates |
| `sugars_g` | `numeric` | Nullable | Sugars |
| `fibre_g` | `numeric` | Nullable | Dietary fibre |
| `protein_g` | `numeric` | Nullable | Protein |
| `sodium_mg` | `numeric` | Nullable | Sodium |
| `salt_g` | `numeric` | Nullable | Salt |
| `cholesterol_mg` | `numeric` | Nullable | Cholesterol |
| `calcium_mg` | `numeric` | Nullable | Calcium |
| `iron_mg` | `numeric` | Nullable | Iron |
| `vitamins` | `text` | Nullable | Source vitamin text |
| `serving_size` | `numeric` | Nullable | Serving quantity |
| `serving_unit` | `varchar(20)` | Nullable | Serving unit, such as `g` |
| `nutrition_basis` | `varchar(20)` | Required | `per_serving` or `per_100g` |

The CSV contains a serving size in grams but no field identifying the basis of
its nutrient amounts. The importer therefore leaves `nutrition_basis`
unspecified during a dry run and requires a verified `--nutrition-basis` value
before writing. Do not infer the basis solely from `Serving_Size_g` or the
database column names. The product detail and comparison views can convert
values when the selected basis and serving size in grams make conversion
possible.

### `ProductImages`

Product image records contain `id`, `product_id`, `image_url`, `image_type`,
and `is_primary`. Product queries select the primary image first.

### Image management

- `product_image_sources` records image source, confidence, licensing notes,
  and verification time.
- `product_image_reviews` records moderator review status and update time.

### Categories

- `categories` stores category identifiers, names, and optional descriptions.
- `product_categories` links products to categories using a composite key.

These relationships support category browsing, category filters, and category
selection in the moderator dashboard.

### Accounts and sessions

- `"Users"` stores a user's name, unique email, password hash, role, and
  timestamps.
- `user_sessions` stores a unique token hash, owning user, expiry, and creation
  time. Raw session tokens are held in HTTP-only cookies and are not stored in
  the database.

## API structures

Product responses include product identity, brand, ingredient text, image,
categories, nutrition labels, price, and nutrition values. Nutrition values
include a basis, serving size/unit, energy, macronutrients, sodium, salt,
cholesterol, calcium, iron, and vitamin text.

Search and category responses return product summaries with category and
nutrition information. Compare responses include full product and nutrition
details.

Registration accepts `{ name, email, password }`; login accepts
`{ email, password }`. Successful account requests return an `AuthUser` with
`id`, `name`, `email`, and a `user` or `moderator` role.

The moderator image update endpoint accepts `imageUrl`, optional `sourceUrl`,
optional `sourceName`, and `reviewStatus`. The API validates image URLs and
requires moderator authorization and CSRF validation.

## Configuration

- [`apps/api/.env.example`](../../apps/api/.env.example) documents
  `DATABASE_URL`, `PORT`, `WEB_ORIGIN`, and `UPLOAD_DIR`.
- [`apps/web/.env.example`](../../apps/web/.env.example) documents
  `PUBLIC_API_URL`.
