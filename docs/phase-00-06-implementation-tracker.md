# Phase 00–06 Implementation Tracker

This tracker is the single sign-off checklist for the foundation work. It must be updated with evidence, not optimistic assumptions.

## Phase 00 — Foundation

- [ ] Lockfile committed and CI uses `npm ci`.
- [ ] Clean checkout installs and builds on supported Node.js.
- [ ] Local worktree reconciled without losing local changes.
- [ ] Secret scan reviewed across tracked files and Git history.
- [ ] Environment conventions documented for development, test, staging and production.
- [ ] Contribution, review, security reporting and coding standards documented.
- [ ] CI success recorded against the exact final commit.

## Phase 01 — Database infrastructure

- [ ] Versioned migration runner with migration ledger.
- [ ] Safe repeatable development seed script; no production sample identities.
- [ ] Aiven connection verified using a real TLS-protected query.
- [ ] Negative connection tests completed without exposing credentials.
- [ ] Migration 001 and 002 applied to a disposable MySQL 8 instance and schema inspected.
- [ ] Backup retention/access policy and restoration drill documented and tested.
- [ ] Hosting, database, object storage, email and job service costs checked against current provider pricing.

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

## Evidence recorded so far

- GitHub Actions run for commit `b6d17f29127e67e663334f96030d29428002a255` reported success for the current lint/typecheck/build workflow.
- The remote repository had no committed `package-lock.json` at the time of audit.
- Aiven TLS query, migration application, backup/restore drill, auth and protected business workflows have not been verified in this repository audit.
- `database/migrations/002_identity_catalog_workflows.sql` is a schema draft until tested against a real disposable MySQL 8 instance.
- Local Mac worktree status is not available from this execution environment.

**Rule:** Never mark the phase complete based on docs alone. Keep each box unchecked until the evidence exists.
