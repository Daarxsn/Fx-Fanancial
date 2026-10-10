# Phase 06 — Company, Brand and Legal Entity Configuration

**Status:** Configuration design baseline. Do not treat sample values or proposed records as real company/tax information.

## Core distinction

The system must model these separately:

- **Platform operator / parent company:** owns the internal application and user administration.
- **Brand:** a commercial or product identity used in the UI and optionally on invoice layouts.
- **Legal billing entity:** the legal person/business that supplies goods/services and is named as supplier on an invoice.

A brand must never automatically become a separate legal billing entity. POS, Digitech and Coworks are brand labels only until the business confirms the legal relationship. Multiple brands may map to one legal entity; one legal entity may serve multiple brands if the business approves.

## Legal entity record

Store and validate, as applicable:

- Legal name and display/trading name.
- Registered/business address and address country.
- Company/registration identifiers.
- Tax registrations and applicable jurisdiction.
- Invoice contact details.
- Bank/payment instructions shown on invoice templates.
- Default currency and locale.
- Logo/branding references, template settings and footer/legal text.
- Active/inactive status, effective dates and created/updated audit metadata.

Sensitive banking and tax data should be permission-restricted. Never commit real company secrets or production data to the repository.

## Brand record

Store:

- Brand name and stable code.
- Optional logo/theme references.
- Active/inactive status.
- Default document template preference, if the business confirms it.
- Explicit mapping to one or more legal entities only where approved.

Brand configuration must not override legal supplier/tax details or invoice-numbering rules.

## Invoice numbering configuration

Before enabling issuance, business owners must confirm:

- Sequence scope (legal entity, financial year, document type or another approved scope).
- Financial-year start/end rules and timezone.
- Prefix and numbering format.
- Whether numbers may contain gaps after failed/cancelled issuance.
- Treatment of cancelled invoices and credit notes.
- Whether legacy numbering needs migration.

The number format must be generated server-side. The database must enforce uniqueness within the agreed scope. Do not reset counters by editing production rows manually.

## Tax and currency configuration

- Tax rates/categories and jurisdictional rules must be configured from an accounting-approved source.
- Do not infer tax rate, GSTIN, place of supply or registration from brand name.
- Document currency is explicit; legal entity default currency is only a default, not an assumption for every future document.
- Tax-inclusive/exclusive pricing, rounding and line-vs-invoice rounding require an approved policy.
- Effective dates should be recorded for changes to tax configuration where historical reproducibility matters.
- Do not implement tax advice or unreviewed compliance assumptions as code.

## Configuration change controls

- Restrict legal entity, tax, bank, numbering and template configuration to designated permissions.
- Changes that affect future documents should be auditable and have actor, timestamp, reason and safe before/after values.
- Changes must not rewrite issued invoice snapshots.
- Deactivate obsolete records rather than deleting records referenced by issued documents.
- Validate required fields before allowing an entity to be used for issuance.
- Prevent issuance if the selected legal entity is inactive or has incomplete mandatory configuration.

## Admin UI requirements

- List/create/edit/deactivate legal entities and brands.
- Clearly label which legal entity issues invoices for each brand.
- Show a configuration readiness checklist before enabling issuance.
- Separate supplier/legal details from visual brand preferences.
- Mask sensitive bank/tax fields for users without permission.
- Provide preview of invoice header/footer configuration without creating or issuing a real invoice.

## Acceptance criteria

- [x] Platform operator, brand and legal billing entity distinguished.
- [x] Configuration fields and change-control principles documented.
- [x] Numbering and tax decisions identified as business-controlled.
- [ ] Legal entity and brand records reviewed and approved by the business owner.
- [ ] Configuration schema and migration reviewed against confirmed requirements.
- [ ] Admin UI and server-side validation implemented.
- [ ] Permission checks and audit events tested.
- [ ] Issuance blocked for inactive/incomplete legal entities.
- [ ] Historical issued snapshots remain unchanged after configuration edits.

No real tax, bank or legal identity values should be invented to make the setup appear complete.
