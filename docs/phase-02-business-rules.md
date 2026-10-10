# Phase 02 — Product Requirements and Business Rules

**Document status:** Prepared for business-owner and finance/accounting approval  
**Revision:** 1.0  
**Prepared:** 2026-10-10  
**Approval state:** NOT YET APPROVED. No approver's consent is implied by this draft.  
**Normative terms:** MUST / MUST NOT are mandatory requirements; SHOULD / SHOULD NOT are recommendations; MAY is optional.

## 1. Purpose and scope

This document defines the business rules that schema, server services, APIs, UI, PDFs, email, reminders, reports and tests must preserve. It is a requirements baseline, not evidence that every feature is implemented.

**In scope:** parent-company/brand/legal-entity distinction; customer and catalog data; quotations and invoices; approval and issue workflows; invoice numbering; tax and decimal calculations; payments, allocations and reversals; cancellation and credit/debit notes; roles and permissions; immutable document snapshots; PDFs, emails, reminders, reports, exports, audit, concurrency and testable acceptance criteria.

**Out of scope until separately approved:** automatic GST return filing, tax advice, IRN/e-invoice or e-way-bill submission; bank feeds, payment gateway settlement, accounting-ledger posting; automatic refunds, TDS/withholding workflow, foreign-exchange conversion and multi-currency settlement. A placeholder or database field does not mean a feature is implemented or compliant.

Actual legal entities, registrations, tax rates, tax classifications, bank details and staff assignments must come from authoritative records and approved owners. No real company data is inferred here.

## 2. Domain boundaries: parent company, POS, Digitech, Coworks and legal entities

These concepts MUST remain separate:

1. **Parent company / platform operator:** owns or operates the internal system and manages users. This label alone does not determine the legal supplier shown on an invoice.
2. **Brand / business line:** commercial label. The supplied labels are POS, Digitech and Coworks. Their expansions, legal forms, corporate relationships and tax registrations are not inferred.
3. **Legal billing entity:** the legally identified person/business supplying the goods or services, shown as supplier using its confirmed legal name, address, registrations and tax particulars.
4. **Customer:** recipient billed by the selected legal billing entity.
5. **User:** human account with explicit permissions and legal-entity scope.
6. **Invoice, quotation, payment and document:** distinct records linked by stable IDs, not merely names or labels.

### Public evidence reviewed (context only, not tax/legal proof)

The public Falchion Xeniaa website markets a restaurant-management/POS suite under the Falchion Xeniaa name and lists POS as a product capability ([official website](https://falchionxeniaa.com/), [contact page](https://falchionxeniaa.com/contact-us/)). That supports treating “POS” as a public product/business-line label for requirements purposes, but it does **not** establish which legal person contracts with customers, holds a GSTIN, issues a specific invoice, or whether every module/brand is an independent legal entity. The reviewed public pages did not establish the legal/tax relationship of “Digitech” or “Coworks” to a legal billing entity. Do not infer that relationship from product branding, company marketing or absence of public results.

Before activation, the owner must verify the candidate legal entity name and corporate identifiers directly against authoritative MCA/company records and verify every relevant GSTIN/status and e-invoice applicability through current official GST systems or the appointed tax professional. Public marketing pages and third-party company directories are not substitutes for those records.

### Entity relationship rules

- POS, Digitech and Coworks MUST initially be treated as brand/business-line labels only. No legal-entity or GST-registration mapping is activated without business confirmation.
- A brand MUST NOT automatically create a legal entity, GST registration, tax profile, numbering sequence, bank account or independent security boundary.
- A brand MAY map to one or multiple legal entities over approved effective dates; a legal entity MAY serve multiple brands. Only approved, effective mappings are selectable for new documents.
- Every invoice has exactly one active and approved legal billing entity. A brand is optional descriptive metadata and cannot override the supplier.
- On issue, supplier details are snapshotted from the selected legal entity's approved, effective configuration. Later master-data changes never rewrite historical documents.
- Issuance MUST be blocked if the legal entity is inactive or missing required supplier fields, a confirmed tax configuration, a numbering policy, currency/rounding policy or an explicit approval policy. A deliberate “approval not required” policy is valid only when configured and approved; silence is not consent.
- Inter-company recharges and settlements are not inferred. Enable them only through separately approved requirements.

### Minimum legal entity activation checklist

Legal name; trading/display name if used; registered/business address; jurisdiction/state; registration identifiers as applicable; tax registrations and effective dates where applicable; invoice contact; approved currency; number series and financial-year rule; tax policy; payment terms; bank/payment instructions shown on invoices; template/legal footer; e-invoice applicability decision; approval policy; activation/effective date; approver and evidence reference.

Sensitive banking and tax values are restricted to authorized roles. Creation and changes are audited and independently approved where policy requires. Illustrative values must never be used as production records.

## 3. Invoice and quotation lifecycle

### Invoice lifecycle

| State | Meaning | Allowed next actions |
|---|---|---|
| DRAFT | Editable working document with no official invoice number | Edit; request/withdraw approval; issue only when every gate passes; abandon/void with history |
| ISSUED | Official invoice committed with number and immutable snapshot | Record/allocate payment; send authorized copy; controlled cancellation if policy permits; linked correction/credit/debit process |
| CANCELLED | Historical issued invoice retained and marked cancelled with reason | No return to draft; never reuse number; corrections use separate linked documents |

Draft abandonment is not the same as cancellation of an issued invoice. Issued invoices MUST NOT be deleted or edited in place. An ordinary update must not alter issued supplier, recipient, lines, price, discounts, taxes, totals, invoice date, currency or number.

### Server-side issuance gate

Issuance is a server command, not a UI status toggle. It succeeds only when:

- Caller is authenticated, has explicit issue permission and is in scope for the selected legal entity.
- Legal entity, brand mapping (if supplied), customer and catalog/tax data are valid for the document date.
- Required supplier/recipient fields, line descriptions, units, quantities, prices, discounts, currency, tax and dates validate.
- Numbering and fiscal-year policies are active.
- The entity has an explicit approved approval policy; any required approval is approved, in scope and not withdrawn/rejected. If approval is not required, that setting must be explicit.
- A unique approved tax rule is effective for every taxable line and the approved calculation/rounding policy is available.
- E-invoice applicability has been checked for that legal entity. If e-invoicing is required but the approved integration/workflow is not implemented/configured, issuance is blocked rather than silently skipping it.
- Invoice date, financial year, supplier/customer snapshots and server-calculated totals are finalized.

One database transaction allocates the number, snapshots supplier/customer/line/tax/total values, marks the invoice issued, writes the audit event and stores the idempotency outcome. Failure rolls back the operation as a unit. Retrying the same idempotency key must not create another invoice or issue number; reuse of the key with a different payload is rejected as conflict.

### Independent states

Invoice lifecycle, approval, payment, email delivery, reminder job and document artifact type MUST be separate states. Approval alone does not issue; email does not issue/cancel; payment does not alter invoice lifecycle; email failure does not undo issuance. Payment status is derived from valid allocations net of reversals and approved adjustments, never manually edited.

Suggested state dimensions:
- Invoice: DRAFT / ISSUED / CANCELLED.
- Approval: NOT_REQUIRED / PENDING / APPROVED / REJECTED / WITHDRAWN (plus configured expiry where needed).
- Payment: UNPAID / PARTIALLY_PAID / PAID.
- Each email attempt: QUEUED / PROCESSING / SENT / FAILED / CANCELLED.
- Each reminder: SCHEDULED / PROCESSING / SENT / SKIPPED / FAILED / CANCELLED.
- Artifact types are explicit: issued original, paid/partial copy, cancelled copy, quotation, credit/debit note or attachment.

### Quotations

A quotation is a commercial proposal, not an issued tax invoice. It has an independent number series, status, issue/expiry dates, customer, intended legal entity, optional brand, lines, terms and history. It must be visibly labelled as a quotation. Conversion creates a new invoice draft linked to the quotation and revalidates current entity, customer, tax rules, dates and prices; it does not reuse the quotation number. Conversion retries must not create accidental duplicate drafts.

## 4. Invoice numbering and financial year

- Official invoice numbers are allocated by the server inside the issuance transaction and protected by a database unique constraint. Client-generated numbers and COUNT + 1 are prohibited.
- **Recommended initial sequence scope:** one sequence per legal billing entity per financial year, independent of brand. Separate series by brand require explicit approval; they are not automatically needed because a brand exists.
- Prefix/format is configurable and must be approved. Example for discussion only: configured prefix + FY label + zero-padded counter (for example, PREFIX/FY/000001). This example is not an approved prefix or live number.
- **Proposed India-oriented fiscal year for approval:** 1 April through 31 March. Store this rule explicitly and compute it using the approved entity timezone/date policy, not server timezone/UTC by accident. If an entity's approved requirements differ, configure that instead.
- The number sequence and financial year follow the approved policy and invoice date. If the April–March policy is approved, tests cover 31 March and 1 April.
- Committed numbers are never reused, including cancelled invoices. Failed transactions must not leave an invoice falsely issued. Every committed number must be explainable by its durable record and audit history.
- Concurrent issue requests must not duplicate numbers. Conflict/deadlock/timeout handling either retries safely or returns a safe error without duplicate issuance.
- Quotations and credit/debit notes use separately approved document-type numbering rules and cannot masquerade as tax invoices.
- Format changes are effective-dated, audited and do not renumber history.

**Approval required before entity activation:** final number format/prefix, fiscal-year boundary and any series exceptions.

## 5. Money, currency, discounts and rounding

- Authoritative money calculations happen server-side using decimal-safe arithmetic; MySQL DECIMAL values are authoritative. Binary floating-point is never financial truth.
- Every invoice/payment/allocation has an explicit ISO 4217 currency code; a single invoice has one currency. Currency cannot change after issue.
- Currency comes from the approved legal-entity policy. The schema's existing INR default is a technical default only: it is not evidence that every entity invoices in INR and must not bypass policy approval or entity configuration.
- Initial release should support one configured currency per legal entity. FX conversion and multi-currency settlement remain out of scope until exchange-rate source/date, precision, snapshot and accounting treatment are approved.
- Reject invalid quantities, negative prices, invalid discount amounts, invalid precision and inconsistent totals. Credits/refunds must use approved adjustment/reversal workflows, not negative values as a workaround.
- Line-level and invoice-level discounts may be enabled only after the entity policy specifies types (fixed/percentage), calculation order, eligible base, caps and tax impact.
- Finance/accounting MUST approve the calculation sequence and rounding policy: calculation precision; line-vs-document rounding stage; tax component grouping; displayed/storage precision; residual allocation; and permitted rounding adjustment. UI, PDF, API, report and export must use the same policy.
- Totals must be reproducible from snapshotted inputs plus the policy version. Report invoice amount, adjustments, valid receipts/allocations and outstanding balance as separate measures.
- Tests cover fractional quantities, large values, discount caps, tax rounding boundaries, precision, totals vs sum of lines and invalid values.

**Proposed initial scope for approval:** INR-only per explicitly configured entity, no FX conversion, no TDS workflow, and no automatic refunds. None is accepted policy until the approval register is signed.

## 6. Tax and statutory-document policy

Tax behavior is not inferred from a brand name. It comes from an approved, dated rule for the legal entity, document date and relevant supply/customer facts.

- Never infer GSTIN, registration state, tax rate/category, HSN/SAC, place of supply, exemption, reverse charge, inclusive/exclusive status, cess or e-invoice applicability from POS, Digitech, Coworks, a customer name or an address alone.
- Tax configuration is entity-scoped, versioned, effective-dated and approved by a named finance/accounting owner. It records approved tax code, jurisdiction, rate, inclusive/exclusive mode, dates, approver/time and required classification/place-of-supply/registration context.
- Issuance is blocked if a unique approved tax treatment is unavailable or required supplier registration data is unverified.
- The calculation engine distinguishes the applicable tax components (for example CGST/SGST/UTGST/IGST/cess where applicable) only as directed by an approved tax rule. No blanket rate is applied to every service.
- Issued documents preserve the correct supplier registration and address, recipient details, invoice number/date, description, HSN/SAC or other required classification, goods quantity/unit where applicable, taxable value/discounts, rates, amounts, and other particulars required for the applicable document/transaction. A qualified tax/accounting approver validates the actual field set before production.
- Document type must be correct: tax invoice, bill of supply, credit note, debit note or other approved type. Do not charge/display GST in a way not approved for the entity/supply.
- Credit/debit notes refer to the source invoice and have a reason, date, unique number, delta values, tax impact, approval and audit history. They never mutate/delete the source invoice. Statutory deadlines/treatment are confirmed by the tax owner.
- E-invoice/IRN applicability is checked per legal entity using current official notifications, turnover/transaction scope and exemptions. If required, retain required IRP identifiers, signed payload/QR and response when the approved integration exists. Never claim submission has happened if it has not.
- A new tax rule is effective-dated and never silently recalculates issued invoices. Corrections use an approved adjustment process.
- Tax rule changes and overrides require separate permissions, reason and audit.

**Official references for accountant review (links checked 2026-10-10; confirm current amendments/notifications at approval time):**
- CBIC GST Invoice Rules: https://cbic-gst.gov.in/gst-invoice-rules.html
- CGST Act, Chapter VII on tax invoices and credit/debit notes: https://cbic-gst.gov.in/hindi/CGST-bill-e.html
- GST Invoice Registration Portal information about e-invoice applicability: https://einvoice6.gst.gov.in/content/einvoice-mandate/

These are regulatory reference points, not a conclusion about this group's actual registrations, rates or obligations. Finance/accounting must confirm the current rules for each actual registration.

## 7. Payment terms, payments and reversals

### Terms and due dates
- Payment terms are explicitly configured per approved legal entity/customer/contract. They are not inferred from brand or email text.
- The approved policy defines default terms, allowed overrides, date that starts the clock, calendar/business days, weekend/holiday behavior, advances and any grace period.
- At issue, terms and due date are snapshotted. Master-data edits cannot silently rewrite historical due dates.
- Reminder schedules are configured with a timezone and due-date policy. Before sending, check that invoice remains outstanding, is not cancelled/fully paid, and is not under dispute/hold/suppression.
- Late fees and interest remain out of scope until contractual/legal basis, calculations and approval are documented.

### Recording and allocation
- A receipt stores amount, currency, payment date, method, optional reference, customer, recorder, timestamp, audit and idempotency data. Manual recording means “recorded by an operator,” not “bank-settled.”
- Allocate only when customer and currency compatibility checks pass. Allocation and sum validation occurs inside a transaction with row locking or an equivalent concurrency-safe method.
- Total allocation against an invoice cannot exceed the current outstanding balance. Total allocations from a receipt cannot exceed the receipt amount. Concurrent requests cannot over-allocate.
- If a receipt exceeds the allocatable amount, its remainder may be preserved as an unapplied receipt only if an approved unapplied-payment policy is enabled; do not automatically allocate elsewhere, refund it or label it settled. Otherwise reject that allocation and direct finance to its approved resolution path.
- Partial payments are supported. Payment state is derived from valid allocations net of reversals and approved adjustments.
- A payment cannot be hard-deleted. Reversal needs separate permission, reason, actor, time and audit record. Allocation effects are reversed traceably and balances recalculated without changing invoice snapshot.
- Refunds, TDS/withholding, write-offs, credit-on-account, gateway status and bank reconciliation are separate workflows. Do not represent them as generic notes or silently mark invoices paid.
- Retryable receipt/allocation/reversal commands are idempotent; invalid duplicates return safe conflicts.

## 8. Cancellation and corrections

- Authorized users may abandon a draft with traceable history according to policy. No official number should be reserved for a draft.
- Issued invoices are never deleted or edited in place. Cancellation requires explicit permission, reason, actor, timestamp and any required second approval. The number, original snapshot, payment/allocations and communications remain in history.
- Before cancellation, apply the approved accounting/legal policy to decide whether a cancellation state is permitted or a credit note/other statutory document is needed. Marking CANCELLED alone must not be assumed to correct tax liability.
- If payment exists, cancellation must block or require an explicit approved resolution of allocation/refund before completion.
- Corrections to price, quantity, recipient, tax, registration or supplier details follow the approved credit/debit-note or reissue process, retain the original, and link the correction.
- Cancellation/credit/debit numbering, tax consequences and reporting treatment must be approved before production use.

## 9. Roles, permissions and separation of duties

Default deny applies. Roles are starter profiles, not blanket grants to every employee. Every user is scoped to specific legal entities. System administration alone does not grant invoice issue, cancellation or payment-reversal powers.

| Capability | Permission identifier | Mandatory rule |
|---|---|---|
| Read customers/catalog/invoices/payments | customers:read, catalog:read, invoices:read, payments:read | Scope reads to permitted resources/entities |
| Create/update drafts and quotations | invoices:draft:create, invoices:draft:update, quotations:write | Draft-only edits; no issued snapshot mutation |
| Review/decide approvals | approvals:read, approvals:decide | Scope and separation-of-duties checks |
| Issue invoices | invoices:issue | Separate explicit permission and all issue gates |
| Cancel/issue credit notes | invoices:cancel, credit_notes:issue | Reason, audit, required approval and tax-policy check |
| Record/allocate receipts | payments:record, payments:allocate | Transactional balance validation and audit |
| Reverse payment | payments:reverse | Separate permission and reason; no hard delete |
| Reports/exports | reports:read, exports:create | Scope, export audit, minimum necessary data |
| Manage users, roles, entities, tax settings | users:manage, roles:manage, entities:manage, tax_rules:manage, settings:manage | Restricted capabilities and audited changes |
| Read audit trail | audit:read | Restricted, scoped and read-only |

### Starter role profiles

- **System administrator:** platform, access and technical configuration; no automatic financial mutation power.
- **Finance administrator:** approved financial configuration and finance reporting; sensitive commands only when separately granted.
- **Invoice creator:** scoped customer/catalog access; create/edit drafts and quotations.
- **Approver:** approve/reject within assigned entity and limits; cannot self-approve where separation of duties forbids it.
- **Invoice issuer:** issue within assigned entity scope.
- **Payment recorder:** record and allocate; reversal requires extra permission.
- **Cancellation/credit-note operator:** controlled actions if granted.
- **Auditor:** scoped read-only records/audit.
- **Export/report user:** approved scoped exports.
- **Viewer:** read-only.

The business must confirm staff, roles, scopes, approval thresholds, and whether creators may approve/issue their own work. Until then, no broad production grants. Approval thresholds for discounts, issue, cancellation, credit notes and payment reversals must be a documented matrix; no monetary threshold is invented here.

## 10. PDFs, email, reminders, reports and exports

### Documents
- The issued-original PDF is created from the immutable issue snapshot and stored privately with hash, size, artifact type and metadata.
- Reprints must not change invoice financial data. Keep the original artifact or explicitly label a generated copy.
- Paid/partial/cancelled copies, quotations and credit/debit notes are clearly distinguished and use approved data. Whether status appears on a reprint is a template policy, not a mutation of the original.
- No public URL for invoices/financial attachments. Downloads require authentication, permission and entity scope.
- Storage provider, retention/deletion, watermarking, digital signatures and multilingual template requirements require explicit configuration.

### Email
- Sending is separate and permissioned; recipient and artifact are confirmed.
- Use durable outbox/queue and idempotency key; external email calls happen outside long database transactions.
- Record status, attempts, actor, recipient, safe provider message ID and sanitized failure category; never log credentials/secrets.
- Email failure does not roll back issuance. Retry uses the approved document and cannot create duplicate sends for the same idempotency key.
- Recipient changes are permission-controlled and audited.

### Reminders
- Jobs have durable idempotency keys, schedule, attempts and sanitized result.
- Recheck lifecycle, balance, due date, communication preferences, entity policy and holds before each send.
- Fully paid, cancelled or suppressed invoices are skipped even if a stale job exists.
- Cadence, timezone, maximum attempts, escalation, hold/opt-out and template require business/finance approval. Do not invent late-fee claims.

### Reports and export
- Show invoice/adjustment amounts, payment receipts, allocations, outstanding balance, lifecycle, approval and email states separately.
- Every report defines its date basis (invoice date, payment date, due date or adjustment/cancellation date) and entity scope.
- Cancelled invoices and credit/debit notes remain available for audit with explicit reporting treatment. Avoid double-counting adjustments or calling a receipt invoice revenue.
- Exports require exports:create, enforce entity scope, cap synchronous row counts or use an approved asynchronous process, and audit who exported what and when. Minimize personal/tax/bank fields.
- Unknown filters/sort fields are rejected; output order is stable and currency explicit.

## 11. Audit, security and privacy invariants

- Audit actor, action, target, time, outcome, reason/correlation ID and safe before/after values for issue/cancel/credit, tax/number/entity configuration, payments/reversals/allocations, approval decisions, permissions, exports and email actions.
- Never log passwords, session tokens, database credentials, CA material, payment secrets or raw provider secrets.
- Retain history for issued documents, numbering/config versions, approval decisions, payments/allocations/reversals and tax policy versions.
- Validate all mutations server-side. Hidden UI controls are not authorization. Every read, download, export and background job enforces permissions and legal-entity scope.
- Use transactions for atomic operations, database constraints for integrity and idempotency for retryable commands.
- Private file storage only; no production invoices, customer financial data or live secrets in source control.
- Business/legal owners approve retention, access review, incident response, deletion and legal-hold policies.

## 12. Acceptance and change control

The companion file docs/phase-02-feature-traceability.md is the authoritative requirement-to-acceptance checklist. Every requirement has an ID, criterion and verification method. Completion requires, at minimum:

1. Positive and negative state transitions tested at service boundaries.
2. Concurrent issuance cannot create duplicate numbers or invoice records.
3. Identical retries are idempotent; reused keys with different payloads conflict.
4. Issued snapshots survive customer, brand, tax, template, price and legal-entity config changes.
5. Missing/expired numbering, currency, rounding, tax or approval policy blocks issue safely.
6. Unauthorized/cross-entity reads, mutations, downloads and exports are denied.
7. Concurrent allocations cannot exceed invoice balance or receipt amount; reversals preserve history.
8. Email/reminder retries do not duplicate sends; stale jobs skip paid/cancelled/suppressed invoices.
9. Reports reconcile issued documents, approved adjustments and valid allocations without double-counting.
10. UI, PDFs, API, reports and exports use the approved snapshotted values and rounding.
11. Supported MySQL migrations, lint, typecheck, production build, API/contract tests and integration tests pass.
12. Any rule change updates this document, traceability checklist, schema/API, implementation and tests together.

## 13. Approval register and unresolved decisions

The product must make the following values explicit configuration and fail closed when an unresolved choice affects issuance or financial correctness. No values below are inferred or marked approved.

| ID | Decision | Required approver/evidence | Behavior until confirmed |
|---|---|---|---|
| D-01 | Actual legal entities, registration details and mapping of parent company / POS / Digitech / Coworks | Business owner plus official company/GST records | No entity activation/issuance |
| D-02 | Invoice number format/prefix and fiscal-year rule | Business owner and finance/accounting | Numbering inactive |
| D-03 | Currency, rounding stage/precision, discount ordering and caps | Finance/accounting owner | Issue blocked if incomplete |
| D-04 | GST/tax rules, classifications, place of supply, registrations, credit/debit rules and e-invoice applicability | Qualified tax/accounting owner, current official guidance | No guessed rates; issue blocked if unresolved |
| D-05 | Terms, due-date logic, reminder cadence/timezone and holds | Finance/business owner | No invented terms; reminders off until configured |
| D-06 | Role assignments, entity scopes and separation of duties | Business/security owner | No broad grants; default deny |
| D-07 | Approval thresholds for discounts, issuance, cancellation, credits and reversals | Finance/business owner | Explicit policy required; issue blocked until set |
| D-08 | Cancellation/correction where issued invoice has payments/tax liability | Finance/accounting plus tax/legal as needed | Controlled review; no delete/rewrite |
| D-09 | Unapplied receipts, overpayment, refunds, TDS, credit-on-account and FX | Finance/accounting owner | No automatic refund/settlement; unsupported workflows off |
| D-10 | Invoice/quotation templates, status copies, retention, signatures and export fields | Business and finance/privacy owners | No unsupported legal claims |
| D-11 | E-invoice/IRN obligations and integration workflow | Tax owner plus current official applicability review | If required but unavailable, block issue |

### Sign-off record

| Role | Name | Decision | Date | Evidence/reference |
|---|---|---|---|---|
| Business owner / product sponsor | Pending | Pending | Pending | Pending |
| Finance/accounting owner | Pending | Pending | Pending | Pending |
| Tax/legal reviewer (if applicable) | Pending | Pending | Pending | Pending |

Approval may accept the safe product rules while acknowledging that each actual legal entity remains blocked until its own factual tax/configuration records are verified. It does not approve unknown entity mappings or tax rates.

## 14. Regulatory references and change control

Review this document whenever invoice/GST rules, notifications, contracts, supported currencies, approval controls or product scope change. At approval time, verify amendments/current notifications rather than relying on a stale threshold or example.

- CBIC GST Invoice Rules: https://cbic-gst.gov.in/gst-invoice-rules.html
- CGST Act, Chapter VII on tax invoices and credit/debit notes: https://cbic-gst.gov.in/hindi/CGST-bill-e.html
- GST Invoice Registration Portal e-invoice applicability information: https://einvoice6.gst.gov.in/content/einvoice-mandate/

These are official reference starting points for the qualified tax/accounting reviewer, not a determination of this group's actual registrations, rates or liabilities.
