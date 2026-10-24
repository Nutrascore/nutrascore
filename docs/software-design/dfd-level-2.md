# Data Flow Diagram — Level 2

## Authentication and sessions

```mermaid
flowchart LR
    C[Client] -->|registration credentials and CSRF token| A(["Validate registration"])
    A -->|password hash and account data| U[(Users)]
    C -->|login credentials| L(["Validate login"])
    L -->|account lookup| U
    L -->|verified credentials| S(["Create session"])
    S -->|token hash and expiry| DB[(user_sessions)]
    S -->|HTTP-only session cookie| C
    C -->|session cookie| R(["Resolve current user"])
    R --> DB
    DB --> U
    C -->|logout and CSRF token| O(["Invalidate session"])
    O -->|delete token hash| DB
```

Registration normalizes account details and hashes passwords. Session tokens
are opaque, and only their hashes are stored in PostgreSQL. State-changing
requests require CSRF validation.

## Product discovery and detail

```mermaid
flowchart LR
    C[Client] -->|query, page, and categories| Q(["Search products"])
    Q --> P[(Products)]
    Q --> N[(Nutrition)]
    Q --> I[(ProductImages)]
    Q --> K[(categories / product_categories)]
    Q -->|paged summaries| C

    C -->|product identifier| D(["Load product detail"])
    D --> P
    D --> N
    D --> I
    D --> K
    D -->|product and nutrition details| C

    C -->|category identifier and page| B(["Browse category"])
    B --> K
    B --> P
    B --> N
    B --> I
    B -->|category products| C
```

Search matches product names and brands and supports pagination and category
filters. Product detail includes ingredients, categories, price, product
labels, images, serving information, and nutrients.

## Moderator product and image operations

```mermaid
flowchart LR
    M[Moderator] -->|session cookie| A(["Authorize moderator"])
    A --> S[(Users / user_sessions)]
    A -->|authorized request| V(["Validate operation and CSRF"])
    M -->|product details or image data| V
    V -->|product updates| P[(Products)]
    V -->|nutrition updates| N[(Nutrition)]
    V -->|image updates| I[(ProductImages)]
    V -->|source and review updates| R[(Image sources / review status)]
    V -->|image URL check| X[Image host]
    X -->|status and content type| V
    V -->|result| M
```

Image URL validation checks HTTPS, public-host resolution, response status,
and image content type. Moderator review determines whether an image is
appropriate for its product.
