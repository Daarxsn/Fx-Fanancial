# Phases 01–06 closure gates (2026-10-16)

This is the pre-Phase-07 release checklist. Do not use this page to infer business approval.

## Verified in the developer's dedicated development environment

- [x] Aiven MySQL reachable with verified TLS: `npm run db:verify` passed with an active TLS cipher and `rejectUnauthorized=true`.
- [x] Migrations 001–010 applied to the selected empty development database, then safely rerun.
- [x] Reference seed safely rerun: 22 permission definitions, seven roles and baseline role-permission templates; no extra users or scopes created by the seed.
- [x] `/api/health` and `/api/v1/health` return HTTP 200 with `database: ok`.
- [x] Administrator bootstrap succeeded and the developer signed in locally.
- [x] Closure PR #4 merged to `main` as `7b7e591128facbb66beda6cbe4b781e42759d6ff`; post-merge CI and lockfile/bootstrap workflows passed.

## Code/document work merged to main (PR #4)

- [x] Align global UI tokens to the uploaded brand guide's primary palette.
- [x] Add a scalable SVG reconstruction informed by the supplied Falchion Xeniaa logo reference to shell/auth identity.
- [x] Add scalable SVG reconstructions of MyFX POS, Digitech and Coworks marks and three invoice reference layouts guided by the uploaded assets.
- [x] Display three SVG invoice-layout reconstructions in Settings as labelled reference-only designs, without auto-activating templates or implying PDF rendering.
- [x] Replace stale repository audit text with a dated, evidence-bounded audit and document the actual remaining gates.
- [x] Post-merge CI on `7b7e591128facbb66beda6cbe4b781e42759d6ff` passed: [CI](https://github.com/Daarxsn/Fx-Fanancial/actions/runs/38884363880) and [lockfile/bootstrap](https://github.com/Daarxsn/Fx-Fanancial/actions/runs/38884364023).

## Must remain open until independently verified/approved

- [ ] Phase 02 business owner sign-off and finance/accounting policy approval; tax/legal review where applicable. The decision packet currently says PENDING.
- [ ] Confirm exact approved legal identity, actual brand-to-entity mapping, legal/tax registrations, rates, numbering, currency, rounding, payment and correction policy. Keep unknowns unconfigured.
- [ ] Review actual Aiven backup retention and complete a provider-level restore drill into an isolated environment.
- [ ] Approve RPO/RTO and monthly infrastructure spend ceiling.
- [ ] Review production database grants, session secret, HTTPS APP_ORIGIN, trusted ingress/proxy configuration and any company-mandated MFA/SSO controls.
- [ ] Approve the Google Fonts dependency or supply licensed self-hosted Sansation/Open Sans fonts.
- [ ] Perform manual desktop/tablet/mobile + light/dark visual review in a real browser.
- [ ] Implement/verify an actual branded PDF renderer, private object storage, authorized download and email delivery before claiming those capabilities are live.

## Explicit phase boundary

Phase 07 has **not started** on this branch. Customer/catalog CRUD, archive/import/export and connected list/detail edit screens remain the next phase and must be built after these pre-Phase-07 gates are reviewed. A sample image or a template config JSON is not an issued invoice.
