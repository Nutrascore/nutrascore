# Database schema and data dictionary

The active database contract is the
[Drizzle schema](../../apps/api/src/db/schema.ts) and the SQLite migrations in
[`apps/api/drizzle-sqlite/`](../../apps/api/drizzle-sqlite/). The older
PostgreSQL baseline in `apps/api/drizzle/` is retained as historical data.

## Tables

The application uses five tables: `"Products"`, `categories`,
`product_categories`, `"Users"`, and `user_sessions`. Nutrition values are
stored directly on products. UUID identifiers are stored as text. Decimal
values and timestamps are also stored as text to preserve their original
precision and representation; the API converts nutrition and price values to
numbers where needed.

| Table | Purpose |
| --- | --- |
| `"Products"` | Product identity, price, ingredients, image, nutrition, and serving information. |
| `categories` | Unique category names and optional descriptions. |
| `product_categories` | Product/category links with a composite primary key and cascading foreign keys. |
| `"Users"` | Account email, password hash, role, and timestamps. |
| `user_sessions` | Session token hashes, expiry, and owning user. |

`"Products".nutrition_basis` is nullable and constrained to `per_serving`,
`per_100g`, or `NULL` when unknown. The API does not automatically convert
between bases. The cleaned CSV contains no basis field, so its import requires
a basis explicitly verified by the operator.

Products can have a nullable `image_url`. Moderators can set or clear it; the
API validates supplied URLs as public HTTPS image endpoints. The CSV import
does not overwrite image URLs or existing product values.

## Data import and preservation

`script/load_sqlite.py` adds products from the cleaned CSV and inserts missing
category links without replacing existing products. Run
`script/migrate_postgres_to_sqlite.py` first to copy application records from
an existing PostgreSQL database. That script reads PostgreSQL in read-only
mode and refuses to write to a non-empty SQLite destination. It transfers
products, categories, links, users, and sessions and verifies foreign keys.

`script/sync_product_csv.py` remains an optional matched-record synchronization
tool. It creates a report by default; `--apply` is required to update matched
prices and nutrition, and the nutrition basis must be explicitly supplied.
