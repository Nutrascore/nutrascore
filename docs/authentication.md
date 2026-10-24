# Authentication and moderator administration

The API supports account registration, login, logout, session lookup, and
moderator authorization. Registration creates a regular user; role changes
are restricted to the administrative command.

## Apply database migrations

Configure `DATABASE_URL` in `apps/api/.env`, then run this from the repository
root:

```sh
pnpm db:migrate
```

## Promote a moderator

1. Register an account through the application.
2. From an administrator-controlled shell, promote that existing account:

```sh
pnpm --filter api admin:promote-moderator -- moderator@example.com
```

The command updates the role of the exact existing email address. Public
registration does not accept a role.

## Session handling

Sessions use opaque random tokens delivered in HTTP-only cookies. PostgreSQL
stores only SHA-256 token hashes. State-changing API calls require the CSRF
token returned by `/api/auth/csrf`. Cookies use `SameSite=Lax`; the `Secure`
flag is enabled when `NODE_ENV=production`. Passwords are bcrypt-hashed and
are never returned by the API.
