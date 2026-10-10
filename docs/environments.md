# Environment Configuration

## Environments

| Environment | Purpose | Data and access policy |
|---|---|---|
| Local development | Individual development and debugging | Use `.env.local` with a dedicated non-production database; use synthetic fixtures only. |
| CI/test | Repeatable lint, typecheck, build and automated tests | Use disposable services or placeholders for build-only checks. Never connect CI to production data. |
| Staging | End-to-end acceptance and release rehearsal | Separate database, storage, email credentials and access policies from production; use synthetic or approved sanitized data. |
| Production | Live financial records | Store secrets in deployment secret settings; restrict access, require TLS, enable backups and monitor failures. |

## Variable conventions

- `.env.example` documents required variable names and safe placeholder values only.
- `.env.local` is for local secrets and must never be committed.
- Deployment environments must configure variables independently; do not copy production credentials into local or CI environments.
- Required database variables are `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_NAME`, `DATABASE_USER`, `DATABASE_PASSWORD` and `DATABASE_SSL`.
- Set `DATABASE_SSL=true` in production so the driver validates the TLS certificate. Plaintext database connections are not permitted in production.
- Authentication secrets such as `SESSION_SECRET` must be generated securely, stored outside Git and rotated through a planned process.
- Never print environment values in build logs, diagnostics, support screenshots or issue reports.

## Release checklist

1. Verify required variables are present without printing their values.
2. Verify database TLS and least-privilege credentials.
3. Apply reviewed migrations through the migration runner.
4. Confirm backup freshness and a tested restoration procedure.
5. Verify auth callback/origin, cookie and HTTPS settings.
6. Confirm private storage, email and job credentials are environment-specific.
7. Run staging acceptance tests and record the exact commit deployed.
8. Roll back application changes or follow an approved forward-repair procedure; do not blindly reverse production DDL.
