# NutraScore authentication administration

The authentication migration is additive and does not modify or reseed the product catalogue.

## Apply the migration

From the repository root:

```powershell
pnpm db:migrate
```

The API loads `DATABASE_URL` from `apps/api/.env` (or the repository environment configuration). The migration creates `Users`, `user_sessions`, `product_likes`, and `product_favourites`, plus indexes and image-review metadata.

## Create the first moderator

1. Register a normal account through `/register`.
2. From an administrator-controlled shell, promote that existing account:

```powershell
pnpm --filter api admin:promote-moderator -- moderator@example.com
```

The command only updates the role of the exact existing email. Registration never accepts a role, and the command does not create or expose credentials.

## Security notes

Sessions are opaque random tokens stored only as SHA-256 hashes in PostgreSQL and delivered in HTTP-only cookies. State-changing API calls require the CSRF token returned by `/api/auth/csrf`. Cookies are `SameSite=Lax`, and `Secure` is enabled when `NODE_ENV=production`. Passwords are bcrypt-hashed and are never returned by the API.
