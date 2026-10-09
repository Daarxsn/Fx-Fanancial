# Phase 02 — Business Rules and Domain Invariants

This specification establishes rules for later schema, API, UI, PDF, email and reporting work. Do not invent unresolved financial or legal rules.

## Domain boundaries
Parent company, brand and legal billing entity are distinct. Customers, documents, payments, approvals, communications and reminders are separate domain concepts. A brand is not automatically a legal entity or tax registration.

## Invoice lifecycle and immutability
Drafts are editable by authorized users. Issuance is a server-side operation that creates a numbered invoice snapshot. Issued supplier/customer details, lines, tax inputs and totals must not be silently overwritten. Cancellation requires actor, timestamp, reason and audit record. Corrections use a separately approved credit-note/adjustment process. Quotations do not share official invoice numbers.

## Independent state
Invoice lifecycle, payment state, approval state, email result, reminder state and PDF artifact type must not be overloaded into one status. Payment does not change invoice lifecycle; email sending does not issue an invoice; approval does not automatically issue one unless an approved workflow explicitly says so.

## Numbering and concurrency
Numbering is server-side, transactional and unique within an explicitly approved scope (for example, legal entity and financial year). Retries must not duplicate issuance. Use database constraints and transactions, not UI checks or row counts.

## Money and tax
Authoritative totals are calculated on the server. MySQL DECIMAL is used for money; binary floating-point is not authoritative. Currency, tax treatment, rounding stage/precision, discounts, inclusive/exclusive pricing, GST rules, withholding/TDS and reverse-charge behavior must be approved before implementation. No blanket tax rate may be inferred from brand or hard-coded without approval.

## Snapshots and payments
Historical issued snapshots survive master-data edits. Payments are separate exact-decimal ledger entries; allocations cannot exceed remaining balance unless an approved policy handles overpayment/refund. Preserve reversal history and use idempotency for retryable writes. Manual entry is not proof of bank settlement.

## Documents, communication and audit
Issued-original PDFs are immutable and stored privately. Paid/partial/cancelled copies are distinct artifacts. Email attempts are auditable and failure does not undo issuance. Protected reads and mutations require server-side authorization. Audit records capture actor, action, target, time, outcome and safe change details, without secrets.

## Reminders and reports
Reminders must be idempotent and re-check current payment/cancellation state before sending. Reports distinguish invoiced amounts, received payments and outstanding balances; cancellation treatment must be explicit. Exports are sensitive data.

## Decisions still required
1. Legal billing entities and tax/bank details.
2. Invoice number format, sequence scope and financial-year boundary.
3. Currency and rounding policy.
4. Tax configuration approved by accounting owner.
5. Payment terms and due-date rules.
6. Roles, approval thresholds and separation of duties.
7. Cancellation, credit-note and payment reversal policy.
8. Template fields and paid/partial/cancelled PDF rules.
9. Overpayments, refunds, TDS and multi-currency scope.

## Acceptance gates
- [x] Domain/state invariants documented.
- [x] Initial relational schema added for review.
- [ ] Business decisions confirmed by the owner.
- [ ] Transactional issuance and payment-allocation services implemented.
- [ ] Automated tests cover lifecycle transitions, rounding, idempotency and concurrent operations.
- [ ] Migrations, lint, typecheck and production build pass.
- [ ] Integration tests run against MySQL.
