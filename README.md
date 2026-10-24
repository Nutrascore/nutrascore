# NutraScore

NutraScore is a platform for discovering, comparing, and understanding
packaged food products sold in India. It brings product names, brands,
ingredients, nutrition values, serving information, categories, prices, and
available images together in a searchable catalogue.

## Problem statement and objectives

Nutrition and ingredient details for packaged foods can be difficult to find
and compare across products. NutraScore provides a single interface for
exploring the available product records and comparing their nutrition and
price information.

Project objectives:

- provide product discovery by text and category,
- present product details and available nutrition/serving information,
- support side-by-side comparison of selected products,
- provide account and moderator tools for maintaining catalogue records,
- document a reproducible local development and data import workflow.

The catalogue covers packaged products sold in India; it does not imply that
all listed products are manufactured in India.

## Implemented features

- Search products by name or brand, with autocomplete, category filters, and
  paginated results.
- Browse categories and their products.
- View product details, including available brand, ingredients, category,
  price, image, serving information, and nutrition data.
- Compare two products in the current web interface. The API accepts two to
  four product IDs.
- Register, sign in, view the current profile, and sign out using
  CSRF-protected sessions.
- Let moderators search, create, edit, and delete product records and manage
  product images and review status.

The application does not currently implement favorites, barcode scanning,
automated image discovery/enrichment, or AI features.

## Technology stack and architecture

- **Frontend:** SvelteKit, Svelte, TypeScript, and Vite.
- **API:** Fastify and TypeScript.
- **Database:** PostgreSQL, accessed at runtime through the `pg` connection
  pool. Drizzle Kit uses the Drizzle schema and SQL migration journal for
  database migrations.
- **Data import:** Python with pandas and DuckDB.
- **Checks:** Svelte/TypeScript checks, ESLint/Prettier, Vitest, and Python
  `unittest`.

The web client calls the Fastify API. API route modules read and write
PostgreSQL. Separately, a developer or data administrator can run the Python
CSV importer to validate and load product data after database migrations.
The importer is not part of the application's runtime request path.

## Repository structure

```text
apps/
  api/
    drizzle/              SQL migrations and migration journal
    src/
      db/                 Drizzle schema and PostgreSQL pool
      routes/             Product, search, category, comparison, auth, moderator
  web/
    src/
      lib/                API clients, components, stores, and utilities
      routes/             Home, discovery, product, compare, account, moderator
data/
  processed/              Tracked cleaned CSV copy
  raw/                    Raw and cleaned CSV files used by the importer
docs/
  software-design/        DFDs, structure chart, data dictionary
script/
  load_postgres.py        Validated CSV import to PostgreSQL
  sync_product_csv.py     CSV synchronization utility
  validate_dataset.py     Dataset checks
tests/
  integration/            PostgreSQL integration check
  unit/                   Frontend, API, and Python script tests
```

## Dataset, provenance, and licensing

The cleaned dataset is present in both
[`data/processed/packaged_foods_india_cleaned.csv`](./data/processed/packaged_foods_india_cleaned.csv)
and
[`data/raw/packaged_foods_india_cleaned.csv`](./data/raw/packaged_foods_india_cleaned.csv).
The maintained importer currently reads the **raw-directory path**; the
processed copy is not its input. The CSV contains source metadata fields
including `Source_of_Data`, `Collection_Date`, and `Collected_By`.

The repository does not establish ownership or redistribution terms for the
dataset. Verify the original source's permission and license before
redistributing it. Do not infer the nutrition values' basis from the field
names or serving size: the CSV has no nutrition-basis field, and import writes
require a basis verified from an authoritative source.

## Prerequisites

The CI workflow is configured with Node.js 24, pnpm 10, Python 3.13, and
PostgreSQL 17. Use those versions for the documented development workflow.
Git and a locally installed PostgreSQL 17 server are required.

## First-time setup (Windows PowerShell)

The commands below are run from PowerShell. First fork
`Nutrascore/nutrascore` on GitHub if you plan to contribute, then clone your
fork (replace the username with your GitHub username).

### 1. Clone the fork and enter the repository

```powershell
git clone https://github.com/<your-github-username>/nutrascore.git
Set-Location .\nutrascore
git remote add upstream https://github.com/Nutrascore/nutrascore.git
```

If you are not working from a fork, clone the upstream repository instead:

```powershell
git clone https://github.com/Nutrascore/nutrascore.git
Set-Location .\nutrascore
```

Create a working branch before making project changes:

```powershell
git switch -c work/my-change
```

### 2. Install JavaScript and Python dependencies

Install/use pnpm 10 through Corepack, then install exactly from the committed
lockfile:

```powershell
corepack enable
corepack prepare pnpm@10 --activate
pnpm install --frozen-lockfile
```

Python 3.13 is used by the CSV importer and Python unit tests. Create a local
virtual environment and install the repository's Python requirements:

```powershell
py -3.13 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements-test.txt
.\.venv\Scripts\Activate.ps1
```

If PowerShell blocks virtual-environment activation, allow it for this shell
only and activate again:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\.venv\Scripts\Activate.ps1
```

### 3. Start locally installed PostgreSQL 17 and create the development database

Install PostgreSQL 17 using the installer for your operating system, start
its local service, and connect as a PostgreSQL administrator:

```powershell
psql -U postgres -h localhost -p 5432 -d postgres
```

At the `psql` prompt, create a dedicated local role and database; replace the
placeholder password with a password of your choice:

```sql
CREATE ROLE nutrascore LOGIN PASSWORD '<choose-a-local-password>';
CREATE DATABASE nutrascore OWNER nutrascore;
\q
```

Verify the connection using `psql` (replace the placeholder and URL-encode any
reserved characters in the password):

```powershell
psql "postgresql://nutrascore:<your-local-password>@localhost:5432/nutrascore" -c "SELECT current_database(), current_user;"
```

### 4. Configure local environment files

From the repository root, copy the tracked examples:

```powershell
Copy-Item .\apps\api\.env.example .\apps\api\.env
Copy-Item .\apps\web\.env.example .\apps\web\.env
notepad .\apps\api\.env
notepad .\apps\web\.env
```

In `apps/api/.env`, set a database URL matching the role/password chosen
above, and retain or set the local API values:

```dotenv
DATABASE_URL=postgresql://nutrascore:<your-local-password>@localhost:5432/nutrascore
PORT=3000
WEB_ORIGIN=http://localhost:5173
UPLOAD_DIR=./uploads
```

In `apps/web/.env`, use:

```dotenv
PUBLIC_API_URL=http://localhost:3000
```

`DATABASE_URL`, `PORT`, `WEB_ORIGIN`, and `UPLOAD_DIR` are API-side
configuration. `PUBLIC_API_URL` is read by the Vite/SvelteKit client and is
intended to be public; do not put credentials or secrets in `PUBLIC_` values.
The API runtime and importer load `apps/api/.env`; the web app loads
`apps/web/.env`. These local `.env` files are ignored by Git.

### 5. Apply database migrations

Run from the repository root after PostgreSQL and the API environment are
ready:

```powershell
pnpm db:migrate
```

This runs the API's `drizzle-kit migrate` command. It creates or updates the
tables expected by the application and importer; do not restore a developer's
database dump or run a database reset as part of normal setup.

### 6. Validate and import product data

Run the importer in dry-run mode first. It reads
`data/raw/packaged_foods_india_cleaned.csv`, validates its required columns,
and does not connect to or change PostgreSQL in dry-run mode. It reports
missing or invalid numeric values; review those messages before applying,
because rejected numeric values are imported as `NULL` rather than corrected:

```powershell
python .\script\load_postgres.py
```

To load it, first verify the CSV's nutrient basis from authoritative source
documentation. The importer requires an explicit `per_serving` or `per_100g`
choice and does not determine which one is correct. Only after verification,
run **one** matching command:

```powershell
python .\script\load_postgres.py --apply --nutrition-basis per_serving
```

or:

```powershell
python .\script\load_postgres.py --apply --nutrition-basis per_100g
```

The importer checks the migrated schema and required foreign keys, writes in a
transaction, and creates a logical CSV export of affected tables under
`data/backups/` before applying changes. These exports are not full database
backups. CSV fields are authoritative when present in the importer mapping;
missing source values may clear their corresponding product/nutrition fields
or category links. Re-running `--apply` re-applies those values, so do it
deliberately. Migrations and CSV import are one-time setup steps for a new
local database; rerun migrations when the project adds migrations, and rerun
the importer when intentionally refreshing imported data.

If no reliable source establishes the nutrition basis, do not run the `--apply`
command. The web app and API can still start, but product data will not be
loaded into that database.

### 7. Start the API and frontend

Use two terminals, each opened at the repository root.

**Terminal 1 — API:**

```powershell
pnpm dev:api
```

**Terminal 2 — frontend:**

```powershell
pnpm dev:web
```

The frontend is at <http://localhost:5173>; the API is at
<http://localhost:3000>.

## Verify setup and run checks

From the repository root, with the Python virtual environment activated:

```powershell
Invoke-RestMethod http://localhost:3000/api/health
pnpm check
pnpm lint
pnpm test:unit
pnpm test:integration
pnpm build
```

The health endpoint should report `status: ok` and `database: connected`.
After a successful data import, product results should be available through
the discovery page at <http://localhost:5173/discover>. The integration test
requires a running PostgreSQL instance configured with the same
`DATABASE_URL`. `pnpm test:unit` runs frontend, API, and Python unit tests;
`pnpm test` runs unit and integration tests. There are no configured browser
end-to-end tests.

Available root commands include:

| Command                 | Purpose                                          |
| ----------------------- | ------------------------------------------------ |
| `pnpm dev:api`          | Start the API in watch mode                      |
| `pnpm dev:web`          | Start the frontend dev server                    |
| `pnpm db:migrate`       | Apply Drizzle SQL migrations                     |
| `pnpm check`            | Svelte checks and API TypeScript typecheck       |
| `pnpm lint`             | Frontend Prettier and ESLint checks              |
| `pnpm test:unit`        | Frontend, API, and Python unit tests             |
| `pnpm test:integration` | API/PostgreSQL integration check                 |
| `pnpm test`             | Unit tests followed by integration test          |
| `pnpm build`            | Build frontend and API                           |
| `pnpm db:generate`      | Generate a migration from Drizzle schema changes |

## Troubleshooting

- **PostgreSQL connection refused:** ensure the local PostgreSQL service is
  running and listening on port 5432. Check the host, port, database, role,
  and password in `DATABASE_URL`.
- **PostgreSQL authentication failed:** verify the local role password and
  update `apps/api/.env`. URL-encode reserved characters in the password
  portion of the connection URL.
- **`DATABASE_URL` is missing or migrations fail to connect:** check
  `apps/api/.env` and run commands from the repository root. Ensure the
  database exists before `pnpm db:migrate`.
- **Missing required table/foreign key during import:** apply
  `pnpm db:migrate` first, then retry the importer dry run.
- **Cleaned CSV not found:** the importer currently requires
  `data/raw/packaged_foods_india_cleaned.csv`; it does not read the
  `data/processed/` copy. Confirm the raw cleaned CSV exists in the clone.
- **Importer rejects `--apply`:** verify the nutrition basis independently
  and choose exactly `per_serving` or `per_100g`. Do not guess from column
  names or serving size.
- **Port already in use:** stop the process using the occupied port or choose
  another API `PORT`. If the API port changes, update `PUBLIC_API_URL`; if the
  frontend origin changes, update `WEB_ORIGIN` to match it.
- **Frontend cannot reach the API:** verify the API health endpoint and the
  `PUBLIC_API_URL` in `apps/web/.env`; ensure `WEB_ORIGIN` in
  `apps/api/.env` matches the frontend origin.
- **`pnpm` command not found:** install Node.js 24, then run `corepack enable`
  and `corepack prepare pnpm@10 --activate`.
- **Python module missing:** activate `.venv` and run
  `python -m pip install -r requirements-test.txt`.
- **JavaScript dependency or lockfile error:** run
  `pnpm install --frozen-lockfile` from the repository root using pnpm 10.

## Further documentation

- [Software design documentation index](./docs/software-design/README.md)
- [DFD Level 0 — context](./docs/software-design/dfd-level-0.md)
- [DFD Level 1](./docs/software-design/dfd-level-1.md)
- [DFD Level 2](./docs/software-design/dfd-level-2.md)
- [Structure Chart](./docs/software-design/structure-chart.md)
- [Data Dictionary](./docs/software-design/data-dictionary.md)
- [Authentication and moderator administration](./docs/authentication.md)
