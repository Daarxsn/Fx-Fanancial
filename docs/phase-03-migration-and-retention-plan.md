# Phase 03 — Migration, Rollout and Data-Retention Plan

**System:** Falchion Xeniaa Invoice Management System  
**Baseline:** MySQL 8.0+ / InnoDB; migrations are immutable and tracked with SHA-256 checksums in schema_migrations.  
**Date:** 2026-10-10  
**Status:** Design/review baseline. Production rollout requires a reviewed data inventory and tested backup/restore.

## 1. Migration ledger and ordering

| Version | File | Scope | Compatibility and verification |
|---|---|---|---|
| 001 | database/migrations/001_initial_schema.sql | Core legal entities, brands, customers, invoice numbering, invoice headers/lines, receipts/allocations and base audit events | First-install baseline. Verify foreign keys, checks and unique scopes on MySQL 8. |
| 002 | database/migrations/002_identity_catalog_workflows.sql | Users/roles/permissions and entity scope, catalog, quotations/lines, approvals, reminders, file metadata, email outbox, entity config history, brand mappings and tax rules | Depends on 001. Intentionally seeds no real entities, tax rates, users or grants. |
| 003 | database/migrations/003_phase3_integrity_snapshots.sql | Document-type sequence scope, credit/debit-note linkage, invoice-line master-data references, immutable issue snapshot table, separate quotation series, payment reversal events, typed approval targets and actor FKs | Depends on 001+002. Forward-only. Test fresh install and rerun; inventory any existing rows before live application. |

Do not edit a migration once its filename/checksum is recorded. Add the next monotonically numbered migration and update the schema review and tests. The runner sorts migration filenames lexically, so keep a consistently zero-padded numeric prefix as the project grows and verify the ordering after every added migration.

## 2. Preflight checks before applying migration 003 to an existing service

Migration 003 is forward-only but includes ALTER TABLE, new foreign keys and unique-index replacement. MySQL DDL may auto-commit and a partially failed migration can leave part of the change present. Before production:

1. Confirm the target schema and selected database identity through approved console/metadata checks; never print credentials.
2. Verify a provider-managed backup and create an encrypted off-provider logical export using a least-privilege backup account; record its checksum/location separately from the database.
3. Restore the backup to an isolated temporary MySQL 8 database and validate the restore before the change window.
4. Check row counts and data shape in invoices, invoice_lines, invoice_sequences, payments, payment_allocations, approval_requests, quotations, brands and legal_entities. Do not include personal, tax or bank values in shared output.
5. Specifically inventory pre-existing ISSUED and CANCELLED invoices that do not have an issue snapshot (migration 003 does not backfill old snapshots). Agree on a deterministic, reviewed backfill from existing evidence or document an archival exception. Do not manufacture historic calculations.
6. Verify old invoice_sequences rows map to document type INVOICE through the new default, and inspect historical numbers for collisions across document types before enabling credit/debit note issuance.
7. Identify legacy approval_requests rows. Migration 003 keeps resource_type/resource_id for compatibility and adds typed target columns; map each legacy approval to exactly one typed target and matching legal entity through a reviewed backfill before stricter constraints or approval-dependent issuance are enabled.
8. Run migrations 001–003 on an isolated copy, verify constraints/indexes, rerun the migration command to confirm idempotence, run negative tests, then restore/compare data.
9. Apply the same immutable migration set to the intended target only under an approved change window, with operator monitoring and a known recovery path.

If an ALTER TABLE fails after partial application, stop. Do not rerun blindly or mark the migration manually complete. Inspect the current schema and ledger with an authorized operator, restore a verified backup or follow a reviewed forward-repair procedure, then continue.

## 3. Cutover and expand/contract rules

- Add new columns/tables before code starts requiring them. Deploy readers that tolerate null/legacy rows where a transition requires it.
- Backfill in bounded, restartable batches with before/after row counts and an audit record; do not log sensitive snapshot payloads.
- Verify backfill completeness and integrity hashes, then deploy code that reads the new model.
- Add NOT NULL, strict CHECK or unique constraints only after legacy data is validated and reconciled. Prefer a new migration to editing migration 003.
- Remove legacy columns/tables only in a later approved migration after code no longer reads/writes them and rollback impact is accepted.
- Never run schema migrations from every app instance at startup. Use one controlled release job/operator path with a migration-specific DB account.
- Keep the runtime app account least-privilege; it should not own the schema or perform DDL. Snapshot immutability needs INSERT/SELECT privileges without UPDATE/DELETE for the snapshot table, or a separately reviewed enforced mechanism. Verify the actual runtime grants.
- Version public API contracts deliberately; additive optional response fields may be compatible, but removing/renaming fields or changing semantics requires a version/compatibility review.

## 4. Rollback and recovery

DDL rollback is not assumed to be transactional. Preferred recovery:

1. Stop deployment and disable the affected new write path.
2. Capture migration status and schema metadata safely.
3. Decide with the DB owner whether to repair forward or restore to an isolated database. Do not automatically drop new tables/columns if they may contain live writes.
4. Restore provider backup/logical export to an isolated database and validate table counts, foreign keys, migration ledger, snapshot hashes and financial reconciliations.
5. For a restore-over-production decision, require an approved outage/data-loss window and recovery plan; document lost/replayed writes.
6. Add a corrective migration or follow the restore plan, rerun the integration suite, and record the change/incident reference.

For additive migrations, “rollback” usually means a carefully reviewed forward fix or database restore; do not promise a down migration is safe merely because SQL can remove a column.

## 5. Retention and archival model

Retention durations below are proposed implementation defaults for review, not legal advice. A business/tax/privacy owner must map them to current statutory requirements, contracts, customer commitments and legal holds before lifecycle jobs are enabled.

| Data class | Proposed handling | Deletion/retention control |
|---|---|---|
| Issued invoices, issue snapshots, credit/debit notes, cancelled originals | Retain immutable issued history for the company-approved statutory/accounting period; no automatic deletion until a retention policy is approved | No cascading delete; legal hold overrides normal lifecycle; correction is a linked document |
| Payments, allocations, reversals, reconciliation and related audit events | Retain through the approved finance-record period, and at least as long as needed to reconstruct balances and source invoices | Append reversal/adjustment events; no hard-delete of monetary events |
| Number series and migration ledger | Retain for the system lifetime and preserve during restore/rebuild; do not reuse issued numbers | Back up and reconcile to issued documents |
| Customers and catalog masters | Deactivate/archive when unused; remove only if no legal, invoice, audit, contract or retention obligation remains | Historical snapshots survive master updates/deactivation |
| Legal entity, brand, tax/numbering/approval config versions | Retain versions needed to explain historical issued documents | Effective-dated, immutable versions; do not overwrite referenced versions |
| Approval decisions, audit logs and user/security events | Retain under approved security/accounting policy; apply restricted access and tamper-resistant retention | Do not cascade from deactivated users; preserve the actor reference/snapshot as policy requires |
| PDFs, adjustment files, attachments and generated exports | Private encrypted storage, access audit, approved retention/legal holds; temporary exports get shorter-lived retention where legally allowed | Integrity hash; lifecycle jobs must not delete held/linked original evidence |
| Email outbox, delivery attempts and reminder attempts | Keep minimum delivery/audit metadata needed to explain communications; minimize retained body content/attachments under privacy policy | Sanitized errors; no secrets; defined retry and retention rules |
| Sessions and authentication transient state | Short-lived; expire/revoke according to security policy | Never retain raw tokens in logs or analytics |

Never build an automatic purge until legal/tax retention periods, privacy rights, archival access, legal-hold behavior, backup expiry and deletion verification are approved. Backups can retain deleted data until expiry; the policy must account for that. Prefer soft-delete/deactivation of referenced master records over breaking referential integrity.

## 6. Indexing and query review process

For each business query, document filters, sort order, legal-entity predicate, expected row volume and explain plan. At minimum review entity/date invoice lists, customer history, payment allocations by invoice, receipts by customer/date, approval inbox, due reminder jobs, email queue, tax/config effective-date lookup and audit search. Use composite indexes aligned to leading equality filters followed by date/order columns; avoid redundant indexes without comparing write cost and EXPLAIN output.

Paginated API lists must cap page size (default 25, max 100), use deterministic ordering with a unique tie-breaker, validate sort keys against an allowlist, and never concatenate arbitrary client input into SQL.

## 7. Definition of done

- [x] Migration order/dependencies and immutable migration policy documented.
- [x] Migration 003 preflight, history backfill, cutover and recovery risks documented.
- [x] Retention/deletion rules differentiated by data class and pending company approval.
- [x] Production-safe rollout process documented; no live Aiven migration is implied.
- [ ] Migration 003 passes repository CI after assertions are updated for three migration records.
- [ ] Existing Aiven schema/data inventory confirms whether historical snapshot and approval backfills are needed; no production migration until reviewed.
- [ ] Runtime DB grants enforce snapshot immutability and least privilege.
