# NutraScore structure chart

The structure chart groups the implemented modules by responsibility rather than
listing every source file as a separate top-level component.

```mermaid
flowchart TD
    N["NutraScore"]

    N --> UI["1. Web UI (SvelteKit)"]
    N --> API["2. Fastify API"]
    N --> DB["3. PostgreSQL data access"]
    N --> OPS["4. Import and enrichment operations"]

    UI --> NAV["Navbar and shared layout\nNavbar.svelte, +layout.svelte"]
    UI --> DISC["Product discovery"]
    UI --> DETAIL["Product detail and nutrition"]
    UI --> ACCOUNT["Account UI"]
    UI --> MODUI["Moderator dashboard"]
    UI --> COMP["Compare, categories, barcode"]

    DISC --> SEARCHBAR["SearchBar.svelte / discover/+page.svelte"]
    DISC --> CARD["ProductCard.svelte"]
    DETAIL --> PRODUCTPAGE["product/[id]/+page.svelte"]
    DETAIL --> NUTRITION["Nutrition and ingredient rendering"]
    ACCOUNT --> AUTHUI["login, register, profile"]
    ACCOUNT --> FAVUI["favourites page"]
    MODUI --> MODPAGE["moderator/+page.svelte"]

    UI --> CLIENT["API clients\nlib/api.ts and lib/api/client.ts"]
    CLIENT -->|HTTP JSON + cookies + CSRF header| API

    API --> ROUTES["Route plugins"]
    ROUTES --> AUTH["Authentication and sessions\nroutes/auth.ts, auth.ts"]
    ROUTES --> PRODUCTS["Products and engagement\nroutes/products.ts"]
    ROUTES --> SEARCH["Search and autocomplete\nroutes/search.ts"]
    ROUTES --> ACCOUNTAPI["Account favourites\nroutes/account.ts"]
    ROUTES --> MOD["Moderator image management\nroutes/moderator.ts"]
    ROUTES --> CATS["Categories\nroutes/categories.ts"]
    ROUTES --> COMPAPI["Compare\nroutes/compare.ts"]
    ROUTES --> BARCODE["Barcode lookup\nroutes/barcode.ts"]

    AUTH --> GUARDS["Session, CSRF, user, and moderator guards"]
    MOD --> VALIDATE["HTTPS/public-host/image-content validation"]
    MOD --> TX["Transactional image/provenance/review updates"]
    ROUTES --> POOL["pg Pool\nsrc/db/pool.ts"]
    POOL --> DB

    DB --> PRODUCTSSTORE[("Products")]
    DB --> NUTRITION[("Nutrition")]
    DB --> IMAGES[("ProductImages")]
    DB --> CATEGORIES[("categories / product_categories")]
    DB --> ALLERGENS[("allergens / product_allergens")]
    DB --> USERS[("Users / user_sessions")]
    DB --> ENGAGE[("product_likes / product_favourites")]
    DB --> PROV[("product_image_sources / product_image_reviews")]
    DB --> BARSTORE[("product_barcode_sources")]

    OPS --> IMPORT["import-data.ts\nParquet to PostgreSQL"]
    OPS --> ENRICH["Browser image enrichment and provenance\nseparate operational scripts"]
    IMPORT --> DB
    ENRICH -->|validated external image URLs and source metadata| IMAGES
    ENRICH --> PROV
```

## Module responsibilities

### Web UI

- [`+layout.svelte`](../../apps/web/src/routes/+layout.svelte) composes
  [`Navbar.svelte`](../../apps/web/src/lib/components/Navbar.svelte), page content,
  and the footer.
- Discovery uses [`discover/+page.svelte`](../../apps/web/src/routes/discover/+page.svelte)
  and [`ProductCard.svelte`](../../apps/web/src/lib/components/ProductCard.svelte).
- Product details and nutrition are rendered by
  [`product/[id]/+page.svelte`](../../apps/web/src/routes/product/[id]/+page.svelte).
- Authentication/account pages are under `apps/web/src/routes/login`,
  `register`, `profile`, and `favourites`.
- Moderator image management is under
  [`moderator/+page.svelte`](../../apps/web/src/routes/moderator/+page.svelte).

### API

[`index.ts`](../../apps/api/src/index.ts) registers route plugins under `/api`,
configures credentialed CORS using `WEB_ORIGIN`, and exposes `/api/health`.
Routes use the shared [`pool.ts`](../../apps/api/src/db/pool.ts) PostgreSQL pool.

### Operational code

[`import-data.ts`](../../apps/api/src/db/import-data.ts) imports Parquet data
using DuckDB and Drizzle. Image enrichment is not a Fastify request handler;
it is an external/background operational path that writes `ProductImages` and
provenance records.

## Important implementation boundary

The current SvelteKit frontend is primarily client-rendered and calls the
Fastify API directly. The API, not the frontend, performs authentication,
authorization, SQL filtering, image URL validation, and database writes.

