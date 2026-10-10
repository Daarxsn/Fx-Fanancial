# Phase 03 — System Architecture, Data Model and API Contracts

**System:** Falchion Xeniaa Invoice Management System  
**Model version:** 1.0 · **Date:** 2026-10-10  
**Target:** Next.js App Router, TypeScript, MySQL 8.0+ / InnoDB  
**Status:** Design package complete; implementation status is explicitly identified in OpenAPI. The schema and contracts do not imply that every business endpoint is already live.

## 1. Architecture decisions

### Runtime boundaries

- Next.js Route Handlers are the HTTP boundary; validation, authorization and business/domain services stay server-side.
- React/client code never imports database pool, server-only modules, session secrets or tax/calculation internals.
- MySQL access uses mysql2/promise through the server-only pool. TLS certificate verification remains enabled in production.
- Route Handlers parse and validate input before executing use cases. Authorization is checked server-side per operation and re-checked against current account status and legal-entity scope.
- Domain services own invoice issuance, numbering, snapshots, payment allocations, reversals, approvals, cancellation and side-effect queueing. Those business commands must not be implemented as arbitrary client-directed row updates.
- MySQL transactions/constraints protect atomic database invariants. Email and private storage calls are external side effects and are queued through durable outbox/job records; do not hold database transactions open during provider requests.
- Private PDFs/attachments are stored outside the public static asset directory. The database stores private object identifiers, content metadata and hashes, not public access tokens.
- Deployment environments are isolated. Schema migrations run as one controlled release/operator job, not from every app instance startup.

### Security and tenant/entity boundary

- Authentication establishes identity; permission and legal-entity scope independently decide resource access.
- Every data query, detail route, mutation, PDF/file download, report, export and background job must apply a server-side scope filter.
- A client-supplied legalEntityId, role, actorId or invoice status is input, not proof of permission.
- API errors contain a stable code, safe message, optional field-error map and server-generated requestId. The same requestId is returned in the X-Request-Id header. No stack trace, SQL, connection host, credential, token or raw provider error is returned.
- Use no-store on private business responses. Health endpoints expose only generic readiness status, never business data or driver diagnostics.

## 2. Technology and serialization contract

- Database: MySQL 8.0+ with InnoDB; migrations run and test against MySQL 8.
- IDs: canonical UUID strings at API boundary, represented in existing schema as CHAR(36).
- Calendar dates: ISO 8601 date strings YYYY-MM-DD. Instants: ISO 8601 date-time with timezone; normalize persistence/display under an explicitly selected UTC strategy while preserving legal document dates as date-only values.
- Money and quantities: decimal values represented as strings over JSON; authoritative monetary columns use DECIMAL(19,4), never JavaScript binary floating-point. Tax rates use DECIMAL(9,6); API tax rate is a decimal string in percentage points (for example, 18.000000 means 18%), not a 0.18 fraction. Actual values and treatments require Phase 02 owner-approved policy.
- Currency: explicit three-letter uppercase ISO 4217 code. The existing INR default is technical only and cannot override legal-entity configuration.
- JSON snapshots: stable canonical serialization is defined before hashing; UTF-8 canonical bytes are SHA-256 hashed and both canonicalization/schema version and digest are retained.
- Timestamps: timestamp columns represent instants; invoice date/due date and effective tax dates remain date-only. Do not infer invoice financial year from server default timezone.
- API paths: same-origin routes under /api/v1, plural resource nouns, lowercase paths, explicit action endpoints for non-CRUD commands.
- Paging: default 25 rows, max 100; offset is bounded in existing list APIs. Stable ordering includes a unique ID tie-breaker. Cursor pagination can replace offset for large measured query patterns without changing business semantics.
- Sorting: sort keys are allowlisted by endpoint. Client-supplied SQL identifiers are never interpolated. Unknown parameters are rejected rather than silently ignored.

## 3. Data model — table catalogue

The current migration set creates 28 application tables plus the schema_migrations ledger table.

| Domain | Table(s) | Primary purpose |
|---|---|---|
| Legal entity and brand | legal_entities, brands, brand_legal_entities, legal_entity_config_versions | Keep issuing legal identity distinct from visual/commercial brands; version supplier/number/template settings |
| Customer and catalog | customers, catalog_items | Editable party and reusable item/service master data; historical issue values are copied to the invoice snapshot |
| Tax and numbering | tax_rules, invoice_sequences, quotation_sequences | Effective-dated approved tax rules and independent, document-type-scoped number series |
| Invoice | invoices, invoice_lines, invoice_issue_snapshots | Editable draft projection, line inputs and one immutable issue-time snapshot per issued invoice |
| Quotation | quotations, quotation_lines | Separate proposal lifecycle and series, with conversion link to an invoice draft |
| Receivables | payments, payment_allocations, payment_reversal_events | Separate receipt ledger, invoice allocation ledger and full-reversal audit event |
| Identity/RBAC | app_users, app_roles, app_permissions, user_roles, role_permissions, user_legal_entity_access | Identity-provider subject mapping and explicit grants/scopes |
| Workflow and delivery | approval_requests, reminder_jobs, email_outbox, document_files | Typed approval targets, durable reminder/email jobs and private document metadata |
| Audit | audit_events | Actor, action, resource, time, outcome, correlation and safe before/after details |
| Migration metadata | schema_migrations | Applied migration filename/version, checksum and application timestamp |

Detailed relationships and delete rules are documented in [Phase 03 Relationship Diagram](phase-03-relationship-diagram.md). The rollout/backfill plan is in [Phase 03 Migration and Retention Plan](phase-03-migration-and-retention-plan.md).

## 4. Relationship invariants

- One invoice belongs to exactly one legal entity and one customer; brand is optional descriptive metadata and is not the legal supplier.
- An invoice contains ordered lines with unique (invoice_id, line_number). Draft line catalog/tax IDs are references, not the historical calculation source.
- Issuance stores exactly one canonical issue snapshot for each invoice. It contains all supplier/customer/line/tax inputs and outputs, currency, issue date/number, due-date/payment terms snapshot, policy versions and totals. The snapshot hash is verified against canonical serialization.
- Issued supplier, customer, line, tax, currency, total, date and number details are immutable. The invoice header may expose a status/query projection, but any change to issued financial content uses a linked, reasoned correction/credit/debit workflow.
- Invoice number uniqueness is per legal entity + financial year + document type + number. Sequences are allocated with a transaction and row lock, never by a UI counter or COUNT + 1. Quote numbering uses a distinct sequence table.
- A credit/debit note links to its source invoice through related_invoice_id. Service validation enforces compatible legal entity/document rules and required reasons/approval; unique number and tax policy remain explicit.
- Payments and payment_allocations are separate. Foreign keys alone cannot prevent cross-customer/currency allocation or enforce aggregate receipt/invoice-balance caps. The payment command must lock relevant receipt/invoice rows, calculate outstanding balance transactionally and write a durable audit event.
- Approval rows use typed invoice_id or quotation_id references plus legal_entity_id. Service rules require exactly one target and scope consistency. Legacy resource_type/resource_id remains transitional and must be backfilled/retired under an approved migration plan.
- document_files and email_outbox currently use resource_type/resource_id polymorphic targets without one FK per resource type. A server allowlist and target/scope validation are mandatory; consider typed link tables in a later migration for stronger referential integrity.
- Configuration (tax, numbers, entity templates, brand mapping) is effective-dated/versioned and does not rewrite historical snapshots.
- Referenced records are deactivated/archived rather than deleted. Financial events and audit/approval history are not cascade-deleted.

## 5. Schema review — constraints and indexes

### Key uniqueness and checks

| Table(s) | Unique/check protection | Remaining application invariant |
|---|---|---|
| app_users | Unique email; unique (identity_provider, provider_subject) | Normalize email consistently; identity-provider subject must come from trusted auth |
| app_roles/app_permissions | Unique role_key / permission_key | No grants seeded automatically; access policy approval is separate |
| user_roles/role_permissions/user_legal_entity_access | Composite primary keys prevent duplicate links | Only authorized actors can grant/revoke and changes are audited |
| brands | Unique code | Brand label never implies a legal entity or tax registration |
| legal_entities/config/tax_rules | Entity-scoped records; tax unique by entity/code/effective_from; date/rate checks | No overlapping ambiguous tax effective windows; approval must be verified |
| invoice_sequences | Unique (legal_entity_id, financial_year, document_type) | Atomically lock/update sequence and resolve retry/duplicate behavior |
| invoices | Unique (legal_entity_id, financial_year, document_type, invoice_number); unique idempotency key where non-null; total/status checks; source-invoice FK | Date/number/policy validation and duplicate payload detection are transactional |
| invoice_lines / quotation_lines | Unique document + line number; nonnegative/positive checks; catalog/tax FKs for invoice lines | Totals and tax calculations reconciled in application service |
| invoice_issue_snapshots | Unique invoice_id, digest format check, invoice/actor FKs | Runtime DB role must not UPDATE/DELETE snapshots; hash must verify after read |
| payments/payment_allocations/payment_reversal_events | Positive amount checks, unique idempotency, one full reversal per payment, receipt and invoice FKs | Currency/customer match and aggregate limits are locked transactional checks |
| quotations/quotation_sequences | Unique entity + quotation number/sequence scope, conversion FK | Conversion idempotency and number assignment are service-level rules |
| approval_requests | Entity/invoice/quotation FKs and inbox/resource indexes | Exactly one typed target and target/entity agreement require validation and backfill before stricter CHECK constraints |
| reminder_jobs/email_outbox | Unique idempotency keys and queue indexes | Revalidate state before send; do not rely on queue state alone |
| document_files | Unique provider + storage key prefix, resource index, creator FK | Target resource link is polymorphic; storage ACL and hash verification remain service responsibility |
| audit_events | Entity/actor/date indexes, actor FK | Prevent sensitive payloads and unauthorized event mutation; retention and archival are policy-controlled |

### Index strategy

The migrations currently cover common access patterns: customer name/email; catalog name/active/type; invoice customer/status/date/entity-date/related-source; line catalogue/tax refs; payment customer/date; allocations by invoice; approval inbox/entity/time and target; reminders by status/scheduled time; email outbox by status/time; tax effective lookup; configuration versions; document resource; audit entity/time and actor/time.

Before scaling production, capture EXPLAIN plans for invoice list by entity/date/status, customer invoice history, payment reconciliation, approval inbox, reminder worker selection, email queue, effective tax lookup and audit search. Add composite indexes only where query plans/workload justify their write/storage cost. All query paths need the entity-scope predicate in addition to indexes.

### Deletion/update rules

- Hard-delete of issued invoice/snapshot, receipt, allocation, reversal, credit/debit note, approval decision or audit evidence is prohibited.
- Master data is deactivated/archived when no longer selected; delete is restricted where referenced. Historical snapshots are independent of master-data state.
- Drafts may be abandoned; if draft cleanup is enabled, it requires explicit age/eligibility policy and must preserve required audit evidence.
- Files are deleted only under approved retention/legal-hold rules and after verifying no required invoice/approval reference remains.
- Any cascade must be reviewed explicitly; default policy for legal/finance history is RESTRICT or append-only correction.

## 6. Immutable snapshot model

The issue operation must commit, in one MySQL transaction:

1. Verify user permission/entity scope and all approved entity/brand/customer/number/tax/approval policies.
2. Lock the invoice draft and the relevant sequence row.
3. Recompute totals server-side using the approved calculation policy; never trust client-supplied totals or tax rates.
4. Allocate the official number under the entity/year/document-type scope.
5. Create deterministic JSON containing legal supplier snapshot, customer snapshot, ordered lines, tax rule values/registration context, totals, currency, dates, payment terms, issue identity, number policy version and calculation-policy version.
6. Compute the canonical SHA-256, insert invoice_issue_snapshots and update the invoice's issued projection/status and issue metadata.
7. Insert the audit event and idempotency outcome, then commit.

On any error, rollback all state. Matching retry returns the same issuance outcome; a different payload with the same key conflicts. A canceled invoice's number is not reused.

Database roles must enforce snapshot INSERT/SELECT only for runtime operations (no UPDATE/DELETE). If the provider's grant model cannot isolate this table privilege, use a separately reviewed trigger/ownership strategy and test it. Code comments alone do not make a table immutable.

## 7. API response, errors and validation contracts

### Success envelope

Single-resource success and mutation responses use:

```json
{
  "data": {},
  "meta": {
    "requestId": "server-generated-uuid",
    "pagination": {
      "limit": 25,
      "offset": 0,
      "hasMore": false
    }
  }
}
```

The pagination member is present only for list endpoints. RequestId is present in meta for business-resource responses and in the X-Request-Id response header. Health endpoints are intentionally minimal and are an exception to the data envelope.

### Error envelope

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request contains invalid fields",
    "fields": {
      "customerId": "A valid customer is required."
    },
    "requestId": "server-generated-uuid"
  }
}
```

Field values are safe descriptions, not echo of submitted secrets. Never include SQL, stack trace, tokens, hostnames or raw provider response. Public error codes include MALFORMED_JSON, VALIDATION_ERROR, UNAUTHENTICATED, FORBIDDEN, NOT_FOUND, CONFLICT, RATE_LIMITED, and INTERNAL_ERROR. Malformed JSON/query parameters return 400; missing authentication 401; permission/scope denial 403 (or deliberately concealed 404); state/idempotency/concurrency conflicts 409; body/domain validation 422; rate limiting 429; unexpected server/dependency failure 500/503.

### Validation policy

- Zod schemas at request boundary are strict about unknown fields where mutation integrity matters; optional update schemas require at least one field.
- UUID fields validate canonical format. Currency uses uppercase ISO-like three-letter syntax and must be enabled by the selected entity.
- Calendar fields validate real YYYY-MM-DD dates; date range ordering is a domain/service rule.
- Money/quantity/tax-rate fields are decimal strings with a documented precision. Never convert to Number for totals.
- Invoice draft inputs contain legalEntityId, customerId, optional brandId, currency and line inputs. Client-supplied number/status/total/snapshots/approval are never accepted as authoritative issue fields.
- Catalog itemCode/description/unit/price/currency/tax code are validated independently from invoice values; changing the catalog does not alter an issued snapshot.
- List parameters accept only documented status, filters, limit and offset; limits are bounded, sort keys are allowlisted and ordering is deterministic.
- Issue, conversion, allocation, email queue, export and reversal commands require Idempotency-Key (16–128 characters) and payload-hash binding.
- Cross-field/domain validation includes entity status, effective mapping, current tax rules, currency compatibility, outstanding balances, permitted state transitions, approval state and legal-entity scope.

### Contract inventory and implementation status

OpenAPI is the machine-readable contract at [docs/openapi.yaml](openapi.yaml). Each operation uses x-implementation-status to distinguish current routes from future contracts. Current implemented endpoints are:

- GET /api/health and GET /api/v1/health
- GET/POST /api/v1/customers
- GET/POST /api/v1/catalog/items

Other operations are specified for future implementation and must not be presented as available before their Route Handler, service, authorization and tests exist. The API specification covers customer/catalog, legal entities, brands/mappings, tax rules, invoices, quotations/conversion, receipts/allocations/reversal, approvals, email, private documents, reminders, receivables report, exports and audit search.

The current login/session issuance flow and external identity provider remain a Phase 05 decision. Protected operations require the HttpOnly fx_session cookie; do not treat the OpenAPI cookie scheme as proof login routes are implemented.

## 8. Migration and schema-change policy

The immutable migration ledger is documented in [Phase 03 Migration and Retention Plan](phase-03-migration-and-retention-plan.md). Current order:

1. 001_initial_schema.sql — core billing entities, customers, invoice, lines, receipts, allocations and base audit.
2. 002_identity_catalog_workflows.sql — identity/RBAC, catalog, quotations, approvals, reminders, file/email queue, configuration history and tax rules.
3. 003_phase3_integrity_snapshots.sql — document-type series scope, source-invoice linkage, line references, issue snapshots, quotation sequence, payment reversal event, typed approval targets and actor FKs.

Never edit an applied migration. MySQL DDL is not assumed atomic. CI uses a fresh MySQL 8 service, runs all migrations and reruns migration/seed commands, verifies the ledger and test restore. A real existing database needs preflight and backup. Migration 003 does not backfill snapshots for historical issued invoices or map historic polymorphic approval targets to typed targets; inspect and backfill with an approved, restartable, audited process before activating dependent features. Do not apply unreviewed migrations to production merely because CI passes.

## 9. Data retention and lifecycle

- Issued invoice snapshots, canceled originals, credit/debit notes, receipts, allocations/reversals, approval outcomes and audit evidence are retained under the business-approved statutory/accounting/security policy, with legal hold taking precedence.
- Number sequences, issued-number history and schema_migrations persist for system lifetime; number reuse is prohibited.
- Referenced master data/config versions are deactivated or versioned, not deleted.
- PDFs/attachments are private, encrypted where supported, hashed and subject to retention/legal-hold policy; exports should be time-limited.
- Email/reminder history retains minimum delivery/decision evidence for the approved period and sanitizes provider errors.
- Sessions are short-lived and revoked/expired by security policy; raw tokens never enter logs.
- No automatic purge runs until durations, backup expiry, legal hold, archive access and deletion verification are approved. No jurisdiction-specific retention duration is fabricated in this design.

## 10. Phase 03 acceptance checklist

### Design completion gate

- [x] System architecture boundaries and serialization contract documented.
- [x] All core data tables and relationships reviewed: users/roles/permissions, legal entities/brands, customers/catalog/tax, invoices/lines/snapshots, quotations, payments/allocations/reversals, reminders, approvals, audit events and private file/email metadata.
- [x] Unique constraints, foreign keys, query indexes, deletion/update rules, transactional-only invariants and known polymorphic-reference limitations reviewed.
- [x] Immutable issued snapshot and decimal-safe financial representation specified.
- [x] Mermaid ERD provided in `docs/phase-03-relationship-diagram.md`.
- [x] Migration ordering, preflight, backfill hazards, cutover, forward-repair/recovery and retention plan documented in `docs/phase-03-migration-and-retention-plan.md`.
- [x] API success/error envelope, request IDs, validation rules, status codes, pagination and idempotency rules documented.
- [x] OpenAPI 3.1 specification describes current and planned API resources, schemas, responses and implementation status.
- [x] Structural OpenAPI validation added to CI, checking YAML syntax, local references, operation IDs, path parameters and implementation-status labels.
- [x] Migration 003 verified against a fresh MySQL 8 service; migration rerun, seed idempotency, failure-safety, logical restore, health endpoints, OpenAPI validation, lint, TypeScript and production build passed on commit `f197fad347c57f752f799a6a54f381912a96c369`.
- [x] **Phase 03 design completion gate: COMPLETE** — reviewed schema, relationship diagram, migration/retention plan and API specification are committed and CI-validated.

Evidence:
- CI: https://github.com/Daarxsn/Fx-Fanancial/actions/runs/38033713634
- Lockfile workflow: https://github.com/Daarxsn/Fx-Fanancial/actions/runs/38033713635
- ERD/schema review: `docs/phase-03-relationship-diagram.md`
- Migration/retention plan: `docs/phase-03-migration-and-retention-plan.md`
- OpenAPI contract: `docs/openapi.yaml`
- Validator: `scripts/validate-openapi.mjs`

### Separate prerequisites before enabling production financial operations

- [ ] Inventory target Aiven data/schema before applying migration 003; backfill or explicitly disposition historical issued invoices without issue snapshots and legacy approval requests without typed targets.
- [ ] Enforce and verify database privileges that prohibit runtime UPDATE/DELETE on `invoice_issue_snapshots`.
- [ ] Implement and test every endpoint marked `planned` in OpenAPI; currently only health, customer list/create and catalog list/create routes exist.
- [ ] Add API integration tests for implemented and future resource routes, including authorization/entity scope, concurrency/idempotency, snapshot integrity and payment allocation.
- [ ] Obtain Phase 02 business/finance/tax approvals for the actual legal entity, tax, numbering, currency, payment and workflow configuration before enabling invoice issuance.

These are real release/implementation gates, not uncompleted design artifacts. Passing design CI does not claim that the future invoice/payment/approval/file/email/report routes are live, that migration 003 has been applied to Aiven, or that historical rows/DB grants have been reconciled.
