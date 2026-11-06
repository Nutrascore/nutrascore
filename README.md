# NutraScore

NutraScore is a web application for discovering, viewing, and comparing
packaged-food products sold in India. It brings product names, brands,
ingredients, nutrition, serving information, categories, prices, and available
images together in a searchable catalogue.

## Features

- Search products by name or brand with autocomplete, category filters, and
  paginated results.
- Browse categories and the products associated with them.
- View product details, including available ingredients, price, image, and
  nutrition information.
- Compare two distinct products side by side.
- Register, sign in, view the current profile, and sign out.
- Let authenticated moderators list, create, edit, and delete products.

There are no category-management endpoints. Favorites, barcode scanning,
automated image discovery, and AI features are not implemented.

## Architecture

- **Frontend:** SvelteKit, Svelte 5, TypeScript, and Vite.
- **API:** Fastify and TypeScript, with REST endpoints under `/api`.
- **Database:** PostgreSQL. The API uses the `pg` connection pool for runtime
  queries; Drizzle ORM describes the schema and Drizzle Kit applies SQL
  migrations.
- **Authentication:** Passwords are bcrypt-hashed. Login creates an opaque
  session token in an HTTP-only cookie; PostgreSQL stores its SHA-256 hash.
  State-changing requests use a CSRF token. Sessions expire after 30 days.

The browser frontend calls the Fastify API using `PUBLIC_API_URL`, includes
credentials for session cookies, and uses the API's CSRF endpoint for
state-changing requests. `WEB_ORIGIN` configures the API's allowed frontend
origin.

### Application database schema

The current application schema consists of these five tables:

| Table                | Purpose                                                          |
| -------------------- | ---------------------------------------------------------------- |
| `"Products"`         | Product details, image URL, price, and nutrition/serving fields. |
| `categories`         | Product category names and descriptions.                         |
| `product_categories` | Many-to-many links between products and categories.              |
| `"Users"`            | Registered accounts and their `user` or `moderator` role.        |
| `user_sessions`      | Hashed session tokens, expiry times, and user references.        |

Nutrition is stored on `"Products"` rather than in a separate application
table. Existing databases may retain historical tables such as `"Nutrition"`
or `"ProductImages"`; these are not part of the current application schema and
the migration does not automatically delete them.

### API overview

- `GET /api/products/search` and `GET /api/products/autocomplete`
- `GET /api/products/:id`
- `GET /api/categories` and `GET /api/categories/:id/products`
- `GET /api/compare?ids=<uuid>,<uuid>` (exactly two distinct products)
- `/api/auth`: CSRF token, registration, login, current user, and logout
- `/api/moderator/products`: moderator product listing and create/read/edit/delete

## Prerequisites

The CI workflow uses Node.js 24, pnpm 10, Python 3.13, and PostgreSQL 17.
Use those versions where available for the closest match to CI. Git, Node.js,
pnpm, and PostgreSQL are needed for the application. Python and the
`requirements-test.txt` packages are needed for CSV tools and Python tests.

## Setup on Windows (PowerShell)

### 1. Install and verify prerequisites

Install [Git for Windows](https://git-scm.com/download/win) and the latest
Node.js 24 release from the [Node.js archive](https://nodejs.org/en/download/archive/)
(including Corepack). Install PostgreSQL 17 using the
[official Windows installer](https://www.postgresql.org/download/windows/);
include the command-line tools so `psql` is available. Install
[Python 3.13](https://www.python.org/downloads/windows/) if you plan to use
the CSV tools or run Python tests.

Open a new PowerShell window and verify:

```powershell
git --version
node --version
corepack --version
psql --version
```

Enable pnpm 10 through Corepack:

```powershell
corepack enable
corepack prepare pnpm@10 --activate
pnpm --version
```

### 2. Start PostgreSQL and create a development database

Find the installed PostgreSQL service, then start the service using the exact
name shown on your computer (the version suffix can vary). Starting it may
require an elevated PowerShell window:

```powershell
Get-Service *postgres*
Start-Service -Name postgresql-x64-17
Get-Service -Name postgresql-x64-17
```

If that service name does not exist, substitute the name returned by
`Get-Service *postgres*`. Connect as the PostgreSQL administrator:

```powershell
psql -U postgres -h localhost -p 5432 -d postgres
```

At the `psql` prompt, create a local role and empty database, replacing the
password placeholder with a password of your choice:

```sql
CREATE ROLE nutrascore LOGIN PASSWORD '<choose-a-local-password>';
CREATE DATABASE nutrascore OWNER nutrascore;
CREATE DATABASE nutrascore_test OWNER nutrascore;
\q
```

The second database is reserved for integration tests.

### 3. Clone the repository and install dependencies

Clone the upstream repository, or replace its URL with your fork:

```powershell
git clone https://github.com/Nutrascore/nutrascore.git
Set-Location .\nutrascore
pnpm install --frozen-lockfile
```

### 4. Configure environment files

The API reads the repository-root `.env` first and then `apps/api/.env` for
values not already set. Vite is configured to read frontend environment files
from the repository root. Create the API file from its example:

```powershell
Copy-Item .\apps\api\.env.example .\apps\api\.env
notepad .\apps\api\.env
```

Set `DATABASE_URL` to the role and database created above. URL-encode reserved
characters in the password:

```dotenv
DATABASE_URL=postgresql://nutrascore:<URL-encoded-password>@localhost:5432/nutrascore
PORT=3000
WEB_ORIGIN=http://localhost:5173
```

Create the repository-root `.env` for the frontend (if it does not already
exist), based on the web example:

```powershell
if (-not (Test-Path .\.env)) { Copy-Item .\apps\web\.env.example .\.env }
notepad .\.env
```

Set or retain:

```dotenv
PUBLIC_API_URL=http://localhost:3000
```

All `.env` files are ignored by Git; do not commit credentials. The tracked
`.env.example` files contain local-development examples, not secrets.

### 5. Migrate and start the application

From the repository root, run the migration and start the API and frontend in
separate PowerShell windows:

```powershell
pnpm db:migrate
```

```powershell
pnpm dev:api
```

```powershell
pnpm dev:web
```

The frontend is at <http://localhost:5173>, the API is at
<http://localhost:3000>, and its health endpoint is
<http://localhost:3000/api/health>.

## Setup on Ubuntu (Bash)

### 1. Install Git, Node.js, pnpm, and PostgreSQL

Install Git, curl, build tools, Python tooling, and PostgreSQL utilities:

```bash
sudo apt update
sudo apt install -y git curl build-essential python3 python3-venv python3-pip postgresql-common
```

Install PostgreSQL 17 from the PostgreSQL Apt Repository, matching the CI
version:

```bash
sudo /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y
sudo apt update
sudo apt install -y postgresql-17 postgresql-client-17
```

Install Node.js 24 with `nvm`, then enable pnpm 10 using Corepack:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
source ~/.bashrc
nvm install 24
nvm use 24
corepack enable
corepack prepare pnpm@10 --activate
```

Verify the tools:

```bash
git --version
node --version
pnpm --version
psql --version
```

### 2. Start PostgreSQL and create a development database

Enable and start the PostgreSQL service:

```bash
sudo systemctl enable --now postgresql
systemctl status postgresql --no-pager
```

Create a role with a local password and an empty database owned by that role:

```bash
sudo -u postgres psql <<'SQL'
CREATE ROLE nutrascore LOGIN PASSWORD '<choose-a-local-password>';
CREATE DATABASE nutrascore OWNER nutrascore;
CREATE DATABASE nutrascore_test OWNER nutrascore;
SQL
```

Connect using TCP (`localhost`) and the role password; the setup expects
PostgreSQL to accept password authentication for local TCP connections.
The second database is reserved for integration tests.

### 3. Clone the repository and install dependencies

```bash
git clone https://github.com/Nutrascore/nutrascore.git
cd nutrascore
pnpm install --frozen-lockfile
```

### 4. Configure environment files

Create the API environment file:

```bash
cp apps/api/.env.example apps/api/.env
${EDITOR:-nano} apps/api/.env
```

Set the database URL to the local role and database. URL-encode reserved
characters in the password:

```dotenv
DATABASE_URL=postgresql://nutrascore:<URL-encoded-password>@localhost:5432/nutrascore
PORT=3000
WEB_ORIGIN=http://localhost:5173
```

Create the repository-root `.env` used by the frontend:

```bash
if [ ! -f .env ]; then cp apps/web/.env.example .env; fi
${EDITOR:-nano} .env
```

Set or retain:

```dotenv
PUBLIC_API_URL=http://localhost:3000
```

The API reads the root `.env` and then `apps/api/.env`; Vite reads the root
`.env`. All `.env` files are ignored by Git. Never commit credentials.

### 5. Migrate and start the application

From the repository root, run the migration and start each server in a
separate terminal:

```bash
pnpm db:migrate
```

```bash
pnpm dev:api
```

```bash
pnpm dev:web
```

The frontend is at <http://localhost:5173>, the API is at
<http://localhost:3000>, and its health endpoint is
<http://localhost:3000/api/health>.

## Database setup and migrations

### Fresh installation

1. Install and start PostgreSQL.
2. Create an empty database and PostgreSQL role.
3. Configure `DATABASE_URL` in `apps/api/.env`.
4. Install dependencies with `pnpm install --frozen-lockfile`.
5. Run `pnpm db:migrate` from the repository root.

The current Drizzle journal contains the consolidated
[`0000_baseline.sql`](./apps/api/drizzle/0000_baseline.sql) migration. On a
fresh database it creates the five application tables, their current columns,
constraints, foreign keys, and indexes. It does **not** load product records.
Use the optional CSV import workflow below if you intentionally want to load
the provided dataset.

### Existing installation

Run `pnpm db:migrate` to apply migrations that Drizzle identifies as pending.
The consolidated baseline is the intended schema for fresh installs. For
existing installations, its guarded compatibility logic checks current
definitions and stops on incompatible schema objects rather than attempting
an unsafe conversion. If a populated database is involved, make and verify a
backup before applying migrations; investigate any migration error instead of
dropping tables, resetting data, or changing migration history.

Where the expected legacy `"Nutrition"` or `"ProductImages"` table exists,
the baseline copies its product-linked nutrition values or primary image URL
into corresponding `"Products"` fields only where those target fields are
NULL. It does not automatically delete legacy tables or their historical
records. The baseline preserves compatible existing data and does not
recreate a populated database.

## Optional CSV data tools

The cleaned source used by the current loader is
[`data/processed/packaged_foods_india_cleaned.csv`](./data/processed/packaged_foods_india_cleaned.csv).
The fresh database is empty until data is imported.

Install Python dependencies if using these tools:

```powershell
py -3.13 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-test.txt
```

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements-test.txt
```

The database import/sync scripts read `DATABASE_URL` from `apps/api/.env`.
`validate_dataset.py` checks the CSV without changing it. The default
`load_postgres.py` command is a dry run: it connects to check the database
schema and report the proposed import, but does not write database records.
Review its output:

```powershell
.\.venv\Scripts\python.exe .\script\validate_dataset.py
.\.venv\Scripts\python.exe .\script\load_postgres.py
```

```bash
source .venv/bin/activate
python script/validate_dataset.py
python script/load_postgres.py
```

The CSV does not establish whether nutrient values are per serving or per
100 g. Only after verifying the basis from a reliable source, choose one of
these matching commands:

**If the verified basis is per serving:**

```powershell
.\.venv\Scripts\python.exe .\script\load_postgres.py --apply --nutrition-basis per_serving
```

```bash
python script/load_postgres.py --apply --nutrition-basis per_serving
```

**If the verified basis is per 100 g:**

```powershell
.\.venv\Scripts\python.exe .\script\load_postgres.py --apply --nutrition-basis per_100g
```

```bash
python script/load_postgres.py --apply --nutrition-basis per_100g
```

The loader uses a transaction and creates logical CSV exports of affected
tables under `data/backups/`; these are not full database backups. CSV values,
including missing mapped values, are authoritative for imported fields.
Applying the import again deliberately re-synchronizes those fields.
`script/sync_product_csv.py` is an additional utility for matching existing
products to CSV rows and synchronizing selected CSV-owned values; it also
requires an explicitly verified nutrition basis before applying updates.

The CSV does not own product image URLs. Do not infer nutrition units from
column names or serving size. Dataset ownership and redistribution terms
should be confirmed with the original data source before redistributing it.

## Development commands

Run these commands from the repository root:

| Command                          | Purpose                                           |
| -------------------------------- | ------------------------------------------------- |
| `pnpm install --frozen-lockfile` | Install the locked workspace dependencies.        |
| `pnpm dev:api`                   | Start the Fastify API in watch mode.              |
| `pnpm dev:web`                   | Start the SvelteKit development server.           |
| `pnpm db:migrate`                | Apply pending Drizzle migrations.                 |
| `pnpm lint`                      | Run ESLint for the frontend, API, and tests.      |
| `pnpm format`                    | Check frontend formatting with Prettier.          |
| `pnpm typecheck`                 | Run Svelte checks and the API TypeScript check.   |
| `pnpm unit-test`                 | Run frontend, API, and Python unit tests.         |
| `pnpm integration-test`          | Run the API/PostgreSQL integration workflow.      |
| `pnpm test`                      | Run unit and integration tests.                   |
| `pnpm check`                     | Run lint and typecheck.                           |
| `pnpm build`                     | Build the frontend and API.                       |
| `pnpm db:generate`               | Generate a migration from Drizzle schema changes. |

Integration tests create and delete temporary records. They require a
dedicated, migrated test database through `NUTRASCORE_TEST_DATABASE_URL` and
refuse to run if it resolves to the configured development database. Migrate
the test database with a temporary `DATABASE_URL` override, then restore or
remove that override before running the test:

```powershell
$env:NUTRASCORE_TEST_DATABASE_URL = "postgresql://nutrascore:<password>@localhost:5432/nutrascore_test"
$developmentDatabaseUrl = $env:DATABASE_URL
$env:DATABASE_URL = $env:NUTRASCORE_TEST_DATABASE_URL
pnpm db:migrate
if ($null -eq $developmentDatabaseUrl) {
    Remove-Item Env:DATABASE_URL
} else {
    $env:DATABASE_URL = $developmentDatabaseUrl
}
pnpm integration-test
```

```bash
export NUTRASCORE_TEST_DATABASE_URL='postgresql://nutrascore:<password>@localhost:5432/nutrascore_test'
DATABASE_URL="$NUTRASCORE_TEST_DATABASE_URL" pnpm db:migrate
pnpm integration-test
```

## Environment variables

| Variable                       | Required?                              | Purpose and example                                                                                            |
| ------------------------------ | -------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                 | Yes for API, migrations, and CSV tools | PostgreSQL connection string, e.g. `postgresql://nutrascore:<URL-encoded-password>@localhost:5432/nutrascore`. |
| `PORT`                         | No                                     | API listen port; defaults to `3000`.                                                                           |
| `WEB_ORIGIN`                   | No                                     | Additional allowed frontend origin; defaults to `http://localhost:5173`.                                       |
| `PUBLIC_API_URL`               | No                                     | Frontend API origin; defaults to `http://localhost:3000`.                                                      |
| `NODE_ENV`                     | No                                     | Set to `production` to add the `Secure` attribute to auth cookies.                                             |
| `NUTRASCORE_TEST_DATABASE_URL` | Yes for integration tests              | Dedicated, separately migrated test database URL; must not point to the configured development database.       |

The API and Drizzle migration configuration use `DATABASE_URL`.
`PUBLIC_API_URL` is intentionally public; never put credentials or secrets in
it. For local setup, API settings can be placed in `apps/api/.env`, and
`PUBLIC_API_URL` belongs in the repository-root `.env` because Vite's `envDir`
is configured as the repository root. `.env` and `.env.*` are ignored by Git;
the `.env.example` files are tracked templates.

## Project structure

```text
apps/
  api/
    drizzle/              Consolidated SQL baseline and Drizzle metadata
    src/
      db/                 Drizzle schema, PostgreSQL pool, product query
      routes/             Product, search, category, compare, auth, moderator
  web/
    src/
      lib/                API clients, shared components, stores, utilities
      routes/             Home, discover, product, compare, login, register,
                          profile, moderator pages
    static/               Static frontend assets
data/
  processed/              Cleaned product CSV used by import tools
script/                   Dataset validation and PostgreSQL CSV utilities
tests/
  integration/            API integration workflow using a separate database
  unit/                   Frontend, API, and Python unit tests
docs/
  software-design/        Data dictionary, DFDs, and structure chart
```

## Troubleshooting

### PostgreSQL connection failures

- **Windows:** Check `Get-Service *postgres*`, start the installed service,
  and verify `psql --version`. Use the actual service name and confirm
  PostgreSQL listens on the host and port in `DATABASE_URL`.
- **Ubuntu:** Check `systemctl status postgresql --no-pager`; start it with
  `sudo systemctl start postgresql`. Use `sudo -u postgres psql` to inspect
  local roles and databases.
- For password authentication failures, verify the role password and URL.
  URL-encode reserved characters in the password component.

### Migration errors or incorrect `DATABASE_URL`

Confirm the database exists, the selected role can connect, and
`apps/api/.env` contains the intended URL. The API loads the repository-root
`.env` before `apps/api/.env`, so an already defined root value takes
precedence. Verify the target carefully before running `pnpm db:migrate`.
If the baseline reports an incompatible schema, stop and investigate; do not
drop tables, truncate rows, or rewrite migration history.

### Port conflicts

The defaults are API port `3000` and frontend port `5173`. Set `PORT` to a
free API port and update `PUBLIC_API_URL` to match. If the frontend origin
changes, update `WEB_ORIGIN` to allow that origin in the API.

### Frontend cannot communicate with the API

Check <http://localhost:3000/api/health>, set `PUBLIC_API_URL` in the
repository-root `.env`, and ensure `WEB_ORIGIN` in the API environment matches
the frontend's origin. Restart the dev server after changing environment
files.

### pnpm or missing environment variables

Use Node.js 24, then run `corepack enable` and
`corepack prepare pnpm@10 --activate`. If a command reports a missing
`DATABASE_URL`, check the API environment file and confirm the command is
being run from the repository root.

### Python dependencies or missing CSV

Activate `.venv` and run `python -m pip install -r requirements-test.txt`.
Confirm the cleaned dataset exists at
`data/processed/packaged_foods_india_cleaned.csv`.

## Further documentation

- [Authentication and moderator administration](./docs/authentication.md)
- [Software design documentation index](./docs/software-design/README.md)
- [DFD Level 0](./docs/software-design/dfd-level-0.md)
- [DFD Level 1](./docs/software-design/dfd-level-1.md)
- [DFD Level 2](./docs/software-design/dfd-level-2.md)
- [Structure chart](./docs/software-design/structure-chart.md)
- [Data dictionary](./docs/software-design/data-dictionary.md)
