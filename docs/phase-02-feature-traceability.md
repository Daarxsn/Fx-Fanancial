# Phase 02 — Feature Traceability and Acceptance Checklist

**Companion to:** `docs/phase-02-business-rules.md`  
**Revision:** 1.0  
**Prepared:** 2026-10-10  
**Status:** Traceability authored; stakeholder approvals remain pending.  
**Purpose:** Each requirement must map to observable acceptance criteria and a verification method. A checked documentation item does not imply that a corresponding runtime feature is already implemented.

## Status legend

- **SPEC READY** — requirements and acceptance criterion are stated.
- **APPROVAL REQUIRED** — value/policy needs a named business, finance or tax owner.
- **IMPLEMENTATION REQUIRED** — runtime source/schema/UI/operations/tests need to exist and pass.
- **BLOCKED UNTIL CONFIGURED** — safe behavior is to deny issuance/action until approved entity configuration exists.

Phase 02 is a product/business rules phase, not a claim that the whole invoice application is built. This checklist provides the traceability baseline for implementation phases 03–06 and later test work.

## A. Domain and legal-entity model

| ID | Requirement | Acceptance criteria | Verification | Owner / dependency |
|---|---|---|---|---|
| BR-001 | Separate parent/platform operator, brand and legal billing entity | Changing a brand label never changes supplier legal identity or tax configuration | Domain/service tests; schema review | Product + finance |
| BR-002 | Represent POS, Digitech and Coworks as labels until mapped | No legal entity or GST registration is auto-created or inferred from these labels | Seed/config test; negative tests | Business owner approval |
| BR-003 | Effective-dated brand-to-entity mapping | Only an approved mapping effective on the document date may be selected; historical invoice keeps its mapping snapshot | Mapping boundary integration test | Business + finance |
| BR-004 | Invoice has exactly one billing legal entity | Issuance with missing, inactive, ambiguous or unapproved entity is denied | API/service negative tests | Phase 03/06 |
| BR-005 | Entity activation guard | Activation fails when required legal, numbering, currency, tax or approval configuration is absent | Configuration validation tests | Finance/tax approval |
| BR-006 | Snapshot legal identity at issue | Later entity/address/registration changes do not modify issued PDF/API/history | Snapshot immutability integration test | Phase 03/06 |

## B. Invoice and quotation lifecycle

| ID | Requirement | Acceptance criteria | Verification | Owner / dependency |
|---|---|---|---|---|
| BR-010 | Draft editing boundary | Authorized draft can be edited; issued/cancelled financial fields cannot be changed by ordinary update endpoints | Service/API transition tests | Phase 03/05 |
| BR-011 | Explicit issuance command | Issue command enforces all gates server-side; UI state tampering cannot issue an invoice | Negative API tests | Phase 03/05 |
| BR-012 | Transactional issuance | Number allocation, snapshots, status, audit and idempotency outcome commit atomically or roll back together | Fault-injection integration tests | Phase 03 |
| BR-013 | Issue-policy completeness | Missing tax, currency, rounding, numbering, entity or approval policy denies issue with a safe actionable error | Policy-guard matrix tests | Finance/tax setup |
| BR-014 | Independent state dimensions | Payment/email/approval state changes never accidentally change invoice lifecycle | State transition tests | Phase 03 |
| BR-015 | Quote numbering separation | Quotation cannot consume or collide with official invoice series | Schema/service uniqueness tests | Phase 03 |
| BR-016 | Quote-to-invoice conversion | Conversion creates a linked invoice draft, revalidates current policies and is retry-safe | Conversion integration tests | Phase 03 |
| BR-017 | No silent deletion | Issued invoice remains discoverable after cancellation and is not hard-deleted | DB/service/audit tests | Phase 03 |
| BR-018 | Snapshot invariance | Customer, brand, entity, tax, catalog and template edits do not rewrite issue-time values | Integration test with before/after comparison | Phase 03/06 |
| BR-019 | Explicit workflow history | Issue, cancellation, approval and conversion record actor, time, outcome and safe change details | Audit-event tests | Phase 03/05 |

## C. Numbering and date policy

| ID | Requirement | Acceptance criteria | Verification | Owner / dependency |
|---|---|---|---|---|
| BR-020 | Approved sequence scope | Sequence is allocated under the approved scope (recommended: legal entity + financial year, not brand by default) | Schema constraints + config test | Business/finance approval |
| BR-021 | Concurrency-safe numbering | Parallel issue requests never allocate duplicate official numbers | Concurrent MySQL integration test | Phase 03 |
| BR-022 | Idempotent issuance | Same key and payload returns original result; same key with different payload conflicts | API integration test | Phase 03 |
| BR-023 | Financial-year boundaries | Approved fiscal-year rules yield correct year at boundary dates and use explicit timezone/date policy | Boundary unit + integration tests | Finance approval |
| BR-024 | Number immutability | Cancellation does not release number; configuration change never renumbers history | Cancellation/config migration tests | Phase 03/06 |
| BR-025 | Separate document series | Invoices, quotations and applicable credit/debit notes follow approved non-colliding series | Uniqueness tests | Finance/tax approval |

## D. Amounts, currency, discount and rounding

| ID | Requirement | Acceptance criteria | Verification | Owner / dependency |
|---|---|---|---|---|
| BR-030 | Decimal-safe server totals | Amounts use decimal-safe arithmetic; binary floats are not authoritative | Unit tests and static review | Phase 03 |
| BR-031 | Entity-scoped currency policy | Currency is explicit on invoice/payment; technical INR default cannot bypass entity configuration | Policy tests; invalid-currency cases | Finance approval |
| BR-032 | Single-currency invoice | Mixed-currency lines/allocations are rejected unless an approved separate FX workflow exists | API/service negative tests | Phase 03 |
| BR-033 | Approved discount policy | Only configured discount types/order/caps are accepted; tax base is correct for selected policy | Table-driven calculation tests | Finance approval |
| BR-034 | Consistent rounding | Line, tax, invoice, PDF, API, report and export totals match at approved precision | Golden test vectors and cross-output tests | Accounting approval |
| BR-035 | Input/precision validation | Invalid precision, zero/negative quantities where prohibited, negative price/discount or inconsistent totals are rejected | Unit/API validation tests | Phase 03 |
| BR-036 | Reproducible total calculation | Issued snapshot stores policy/version and sufficient inputs to reproduce totals | Snapshot comparison test | Phase 03 |

## E. Tax and statutory document rules

| ID | Requirement | Acceptance criteria | Verification | Owner / dependency |
|---|---|---|---|---|
| BR-040 | No tax inferred from brand | POS, Digitech or Coworks cannot auto-set GSTIN, registration, tax rate or document type | Negative mapping/config tests | Business/tax approval |
| BR-041 | Effective-dated approved tax rules | Rule selection is unique, active, legal-entity scoped and effective on document date | Tax config unit/integration tests | Tax owner |
| BR-042 | Fail closed on unresolved tax | Issue is denied where tax classification/rule or required registration is missing/ambiguous | Negative issue tests | Tax owner |
| BR-043 | Tax component and basis rules | Configured tax components, inclusive/exclusive mode and discount base follow approved rule | Golden tax test matrix | Tax/accounting approval |
| BR-044 | Statutory field completeness | Document validation enforces current required fields for the transaction/document type | Qualified reviewer sign-off + tests | Tax/legal reviewer |
| BR-045 | Credit/debit-note lineage | Notes have their own number, reason, date, linked source invoice, delta and audit trail; source invoice remains immutable | Integration tests | Finance/tax approval |
| BR-046 | E-invoice applicability gate | Applicability is reviewed per legal entity; if required but integration/configuration is absent, issue is blocked | Configuration and negative tests | Tax owner + integration |
| BR-047 | No false compliance claims | UI/export never represents IRN, QR, statutory submission or tax validation as successful without verified response/evidence | Contract and integration tests | Tax + engineering |

## F. Payment, allocation, due dates and reversals

| ID | Requirement | Acceptance criteria | Verification | Owner / dependency |
|---|---|---|---|---|
| BR-050 | Snapshot payment terms | Issued due date/terms do not silently change when customer or entity defaults change | Snapshot test | Finance approval |
| BR-051 | Derived payment state | UNPAID/PARTIALLY_PAID/PAID is derived from valid allocations, reversals and approved adjustments | Table-driven reconciliation tests | Phase 03 |
| BR-052 | Allocation limits | Allocation sum never exceeds invoice outstanding balance or receipt amount | Negative unit/integration tests | Phase 03 |
| BR-053 | Concurrent allocation safety | Parallel allocations cannot over-allocate after locking/transaction retry | Concurrent MySQL integration test | Phase 03 |
| BR-054 | Customer/currency compatibility | Allocation to wrong customer or currency is rejected under approved matching rules | API/service negative tests | Phase 03 |
| BR-055 | Unapplied payment behavior | Excess receipt is preserved/rejected only according to an explicit approved policy; no silent auto-refund | Policy branch tests | Finance approval |
| BR-056 | Reversal not deletion | Reversal requires reason, separate permission and audit; allocation/balance history remains traceable | Authorization + audit tests | Phase 03/05 |
| BR-057 | Manual payment not bank settlement | Manual receipt is labelled recorded, not bank-confirmed/settled | UI/API/report tests | Product |
| BR-058 | Terms/reminders policy | Due-date calendar/timezone/terms and reminder schedule are approved; stale jobs skip paid/cancelled/held invoices | Date tests + job integration tests | Finance/business approval |

## G. Cancellation and correction

| ID | Requirement | Acceptance criteria | Verification | Owner / dependency |
|---|---|---|---|---|
| BR-060 | Controlled cancellation | Only permissioned actors cancel, providing a reason; all actions are audited | Authorization/state tests | Finance approval |
| BR-061 | Payment-aware cancellation | Cancellation blocks or follows explicit approved resolution when valid payments/allocations exist | Negative and workflow tests | Finance approval |
| BR-062 | Original is immutable | Cancelling/correcting never alters or deletes original issued values or releases its number | DB/API regression tests | Phase 03 |
| BR-063 | Credit/debit/correction process | Correction has link to original, separately approved series/tax treatment and traceable audit history | Integration tests | Finance/tax approval |
| BR-064 | Legal/statutory treatment gate | System does not assume CANCELLED alone corrects tax liability; incomplete correction policy blocks the command | Policy negative tests | Tax/legal approval |

## H. Roles, permissions and separation of duties

| ID | Requirement | Acceptance criteria | Verification | Owner / dependency |
|---|---|---|---|---|
| BR-070 | Default-deny permission checks | No protected operation succeeds without explicit permission, on server, regardless of UI state | Authorization test matrix | Phase 05 |
| BR-071 | Entity-scoped access | User cannot read/change/download/export another entity's resources without scope | Cross-entity security tests | Phase 05 |
| BR-072 | Separation of duties | Configured self-approval prohibition and thresholds are enforced at the server | Positive/negative approval tests | Owner approval |
| BR-073 | Separate sensitive actions | Issue, cancel/credit, payment reverse, user management and tax config have distinct permissions | Role-permission tests | Phase 05 |
| BR-074 | Admin is not implicit finance actor | System admin role alone cannot issue/cancel/reverse without those permissions | Negative authorization tests | Phase 05 |
| BR-075 | Audit access is restricted | Audit and export data are scoped and read-only unless explicit separate access exists | Authorization tests | Phase 05 |
| BR-076 | No broad unapproved grants | No production role/user permissions are seeded without approved mapping | Seed/config review and tests | Business/security owner |

## I. PDFs, email, reminders, reporting and exports

| ID | Requirement | Acceptance criteria | Verification | Owner / dependency |
|---|---|---|---|---|
| BR-080 | Private immutable original PDF | Issued PDF uses snapshot, private storage metadata/hash is recorded, unauthorized download is denied | Storage/integration/security tests | Phase 03/06 |
| BR-081 | Artifact labels are clear | Original, paid/partial/cancelled copy, quotation and credit/debit note are distinct and correct | PDF golden tests | Finance/template approval |
| BR-082 | Durable idempotent email | Send uses confirmed recipient, durable outbox, retry-safe idempotency and safe audit; failure does not undo issue | Email-provider mock/integration tests | Phase 03 |
| BR-083 | Reminder revalidation | Job checks current balance/lifecycle/hold before send; paid/cancelled invoices are skipped | Scheduler integration test | Phase 03 |
| BR-084 | Reconciled reports | Invoice totals, adjustments, receipts, allocations and balance reconcile without double-counting | Seeded ledger/report tests | Finance |
| BR-085 | Safe, scoped export | Export permission, entity filter, row cap/async policy and audit apply; sensitive fields minimized | Export authorization/integration test | Phase 03/05 |
| BR-086 | Stable filters/sorting | Unknown sort/filter fields rejected; outputs use stable order and currency | API contract tests | Phase 03 |

## J. Security, operations and release acceptance

| ID | Requirement | Acceptance criteria | Verification | Owner / dependency |
|---|---|---|---|---|
| BR-090 | Safe audit/logging | No passwords, tokens, DB credentials, private certificate material or raw provider secrets appear in logs/audit | Secret scan + negative tests/review | Security |
| BR-091 | Transaction and idempotency boundaries | High-risk commands have documented transaction and retry behavior | Design review + integration tests | Engineering |
| BR-092 | Configuration history | Tax, legal entity, numbering and approval policy edits are effective-dated/versioned and auditable | Schema/service tests | Phase 03/06 |
| BR-093 | MySQL integration verification | Migrations apply to supported MySQL; test suite validates constraints and transactional rules | CI integration workflow | Engineering |
| BR-094 | Cross-layer total consistency | UI, API, PDF, reporting and exports agree on totals and snapshot fields | Contract/golden tests | Engineering |
| BR-095 | Documentation traceability | Requirement change updates this matrix, business rules, schema/API, code and automated tests | PR checklist/review | Engineering/product |
| BR-096 | Release readiness evidence | Lint, typecheck, production build, schema tests and integration tests all pass on same revision | CI run linked to commit | Engineering |

## K. Approval register — decisions must be answered before production

| Decision ID | Decision to approve | Approver | Status |
|---|---|---|---|
| D-01 | Actual legal entities, registrations and brand mappings for parent company / POS / Digitech / Coworks | Business owner + official records | PENDING |
| D-02 | Number prefix/format, sequence scope and financial-year boundary | Business + finance/accounting | PENDING |
| D-03 | Currency, discounts and rounding sequence/precision | Finance/accounting | PENDING |
| D-04 | Tax rules, classifications, registration, credit/debit-note treatment and e-invoice applicability | Qualified tax/accounting owner | PENDING |
| D-05 | Payment terms, due-date logic, reminders/timezone and holds | Finance/business | PENDING |
| D-06 | Role assignments, entity scopes and separation-of-duties policy | Business/security | PENDING |
| D-07 | Approval thresholds by action and amount | Finance/business | PENDING |
| D-08 | Cancellation and corrections where payment/tax liability exists | Finance/tax/legal | PENDING |
| D-09 | Overpayment/unapplied receipt, refund, TDS and FX scope | Finance/accounting | PENDING |
| D-10 | PDF/email templates, retention, signatures, export fields | Business + finance/privacy | PENDING |
| D-11 | E-invoicing requirement and integration plan | Tax/accounting owner | PENDING |

## Gate summary

- [x] Full requirements IDs and acceptance criteria documented.
- [x] All specified product areas map to verification methods.
- [x] Unresolved legal/financial decisions are identified with responsible approver categories and fail-safe behavior.
- [x] Traceability is linked to future schema, API, security, UI and CI work.
- [ ] Authorized business owner accepts the requirements revision.
- [ ] Finance/accounting owner accepts financial and tax policies within their remit.
- [ ] Tax/legal review completed where required.
- [ ] Runtime implementation and automated tests pass in later implementation phases.

**Do not represent Phase 02 as formally signed off until the required approvers record their decisions.** This is intentional governance: the document is complete as a reviewable requirements baseline, but unknown actual entities, tax registrations, policies and business approvals are not fabricated.
