# Phase 07 — Customer and Item/Service Catalog

**Status:** Specification committed; implementation and verification are pending.  
**Scope:** Reusable customer records and billable item/service records used by quotations and invoices.

## Goals

- Maintain one controlled source of customer and item/service data.
- Make invoice drafting faster while preserving a legally and financially accurate snapshot on each issued document.
- Support multiple brands and legal entities without assuming that a brand is itself a legal entity.
- Keep customer and commercial data private behind authenticated, permission-checked server actions.

## Customer records

A customer record should support:
- Stable internal ID; display/legal name; customer code if enabled; active/archived state.
- Customer type only if the business needs it; do not make unsupported tax/legal assumptions from this field.
- Billing address and optional separate service/shipping address.
- Contact person, email, phone, and optional purchase-order/reference number.
- Tax identifier(s) with country/jurisdiction and identifier type, stored only where required; validate format without claiming that format validation proves registration or legal validity.
- Internal notes with restricted visibility; never include internal notes in invoice PDFs or outbound customer emails by default.
- Created/updated timestamps, creator/updater IDs, and auditable changes.

Rules:
1. Required fields and validation must be explicit and consistent between UI and server.
2. Normalize email for matching, but do not use email as the permanent primary key.
3. Do not silently merge duplicate customers. Provide duplicate warnings and an explicit, permissioned resolution workflow if merging is later approved.
4. Archive rather than hard-delete a customer referenced by a quotation, invoice, payment, or audit record.
5. Search by legal/display name, customer code, email, phone, and tax identifier only for authorized users. Paginate results and cap query size.
6. Treat tax IDs, contact details, and notes as sensitive business data; do not log their values in errors or telemetry.

## Item/service records

A catalog item/service should support:
- Stable internal ID and optional unique SKU/service code.
- Name, customer-facing description, internal description (never emitted on a document by default), and item/service classification.
- Unit of measure (for example, hour, unit, month, or project), with the allowed values configurable rather than hard-coded to a single industry.
- Default unit price stored as an exact decimal, with explicit currency; no floating-point arithmetic for money.
- Optional default tax code/rule selected from approved configuration. Do not invent tax rates or automatically infer a rate from a product name.
- Active/archived state and created/updated audit metadata.

Rules:
1. Price and tax defaults are suggestions for new draft lines, not immutable truth.
2. Editing an item, description, price, unit, or tax configuration must never rewrite existing invoice lines or issued snapshots.
3. Archived items remain visible when rendering historical documents but cannot be selected for new drafts unless an authorized exception is explicitly designed.
4. Never allow client-provided totals to override server-calculated values.
5. SKU uniqueness is scoped as an explicit product decision; default to unique within the applicable catalog, and document any decision to scope it by legal entity or brand before implementing the database constraint.
6. Price changes and tax-default changes should be auditable.

## Brand and legal-entity context

- Drafts must identify the selected legal entity and, where useful, the operating brand.
- Customer and item catalogs should not duplicate records per brand by default.
- If access or catalog visibility must be scoped by legal entity/brand, implement it as an explicit policy with tests rather than an implicit UI filter.
- The selected legal entity controls the issuer identity and configured invoice settings; customer and item records do not override issuer details.

## Snapshot boundary

When an invoice is issued, copy the applicable customer billing identity/address/tax identifiers, issuer/legal-entity details, line description, unit, quantity, unit price, discount/tax inputs and calculated totals into an immutable invoice snapshot. Subsequent edits to catalog or customer data affect only future drafts. Any permitted correction to an issued invoice must use a separately audited correction/cancellation process, not silent snapshot mutation.

For a draft, the UI may refresh defaults from catalog records, but should make the behavior clear and must not unexpectedly overwrite user-edited line fields.

## Proposed API surface

All endpoints below are planned, not yet implemented. Every operation must require authentication and server-side authorization.

- `GET /api/v1/customers?query=&status=&cursor=` — paginated search.
- `POST /api/v1/customers` — create.
- `GET /api/v1/customers/{id}` — read.
- `PATCH /api/v1/customers/{id}` — update with optimistic concurrency/version checking.
- `POST /api/v1/customers/{id}/archive` — archive with reference-aware safeguards.
- `GET /api/v1/catalog/items?query=&status=&cursor=` — paginated item/service search.
- `POST /api/v1/catalog/items` — create.
- `GET /api/v1/catalog/items/{id}` — read.
- `PATCH /api/v1/catalog/items/{id}` — update with optimistic concurrency/version checking.
- `POST /api/v1/catalog/items/{id}/archive` — archive.

Use consistent validation/error envelopes, bounded pagination, and no-store behavior for sensitive responses. Do not expose database driver messages or stack traces. Avoid returning internal descriptions/notes to roles that do not need them.

## UI requirements

- Customer list with search, status filter, pagination, and a clear empty state.
- Customer create/edit form with inline validation and a reviewable address/contact section.
- Customer detail view with linked quotations/invoices where permitted.
- Item/service list with search, active/archived filter, code, unit, currency and default price.
- Item/service create/edit form with exact-decimal validation and clearly labeled defaults.
- Confirmation before archive; explain when existing records still reference the customer/item.
- Accessible labels, keyboard operation, loading/error states, and responsive layouts.
- Keep destructive or high-impact actions separate from routine save actions.

## Permissions and audit

Define granular permissions before implementation, at minimum:
- `customers.read`, `customers.create`, `customers.update`, `customers.archive`
- `catalog.read`, `catalog.create`, `catalog.update`, `catalog.archive`

The server must enforce permissions regardless of whether a UI control is hidden. Record actor, timestamp, entity ID, action, and safe before/after metadata in the audit trail. Redact secrets and avoid copying unnecessary personal data into audit payloads.

## Acceptance criteria

- [ ] Schema migration includes customers, customer contacts/addresses or a justified normalized equivalent, and catalog items/services.
- [ ] Required-field, length, enum, identifier, email, currency and exact-decimal validation is covered by automated tests.
- [ ] Duplicate warnings do not silently merge records.
- [ ] Archive/reference rules prevent broken historical documents.
- [ ] Permission-denied requests fail on the server and are tested.
- [ ] Pagination and search are bounded and tested.
- [ ] Changes to catalog/customer data do not alter a saved invoice snapshot.
- [ ] Audit events are emitted for create, update and archive.
- [ ] UI works at desktop and mobile widths and has accessible validation/error states.
- [ ] Migration is applied and tested against the configured MySQL version.
- [ ] Clean-checkout lint, typecheck, build and relevant integration tests pass.

## Decisions required before implementation

- Whether customer codes are mandatory and how they are generated.
- Whether customers/items are shared globally or scoped to a legal entity/brand.
- Which currencies and units are allowed.
- Which tax identifiers and tax rules are required for the actual operating jurisdictions.
- Which roles may view internal notes and sensitive identifiers.

Do not invent these business/legal settings. Record approved decisions in configuration and tests.
