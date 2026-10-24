# NutraScore

  NutraScore is a nutrition-discovery app for packaged foods sold in India. It lets people search product catalogues, compare nutrition and price information, review ingredients and serving sizes, and manage product data with moderator tools.

  ## Scope and intended users

  NutraScore is designed for:

  - shoppers comparing packaged foods before purchase,
  - people looking up ingredients, serving sizes, and nutrition values,
  - moderators reviewing product data and image quality,
  - developers working on the local SvelteKit + Fastify stack.

  ## Features currently implemented

  - product search by name, brand, or category,
  - category browsing and filtering,
  - product detail pages with ingredients, price, serving size, and nutrition values,
  - side-by-side product comparison for up to four products,
  - account registration and login with CSRF-protected sessions,
  - moderator tooling for product validation and image review status.

  The app does not currently include a deployment pipeline, SSO, or browser-based end-to-end tests.

  ## Technology stack

  - Frontend: SvelteKit, TypeScript, Vite
  - API: Fastify, TypeScript, Drizzle ORM, PostgreSQL
  - Data import: Python, pandas, duckdb
  - Validation: Vitest and Python unittest

  ## Repository structure

  - `apps/web/` — SvelteKit frontend
  - `apps/api/` — Fastify API, Drizzle schema, and migrations
  - `data/` — datasets, backups, reports, and processed exports
  - `docs/` — project documentation and design notes
  - `script/` — data import and maintenance utilities
  - `tests/` — unit and integration tests

  ## Prerequisites and supported versions

  - Node.js 24
  - pnpm 10
  - Python 3.13
  - PostgreSQL 17
  - Git

  The CI workflow in `.github/workflows/ci.yml` runs against Node.js 24, pnpm 10, Python 3.13, and PostgreSQL 17.

  ## First-time installation after forking or cloning

  From a fresh clone, run the following in PowerShell from the repository root:

  ```powershell
  git clone https://github.com/<your-user>/nutrascore.git
  cd nutrascore
  corepack enable
  corepack prepare pnpm@10 --activate
  pnpm install --frozen-lockfile
  python -m pip install -r requirements-test.txt
  ```

  If you prefer to start PostgreSQL through Docker instead of a local service, use:

  ```powershell
  docker run --name nutrascore-postgres `
    -e POSTGRES_DB=nutrascore `
    -e POSTGRES_USER=nutrascore `
    -e POSTGRES_PASSWORD=nutrascore_dev `
    -p 5432:5432 `
    -d postgres:17
```

  ## Environment configuration

  Copy the example environment files before starting the app:

  ```powershell
  Copy-Item .\apps\api\.env.example .\apps\api\.env
  Copy-Item .\apps\web\.env.example .\apps\web\.env
  ```

  Set the values in `apps/api/.env`:

  ```env
  DATABASE_URL=postgresql://nutrascore:nutrascore_dev@localhost:5432/nutrascore
  PORT=3000
  WEB_ORIGIN=http://localhost:5173
  UPLOAD_DIR=./uploads
  ```

  Set the values in `apps/web/.env`:

  ```env
  PUBLIC_API_URL=http://localhost:3000
  ```

  The API loads `DATABASE_URL` through `dotenv` and the importer reads the same value from `apps/api/.env`.

  ## PostgreSQL database setup

  Create the local database and role if you are not using Docker:

  ```sql
  CREATE ROLE nutrascore LOGIN PASSWORD 'nutrascore_dev';
  CREATE DATABASE nutrascore OWNER nutrascore;
  ```

  The project expects a PostgreSQL database named `nutrascore` and a user named `nutrascore` with access to it.

  ## Database migration instructions

  Run the schema migrations from the repository root:

  ```powershell
  pnpm db:migrate
  ```

  This command executes `drizzle-kit migrate` for `apps/api` using `DATABASE_URL`.

  ## Product dataset import instructions

  The current importer reads the cleaned CSV at `data/raw/packaged_foods_india_cleaned.csv` and the tracked processed copy at `data/processed/packaged_foods_india_cleaned.csv`.

  Before applying the CSV to PostgreSQL, inspect the imported file and confirm the source basis for the nutrition values. The script does not infer the basis from the dataset and aborts an apply without a verified value.

  Dry run:

  ```powershell
  python .\script\load_postgres.py
  ```

  Apply with a verified basis:

  ```powershell
  python .\script\load_postgres.py --apply --nutrition-basis per_serving
```

  Use `per_100g` instead if the source documentation confirms that basis for the CSV. The script is intentionally safe by default: it validates the schema, creates logical CSV exports, and writes CSV-owned data in one transaction without recreating the database or running migrations.

  The importer is safe to run multiple times in dry-run mode. An `--apply` run is meant to be deliberate and should only be used after you have verified the dataset and the nutrition basis.

  ## Starting the API and frontend

  Open two terminals in the repository root and start each service separately:

  ```powershell
  # Terminal 1
  pnpm dev:api
  ```

  ```powershell
  # Terminal 2
  pnpm dev:web
  ```

  The API listens on `http://localhost:3000` and the frontend on `http://localhost:5173`.

  ## How to run checks and tests

  From the repository root:

  ```powershell
  pnpm check
  pnpm test:unit
  pnpm test:integration
  pnpm test
  pnpm build
  ```

  `pnpm test:integration` requires `DATABASE_URL` to point at a running PostgreSQL instance. Unit tests do not require a live database.

  ## Common setup errors and their solutions

  - `DATABASE_URL is missing` — create `apps/api/.env` from `.env.example` and set `DATABASE_URL` before running migrations or imports.
  - `connection refused` to PostgreSQL — start the PostgreSQL service or Docker container and confirm the port and credentials match the `.env` file.
  - `pnpm: command not found` — enable Corepack and activate pnpm 10 with `corepack enable` and `corepack prepare pnpm@10 --activate`.
  - `Python package import errors` — run `python -m pip install -r requirements-test.txt`.
  - `CSV not found` — verify the cleaned file exists at `data/raw/packaged_foods_india_cleaned.csv` and that you are running the script from the repository root.

  ## Dataset provenance and licensing

  The working product dataset is kept in `data/raw/packaged_foods_india_cleaned.csv` and the tracked processed copy is in `data/processed/packaged_foods_india_cleaned.csv`.

  The repository does not include a separate dataset license file, and the CSV itself contains source metadata fields such as `Source_of_Data`, `Collection_Date`, and `Collected_By`. Verify the ownership and redistributions terms of the original data source before sharing the dataset outside this project.

  ## More detailed documentation

  See [docs](./docs) and the software design notes in [docs/software-design/README.md](./docs/software-design/README.md) for the API contract, schema details, and project design.

  ## Maintainer note

  This repository is intentionally configured for local development. It does not include a production deployment configuration, environment secrets management, or cloud hosting setup.
