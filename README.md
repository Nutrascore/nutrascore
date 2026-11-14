# NutraScore

NutraScore helps users find, view, and compare packaged-food products sold in India.

## Features

- Search products and browse categories.
- View product ingredients, price, image, and nutrition.
- Compare two products.
- Register, sign in, and manage sessions.
- Moderator product management.

## Technology

- SvelteKit, Svelte 5, TypeScript, and Vite.
- Fastify and TypeScript API.
- SQLite in a local file, accessed through Drizzle ORM.
- Vitest.

## Prerequisites

- Node.js 24 and pnpm 10 (`corepack enable`).
- Python 3.13 only for the CSV and existing-database import scripts.

Install the optional Python tools when using the data scripts:

```sh
python -m pip install -r requirements-test.txt
```

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

The migration creates an empty database. Import the cleaned product CSV with a
verified nutrition basis (the source CSV does not specify whether values are
per serving or per 100 g):

```sh
python script/load_sqlite.py --apply --nutrition-basis per_serving
```

The importer adds missing products and category links without overwriting
existing records. To transfer data from an existing PostgreSQL database first,
see `script/migrate_postgres_to_sqlite.py`; the source is read-only and the
SQLite destination must be empty. It requires `psycopg` from
`requirements-test.txt` and a `POSTGRES_MIGRATION_URL`.

Generate a migration after changing the schema with `pnpm db:generate`.
SQLite migrations are kept in `apps/api/drizzle-sqlite/`; the historical
PostgreSQL migration is retained separately in `apps/api/drizzle/`.

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
