# Phase 03 — Data Model and API Contract Design

**Status:** Initial design committed; implementation and integration tests are pending. This document is the design baseline, not a claim that every endpoint exists.

## Design principles

- Use Next.js App Router Route Handlers for HTTP endpoints and server-only domain/service modules for business logic.
- Keep database access server-only. Never return database driver errors or secrets.
- Validate input at the API boundary and re-check authorization inside every protected service.
- Use MySQL foreign keys, unique constraints, CHECK constraints and transactions for enforceable invariants.
- Use MySQL DECIMAL for monetary values and serialize money as decimal strings in JSON to avoid JavaScript floating-point ambiguity.
- Use UUIDs represented as canonical strings at the API boundary.
- Use ISO 8601 timestamps with an explicit timezone and ISO date strings (YYYY-MM-DD) for calendar dates.
- Separate invoice lifecycle from payment, approval, email, reminder and PDF artifact state.
- Do not implement legal/tax decisions that remain unconfirmed in Phase 02.
- Version public contracts deliberately; use /api/v1 for the initial internal app.

## Data model baseline

The initial migration defines legal_entities, brands, customers, invoice_sequences, invoices, invoice_lines, payments, payment_allocations, and audit_events.

Required relationships:
- One legal entity can issue many invoices and owns a numbering sequence per approved sequence scope.
- A brand is an optional commercial label associated with an invoice; it is not the supplier legal entity.
- An invoice belongs to one legal entity and one customer and contains one or more lines.
- Invoice supplier/customer details and line/total details are snapshotted at issuance.
- Payments are recorded independently; allocations connect payments to invoices.
- Audit events reference the target entity and actor identifier without logging secrets.

Before production, schema review must address:
- User/role/permission and session tables (or a documented external identity model).
- Catalog items and reusable tax/discount configuration.
- Quotation lifecycle and conversion lineage.
- Approval requests/decisions.
- Email attempts, reminder schedules, idempotent job/outbox records.
- PDF artifact metadata and private object-storage keys.
- Payment allocation rules for currency consistency and overpayment/refund handling.
- Whether invoice line/financial snapshots need normalized columns, immutable child records, or both.
- Foreign-key strategy for actor IDs once identity is selected.
- Migration version tracking and rollback/forward-fix policy.

## Resource naming and response envelope

Use plural nouns, lower-case paths, and explicit action endpoints only for commands that are not ordinary CRUD.

Success response:
```json
{
  "data": {},
  "meta": { "requestId": "server-generated-id" }
}
```

Validation/domain error response:
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request could not be processed.",
    "fields": { "customerId": "A valid customer is required." },
    "requestId": "server-generated-id"
  }
}
```

Never include stack traces, SQL, database hosts, credentials, session tokens, or internal provider responses.

## Initial endpoint inventory

| Method | Path | Purpose | Gate |
|---|---|---|---|
| GET | /api/v1/health | Safe readiness/health response | Public only if deployment policy permits |
| GET/POST | /api/v1/customers | Search/create customers | Authentication and permission required |
| GET/PATCH | /api/v1/customers/{customerId} | Read/update customer master | Authentication and permission required |
| GET/POST | /api/v1/invoices | List/create drafts | Authentication and permission required |
| GET/PATCH | /api/v1/invoices/{invoiceId} | Read/update draft | Draft-only mutation |
| POST | /api/v1/invoices/{invoiceId}/issue | Transactional issuance | Explicit issue permission, idempotency |
| POST | /api/v1/invoices/{invoiceId}/cancel | Controlled cancellation | Explicit cancel permission and reason |
| GET | /api/v1/invoices/{invoiceId}/pdf | Authorized private PDF access | Auth and scoped access |
| GET/POST | /api/v1/invoices/{invoiceId}/payments | Read/record allocations | Auth, transaction, balance validation |
| POST | /api/v1/payments/{paymentId}/reverse | Correct a recorded payment | Explicit permission, reason, audit |
| POST | /api/v1/invoices/{invoiceId}/send-email | Queue an email attempt | Auth, recipient confirmation, idempotency |
| GET | /api/v1/audit-events | Scoped audit search | Audit-read permission |

These are planned contracts; they must not be treated as implemented until source files and tests exist.

## Pagination, filters and sorting

- Use bounded pagination. Initial default page size: 25; maximum: 100.
- Validate sort fields against an allowlist; never interpolate user-supplied sort identifiers into SQL.
- Support documented filters only. Unknown filters should return a validation error rather than silently changing semantics.
- Use stable ordering with a unique tie-breaker.
- For large or changing datasets, prefer cursor pagination after query patterns are measured.

## Mutation safety

- Draft creation/update must be authorized and validated server-side.
- Issuance must use a transaction and idempotency key, allocate a unique number under the approved scope, snapshot supplier/customer/line/total values and write an audit event atomically.
- Payment creation/allocation must use a transaction, enforce currency compatibility and remaining balance, and write audit events.
- Cancellation and payment reversal must be reasoned, permission-checked commands.
- Email/PDF/object-storage operations are external side effects: do not hold database transactions open while calling providers. Use durable job/outbox records and idempotent retries when those features are implemented.
- Every protected response and download must apply company/legal-entity scope.

## HTTP status guidance

- 200: successful read or mutation with response.
- 201: resource created.
- 202: accepted for asynchronous work (for example, email queued).
- 204: successful operation with no response body.
- 400: malformed request or invalid query parameters.
- 401: missing/invalid authentication.
- 403: authenticated but not authorized.
- 404: absent resource or intentionally concealed inaccessible resource.
- 409: state conflict, duplicate/idempotency conflict, or concurrency conflict.
- 422: syntactically valid request that fails domain validation.
- 429: rate limit exceeded.
- 500/503: unexpected server error or unavailable dependency; details stay server-side.

## Contract testing requirements

- Validate request/response schemas and reject unknown or invalid fields where appropriate.
- Test authorization for every resource and command.
- Test pagination bounds, filtering and stable sorting.
- Test idempotent retries and conflict responses.
- Test issuance uniqueness under concurrent requests.
- Test payment over-allocation and concurrent allocation attempts.
- Test that error responses do not leak secrets.
- Keep the OpenAPI document and route implementation synchronized in CI.

## Phase 03 acceptance

- [x] Initial entity relationships and endpoint inventory documented.
- [x] Response/error conventions and status codes documented.
- [x] Financial and security invariants reflected in API command boundaries.
- [ ] Business owner confirms open legal/tax/payment/numbering decisions.
- [ ] Complete schema reviewed against identity, catalog, quotation, approval, document and job requirements.
- [ ] OpenAPI validates and matches implemented routes.
- [ ] Migration applies cleanly to disposable MySQL.
- [ ] Contract and integration tests pass.

## Current blocker

The GitHub tree currently has no committed package-lock.json, and CI has not yet been confirmed green. Phase 03 design can proceed, but implementation acceptance must wait for a reproducible build and database integration tests.
