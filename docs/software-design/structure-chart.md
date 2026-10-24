# NutraScore structure chart

```mermaid
flowchart TD
    N["NutraScore"]
    N --> W["Web application"]
    N --> A["Fastify API"]
    N --> D["PostgreSQL"]
    N --> O["CSV and image operations"]

    W --> DISC["Discovery and categories"]
    W --> DETAIL["Product details and nutrition"]
    W --> COMPARE["Product comparison"]
    W --> AUTHUI["Account pages"]
    W --> MODUI["Moderator dashboard"]
    W --> CLIENT["API client"]
    CLIENT -->|HTTP and session cookies| A

    A --> AUTH["Authentication"]
    A --> SEARCH["Search and autocomplete"]
    A --> PRODUCTS["Products and categories"]
    A --> COMPAREAPI["Comparison"]
    A --> MOD["Moderator operations"]
    A --> POOL["PostgreSQL pool"]
    POOL --> D

    D --> CATALOG["Products, nutrition, images, categories"]
    D --> USERS["Users and sessions"]
    D --> REVIEWS["Image sources and review status"]

    O --> CSV["CSV product import"]
    O --> IMAGES["Image maintenance"]
    CSV --> D
    IMAGES --> D
```

The web application is in `apps/web/`. API route plugins, authentication,
database access, and migrations are in `apps/api/`. The root `script/` folder
contains CSV preparation/import and image maintenance tools.
