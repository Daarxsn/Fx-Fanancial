# Repository Audit — Phases 00–06

**Audit date:** 2026-10-16  
**Baseline:** `main` at `c735e771bf923494070700055f43c3ab255d5a9d`  
**Work branch:** `audit/phase-01-06-completion`  
**Purpose:** reconcile older audit notes with the current repository, capture live development evidence provided by the developer, and keep Phase 7 explicitly blocked until Phase 1–6 acceptance is supported.

## Executive verdict

**Do not certify Phases 1–6 as 100% complete yet.** The repository is materially more advanced than the outdated audit dated 2026-10-09 described: it has deterministic lockfile workflows, ten migrations, live-password/session authentication and RBAC, company/brand/entity configuration, effective-dated tax and numbering, an invoice issue gate, immutable configuration snapshots, and CI integration tests. However, passing CI and a successful development login are not proof of end-to-end invoicing or production readiness.

Latest evidence on baseline `main`:
- Full CI passed: https://github.com/Daarxsn/Fx-Fanancial/actions/runs/38851740024
- Lockfile/bootstrap workflow passed: https://github.com/Daarxsn/Fx-Fanancial/actions/runs/38851740089
- Baseline revision: `c735e771bf923494070700055f43c3ab255d5a9d`

The branch `audit/phase-01-06-completion` proposes corrections for the brand-guide drift and adds first-party logo assets, a constrained asset registry, accessible brand selection, and CI validation. Those branch-specific changes must not be described as merged or complete until its CI and visual review pass.

## Phase-by-phase status

| Phase | What is evidenced | What is still open | Gate |
|---|---|---|---|
| 00 — Foundation | `package-lock.json`, `npm ci` CI, current Node 24 setup, repository policies, lint/typecheck/build in CI. Developer also reported a synchronized and clean local checkout at baseline `c735e77`. | History-wide secret review is not reproduced in this audit session; branch changes need their own CI result. | Technical baseline passes; verify any new commit in CI. |
| 01 — Database infrastructure | Developer verified Aiven TLS with `rejectUnauthorized=true`, successful `SELECT 1`, ten migrations applied/re-run, role seed re-run, both health endpoints HTTP 200. This is development database evidence, not guessed from CI. | Provider-managed backup retention, independent restore drill, approved RPO/RTO and cost ceiling; confirm actual runtime grants and deployment secrets before production. | **Development connectivity gate passes; production readiness does not.** |
| 02 — Business rules | Written rules, requirement traceability, approval packet and explicit fail-closed decisions exist. No unapproved tax/legal/financial facts are assumed. | Authorized business owner and finance/accounting owner approvals, plus tax/legal review where applicable; decisions D-01–D-12 and actual entity mappings/configuration need evidence. | **Not signed off.** Approval cannot be manufactured by code changes. |
| 03 — Architecture/data model | Ten ordered/checksummed migrations, ERD/migration and retention docs, OpenAPI contract validation, integrity snapshot schema/triggers, disposable MySQL migration and restore checks in CI. | Reconcile legacy issued records/snapshots before any production cutover; verify runtime DB grants prevent UPDATE/DELETE on immutable snapshots; align OpenAPI with every implemented config route and avoid treating planned operations as live. | Design gate passes; production integrity/reconciliation checks remain open. |
| 04 — UI foundation | Responsive shell, theme toggle, reusable accessible controls, loading/error/empty states, a typed SVG icon set, route-level states and UI validator exist. | Before this branch, rendered brand UI used Geist and off-guide red/navy/blue literals, and logos were text placeholders. This branch proposes guide-aligned fonts/colors and first-party SVG marks/logos; validate via CI and manual visual review. Many finance module pages intentionally remain placeholder status pages. | Foundation passes; branch correction and visual review pending. |
| 05 — Authentication/RBAC | Scrypt passwords, DB-backed revocable sessions, CSRF, rate limits, invitations, role templates, scoped permission enforcement, admin lifecycle safeguards and CI negative tests. Developer successfully bootstrapped the first admin in the development database and signed in. | Production `SESSION_SECRET`, public HTTPS `APP_ORIGIN`, trusted-proxy decision, provider deployment settings, backup/restore preflight and actual employee/role/entity approvals; SSO/MFA/recovery/email are not represented as implemented. | Core development/auth gate passes; production activation/owner approval remains open. |
| 06 — Company, brand, tax, numbering, templates and issue gate | Settings APIs/UI; legal entity, brand, business-unit mappings; audit/version history; bank masking; effective-dated registrations/rules; numbering allocation; tax readiness; safe preview; transactional issue endpoint, idempotency, immutable config snapshot/hash and CI regression coverage. | Real legal/tax/banking data and brand/entity mappings require approval. The user-facing invoice draft/list/edit lifecycle and PDF rendering/private storage/delivery are not implemented as complete workflows. Uploaded logos/templates were absent from the baseline UI/assets; this branch integrates supplied logo assets and the palette but remains unvalidated until CI/visual review. | Configuration/issuance safeguards pass automated tests; **not a complete end-to-end invoice workflow or production-ready issuance environment.** |

## Brand guide and asset findings

The user uploaded `FX Brand Guidelines(2).pdf`, MyFX POS, Digitech and Coworks logo ZIPs, and invoice sample images. The guide defines Sansation headings, Open Sans UI/body, primary Gold `#DAAF51` and Saffron Red `#931314`, Charcoal `#111111`, Platinum `#F4F4F5`, White `#FFFFFF`, and tertiary Green `#67AF7A`, Yellow `#F5C25C`, Red `#F25138`; it disallows arbitrary unlisted colours.

Baseline main used Geist/Inter-style typography, off-guide values including `#B51F32`, `#17243B` and blue focus/info colors, and a hand-written "FX" tile instead of product logo assets. The Settings template preview represented the logo with issuer initials rather than an uploaded logo. The active audit branch replaces these with brand-guide tokens and SVG assets from the supplied logos and validates palette literals in CI.

Invoice sample images are design references, not public assets: do not place them under `public/` because they may contain supplier/contact details. The new vector assets are brand marks/logotypes; they do not replace a secure upload pipeline or approved document-PDF renderer.

## Mandatory release blockers before any “100% complete” claim

1. **Phase 02 approvals:** business owner, finance/accounting owner and tax/legal reviewer (where applicable) need to record their decision and evidence in the approval packet. Do not mark pending sign-off as complete.
2. **Phase 01/03 production safety:** confirm provider backup/retention, run a provider-managed backup plus independent restore drill, approve recovery targets, and verify production runtime grants cannot alter/delete issued snapshots.
3. **Phase 04 visual evidence:** CI must pass on the brand-corrected branch; manually inspect login, shell, settings, and template preview across desktop/tablet/mobile and light/dark modes.
4. **Phase 05 deployment settings:** configure production secrets and exact public HTTPS origin, confirm ingress/trusted proxy handling, and approve actual role/entity access assignments.
5. **Phase 06 business configuration:** approved legal entity, tax registration/rules, currency/rounding, numbering, template choices and brand/entity/business-unit mappings must be provided by authorized owners. No placeholder/CI data may become production values.
6. **Phase 06 workflow boundary:** create/edit/list invoice drafts, validated line calculations, a user-facing issue flow, and secure document/PDF rendering and storage remain outstanding if the requirement is a complete usable invoice product. An issue endpoint alone does not satisfy the complete lifecycle.

## Scope boundary

Phase 7 is **not started** by this branch. Customer/catalog CRUD, detail/update/archive UI/API, duplicate workflow, import/export, and catalog historical behavior remain Phase 7 scope per `docs/phase-07-customer-and-catalog.md`. The branch must not silently implement Phase 7 as part of the foundation audit.

Do not delete existing data, reset database state, auto-create legal entities/tax rates/bank settings, weaken TLS, or apply production migrations as part of this audit. The Aiven environment tested by the developer was explicitly designated development/testing.

## Acceptance and evidence policy

Record only what a test, CI job, approved source document or authorized owner actually demonstrated. Keep `main` unchanged until the active branch has clean-checkout CI and review. The repository does not become “100%” complete merely because this audit document is updated or the build is green.
