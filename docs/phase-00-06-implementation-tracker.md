# Phase 00–06 Implementation Tracker

This tracker records verified implementation evidence. Do not mark infrastructure or application behavior complete solely because documentation or source files exist.

## Phase 00 — Foundation

- [x] Lockfile committed and CI uses `npm ci`.
- [x] Clean CI checkout installs and builds on supported Node.js 24.
- [x] Developer Mac worktree reconciled and verified clean after pulling the latest remote commit.
- [x] Gitleaks secret scan passed on the tracked repository history after full-history checkout was configured.
- [x] Environment conventions documented for local development, CI/test, staging and production.
- [x] Contribution, review, security reporting and coding standards documented.
- [x] CI and lockfile bootstrap passed for revision `2121950b4fe3c1b9130f9ad8c45813261082df2b`.
- [x] Phase 00 acceptance checklist updated with links to CI evidence.

Evidence:
- CI success: https://github.com/Daarxsn/Fx-Fanancial/actions/runs/38029253509
- Lockfile bootstrap success: https://github.com/Daarxsn/Fx-Fanancial/actions/runs/38029253557
- Acceptance record: `docs/phase-00-acceptance.md`

## Phase 01 — Database connectivity and infrastructure

- [x] Server-only MySQL pool uses bounded settings and production requires TLS.
- [x] Optional Aiven CA PEM configuration supports local file path or protected deployment environment value while retaining certificate verification.
- [x] Health endpoints return 200/503 and suppress raw driver errors.
- [x] Versioned migration runner uses a ledger and SHA-256 checksums.
- [x] Repeatable reference seed creates role/permission definitions only; it creates no users and does not assign grants.
- [x] `npm run db:verify` implements a strict `SELECT 1` plus active TLS cipher check with verified certificates.
- [x] CI applied migrations 001/002 to a fresh MySQL 8 instance and safely reran the migration command.
- [x] CI seeded twice and verified the expected 2 migrations, 22 permission definitions and 7 role definitions.
- [x] CI tested a deliberate failed connection without printing raw network/credential diagnostics.
- [x] CI logical dump restored into a separate disposable database with matching base-table count and migration ledger.
- [x] Runtime health endpoint returned 200 for a healthy database and generic 503 for an unavailable database, without raw diagnostics.
- [x] Backup, recovery and least-privilege access policy documented; provider pricing comparison reviewed from current official list-price pages.
- [x] **Live completion gate:** developer ran `npm run db:verify` against the configured Aiven service; `SELECT 1` succeeded, MySQL reported an active TLS cipher, and certificate validation remained enabled (`rejectUnauthorized=true`).
- [ ] Before production: verify actual Aiven plan backup retention and complete a provider-managed restore drill; approve business RPO/RTO targets and final provider spend ceiling.

Evidence:
- Live verification (developer-provided output, 2026-10-10): `PASS: SELECT 1 succeeded and MySQL reports an active TLS cipher.` and `Certificate verification was enabled (rejectUnauthorized=true).`
- CI success for commit `1f5aa08189c4bde09ac0d2a32e142a0c577ae6e5`: https://github.com/Daarxsn/Fx-Fanancial/actions/runs/38030068615
- Lockfile/build workflow success: https://github.com/Daarxsn/Fx-Fanancial/actions/runs/38030068593
- Verification command and backup/access policy: `docs/phase-01-database-infrastructure.md`, `docs/database-migrations.md`, `docs/database-backup-and-access.md`
- Public list-price comparison: `docs/provider-cost-review-2026-10.md`

**Sign-off rule:** Phase 01's specified completion gate has passed and the phase is recorded as complete. The provider-level restore drill, approval of business RPO/RTO targets, and final budget decision remain pre-production safeguards.

## Phase 02 — Business rules

- [ ] Invoice lifecycle, independent payment/approval/email states and cancellation/credit-note policy approved.
- [ ] Invoice numbering scope and financial-year boundary approved.
- [ ] Currency, tax, discounts and rounding approved by the business/accounting owner.
- [ ] Payment terms, overpayment/refund/TDS and multi-currency scope approved.
- [ ] Roles, approval thresholds and separation-of-duties rules approved.
- [ ] Requirements traceable to implementation and automated tests.

## Phase 03 — Data model and API

- [x] Initial schema migration exists.
- [x] Expansion schema draft exists for identity, catalog, quotations, approval requests, reminders, document metadata, email outbox, tax rules and configuration versions.
- [ ] Schema reviewed for MySQL syntax and applied to disposable MySQL 8.
- [ ] Data relationships, indexes, delete rules and tenant/legal-entity scoping reviewed.
- [ ] Migration rollback/recovery strategy tested.
- [ ] API runtime schemas implemented and OpenAPI synchronized.
- [ ] API integration/contract tests pass.

## Phase 04 — UI

- [ ] Design tokens and accessible reusable component system implemented.
- [ ] Application shell/navigation and responsive layouts implemented.
- [ ] Customer/catalog/company/invoice/payment pages use real protected APIs.
- [ ] Loading, empty, error, validation, conflict and confirmation states implemented.
- [ ] Keyboard, accessibility and desktop/tablet/mobile review completed.

## Phase 05 — Authentication/RBAC

- [ ] Identity provider approved and configured.
- [ ] Login/logout, session expiry/revocation, deactivation and rate limiting implemented.
- [ ] CSRF protections configured for cookie-authenticated writes.
- [ ] Server-side default-deny permission checks implemented on every protected route/service/download/job.
- [ ] Legal-entity-scoped resource access enforced in data access paths.
- [ ] Negative, cross-entity, revoked-user and download/export security tests pass.
- [ ] Security events are auditable without tokens or secrets.

## Phase 06 — Company/brand/legal entity

- [ ] Legal entities and brand mappings confirmed by the business owner.
- [ ] Legal-entity, brand, tax, bank, numbering and template configuration schema implemented.
- [ ] Configuration history/version/effective dates recorded.
- [ ] Admin UI and server validation implemented with restricted permissions.
- [ ] Issuance is blocked for inactive/incomplete legal entities.
- [ ] Audit and cross-entity access tests pass.
- [ ] Snapshot immutability verified after configuration changes.

## Evidence notes

- The GitHub Actions workflows prove dependency installation, lint, TypeScript, secret scanning and production build for the specific successful revision; they do not prove database connectivity or that migrations were applied.
- The database migrations and seed script have been applied and tested against disposable MySQL 8 in CI; the live Aiven TLS verification gate has since passed. Provider-level backup/restore verification remains outstanding.
- Local Mac status cannot be observed by GitHub Actions or this remote repository audit. Verify with `git status -sb`, `git rev-parse HEAD`, and `git rev-parse origin/main`.

**Sign-off rule:** Phase 00's repository foundation is signed off based on the developer-confirmed clean/synchronized worktree and passing CI/lockfile workflows. This tracker/acceptance update triggers another CI run. Phase 01 remains in progress until its database integration and recovery tests have evidence.
