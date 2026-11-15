# NutraScore

NutraScore is a small Indian packaged-food discovery and comparison platform.
It uses a local SQLite database for an offline-friendly demonstration dataset.

## Features

- Search products and browse categories.
- View product ingredients, price, image, and nutrition.
- Compare exactly two products.
- Register, sign in, and manage sessions.
- Moderators can add, edit, and delete products.

## Technology

- SvelteKit, Svelte 5, TypeScript, and Vite.
- Fastify and TypeScript API.
- SQLite in a local file, accessed through Drizzle ORM (475 products and 906 product-category relationships in the demonstration database).
- Vitest.

## Prerequisites

- Node.js 24 and pnpm 10 (`corepack enable`).
- Python 3.13 only when using the CSV import or validation scripts.

## Install

```sh
git clone https://github.com/Nutrascore/nutrascore.git
cd nutrascore
pnpm install --frozen-lockfile
```

Create `apps/api/.env` from `apps/api/.env.example`. The default database path
is `data/nutrascore.sqlite`; set `NUTRASCORE_DB_PATH` to use another file.
Create the repository-root `.env` from `apps/web/.env.example` and set:

```dotenv
PUBLIC_API_URL=http://localhost:3000
```

## Database setup

Create the local database tables with Drizzle:

```sh
pnpm db:migrate
```

The migration creates an empty database. The demonstration database already
contains 475 products, 203 categories, and 906 product-category relationships.
To load a cleaned CSV into a new local database, provide a verified nutrition
basis because the source CSV does not specify whether values are per serving or
per 100 g:

```sh
python script/load_sqlite.py --apply --nutrition-basis per_serving
```

The importer adds missing products, categories, and category links without
overwriting existing product records. Nutrition values may be imported per
serving, per 100 g, or per 100 ml; the selected basis is stored with each
product.

SQLite migrations are kept in `apps/api/drizzle-sqlite/`. They rebuild the
Products table in place when column types or names change, preserving records.

## Run

Run each command in a separate terminal from the repository root:

```sh
pnpm dev:api
pnpm dev:web
```

The web app is at <http://localhost:5173>, the API is at
<http://localhost:3000>, and its health endpoint is
<http://localhost:3000/api/health>.

## Tests and checks

```sh
pnpm lint
pnpm format
pnpm typecheck
pnpm unit-test
pnpm integration-test
pnpm build
pnpm check
```

Tests use Vitest and do not require external services.
