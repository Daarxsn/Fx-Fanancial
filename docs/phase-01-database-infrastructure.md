# Phase 01 — Database Infrastructure

## Implemented in repository
- Server-only MySQL connection pool with required environment validation, bounded pool settings, and configurable TLS with certificate verification enabled when TLS is on.
- Server-side database health check that does not expose driver errors.
- A minimal non-cached health endpoint returning HTTP 200 when the database responds and HTTP 503 otherwise.
- Initial MySQL 8 schema migration at `database/migrations/001_initial_schema.sql`.

## Environment
Use `.env.local` for local credentials and deployment secret settings in hosted environments. Never commit secrets or real customer data.

Required variables: `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_NAME`, `DATABASE_USER`, `DATABASE_PASSWORD`, `DATABASE_SSL`.

## Verification gates
- [ ] Commit and verify lockfile against manifest.
- [ ] Lint, TypeScript and production build pass from a clean checkout.
- [ ] Apply migration to a disposable MySQL 8 database and inspect resulting schema.
- [ ] Test valid TLS connection and invalid credentials/network failure.
- [ ] Verify health endpoint never leaks connection details.
- [ ] Review schema constraints and migration rollback/recovery strategy before production use.

A schema file being committed does not mean it has been applied or integration-tested. Do not apply to production without a verified backup and explicit review.
