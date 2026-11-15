# Database schema and data dictionary

The active database contract is the
[Drizzle schema](../../apps/api/src/db/schema.ts) and the SQLite migrations in
[`apps/api/drizzle-sqlite/`](../../apps/api/drizzle-sqlite/). SQLite migrations are the only active database schema.

## Tables

The application uses five tables: `"Products"`, `categories`,
`product_categories`, `"Users"`, and `user_sessions`. Nutrition values are
stored directly on products. UUID identifiers are stored as text. Price and
numeric nutrition values use SQLite REAL columns.

The demonstration database contains 475 products, 203 categories, and 906
product-category relationships. The `product_categories` table connects
products to categories for category browsing and search filtering.

| Table | Purpose |
| --- | --- |
| `"Products"` | Product identity, price, ingredients, image, nutrition, and serving information. |
| `categories` | Unique category names and optional descriptions. |
| `product_categories` | Product/category links with a composite primary key and cascading foreign keys. |
| `"Users"` | Account email, password hash, role, and timestamps. |
| `user_sessions` | Session token hashes, expiry, and owning user. |

`"Products".nutrition_basis` is nullable and constrained to `per_serving`,
`per_100g`, `per_100ml`, or `NULL` when unknown. The frontend converts values
only when the serving unit matches the requested basis: grams are compatible
with per-100-g values and millilitres are compatible with per-100-ml values.
The cleaned CSV contains no basis field, so its import requires a basis
explicitly verified by the operator.

Products can have a nullable `image_url`. Moderators can set or clear it; the
API validates supplied URLs as public HTTPS image endpoints. The CSV import
does not overwrite image URLs or existing product values.

## Data import and preservation

`script/load_sqlite.py` adds products from the cleaned CSV and inserts missing
category links without replacing existing products. The optional
`script/sync_product_csv.py` tool synchronizes matched records; it creates a
report by default, while `--apply` is required to update matched prices and
nutrition. Its nutrition basis must be explicitly supplied.
