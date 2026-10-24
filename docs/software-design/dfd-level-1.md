# Data Flow Diagram — Level 1

This diagram shows current user-facing API processes and the separate
development-time CSV import. The data stores are PostgreSQL tables; the
importer reads the raw cleaned CSV path shown below.

```mermaid
flowchart LR
    V[Anonymous visitor]
    U[Registered user]
    M[Moderator]
    A[Developer or data administrator]
    CSV[(data/raw/packaged_foods_india_cleaned.csv)]

    WEB(["SvelteKit web client"])
    AUTH(["1.0 Authentication and sessions"])
    DISC(["2.0 Product discovery<br/>search, autocomplete, categories, pagination"])
    DETAIL(["3.0 Product detail"])
    COMPARE(["4.0 Product comparison"])
    MOD(["5.0 Moderator product and image management"])
    IMPORT(["6.0 Validate and import CSV<br/>script/load_postgres.py"])

    P[(Products)]
    N[(Nutrition)]
    C[(categories)]
    PC[(product_categories)]
    I[(ProductImages)]
    IS[(product_image_sources)]
    IR[(product_image_reviews)]
    USERS[(Users)]
    SESS[(user_sessions)]

    V -->|browse and search| WEB
    U -->|browse, compare, account actions| WEB
    M -->|moderation actions| WEB
    WEB -->|search, category, and detail API requests| DISC
    DISC --> P
    DISC --> N
    DISC --> C
    DISC --> PC
    DISC --> I
    DISC -->|paged search results and suggestions| WEB
    WEB -->|product ID| DETAIL
    DETAIL --> P
    DETAIL --> N
    DETAIL --> C
    DETAIL --> PC
    DETAIL --> I
    DETAIL -->|product details| WEB
    WEB -->|two selected product IDs; API accepts two to four| COMPARE
    COMPARE --> P
    COMPARE --> N
    COMPARE --> C
    COMPARE --> PC
    COMPARE --> I
    COMPARE -->|comparison including nutrition and price| WEB

    WEB -->|credentials, CSRF token, session cookie| AUTH
    AUTH <--> USERS
    AUTH <--> SESS
    AUTH -->|account status and session cookie| WEB

    WEB -->|moderator request and session cookie| MOD
    MOD <--> USERS
    MOD <--> SESS
    MOD <--> P
    MOD <--> N
    MOD <--> C
    MOD <--> PC
    MOD <--> I
    MOD <--> IS
    MOD <--> IR
    MOD -->|image URL HTTPS HEAD validation| HOST[Moderator-supplied image URL host]
    HOST -->|status and content type| MOD
    MOD -->|product, image, and review results| WEB

    A -->|start import and provide verified nutrition basis| IMPORT
    CSV -->|cleaned CSV rows| IMPORT
    IMPORT -->|products and nutrition upsert| P
    IMPORT -->|nutrition upsert| N
    IMPORT -->|category upsert| C
    IMPORT -->|category links| PC
```

The user-facing discovery process reads paged product summaries; autocomplete
is a separate API operation within discovery. Category browsing uses
`categories` and `product_categories`. Product details and comparisons read
the same product, nutrition, category, and image stores.

The importer at `script/load_postgres.py` reads
`data/raw/packaged_foods_india_cleaned.csv`, requires the database schema and
foreign keys to exist, and writes only `Products`, `Nutrition`, `categories`,
and `product_categories`. Its dry run does not connect to PostgreSQL.

The API image management flow stores moderator-supplied image and source
metadata; it does not perform automated image enrichment.
