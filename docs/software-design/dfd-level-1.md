# Data Flow Diagram — Level 1

This diagram shows current user-facing API processes and the separate
development-time CSV import. The data stores are the five active PostgreSQL
tables; nutrition fields are stored on `Products`.

```mermaid
flowchart LR
    V[Anonymous visitor]
    U[Registered user]
    M[Moderator]
    A[Developer or data administrator]
    CSV[(data/processed/packaged_foods_india_cleaned.csv)]

    WEB(["SvelteKit web client"])
    AUTH(["1.0 Authentication and sessions"])
    DISC(["2.0 Product discovery<br/>search, autocomplete, categories, pagination"])
    DETAIL(["3.0 Product detail"])
    COMPARE(["4.0 Product comparison"])
    MOD(["5.0 Moderator product management"])
    IMPORT(["6.0 Validate and import CSV<br/>script/load_postgres.py"])

    P[(Products)]
    C[(categories)]
    PC[(product_categories)]
    USERS[(Users)]
    SESS[(user_sessions)]

    V -->|browse and search| WEB
    U -->|browse, compare, account actions| WEB
    M -->|moderation actions| WEB
    WEB -->|search, category, and detail API requests| DISC
    DISC --> P
    DISC --> C
    DISC --> PC
    DISC -->|paged search results and suggestions| WEB
    WEB -->|product ID| DETAIL
    DETAIL --> P
    DETAIL --> C
    DETAIL --> PC
    DETAIL -->|product details| WEB
    WEB -->|exactly two distinct product IDs| COMPARE
    COMPARE --> P
    COMPARE --> C
    COMPARE --> PC
    COMPARE -->|comparison including nutrition and price| WEB

    WEB -->|credentials, CSRF token, session cookie| AUTH
    AUTH <--> USERS
    AUTH <--> SESS
    AUTH -->|account status and session cookie| WEB

    WEB -->|moderator request and session cookie| MOD
    MOD <--> USERS
    MOD <--> SESS
    MOD <--> P
    MOD <--> C
    MOD <--> PC
    MOD -->|image URL HTTPS HEAD validation| HOST[Moderator-supplied image URL host]
    HOST -->|status and content type| MOD
    MOD -->|product details and operation results| WEB

    A -->|start import and provide verified nutrition basis| IMPORT
    CSV -->|cleaned CSV rows| IMPORT
    IMPORT -->|product and nutrition upsert| P
    IMPORT -->|category upsert| C
    IMPORT -->|category links| PC
```

The user-facing discovery process reads paged product summaries; autocomplete
is a separate API operation within discovery. Category browsing uses
`categories` and `product_categories`. Product details and comparisons read
the same product row (including nutrition and image fields) and category links.

Product images are stored as the optional `Products.image_url` value. The
moderator product form sets or clears that value; no separate image or review
stores are used.

The importer at `script/load_postgres.py` reads
`data/processed/packaged_foods_india_cleaned.csv`, requires the database
schema and foreign keys to exist, and writes only `Products`, `categories`,
and `product_categories`. Its dry run does not connect to PostgreSQL.

The API validates moderator-supplied image URLs but does not perform automated
image enrichment.
