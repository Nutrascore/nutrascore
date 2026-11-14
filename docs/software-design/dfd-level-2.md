# Data Flow Diagram — Level 2

## Authentication and sessions

```mermaid
flowchart LR
    C[Web client] -->|GET CSRF token| CSRF(["Issue CSRF token"])
    CSRF -->|CSRF cookie and token| C
    C -->|registration credentials and CSRF token| REG(["Validate registration"])
    REG -->|name, normalized email, password hash, role| U[(Users)]
    REG -->|create session| CREATE(["Create session"])
    C -->|login credentials and CSRF token| LOGIN(["Validate login"])
    LOGIN -->|account lookup| U
    LOGIN -->|verified account| CREATE
    CREATE -->|token hash, user ID, expiry| S[(user_sessions)]
    CREATE -->|HTTP-only session cookie| C
    C -->|session cookie| ME(["Resolve current user"])
    ME -->|token hash lookup| S
    S -->|user ID| U
    ME -->|user or no session| C
    C -->|logout and CSRF token| OUT(["Invalidate session"])
    OUT -->|delete matching token hash| S
    OUT -->|expired session cookie| C
```

The API stores an opaque session token only as a SHA-256 hash in
`user_sessions`; the raw token is sent to the browser as an HTTP-only cookie.
State-changing account and moderator requests require the CSRF cookie value in
the `X-CSRF-Token` header. Moderator authorization additionally checks the
`Users.role` value.

## Product discovery, details, and comparison

```mermaid
flowchart LR
    C[Web client]
    SEARCH(["Search products"])
    AUTO(["Autocomplete"])
    CATLIST(["List categories"])
    CATPROD(["Browse products by category"])
    DETAIL(["Load product detail"])
    COMPARE(["Compare products"])
    P[(Products)]
    CATS[(categories)]
    PC[(product_categories)]

    C -->|query, page, pageSize, categories| SEARCH
    SEARCH -->|name and brand match; category filter| P
    SEARCH --> PC
    PC --> CATS
    SEARCH -->|paged summaries and total count| C

    C -->|prefix query and limit| AUTO
    AUTO -->|name and brand prefix lookup| P
    AUTO -->|suggestions| C

    C -->|category request| CATLIST
    CATLIST --> CATS
    CATLIST --> PC
    CATLIST -->|categories with product counts| C
    C -->|category ID, limit, offset| CATPROD
    CATPROD --> CATS
    CATPROD --> PC
    CATPROD --> P
    CATPROD -->|category and paged products| C

    C -->|product ID| DETAIL
    DETAIL --> P
    DETAIL --> PC
    PC --> CATS
    DETAIL -->|product and nutrition details| C

    C -->|exactly two distinct product IDs| COMPARE
    COMPARE --> P
    COMPARE --> PC
    PC --> CATS
    COMPARE -->|product, nutrition, serving, and price values| C
```

Search supports name/brand matching, pagination, and category filters.
Category routes provide category lists and paginated products. Detail and
comparison responses include nullable product price and nutrition values
stored on each `Products` row.
Both the web client and API require exactly two distinct product IDs for a
comparison. Image URLs are returned as part of the product record.

## Moderator product management

```mermaid
flowchart LR
    M[Moderator]
    AUTH(["Resolve session and authorize moderator"])
    VALIDATE(["Validate request and CSRF"])
    PRODUCTS(["List, create, update, or delete product"])
    HOST[Moderator-supplied image URL host]
    USERS[(Users)]
    SESS[(user_sessions)]
    P[(Products)]
    C[(categories)]
    PC[(product_categories)]

    M -->|session cookie| AUTH
    AUTH --> SESS
    SESS --> USERS
    AUTH -->|role must be moderator| VALIDATE
    M -->|request body and CSRF token| VALIDATE
    VALIDATE --> PRODUCTS
    PRODUCTS <--> P
    PRODUCTS <--> C
    PRODUCTS <--> PC
    PRODUCTS -->|operation result| M

    PRODUCTS -->|HTTPS HEAD image URL validation| HOST
    HOST -->|status and image content type| PRODUCTS
```

Moderator endpoints list, create, retrieve, update, and delete products.
Create/edit requests can set or clear one optional image URL, which is checked
for HTTPS and a reachable image response.

## Development-time CSV import

```mermaid
flowchart LR
    A[Developer or data administrator]
    CSV[(data/processed/packaged_foods_india_cleaned.csv)]
    LOAD(["script/load_sqlite.py<br/>validate and transform rows"])
    BASIS[Verified nutrition basis<br/>per_serving or per_100g]
    P[(Products)]
    C[(categories)]
    PC[(product_categories)]

    A -->|run dry-run or --apply| LOAD
    CSV -->|product, category, nutrition, price, and serving columns| LOAD
    A -->|required with --apply; verified externally| BASIS
    BASIS -->|basis argument| LOAD
    LOAD -->|stable product IDs, names, brand, ingredients, price_inr| P
    LOAD -->|nutrients, serving size, vitamins, basis| P
    LOAD -->|Category and Sub_Category names| C
    LOAD -->|product/category associations| PC
```

The importer is separate from runtime API flows. It uses Python's CSV and
SQLite libraries, validates the source, and adds missing records in a
transaction only with `--apply`. The CSV has no nutrition-basis field, so an
apply requires an explicitly verified `--nutrition-basis`. Existing product
values are not overwritten.
