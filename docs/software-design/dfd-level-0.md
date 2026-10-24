# Data Flow Diagram — Level 0 context

```mermaid
flowchart LR
    G[Visitor]
    U[Registered user]
    M[Moderator]
    X[Image host]
    S(["NutraScore"])

    G -->|product, category, search, and comparison requests| S
    S -->|product and nutrition information| G
    U -->|account and session requests| S
    S -->|account status and session cookie| U
    M -->|authenticated product and image management| S
    S -->|product lists, validation results, and operation status| M
    S -->|image URL validation request| X
    X -->|image response| S
```

Visitors browse products, categories, nutrition, and comparisons. Registered
users can access account functions. Moderators can manage product details and
images. External image hosts participate when an image URL is validated.
