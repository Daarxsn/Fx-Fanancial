# Phase 02 — Business Rules and Domain Invariants

**Status:** Specification committed; implementation and automated tests are pending synchronization of the local Next.js application.

This document defines rules that later database schema, API, UI, PDF, email and reporting work must follow. Do not silently invent financial or legal rules. Record unresolved business decisions before implementing them.

## 1. Core domain concepts

Keep these concepts distinct:

- **Parent company:** Organization operating the internal platform.
- **Brand:** Commercial identity such as POS, Digitech or Coworks.
- **Legal billing entity:** Legal person/business named as supplier, with its own legal and tax details where applicable.
- **Customer:** Bill-to party, with invoice-specific details snapshotted when an invoice is issued.
- **Document:** Quotation, draft invoice, issued invoice, credit note or another explicitly supported document type.
- **Payment:** Recorded receipt allocated against an invoice; not the same as invoice lifecycle status.
- **Approval:** Workflow decision, separate from issuance and payment.
- **Communication:** Email/send attempt, separate from invoice status.
- **Reminder:** Scheduled or manually triggered request for payment, separate from invoice status.

A brand is not automatically a separate legal entity. Do not assume each brand has its own GSTIN, bank account, address or invoice sequence. Configuration must identify which legal billing entity issues each invoice.

## 2. Invoice lifecycle

Enforce allowed transitions on the server.

- **Draft:** Editable by authorized users. No final invoice number is reserved unless an explicitly approved policy says otherwise.
- **Issued:** Officially issued, numbered and immutable as a financial snapshot. Corrections must use an authorized correction/cancellation process; never silently overwrite the issued original.
- **Cancelled:** Controlled terminal state requiring an authorized actor, timestamp, reason and audit event. Preserve the issued original and cancellation evidence.
- **Credit note / adjustment:** A separate linked document when needed to correct an issued invoice under approved accounting policy. Never model a correction as an edit to the original PDF or row.

A quotation has its own lifecycle and is not an issued invoice. Converting an accepted quotation must create a new invoice draft and must not reuse the quotation number as the invoice number.

## 3. Independent state dimensions

Do not overload one status field to represent multiple concerns.

- **Invoice lifecycle:** draft, issued, cancelled (plus future explicitly approved states).
- **Payment state (derived from ledger/allocation):** unpaid, partially paid, paid, or overpaid where policy permits it.
- **Approval state:** not required, pending, approved, rejected.
- **Email delivery state:** not sent, queued, sent/accepted by provider, failed. Do not claim recipient delivery or reading without evidence.
- **Reminder state:** not scheduled, scheduled, sent, failed, cancelled.
- **PDF artifact type:** issued original, payment-status copy, cancellation copy, or another explicitly named artifact.

A payment update must not change invoice lifecycle. Sending email must not issue an invoice. Approval must not itself issue an invoice unless a separately approved workflow explicitly performs that transition.

## 4. Issuance and numbering

- Assign the official invoice number only through a server-side issuance operation.
- Generate the number transactionally and safely under concurrent requests.
- Define sequence scope explicitly (for example, legal billing entity and financial year) before implementation.
- Enforce uniqueness in the database; do not rely on a UI check.
- Failed issuance must not leave a partially issued invoice or inconsistent sequence allocation.
- Retries must not create duplicate issued invoices; use an idempotency strategy.
- Record issuer, issuance timestamp and relevant audit metadata.
- Never derive official numbering from browser state, timestamps alone, or a count of existing rows.

Exact numbering format, financial-year boundary and whether draft references exist are business decisions to confirm before implementing numbering.

## 5. Financial calculation and rounding

- Perform authoritative totals and tax calculations on the server. Client previews are advisory only.
- Store monetary values in MySQL exact decimal types; do not use binary floating-point for authoritative money arithmetic.
- Define currency explicitly for every document. Do not assume all invoices use INR.
- Persist line-level inputs and calculated snapshots sufficient to explain issued totals.
- Define rounding precision and stage consistently before tax implementation.
- Tax rates, tax category, place-of-supply rules, GST split/IGST treatment, withholding/TDS, reverse charge, discounts and inclusive/exclusive pricing must follow approved business/tax configuration. Do not hard-code a blanket tax rate or infer treatment from brand name.
- Reject invalid values such as negative quantities or malformed amounts unless a documented adjustment rule allows them.
- Validate line totals, tax totals, discounts and grand total on the server before issuance.

## 6. Customer and supplier snapshots

- Customer master data may be updated for future documents.
- Issued documents retain a snapshot of supplier legal entity, customer name/address/tax identifiers, line descriptions, quantities, unit prices, discounts, tax inputs, totals, currency, payment terms and other printed fields.
- Editing customer or legal-entity records later must not rewrite historical issued invoice data.
- Validate and normalize inputs server-side, while preserving approved snapshot values required for legal/financial records.
- Restrict access to customer tax identifiers, contact details and financial documents.

## 7. Payments and allocations

- Record payments as separate ledger entries; do not edit an issued invoice total to reflect payment.
- Support full and partial payments, including payment date, amount, method/reference and recording actor as applicable.
- Store payments and allocations using exact decimals and database transactions.
- Enforce that an allocation cannot exceed remaining payable balance unless an approved overpayment/refund policy handles it.
- Prevent duplicate payment entry using an appropriate idempotency/reference strategy.
- Preserve history of payment edits, reversals and corrections. Prefer reversal/correction entries over destructive deletion once a payment has been relied upon.
- Derive payment state from invoice amount due and valid allocations; do not let a user manually set an inconsistent paid flag.
- Distinguish manual payment entry from verified settlement where relevant.

## 8. PDF and email rules

- Generate issued-original PDF from the immutable issued snapshot.
- Store issued originals privately and protect downloads with server-side authorization.
- A paid or partially paid copy is a separate artifact/view with clear generation metadata; it must not replace the original.
- A cancellation copy must be clearly identified and must not erase the original.
- Email sending is an independent action with an auditable attempt/result. Failed email must not roll back a successfully issued invoice.
- Confirm recipient and document before sending unless an explicitly approved automated workflow exists.
- Keep internal-copy/CC defaults configurable and validate recipient addresses.
- Never expose private storage URLs publicly or place secrets in email logs.

## 9. Authorization and audit

- Enforce permissions on the server for every protected read and mutation; hiding UI controls is not authorization.
- Use least privilege for roles and scope access by company/legal entity where applicable.
- Issuance, cancellation, payment recording/reversal, approval decisions, supplier/customer financial detail changes and document sending must produce auditable events.
- Audit events should identify actor, action, target, timestamp, outcome and safe before/after representation where appropriate.
- Never put passwords, session tokens, database credentials or unnecessary sensitive data in audit logs.
- Audit history must not be editable by ordinary application users.

## 10. Dates, terms and reminders

- Store timestamps consistently and render them in the user's configured time zone.
- Define invoice date, due date, financial year and overdue calculation rules explicitly.
- Due date calculation must respect configured payment terms and documented date policy.
- Reminders must be idempotent, avoid duplicate sends, respect current paid/cancelled state at send time and record outcomes.
- Background jobs must re-check current invoice/payment state immediately before sending.

## 11. Concurrency, retries and transactions

- Use database transactions for issuance, number allocation, payment allocation, approval transitions and other multi-row invariants.
- Protect against concurrent duplicate issuance and over-allocation with database constraints and transaction-level checks.
- Design retriable operations to be idempotent where feasible.
- Treat external email/PDF/storage calls as fallible; use explicit retry/outbox patterns when appropriate rather than holding database transactions open during network requests.
- Return safe, actionable errors without leaking internal connection details.

## 12. Reporting and exports

- Reports derive from canonical invoice snapshots and payment/allocation records.
- Define whether cancelled invoices are included in each report and label treatment consistently.
- Keep invoice totals, payments received and outstanding balance as distinct metrics.
- Apply the same authorization scope to exports as to underlying records.
- Export files are sensitive business data and must not be committed to source control.

## 13. Decisions required before implementation

Do not guess these decisions:

1. Legal billing entities and their supplier/tax/bank details.
2. Invoice number format, sequence scope and financial-year boundary.
3. Currency support and exact rounding policy.
4. Tax configuration and tax-specific calculations approved by the business/accounting owner.
5. Payment terms and due-date rules.
6. Roles, approval thresholds and separation-of-duties requirements.
7. Cancellation, credit-note and payment reversal policies.
8. PDF template fields and rules for paid/partial/cancelled copies.
9. Whether overpayments, refunds, withholding/TDS and multi-currency payments are in scope.

## 14. Phase 02 acceptance criteria

- [x] Core domain and state boundaries documented.
- [x] Immutable issued-invoice snapshot rule documented.
- [x] Financial arithmetic, numbering, payment and concurrency invariants documented.
- [x] Security, audit, PDF, email and reminder invariants documented.
- [ ] Business owner confirms decisions listed in section 13.
- [ ] Rules are mapped to database constraints, service functions and automated tests.
- [ ] Local Next.js source and lockfile are synchronized with remote repository.
- [ ] Lint, TypeScript, build and relevant tests pass against the actual application.

**Status note:** This commit defines business rules; it does not claim that the rules are implemented or tested. Implementation must wait until the existing local application and remote repository histories are safely synchronized.
