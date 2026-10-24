# Data Flow Diagram — Level 1 system decomposition

This decomposition follows the implemented API route plugins and their
PostgreSQL access. Public browsing remains separate from authenticated
engagement and moderator operations.

```mermaid
flowchart LR
    G[Guest visitor]
    U[Registered user]
    M[Moderator]
    X[External image host]

    P1(["1.0 Manage authentication\nand sessions"])
    P2(["2.0 Search and browse\nproducts"])
    P3(["3.0 Retrieve product,\nnutrition, and comparisons"])
    P4(["4.0 Manage likes,\nfavourites, and profile"])
    P5(["5.0 Manage moderator\nimage operations"])

    D1[("D1 Products")]
    D2[("D2 Nutrition")]
    D3[("D3 ProductImages")]
    D4[("D4 Categories, product_categories")]
    D5[("D5 Allergens, product_allergens")]
    D6[("D6 Users, user_sessions")]
    D7[("D7 product_likes, product_favourites")]
    D8[("D8 product_image_sources,\nproduct_image_reviews")]

    G -->|queries, filters, barcode/compare requests| P2
    G -->|product detail requests| P3
    P2 -->|search/category results with images and nutrition| G
    P3 -->|product, nutrition, ingredient, allergen, compare responses| G

    U -->|register/login/logout| P1
    P1 -->|AuthUser and session cookie| U
    U -->|session-aware product request| P3
    U -->|like/unlike and favourite/unfavourite| P4
    P4 -->|engagement state, counts, favourites| U

    M -->|authenticated dashboard/search| P5
    P5 -->|image list, validation result, operation result| M
    P5 -->|HTTPS image request| X
    X -->|image response and content type| P5

    P1 -->|user/session reads and writes| D6
    P2 -->|product/category search reads| D1
    P2 -->|category reads| D4
    P2 -->|nutrition/image reads| D2
    P2 -->|selected image reads| D3
    P3 -->|product/nutrition/category/allergen/image reads| D1
    P3 --> D2
    P3 --> D3
    P3 --> D4
    P3 --> D5
    P4 -->|authenticated relationship reads/writes| D6
    P4 --> D7
    P4 -->|product identity validation| D1
    P5 -->|moderator authorization| D6
    P5 -->|product and current image lookup| D1
    P5 --> D3
    P5 -->|source and review updates| D8
```

## Process mapping

| Process | Implemented modules/routes |
|---|---|
| 1.0 Manage authentication and sessions | [`auth.ts`](../../apps/api/src/auth.ts), [`routes/auth.ts`](../../apps/api/src/routes/auth.ts), login/register/profile UI |
| 2.0 Search and browse products | [`routes/search.ts`](../../apps/api/src/routes/search.ts), [`routes/categories.ts`](../../apps/api/src/routes/categories.ts), `discover/+page.svelte`, category UI |
| 3.0 Retrieve product, nutrition, and comparisons | [`routes/products.ts`](../../apps/api/src/routes/products.ts), [`routes/barcode.ts`](../../apps/api/src/routes/barcode.ts), [`routes/compare.ts`](../../apps/api/src/routes/compare.ts), product/compare UI |
| 4.0 Manage likes, favourites, and profile | product engagement endpoints, [`routes/account.ts`](../../apps/api/src/routes/account.ts), favourites/profile UI |
| 5.0 Manage moderator image operations | [`routes/moderator.ts`](../../apps/api/src/routes/moderator.ts), moderator dashboard UI |

## Data stores

- `D1`–`D5` are the imported catalogue and nutrition stores.
- `D6` stores account identities and hashed session references.
- `D7` stores user/product relationships.
- `D8` stores image provenance and moderator review state.

## Scope limitations

Compare and barcode response paths currently do not include the authenticated
like/favourite fields that product detail and search responses include.
Category product responses also expose catalogue/nutrition/image fields without
engagement state. This is reflected in the data flow rather than treated as a
planned feature.

