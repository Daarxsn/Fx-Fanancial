# Phase 01 — Database Connectivity and Infrastructure

## Implemented in the repository

- Server-only MySQL 2 connection pool with bounded settings (connection limit 5, max idle 2, bounded wait queue, 10-second connect timeout and keep-alive). Production explicitly rejects `DATABASE_SSL=false`.
- Verified TLS options support system trust plus an optional CA PEM via `DATABASE_SSL_CA_PATH` (local file) or `DATABASE_SSL_CA` (protected deployment environment value). Certificate validation is never disabled when TLS is on.
- Server-side database health check and non-cached health endpoints (`/api/health` and `/api/v1/health`) return HTTP 200 or 503 with generic status and no raw driver diagnostics.
- MySQL 8 schema migrations 001 and 002 with migration ledger and SHA-256 checksum verification.
- Safe, repeatable reference seed script for role/permission definitions. It creates no users and grants no permissions to roles; production use is blocked by default.
- `npm run db:verify` performs `SELECT 1` against the configured remote MySQL endpoint, verifies an active TLS cipher, and enables certificate verification.
- Backup, restoration, least-privilege database access and incident-response policy documented at `docs/database-backup-and-access.md`.
- Dated list-price comparison and planning estimates documented at `docs/provider-cost-review-2026-10.md`; no provider purchase is implied.

## Automated verification evidence

CI at commit `a09e0ce70edadc748ea8f86032245d812e2ea1ad` passed all of the following:
- Gitleaks history scan.
- Fresh MySQL 8.0 service: migrations 001 and 002 applied; migration command rerun to test idempotency.
- Reference seed run twice and exact counts verified (2 migration rows, 22 permission definitions, 7 role definitions).
- Deliberately closed-port check confirms the TLS verifier fails safely and does not print raw network/credential diagnostics.
- Logical database dump restored into a separate disposable database; source/restored base-table counts and migration ledger checked.
- Lint, TypeScript and production build.

Run: https://github.com/Daarxsn/Fx-Fanancial/actions/runs/38029874336  
Lockfile workflow: https://github.com/Daarxsn/Fx-Fanancial/actions/runs/38029874322

These automated checks prove schema/seed/restore mechanics in a disposable MySQL 8 service. They do not prove connection to the user's live Aiven service or provider-managed backup retention.

## The outstanding completion gate

The requested phase definition explicitly requires a real Aiven query over verified TLS. This cannot be truthfully inferred from CI's disposable database. After pulling the latest changes and verifying the Aiven values in the ignored local `.env.local`, run:

```bash
npm run db:verify
```

A successful run prints a pass message stating that `SELECT 1` succeeded and the server reported an active TLS cipher. Certificate verification is enabled. The script suppresses raw driver diagnostics so hosts, database names, account names, and credentials are not printed. If needed, set `DATABASE_SSL_CA_PATH` to the CA PEM downloaded from the authenticated Aiven Console, or `DATABASE_SSL_CA` in a protected deployment environment. Never disable certificate validation to work around errors.

**Phase 01 is not 100% signed off until that command succeeds against the real Aiven service.** Do not share `.env.local`, passwords, connection URIs, CA private keys (if any), or raw logs.

## Backup, access and cost readiness

The backup/access policy defines proposed RPO/RTO, managed-backup verification, encrypted off-host exports, retention, monthly isolated restore drills, least privilege, access reviews and incident response. CI's synthetic dump/restore passed; confirm the actual Aiven plan's backup retention and complete a provider-level restoration drill before production.

Published pricing was checked against the official list-price pages linked in `docs/provider-cost-review-2026-10.md`. Region, taxes, workload, storage/email volume, paid tier and final account quote remain variable. Confirm the provider's billing estimator and approve a monthly spend cap before subscribing; do not assume the planning totals are a quote.
