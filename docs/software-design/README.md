# NutraScore software design documentation

This index links to documentation derived from the current repository implementation.

- [Structure chart](./structure-chart.md) — frontend, API, persistence, and operational modules.
- [Data dictionary](./data-dictionary.md) — PostgreSQL tables, relationships, API structures, and validation.
- [DFD Level 0](./dfd-level-0.md) — NutraScore context diagram.
- [DFD Level 1](./dfd-level-1.md) — system-level process decomposition.
- [DFD Level 2](./dfd-level-2.md) — detailed authentication, discovery, engagement, and moderator flows.

## Scope and evidence

The diagrams describe code currently present under `apps/web/`, `apps/api/`, and
`apps/api/drizzle/`. Product data is read from PostgreSQL. The image enrichment
runner is documented only as an operational/background source because it is not
registered as a Fastify route and is not part of the normal web request path.

