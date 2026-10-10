# Phase 01 — Database Connectivity and Infrastructure

## Implemented in the repository

- Server-only mysql2 connection pool with bounded settings (connection limit 5, max idle 2, bounded wait queue, 10-second connect timeout and keep-alive). Production explicitly rejects `DATABASE_SSL=false`.
- Verified TLS options support system trust plus an optional CA PEM via `DATABASE_SSL_CA_PATH` (local file) or `DATABASE_SSL_CA` (protected deployment environment value). Certificate validation is never disabled when TLS is on.
- Server-side database health check and non-cached health endpoints (`/api/health` and `/api/v1/health`) return HTTP 200 or 503 with generic status and no raw driver diagnostics.
- MySQL 8 schema migrations 001 and 002 with migration ledger and SHA-256 checksum verification.
- Safe, repeatable reference seed script for role/permission definitions. It creates no users and grants no permissions to roles; production use is blocked by default.
- `npm run db:verify` performs `SELECT 1` against the configured remote MySQL endpoint, verifies an active TLS cipher, and enables certificate verification.
- Backup, restoration, least-privilege database access and incident-response policy documented at `docs/database-backup-and-access.md`.
- Dated list-price comparison and planning estimates documented at `docs/provider-cost-review-2026-10.md`; no provider purchase is implied.

## Automated verification evidence

CI at commit `1f5aa08189c4bde09ac0d2a32e142a0c577ae6e5` passed all of the following:
- Gitleaks history scan.
- Fresh MySQL 8.0 service: migrations 001 and 002 applied; migration command rerun to test idempotency.
- Reference seed run twice and exact counts verified (2 migration rows, 22 permission definitions, 7 role definitions).
- Deliberately closed-port check confirms the TLS verifier fails safely and does not print raw network/credential diagnostics.
- Runtime health endpoint tests return 200 for a reachable MySQL service and generic 503 for an unavailable service, without raw diagnostics.
- Logical database dump restored into a separate disposable database; source/restored base-table counts and migration ledger checked.
- Lint, TypeScript and production build.

Run: https://github.com/Daarxsn/Fx-Fanancial/actions/runs/38030068615  
Lockfile workflow: https://github.com/Daarxsn/Fx-Fanancial/actions/runs/38030068593

These automated checks prove schema/seed/restore mechanics in a disposable MySQL 8 service. They do not prove connection to the user's live Aiven service or provider-managed backup retention.

## Live Aiven completion-gate evidence

On 2026-10-10, the developer ran `npm run db:verify` against the configured Aiven service. It returned:

- `PASS: SELECT 1 succeeded and MySQL reports an active TLS cipher.`
- `Certificate verification was enabled (rejectUnauthorized=true).`

This verifies that a real query succeeded and MySQL reported an active TLS cipher while certificate verification remained enabled. The verifier did not print connection credentials or raw driver diagnostics.

**Phase 01's specified completion gate has passed.** Keep the CA PEM and `.env.local` private; never disable certificate validation to work around TLS errors.

## Backup, access and cost readiness

The backup/access policy defines proposed RPO/RTO, managed-backup verification, encrypted off-host exports, retention, monthly isolated restore drills, least privilege, access reviews and incident response. CI's synthetic dump/restore passed; confirm the actual Aiven plan's backup retention and complete a provider-level restoration drill before production.

Published pricing was checked against the official list-price pages linked in `docs/provider-cost-review-2026-10.md`. Region, taxes, workload, storage/email volume, paid tier and final account quote remain variable. Confirm the provider's billing estimator and approve a monthly spend cap before subscribing; do not assume the planning totals are a quote.
