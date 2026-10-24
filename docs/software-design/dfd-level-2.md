# Data Flow Diagram — Level 2 detailed flows

The following diagrams expand the Level 1 processes that contain the most
security- and data-sensitive behavior. Each subprocess is an implemented route
or helper; no unimplemented workflow is shown.

## 1.0 Authentication and session management

```mermaid
flowchart LR
    C[Client] -->|GET csrf| A1(["1.1 Issue CSRF cookie/token"])
    A1 -->|csrf token + cookie| C
    C -->|name, email, password + CSRF| A2(["1.2 Validate registration"])
    A2 -->|normalized credentials| U[(Users)]
    U -->|duplicate constraint/result| A2
    A2 -->|bcrypt hash and default user role| A3(["1.3 Create account/session"])
    A3 -->|opaque session cookie| C
    C -->|email, password + CSRF| A4(["1.4 Validate login"])
    A4 -->|lookup email and password hash| U
    A4 -->|successful credential check| A5(["1.5 Create 30-day session"])
    A5 -->|cookie; token hash stored| S[(user_sessions)]
    A5 -->|AuthUser| C
    C -->|session cookie| A6(["1.6 Authenticate request"])
    A6 -->|hash cookie token, check expiry| S
    S -->|user id| U
    A6 -->|authenticated user/role| A7(["1.7 Authorize user or moderator"])
    C -->|logout + CSRF| A8(["1.8 Invalidate session"])
    A8 -->|delete token hash| S
    A8 -->|expired cookie| C
```

Details:

- `name` is trimmed and must be 2–120 characters.
- Email is lowercased and checked by the API email pattern.
- Password length is 8–128 characters and is bcrypt-hashed.
- Registration never accepts a role; the database default is `user`.
- Failed login attempts are counted in an in-memory email/IP window: ten
  attempts per fifteen minutes.
- The browser uses `credentials: include`; state-changing calls send the
  non-HTTP-only CSRF cookie value in `X-CSRF-Token`.

## 2.0 Product discovery and nutrition retrieval

```mermaid
flowchart LR
    C[Guest or user client] -->|query, page, pageSize, category/nutrition filters| B1(["2.1 Parse and validate search pagination"])
    B1 -->|ILIKE name/brand and filters| P[(Products)]
    B1 -->|nutrition predicates| N[(Nutrition)]
    B1 -->|category predicates| CATS[(categories / product_categories)]
    B1 -->|selected image| I[(ProductImages)]
    B1 -->|like count and optional user state| L[(product_likes / product_favourites)]
    P --> B2(["2.2 Order, limit, and count results"])
    N --> B2
    CATS --> B2
    I --> B2
    L --> B2
    B2 -->|product summaries, totals, pages| C

    C -->|product id or barcode| B3(["2.3 Retrieve product detail"])
    B3 --> P
    B3 --> N
    B3 --> I
    B3 --> CATS
    B3 --> A[(allergens / product_allergens)]
    B3 --> L
    B3 -->|product response| C

    C -->|category id, limit, offset| B4(["2.4 Retrieve category products"])
    B4 --> CATS
    B4 --> P
    B4 --> N
    B4 --> I
    B4 -->|category response and product summaries| C
```

Implemented public endpoints include `/api/products/search`,
`/api/products/autocomplete`, `/api/products/:id`,
`/api/products/barcode/:barcode`, `/api/categories`, and
`/api/categories/:id/products`.

## 4.0 Likes and favourites

```mermaid
flowchart LR
    C[Authenticated client] -->|session cookie| E1(["4.1 Resolve current user"])
    E1 -->|session hash and expiry check| S[(user_sessions)]
    S --> U[(Users)]
    E1 -->|user id| E2(["4.2 Require user + CSRF"])
    C -->|product id and like/favourite action| E2
    E2 -->|product existence check| P[(Products)]
    E2 -->|INSERT ON CONFLICT DO NOTHING| L[(product_likes)]
    E2 -->|DELETE user/product row| L
    E2 -->|INSERT ON CONFLICT DO NOTHING| F[(product_favourites)]
    E2 -->|DELETE user/product row| F
    L --> E3(["4.3 Count and return like state"])
    F --> E4(["4.4 Query user-scoped favourites"])
    E3 -->|liked state and idempotent result| C
    E4 -->|only rows for authenticated user| P
    P --> E4
    E4 -->|favourite product summaries and like counts| C
```

The composite `(user_id, product_id)` primary keys prevent duplicate
relationships. The favourites query is constrained by the authenticated
session’s user id; it does not accept a user id from the client.

## 5.0 Moderator image management

```mermaid
flowchart LR
    M[Moderator client] -->|session cookie| R1(["5.1 Require user and moderator role"])
    R1 -->|session hash| S[(user_sessions)]
    S --> U[(Users)]
    R1 -->|moderator permission| R2(["5.2 Parse dashboard filter/search"])
    R2 -->|product/category/current image/review joins| P[(Products)]
    R2 --> I[(ProductImages)]
    R2 --> PR[(product_image_sources / product_image_reviews)]
    R2 -->|filtered product list| M

    M -->|HTTPS image URL, source URL, review status + CSRF| R3(["5.3 Validate image request"])
    R3 -->|URL parse, HTTPS, DNS public-host check| R4(["5.4 Check external image"])
    R4 -->|HEAD request| X[External image host]
    X -->|status and image/* content type| R4
    R4 -->|validated image| R5(["5.5 Transactional image update"])
    R5 -->|clear current primary flags| I
    R5 -->|insert new ProductImages row| I
    R5 -->|upsert source URL/name/confidence| PR
    R5 -->|upsert review status| PR
    R5 -->|success/error| M

    M -->|remove + confirmation + CSRF| R6(["5.6 Transactional image removal"])
    R6 -->|delete product image rows| I
    R6 -->|delete provenance/review rows| PR
    R6 -->|success| M

    M -->|mark for review + CSRF| R7(["5.7 Set review state"])
    R7 -->|upsert needs_review| PR
    R7 -->|success/error| M
```

The moderator route is [`routes/moderator.ts`](../../apps/api/src/routes/moderator.ts).
It does not determine whether the remote image depicts the correct product; the
stored moderator-supplied provenance explicitly says identity requires human
review by default. The URL validator checks reachability and content type, not
semantic product identity.

## Features outside these Level 2 flows

- Compare is a public read-only request for two to four product IDs.
- Barcode lookup is a public read-only exact `Products.barcode` lookup.
- Barcode scanning is a browser component that supplies a barcode to the API;
  camera decoding is not a PostgreSQL process.
- The separate image enrichment runner can write image/provenance records, but
  it is not invoked by the Fastify API and is intentionally not represented as
  a user-request subprocess.

## Implementation references

- Authentication helpers: [`apps/api/src/auth.ts`](../../apps/api/src/auth.ts)
- Authentication routes: [`apps/api/src/routes/auth.ts`](../../apps/api/src/routes/auth.ts)
- Search: [`apps/api/src/routes/search.ts`](../../apps/api/src/routes/search.ts)
- Product detail/engagement: [`apps/api/src/routes/products.ts`](../../apps/api/src/routes/products.ts)
- Favourites: [`apps/api/src/routes/account.ts`](../../apps/api/src/routes/account.ts)
- Moderator operations: [`apps/api/src/routes/moderator.ts`](../../apps/api/src/routes/moderator.ts)
- PostgreSQL schema: [`apps/api/src/db/schema.ts`](../../apps/api/src/db/schema.ts)

