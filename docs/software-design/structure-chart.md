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
    WEB --> STATE["Comparison store and nutrition utilities"]
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
    LOADER --> PYDEPS["pandas and DuckDB PostgreSQL extension"]
    LOADER --> CSV["data/raw/packaged_foods_india_cleaned.csv"]
    LOADER -->|--apply after schema validation| PG
    LOADER -->|logical CSV exports before writes| BACKUPS["data/backups/"]
```

The UI route files are under `apps/web/src/routes/`; shared UI components,
API wrappers, types, and the comparison store are under `apps/web/src/lib/`.
The API registers its route plugins in `apps/api/src/index.ts`. Runtime route
handlers and authentication helpers share the PostgreSQL pool. Drizzle Kit
uses `db/schema.ts` for schema tooling and the SQL migrations in `drizzle/`.

`script/load_postgres.py` is an independent administrative/development tool.
It reads the cleaned CSV from `data/raw/`, validates required columns and
database relationships, and uses pandas and DuckDB to optionally apply
products, nutrition, categories, and category links to PostgreSQL. It does
not run migrations or use the processed-directory copy as its input.
