# Data Flow Diagram — Level 0 context

The diagram separates live application traffic from the one-time or
administrator-run CSV import. The importer is a development/administrative
utility, not an application service.

```mermaid
flowchart LR
    V[Anonymous visitor]
    U[Registered user]
    M[Moderator]
    A[Developer or data administrator]
    CSV[(Cleaned CSV<br/>data/raw/packaged_foods_india_cleaned.csv)]
    APP(["NutraScore web application and API"])
    IMPORT(["CSV validation and import<br/>script/load_postgres.py"])
    DB[(PostgreSQL)]
    HOST[Moderator-supplied image URL host]

    V -->|search, category, detail, comparison requests| APP
    APP -->|product and nutrition results| V
    U -->|registration, login, logout, profile requests| APP
    APP -->|account status and session cookies| U
    M -->|authenticated product and image management| APP
    APP -->|product records and operation results| M
    APP -->|outbound HTTPS HEAD validation| HOST
    HOST -->|HTTP status and content type| APP

    A -->|run import; select verified nutrition basis| IMPORT
    CSV -->|cleaned product, category, and nutrition rows| IMPORT
    IMPORT -->|upsert Products, Nutrition, categories, and links| DB
    APP <-->|query and update application records| DB
```

The web application uses the Fastify API to access PostgreSQL. The CSV
importer independently validates and writes the cleaned file; it does not
start the app, apply migrations, or replace the database.

The API validates moderator-supplied image URLs with an HTTPS `HEAD` request.
This is not an automated image discovery or enrichment flow.
