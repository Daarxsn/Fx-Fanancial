**Status:** Phase 06A/06B implementation and regression fixes are merged into `main`; the latest audited revision is `c837e4fae5b6e0ec1dbc42828f2c46aff1c4ee69`. Post-merge CI and lockfile/bootstrap passed on that revision (CI run `38889236087`, bootstrap run `38889236031`). PR #6 merged the exact supplied WebP exports for the corporate logo, MyFX POS, Digitech and Coworks, corrected logo CSS and strengthened UI asset validation. Business-owner sign-off remains required. Do not treat sample values or proposed records as real company/tax information.
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
- Optional separately configured billing address; when omitted, the registered address is the intended billing address.
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
- Entity configuration versions keep a full internal snapshot, while the API's version history returns only version metadata and a reason.
- Bank-detail changes require the finance configuration approver role. General entity APIs and audit before/after values return only masked banking status and the last four account digits.
- Brand and business-unit mappings are effective-dated. Removing a link closes its effective period; it does not delete historical mapping rows.
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

- [x] Platform operator, commercial brand, legal billing entity and business unit are distinct concepts.
- [x] Registered and optional billing address, legal identity, invoice contact, currency, locale, timezone, logo reference, terms and footer are configurable.
- [x] Brand-to-entity and business-unit-to-entity/brand mappings are explicit and server-validated.
- [x] Legal-entity list/detail/create/update is restricted to assigned legal-entity scope.
- [x] Bank account values are not returned in ordinary API responses; bank writes are finance-approver-only.
- [x] Entity/brand/business-unit configuration versions and audit reasons are recorded; mapping history is retained.
- [x] Integration tests are authored for sensitive-field masking, change history and cross-scope isolation.
- [x] The merged `main` revision passes both post-merge GitHub Actions workflows (CI and lockfile/bootstrap; merge commit `7b7e591128facbb66beda6cbe4b781e42759d6ff`).
- [ ] The business owner validates actual legal identifiers, approved finance/tax references, banking instructions, and intended brand/entity/business-unit mappings.
- [x] Phase 6B CI integration tests verify numbering concurrency and financial-year boundaries, approved date-effective tax/registrations, jurisdiction-matched readiness, template selection, idempotent issuance, canonical SHA-256 snapshot capture, configuration-history preservation and immutable snapshots using synthetic MySQL fixtures.

No real tax, bank or legal identity values should be invented to make the setup appear complete. CI fixture data is synthetic and must never be promoted to production.


## Phase 6B — Tax, numbering, templates and issue-time snapshots

Approved tax registrations and tax rules are selected by document date. Numbering is allocated server-side inside the same transaction as issuance, using an entity/document-type/financial-year counter. Effective entity/brand identity versions, approved tax references, numbering configuration, allocation, and the entity-wide or mapped-brand template are stored in a canonical snapshot whose SHA-256 digest is returned with the issue result.

The issue endpoint fails closed for inactive/incomplete/unapproved configurations and out-of-scope invoices. It uses an idempotency key, records an audit event, and exposes only snapshot metadata in its response. Legacy supplier snapshots exclude full bank account details; complete approved billing details remain only in the private configuration snapshot.

The passing CI suite includes concurrent numbering, financial-year boundary, date-effective tax and registration, snapshot hashing, immutable snapshot, version-history, positive invoice issuance/idempotency, and negative scope/configuration checks.

- Phase 6B integration coverage: `scripts/verify-phase-6b-configuration.ts` and CI workflow step `Verify Phase 6B numbering and immutable configuration snapshots`.
- Post-merge CI: https://github.com/Daarxsn/Fx-Fanancial/actions/runs/38884363880
- Post-merge lockfile/bootstrap: https://github.com/Daarxsn/Fx-Fanancial/actions/runs/38884364023

Real tax values, registration numbers, numbering decisions, finance/tax approval, and production activation still require approved values and a controlled deployment migration.


## Brand asset integration audit (2026-10-16)

PR #4 added reconstructed SVG logo/template references to `main` at `7b7e591128facbb66beda6cbe4b781e42759d6ff`. PR #6 then merged the exact supplied WebP exports for Falchion Xeniaa, MyFX POS, FX Digitech and FX Coworks into `main` at `c837e4fae5b6e0ec1dbc42828f2c46aff1c4ee69`.

- `falchion-xeniaa-logo.webp`, `myfx-pos.webp`, `fx-digitech.webp`, `fx-coworks.webp` — exact supplied transparent logo exports proposed for live shell/auth/header use in PR #6.
- The four `.svg` logo variants and three SVG invoice layouts — reconstructed reference art retained for design/dev reference.

With PR #6, the shell, login/activation identity and illustrative Settings preview use the exact supplied corporate WebP export; MyFX POS, FX Digitech and Coworks headers also use their exact supplied exports. The Templates tab presents sanitized SVG layout reconstructions as **reference artwork**, labelled not active. They are not effective-dated template records, are not assumed to map to any particular legal entity, and do not imply PDF rendering, secure storage, download or email delivery. A finance/business owner still needs to approve entity/brand mapping and actual production template configuration.

The CSS design tokens use the official guide's Gold `#DCAF51`, Saffron Red `#931314`, Charcoal `#111111`, Platinum `#F4F4F5`, and White `#FFFFFF`. Sansation/Open Sans web fonts are requested from Google Fonts with local system fallbacks; the repository does not currently contain self-hosted font binaries.


**Fidelity note:** the exact supplied corporate, MyFX POS, Digitech and Coworks logo WebP exports are proposed on PR #6. The invoice reference layouts are sanitized reconstructions, not pixel-identical copies of the original invoice sample sheets. The templates remain reference-only; PDF rendering/storage/delivery is still a separate feature gate.


### Supplied logo export fidelity follow-up (2026-10-16)

PR #6 integrates the exact supplied transparent WebP exports for Falchion Xeniaa, MyFX POS, FX Digitech and Coworks into the live shell/authentication/template-header UI, with contrast-safe charcoal surfaces for gold marks where needed. The original invoice samples are not committed to the public folder because they contain example financial/business details; Settings continues to display sanitized vector layout reconstructions that are not active templates.
