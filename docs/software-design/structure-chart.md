# NutraScore structure chart

The chart shows the main runtime modules and the separate CSV import utility.
It does not imply that API handlers use Drizzle queries: current route
implementations issue SQL through the PostgreSQL `pg` pool.

```mermaid
flowchart TD
    ROOT["NutraScore"]
    ROOT --> WEB["SvelteKit web app<br/>apps/web"]
    ROOT --> API["Fastify API<br/>apps/api"]
    ROOT --> DATA["Development-time data import"]

    WEB --> ROUTES["SvelteKit routes"]
    ROUTES --> HOME["/ home and discovery"]
    ROUTES --> DISCOVER["/discover"]
    ROUTES --> PRODUCT["/product/[id]"]
    ROUTES --> COMPAREPAGE["/compare"]
    ROUTES --> ACCOUNT["/login, /register, /profile"]
    ROUTES --> MODPAGE["/moderator"]
    ROUTES --> COMPONENTS["Reusable UI components"]
    COMPONENTS --> CARDS["ProductCard, CategorySelect"]
    COMPONENTS --> EDITORS["NutritionEditor, Navbar, Footer"]

    WEB --> CLIENTS["Frontend API clients"]
    CLIENTS --> PRODUCTAPI["api/products.ts<br/>search, categories, detail, compare"]
    CLIENTS --> AUTHAPI["api/auth.ts"]
    CLIENTS --> MODAPI["api/moderator.ts"]
    CLIENTS --> SHARED["api/client.ts and api/types.ts"]
    WEB --> STATE["Comparison store and nutrition utilities<br/>exactly two products"]
    CLIENTS -->|HTTP requests, credentials, CSRF header| API

    API --> ENTRY["src/index.ts<br/>Fastify setup and route registration"]
    ENTRY --> PRODUCTROUTES["routes/products.ts"]
    ENTRY --> SEARCHROUTES["routes/search.ts"]
    ENTRY --> CATEGORYROUTES["routes/categories.ts"]
    ENTRY --> COMPAREROUTES["routes/compare.ts"]
    ENTRY --> AUTHROUTES["routes/auth.ts"]
    ENTRY --> MODROUTES["routes/moderator.ts"]
    AUTHROUTES --> AUTHMODULE["auth.ts<br/>passwords, sessions, CSRF, roles"]
    MODROUTES --> AUTHMODULE
    PRODUCTROUTES --> PRODUCTQUERY["db/product-query.ts<br/>shared detail SQL and mapper"]
    COMPAREROUTES --> PRODUCTQUERY
    PRODUCTROUTES --> POOL["db/pool.ts<br/>PostgreSQL pg Pool"]
    SEARCHROUTES --> POOL
    CATEGORYROUTES --> POOL
    COMPAREROUTES --> POOL
    AUTHMODULE --> POOL
    MODROUTES --> POOL
    API --> DRIZZLE["db/schema.ts and drizzle.config.ts"]
    DRIZZLE --> MIGRATIONS["drizzle/*.sql and migration journal"]
    MIGRATIONS --> PG["PostgreSQL"]
    POOL --> PG

    DATA --> LOADER["script/load_postgres.py"]
    DATA --> VALIDATOR["script/validate_dataset.py"]
    VALIDATOR --> CSV
    VALIDATOR --> REPORTS["data/reports/"]
    LOADER --> PYDEPS["pandas and DuckDB PostgreSQL extension"]
    LOADER --> CSV["data/processed/packaged_foods_india_cleaned.csv"]
    LOADER -->|--apply after schema validation| PG
    LOADER -->|logical CSV exports before writes| BACKUPS["data/backups/"]
```

The UI route files are under `apps/web/src/routes/`; shared UI components,
API wrappers, types, and the comparison store are under `apps/web/src/lib/`.
The API registers its route plugins in `apps/api/src/index.ts`. Runtime route
handlers and authentication helpers share the PostgreSQL pool. Drizzle Kit
uses `db/schema.ts` for schema tooling and the SQL migrations in `drizzle/`.

Product detail and comparison routes share their select and response mapper
through `db/product-query.ts`, while executing SQL through the PostgreSQL pool.
`script/validate_dataset.py` runs read-only quality checks and writes review
reports only when it finds candidates. `script/load_postgres.py` validates
required columns and database relationships, then uses pandas and DuckDB to
optionally apply product fields (including nutrition), categories, and
category links to PostgreSQL. Both are administrative/development tools that
read the canonical cleaned CSV; neither runs migrations.
