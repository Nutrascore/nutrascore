# Data Flow Diagram — Level 1

```mermaid
flowchart LR
    G[Visitor]
    U[Registered user]
    M[Moderator]
    X[Image host]

    A(["1.0 Authentication and sessions"])
    B(["2.0 Product discovery"])
    C(["3.0 Product and nutrition details"])
    D(["4.0 Product comparison"])
    E(["5.0 Moderator product and image management"])

    P[(Products)]
    N[(Nutrition)]
    I[(ProductImages)]
    K[(Categories and product_categories)]
    S[(Users and user_sessions)]
    R[(Image sources and review status)]

    U -->|register, login, logout| A
    A -->|account status and session cookie| U
    A <--> S

    G -->|search, filters, autocomplete| B
    B --> P
    B --> N
    B --> I
    B --> K
    B -->|product summaries| G

    G -->|product identifier| C
    C --> P
    C --> N
    C --> I
    C --> K
    C -->|product details| G

    G -->|product identifiers| D
    D --> P
    D --> N
    D --> I
    D --> K
    D -->|comparison results| G

    M -->|authenticated product and image actions| E
    E --> S
    E --> P
    E --> I
    E --> R
    E -->|image validation request| X
    X -->|image response| E
    E -->|operation result| M
```

The API implements the flows through its authentication, search, product,
category, comparison, and moderator route plugins. Product and category data
are read from PostgreSQL; moderator image changes update image and review
records.
