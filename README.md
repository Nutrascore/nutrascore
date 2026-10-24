# NutraScore

NutraScore helps people discover packaged foods sold in India and compare
their nutrition, ingredients, serving sizes, prices, and categories. Registered
users can manage accounts, and moderators can manage product details and image
reviews.

## Repository layout

- `apps/web/` — SvelteKit user interface.
- `apps/api/` — Fastify API, PostgreSQL access, and Drizzle migrations.
- `data/raw/` — source and cleaned product CSV files.
- `script/` — CSV preparation, PostgreSQL import/synchronization, and image
  maintenance scripts.
- `tests/` — web, API, and script tests.

## Requirements

- Node.js 24 and pnpm 10.
- PostgreSQL 17.
- Python 3.13 for the CSV and maintenance scripts.

Install JavaScript dependencies at the repository root:

```sh
pnpm install
```

Install Python dependencies for the CSV tools and tests:

```sh
python -m pip install -r requirements-test.txt
```

## Local PostgreSQL and environment

Start your local PostgreSQL service and create a database named `nutrascore`
owned by the role you will use in `DATABASE_URL`. For example, from `psql`
connected as a PostgreSQL administrator:

```sql
CREATE ROLE nutrascore LOGIN PASSWORD 'choose-a-local-password';
CREATE DATABASE nutrascore OWNER nutrascore;
```

Copy `apps/api/.env.example` to `apps/api/.env` and set `DATABASE_URL` to the
local database. The API also uses `PORT`, `WEB_ORIGIN`, and `UPLOAD_DIR`.
Copy `apps/web/.env.example` to `apps/web/.env`; set `PUBLIC_API_URL` if the API
is not listening at `http://localhost:3000`.

Apply the database migrations from the repository root:

```sh
pnpm db:migrate
```

The raw and cleaned CSV files are maintained in `data/raw/`. Recreate the
cleaned file from the source file when needed, then validate the data and review the local-only dry run:

```sh
python script/ingredient_cleaner.py
python script/validate_dataset.py
python script/load_postgres.py
```

The importer reads `data/raw/packaged_foods_india_cleaned.csv`. The CSV does
not declare whether nutrition values are per serving or per 100 g, so verify
the source basis before applying changes and state it explicitly:

```sh
# Use only the basis confirmed by the source documentation.
python script/load_postgres.py --apply --nutrition-basis per_serving
```

Replace `per_serving` with `per_100g` if that is what the source documents; do
not infer either basis from this CSV alone. The apply mode
validates the existing schema, creates logical CSV exports of affected tables,
and updates CSV-owned product, nutrition, and category data in a transaction.
Missing CSV values clear their corresponding CSV-owned fields; product labels,
images, and other fields absent from the CSV are preserved. CSV exports are
not complete PostgreSQL backups or an automatic restore mechanism. The
importer does not recreate the database or run migrations.

## Data and image maintenance

- `script/ingredient_cleaner.py` reproducibly generates the cleaned CSV from
  the source CSV; the existing local cleaned file can be used directly when it
  is already current.
- `script/load_postgres.py` defaults to a local-only dry run. Use `--apply`
  only after reviewing the data and supplying a verified nutrition basis.
- `script/validate_dataset.py` checks CSV structure and data quality before an
  import. Review its duplicate and suspicious-row reports manually; flagged
  rows are not automatically corrected or excluded.
- `script/sync_product_csv.py` is an occasional migration helper for matching
  CSV rows to existing product IDs. It is a dry run by default; inspect its
  report before using `--apply` to update existing database rows.
- `script/enrich_product_images_browser.py` searches for products with no
  usable image. It is a dry run by default; `--write` saves an image and source
  for moderator review.
- `script/replace_product_images_google.py` is an occasional image-repair
  utility for products that already have an image. It is a dry run by default
  and writes replacements through the authenticated moderator API, marking them
  for review.

Maintenance reports are written under `data/reports/`; importer backups are
kept under `data/backups/`. These outputs and the source data are local assets,
not generated as part of normal application builds.

## Run the application

Start the API and web application in separate terminals:

```sh
pnpm dev:api
pnpm dev:web
```

The web application is available at `http://localhost:5173`; the API defaults
to `http://localhost:3000`.

To promote an existing registered account to moderator:

```sh
pnpm --filter api admin:promote-moderator -- moderator@example.com
```

Moderators can manage product details, product images, and image review status
from the moderator dashboard.

## Checks and tests

```sh
pnpm check
pnpm test:unit
pnpm test:integration
pnpm test
pnpm build
```

The integration check needs PostgreSQL configured by `DATABASE_URL`. Unit
tests do not require external services. There are no browser end-to-end tests
currently, so the unit and integration commands do not install browser
dependencies.
