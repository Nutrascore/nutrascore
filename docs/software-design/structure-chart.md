# NutraScore structure chart

The chart shows the main runtime modules and separate data tools. Route SQL
runs through the SQLite-backed database module; Drizzle Kit manages schema
migrations.

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
    PRODUCTROUTES --> DATABASE["db/database.ts<br/>SQLite connection and SQL queries"]
    SEARCHROUTES --> DATABASE
    CATEGORYROUTES --> DATABASE
    COMPAREROUTES --> DATABASE
    AUTHMODULE --> DATABASE
    MODROUTES --> DATABASE
    API --> DRIZZLE["db/schema.ts and drizzle.config.ts"]
    DRIZZLE --> MIGRATIONS["drizzle/*.sql and migration journal"]
    MIGRATIONS --> SQLITE["data/nutrascore.sqlite"]
    DATABASE --> SQLITE

    DATA --> LOADER["script/load_sqlite.py"]
    DATA --> MIGRATOR["script/migrate_postgres_to_sqlite.py"]
    DATA --> VALIDATOR["script/validate_dataset.py"]
    VALIDATOR --> CSV
    VALIDATOR --> REPORTS["data/reports/"]
    LOADER --> PYDEPS["Python standard library"]
    LOADER --> CSV["data/processed/packaged_foods_india_cleaned.csv"]
    LOADER -->|--apply adds missing records| SQLITE
    MIGRATOR -->|read-only source copy| SQLITE
```

The UI route files are under `apps/web/src/routes/`; shared UI components,
API wrappers, types, and the comparison store are under `apps/web/src/lib/`.
The API registers its route plugins in `apps/api/src/index.ts`. Runtime route
handlers and authentication helpers share the SQLite connection.
Drizzle Kit uses `db/schema.ts` and migrations in `drizzle-sqlite/`.

Product detail and comparison routes share their select and response mapper
through `db/product-query.ts`, while executing SQL through the SQLite database
module.
`script/validate_dataset.py` runs read-only quality checks and writes review
reports only when it finds candidates. `script/load_sqlite.py` validates the
canonical cleaned CSV and adds missing product and category data.
`script/migrate_postgres_to_sqlite.py` is an optional read-only-source
transfer utility for existing application data.
