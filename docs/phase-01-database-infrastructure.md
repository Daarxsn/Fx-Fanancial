# Phase 01 — Database Infrastructure

## Scope

Establish the server-only MySQL connection layer and a safe connectivity check before introducing business tables or invoice workflows.

## Implemented in this phase

- A shared `mysql2/promise` connection pool.
- Required environment-variable checks for host, port, database, username and password.
- Explicit `DATABASE_SSL=true|false` configuration; TLS certificate verification remains enabled when TLS is enabled.
- Bounded connection count, connection timeout, idle handling and queue limits.
- Development pool reuse to avoid opening a new pool during Next.js development reloads.
- A health-check function that returns a minimal status and timestamp without exposing database-driver errors or connection details.

## Required environment

| Variable | Purpose |
|---|---|
| `DATABASE_HOST` | MySQL host |
| `DATABASE_PORT` | MySQL TCP port |
| `DATABASE_NAME` | Database/schema name |
| `DATABASE_USER` | Database account |
| `DATABASE_PASSWORD` | Database password |
| `DATABASE_SSL` | Explicit TLS toggle (`true` or `false`) |

Keep real values in ignored local environment files or the deployment platform's secret settings. `.env.example` must contain placeholders only.

## Verification gates

- [ ] Confirm the app scaffold and lockfile are present on the working branch.
- [ ] Install dependencies from the committed lockfile.
- [ ] Run ESLint and TypeScript checks.
- [ ] Run the production build.
- [ ] Verify missing or malformed environment variables fail clearly.
- [ ] Test a successful TLS connection against the configured MySQL service.
- [ ] Test failed credentials/network access and ensure the health check exposes no secrets.
- [ ] Confirm no credentials or real customer data are committed.

## Not yet verified

The GitHub repository currently contains the Phase 00 documentation but does not yet contain `package.json`, the Next.js application scaffold, or a committed lockfile. Therefore these new source files have not yet been compiled or integration-tested from the repository. The configured MySQL connection has not been tested by this commit. These are explicit blockers to marking Phase 01 complete.

## Next step

Safely synchronize the existing local Next.js project with the remote `main` history, then run the verification gates above. Do not force-push or commit `.env.local`.
