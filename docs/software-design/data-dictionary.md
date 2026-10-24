# NutraScore data dictionary

This dictionary distinguishes PostgreSQL columns from JSON API fields. Database
definitions are taken from [`schema.ts`](../../apps/api/src/db/schema.ts) and
the SQL migrations in [`apps/api/drizzle/`](../../apps/api/drizzle/).

## Database entities

### `Products`

Purpose: canonical product identity and product-level nutrition labels.

| Column | PostgreSQL type | Nullability/default | Key/constraints | Relationships |
|---|---|---|---|---|
| `id` | `uuid` | `NOT NULL` | Primary key | Referenced by product relationship tables |
| `name` | `varchar` | `NOT NULL` | — | Displayed/searchable product name |
| `brand` | `varchar` | Nullable | — | Displayed/searchable brand |
| `barcode` | `varchar` | Nullable | Unique when present | Used by `/api/products/barcode/:barcode` |
| `ingredients` | `text` | Nullable | — | Returned by product/compare/barcode APIs |
| `nutri_score` | `varchar` | Nullable | — | Returned as `nutriScore` |
| `nova_group` | `smallint` | Nullable | — | Returned as `novaGroup` |
| `created_at` | `timestamptz` | `NOT NULL` | — | Import metadata |
| `updated_at` | `timestamptz` | `NOT NULL` | — | Import/update metadata |

### `Nutrition`

Purpose: one nutrition record per product, values generally expressed per 100 g.

| Column | PostgreSQL type | Nullability/default | Key/constraints | Relationships |
|---|---|---|---|---|
| `id` | `uuid` | `NOT NULL` | Primary key | Nutrition row identity |
| `product_id` | `uuid` | `NOT NULL` | Unique | One-to-one logical relationship to `Products.id` |
| `kcal_per_100g` | `numeric` | Nullable | — | API `nutrition.kcalPer100g` |
| `fat_g` | `numeric` | Nullable | — | API `nutrition.fatG` |
| `saturated_fat_g` | `numeric` | Nullable | — | API `nutrition.saturatedFatG` |
| `trans_fat_g` | `numeric` | Nullable | — | API `nutrition.transFatG` |
| `carbohydrates_g` | `numeric` | Nullable | — | API `nutrition.carbohydratesG` |
| `sugars_g` | `numeric` | Nullable | — | API `nutrition.sugarsG` |
| `fibre_g` | `numeric` | Nullable | — | API `nutrition.fibreG` |
| `protein_g` | `numeric` | Nullable | — | API `nutrition.proteinG` |
| `sodium_mg` | `numeric` | Nullable | — | API `nutrition.sodiumMg` |
| `salt_g` | `numeric` | Nullable | — | API `nutrition.saltG` |

### `ProductImages`

Purpose: product image candidates/records selected as primary by API query
ordering.

| Column | PostgreSQL type | Nullability/default | Key/constraints | Relationships |
|---|---|---|---|---|
| `id` | `uuid` | `NOT NULL` | Primary key | Image row identity |
| `product_id` | `uuid` | `NOT NULL` | No unique constraint in current schema | Logical relationship to `Products.id` |
| `image_url` | `text` | `NOT NULL` | Stored direct image URL | Returned as API `imageUrl` |
| `image_type` | `varchar` | Nullable | Import/moderator code uses `product` | Image classification |
| `is_primary` | `boolean` | `NOT NULL` | API orders `TRUE` first, then `id` | Primary image selection |

The current product queries use a lateral subquery ordered by
`is_primary DESC, id`, not a database-enforced single-primary constraint.

### `product_image_sources`

Purpose: source/provenance for image enrichment or moderator image changes.

| Column | PostgreSQL type | Nullability/default | Key/constraints | Relationships |
|---|---|---|---|---|
| `product_id` | `uuid` | `NOT NULL` | Primary key; migration FK to `Products.id` | One provenance row per product |
| `source_name` | `varchar` | `NOT NULL` | — | Source label |
| `source_url` | `text` | `NOT NULL` | — | Source page URL |
| `match_confidence` | `numeric` | `NOT NULL` | — | Enrichment/moderator confidence value |
| `license_metadata` | `text` | Nullable | — | Rights/provenance note |
| `verified_at` | `timestamptz` | `NOT NULL` | — | Verification/update timestamp |

### `product_image_reviews`

Purpose: separate moderator review state for an image/provenance record.

| Column | PostgreSQL type | Nullability/default | Key/constraints | Relationships |
|---|---|---|---|---|
| `product_id` | `uuid` | `NOT NULL` | Primary key; FK to `Products.id` with cascade delete | One review state per product |
| `review_status` | `varchar(20)` | `NOT NULL` | Default `needs_review`; check: `verified` or `needs_review` | Moderator filter/state |
| `updated_at` | `timestamptz` | `NOT NULL` | Default `NOW()` | Last review-state update |

### `categories`

| Column | PostgreSQL type | Nullability/default | Key/constraints |
|---|---|---|---|
| `id` | `uuid` | `NOT NULL` | Primary key |
| `name` | `varchar` | `NOT NULL` | Unique |
| `description` | `text` | Nullable | — |

### `product_categories`

| Column | PostgreSQL type | Nullability/default | Key/constraints |
|---|---|---|---|
| `product_id` | `uuid` | `NOT NULL` | Composite primary key with `category_id` |
| `category_id` | `uuid` | `NOT NULL` | Composite primary key with `product_id` |

This is the many-to-many logical relationship between `Products` and
`categories`, used by category browsing and search filters.

### `allergens`

| Column | PostgreSQL type | Nullability/default | Key/constraints |
|---|---|---|---|
| `id` | `uuid` | `NOT NULL` | Primary key |
| `name` | `varchar` | `NOT NULL` | Unique |

### `product_allergens`

| Column | PostgreSQL type | Nullability/default | Key/constraints |
|---|---|---|---|
| `product_id` | `uuid` | `NOT NULL` | Composite primary key with `allergen_id` |
| `allergen_id` | `uuid` | `NOT NULL` | Composite primary key with `product_id` |

### `"Users"`

Purpose: registered account identity and authorization role.

| Column | PostgreSQL type | Nullability/default | Key/constraints |
|---|---|---|---|
| `id` | `uuid` | `NOT NULL` | Primary key |
| `name` | `varchar(120)` | `NOT NULL` | Registration length: 2–120 characters |
| `email` | `varchar(320)` | `NOT NULL` | Unique; normalized to lowercase |
| `password_hash` | `text` | `NOT NULL` | bcrypt hash; never returned |
| `role` | `varchar(20)` | `NOT NULL` | Default `user`; check: `user` or `moderator` |
| `created_at` | `timestamptz` | `NOT NULL` | Default `NOW()` |
| `updated_at` | `timestamptz` | `NOT NULL` | Default `NOW()` |

Public registration does not accept a role. Promotion uses the administrative
[`promote-moderator.ts`](../../apps/api/src/admin/promote-moderator.ts) command.

### `user_sessions`

| Column | PostgreSQL type | Nullability/default | Key/constraints |
|---|---|---|---|
| `id` | `uuid` | `NOT NULL` | Primary key |
| `user_id` | `uuid` | `NOT NULL` | FK to `"Users".id`, cascade delete |
| `token_hash` | `varchar(64)` | `NOT NULL` | Unique SHA-256 hash of opaque cookie token |
| `expires_at` | `timestamptz` | `NOT NULL` | Indexed; API creates 30-day sessions |
| `created_at` | `timestamptz` | `NOT NULL` | Default `NOW()` |

The raw session token is held in the HTTP-only cookie
`nutrascore_session`; only its hash is stored in PostgreSQL.

### `product_likes`

| Column | PostgreSQL type | Nullability/default | Key/constraints |
|---|---|---|---|
| `user_id` | `uuid` | `NOT NULL` | Composite primary key with `product_id`; FK to Users |
| `product_id` | `uuid` | `NOT NULL` | Composite primary key; FK to Products |
| `created_at` | `timestamptz` | `NOT NULL` | Default `NOW()` |

The composite key prevents duplicate likes per user/product. An index exists
on `product_id` for count queries.

### `product_favourites`

Same columns, keys, and foreign-key relationships as `product_likes`. The
composite primary key prevents duplicate favourites and an index exists on
`product_id`.

### `product_barcode_sources`

Purpose: provenance for barcode enrichment.

| Column | PostgreSQL type | Nullability/default | Key/constraints |
|---|---|---|---|
| `product_id` | `uuid` | `NOT NULL` | Primary key in migration |
| `source_name` | `varchar` | `NOT NULL` | — |
| `lookup_date` | `timestamptz` | `NOT NULL` | — |
| `matched_name` | `text` | Nullable | — |
| `matched_brand` | `text` | Nullable | — |
| `confidence` | `numeric` | Nullable | — |
| `verification_status` | `varchar` | `NOT NULL` | — |
| `source_url` | `text` | Nullable | — |

The current barcode API reads `Products` and `ProductImages`; this table is
provenance storage rather than a response field in the route implementation.

## API structures

### Product response

Returned by product detail, and structurally similar to compare/barcode
responses:

```json
{
  "id": "uuid",
  "name": "string",
  "brand": "string|null",
  "barcode": "string|null",
  "ingredients": "string|null",
  "imageUrl": "string|null",
  "likeCount": 0,
  "isLiked": false,
  "isFavourite": false,
  "categories": ["string"],
  "allergens": ["string"],
  "nutriScore": "string|null",
  "novaGroup": "number|null",
  "nutrition": {
    "kcalPer100g": "numeric string|null",
    "fatG": "numeric string|null",
    "saturatedFatG": "numeric string|null",
    "transFatG": "numeric string|null",
    "carbohydratesG": "numeric string|null",
    "sugarsG": "numeric string|null",
    "fibreG": "numeric string|null",
    "proteinG": "numeric string|null",
    "sodiumMg": "numeric string|null",
    "saltG": "numeric string|null"
  }
}
```

Search summaries contain identity, image, category, Nutri-Score/NOVA,
nutrition, and engagement fields. Category and compare routes return subsets
without engagement fields.

### Authentication requests/responses

Registration request: `{ name, email, password }`. Login request:
`{ email, password }`. Names are trimmed; emails are lowercased and checked
with the API email pattern; passwords must be 8–128 characters.

Successful registration/login returns:

```json
{ "user": { "id": "uuid", "name": "string", "email": "string", "role": "user|moderator" } }
```

`GET /api/auth/me` returns `{ "user": AuthUser|null }`. Logout returns
`{ "ok": true }`.

### Favourites response

`GET /api/account/favourites` returns `{ products: [...] }` with product id,
name, brand, barcode, selected image URL, and aggregate like count.

### Moderator image update request

`PUT /api/moderator/products/:id/image` accepts:

```json
{
  "imageUrl": "https://...",
  "sourceUrl": "https://...",
  "sourceName": "string",
  "reviewStatus": "verified|needs_review"
}
```

The API requires moderator authorization and CSRF validation. `imageUrl` must
be HTTPS, resolve to a public host, respond successfully, and return an
`image/*` content type. `sourceUrl` is optional in the implementation and
defaults to `imageUrl`; `sourceName` is also optional. The default review
status is `needs_review`.

## Configuration and limitations

- [`apps/api/.env.example`](../../apps/api/.env.example) documents
  `DATABASE_URL`, `PORT`, and `WEB_ORIGIN`; real environment values are not
  reproduced here.
- The legacy `0000_majestic_magus.sql` contains a generic lower-case
  `products` table definition that does not describe the imported
  `"Products"` catalogue used by current routes. Current application schema
  and data import code are the authoritative descriptions.
- Several relationship tables have logical relationships represented by joins
  in code; not every relationship is declared as a foreign key in
  `schema.ts`. The migration is the source of truth where it explicitly adds
  foreign keys.
