# Phase 01 — Database Connectivity and Infrastructure

## Implemented in the repository

- Server-only MySQL 2 connection pool with bounded settings (connection limit 5, max idle 2, bounded wait queue, 10-second connect timeout and keep-alive). Production explicitly rejects `DATABASE_SSL=false`.
- Server-side database health check and non-cached health endpoints (`/api/health` and `/api/v1/health`) return HTTP 200 or 503 with generic status and no raw driver diagnostics.
- MySQL 8 schema migrations 001 and 002 with a migration ledger and SHA-256 checksum checks.
- Safe reference seed script for role/permission definitions; it creates no users or role grants and is blocked in production unless explicitly enabled.
- `npm run db:verify` performs a real `SELECT 1` and confirms an active TLS cipher with certificate verification enabled.
- CI uses a fresh disposable MySQL 8 service to apply migrations twice, seed twice, assert migration ledger state, test generic connection failure behavior, create a logical dump and restore it to a separate disposable database, then compare table/migration counts.
- Backup, restoration, least-privilege database access and incident-response policy documented at `docs/database-backup-and-access.md`.
- Published current list-price comparison and planning totals are documented in `docs/provider-cost-review-2026-10.md`; these are estimates, not an account invoice or a provider purchase approval.

## Environment

Required variables: `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_NAME`, `DATABASE_USER`, `DATABASE_PASSWORD`, `DATABASE_SSL`. CLI commands automatically load the ignored local `.env.local` file, if present; deployed environments must set their variables through the deployment's secret manager. Never commit or paste credentials.

For remote managed databases set `DATABASE_SSL=true`. The TLS verification utility deliberately uses `rejectUnauthorized: true` and requires MySQL's session `Ssl_cipher` to be non-empty.

## Verification evidence

The live GitHub Actions CI run is the evidence of disposable MySQL 8 schema/seed/restore tests. The current workflow result and commit must be reviewed before treating those automated checks as passing.

## Required live sign-off

The explicit Phase 01 completion gate is **a successful real query against the configured Aiven MySQL service over verified TLS**. CI's disposable database does not prove this. Run locally, without sharing the contents of `.env.local`:

```bash
npm run db:verify
```

The command should report only whether `SELECT 1` succeeded and a TLS cipher was reported. If it fails, troubleshoot the endpoint, port, IP allowlist, CA and account grants locally; never disable certificate validation. Do not paste credentials or raw connection details into issues/chat.

## Backup and cost decisions

The backup and access policy defines proposed RPO/RTO goals, retention, encrypted off-host exports, least privilege and monthly isolated restoration drills. Managed backup schedule/retention and a provider-level restore must still be confirmed in the actual Aiven console before production launch.

Current published list prices and options are captured in `docs/provider-cost-review-2026-10.md`. Final paid tier selection, region, monthly budget, and storage/email volume are business decisions; verify the exact checkout/billing estimate before subscribing. No paid provider purchase is implied.
