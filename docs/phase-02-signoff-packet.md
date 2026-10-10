# Phase 02 — Business/Finance Review and Sign-off Packet

**System:** Falchion Xeniaa Invoice Management System  
**Requirements revision:** 1.0  
**Prepared:** 2026-10-10  
**Purpose:** Turn the full business rules into an actionable approval record for the business owner and finance/accounting owner.

> **Not yet signed.** No person's approval is implied. Fill the Decision/Approval fields and record the approving person's name, role, date and evidence. Tax/legal determinations must be confirmed by the qualified company reviewer.

## Decision sheet

| ID | Topic | Recommended starting point for review (not approved policy) | Decision / notes | Required approver | Status |
|---|---|---|---|---|---|
| D-01 | Parent / brands / legal billing entities | Keep parent/platform operator, brand and legal entity distinct. Treat POS, Digitech and Coworks as labels only until supported by authoritative company records. | Pending | Business owner; verify legal/tax records with finance | PENDING |
| D-02 | Numbering | One server-side sequence per legal entity per financial year; independent of brand unless a justified approved series exception is required. Number format is configurable. | Pending | Business owner + finance/accounting | PENDING |
| D-03 | Financial year | Proposed India-oriented 1 April–31 March fiscal-year rule, configurable per legal entity. Confirm that this applies to each actual issuer. | Pending | Finance/accounting | PENDING |
| D-04 | Currency | One explicitly configured currency per legal entity; proposed first release is one currency per entity, without FX settlement. Existing schema INR default must not override configuration. | Pending | Finance/accounting | PENDING |
| D-05 | Calculation and rounding | Decimal-safe server calculations, documented line/document/tax rounding sequence, reproducible issue-time snapshot, consistent displayed precision across UI/API/PDF/reports. Exact policy needs worked examples. | Pending; attach finance-approved examples | Finance/accounting | PENDING |
| D-06 | Discounts and tax | Only approved effective-dated entity-specific tax rules; explicit discount eligibility/order/caps. Never infer from brand or apply a blanket rate. | Pending; attach current registrations and tax matrix | Finance/accounting / tax reviewer | PENDING |
| D-07 | Payment terms | Set terms by approved entity/customer/contract policy; snapshot terms and due date on issue. No invented universal payment term. | Pending | Finance/business owner | PENDING |
| D-08 | Payments and overpayments | Payment state derived from valid allocations; no over-allocation; reversal is reasoned and audited. Enable unapplied balances only if explicitly approved. No automatic refunds or TDS workflow in initial scope unless approved separately. | Pending | Finance/accounting | PENDING |
| D-09 | Cancellation / correction | Never delete or rewrite issued invoices; preserve number/history, require reason/audit and follow tax/legal-approved cancellation or linked credit/debit note process. Resolve payments first. | Pending | Finance/accounting + tax/legal where applicable | PENDING |
| D-10 | Approval and separation of duties | Default deny; separate create, approve, issue, cancel, payment/reversal, export and admin permissions. Recommend prohibiting self-approval where approval is required. Thresholds remain configurable and must be supplied. | Pending; attach role list and thresholds | Business owner + finance/security | PENDING |
| D-11 | E-invoice/statutory scope | Determine applicability for each issuer using current official rules; if applicable but the integration is not ready, block issue. Never claim IRN/submission without a verified response. | Pending; attach tax-review outcome | Tax/accounting owner | PENDING |
| D-12 | Templates, email and reports | Approve supplier/footer/bank fields, quotation/invoice/credit/debit templates, paid/partial/cancelled copy labels, recipient confirmation, reminder policy, export fields and retention. | Pending | Business + finance/privacy owner | PENDING |

## Required evidence before an entity is allowed to issue

Do not put sensitive values into this repository. Store actual documents in the company's approved secure records system and reference them by an internal identifier.

- Legal entity's exact legal name and corporate registration evidence.
- Current official GST registration certificate/status for each applicable registration, jurisdiction, effective date and confirmation of legal issuer.
- Approved mapping from each business label (POS, Digitech, Coworks) to the legal entity or entities, with effective dates.
- Entity-specific numbering format and financial-year boundary.
- Finance-approved currency, pricing, discount and rounding test examples.
- Tax rule matrix with tax codes/rates/classifications, inclusive/exclusive rule, supply/place-of-supply assumptions as relevant, applicability dates and approver.
- E-invoice/IRN applicability determination and integration readiness, where relevant.
- Approved payment terms, due-date rules, cancellation/correction process, overpayment/reversal policy, approval thresholds and role/entity scope matrix.
- Approved invoice/quotation/adjustment templates and communication/reminder/export policy.

## Approval statements

### Business owner / product sponsor

I have reviewed revision 1.0 of `docs/phase-02-business-rules.md` and `docs/phase-02-feature-traceability.md`. I approve the stated product requirements and the listed safe defaults as the implementation baseline, subject to any decisions recorded above. I understand this does not assert unverified legal-entity, GST, bank or statutory values.

- Name: **Pending**
- Role/authority: **Pending**
- Decision: **PENDING — Approve / Reject / Approve with recorded changes**
- Date: **Pending**
- Evidence/reference: **Pending**

### Finance/accounting owner

I have reviewed the numbering, money, tax, payment, cancellation, reporting and approval requirements within my remit. I have either supplied the needed policy values/evidence or explicitly retained a decision as blocked pending evidence. I have not approved any unverified legal/tax facts.

- Name: **Pending**
- Role/authority: **Pending**
- Decision: **PENDING — Approve / Reject / Approve with recorded changes**
- Date: **Pending**
- Evidence/reference: **Pending**

### Tax/legal review (when required)

I have reviewed the active-entity statutory-document, GST and e-invoice requirements for the actual issuer(s), against current official guidance and company records. This is not a generic approval of unknown registrations or future changes.

- Name: **Pending**
- Role/authority: **Pending**
- Decision: **PENDING — Approved / Changes required / Not applicable with rationale**
- Date: **Pending**
- Evidence/reference: **Pending**

## Completion rules

1. Fill decisions with approved values or explicitly record “blocked / not in scope” and owner.
2. An authorized business owner must approve the requirements revision and traceability checklist.
3. Finance/accounting must approve the policies in their remit; obtain tax/legal review where applicable.
4. Preserve an auditable approval record (for example, a signed internal record or recorded approval in the company's accepted workflow). A Git commit alone does not constitute company approval.
5. When material changes are requested, increment the revision, update the requirements and traceability matrix, and re-review affected decisions.
6. Only after approval is recorded should the tracker mark the formal Phase 02 gate complete. Later runtime implementation/tests remain acceptance gates for their relevant development phases.
