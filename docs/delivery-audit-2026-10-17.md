# Invoice Generator Delivery Audit - 2026-10-17

## Purpose and evidence boundary

This document records the implementation status of the supplied project after a source, design-reference and automated-check review. It is not business, tax or legal approval. The supplied logo exports, brand guide and invoice samples were inspected as design references only. No example customer, bank, tax or financial values were copied into application seed data or public assets.

## Product and design reference

- **Stack:** Next.js 16 App Router, React 19, TypeScript, MySQL 8 via `mysql2`, Zod validation, and exact-decimal invoice arithmetic built on scaled `BigInt` values.
- **Brand system:** Sansation for headings, Open Sans for UI/body content; Gold `#DAAF51`, Saffron Red `#931314`, Charcoal `#111111`, Platinum `#F4F4F5` and White `#FFFFFF`.
- **Document reference:** the three supplied pro-forma invoices share a common page structure with a selected product-brand mark, issuer and bill-to blocks, line table, totals, payment details, terms and signature. The application uses sanitized reference layouts and the provided brand assets, rather than exposing the sample invoices themselves.

## Current functional status

Implemented and code-verified work includes:

- A secure project foundation, environment conventions, migration runner, reference seed, health routes and CI workflow.
- MySQL schema/configuration foundations for legal entities, brands, tax registrations/rules, numbering and effective-dated document configuration.
- Local-password activation/login/logout, database-backed revocable sessions, CSRF checks, rate limits, security events, RBAC and entity scope checks.
- A responsive, accessible shell and controlled settings UI that use the supplied visual system.
- Customer and catalog CRUD, archive, bounded search, CSV import/export, duplicate confirmation and permission checks.
- Invoice draft creation/editing, server-side recalculation, exact decimal pricing/tax/discounts, idempotent draft creation, optimistic locking, scoped list/detail APIs and controlled issue-time numbering/configuration snapshots.

The following are not production-ready or must not be described as live:

- Cancellation/credit/debit correction workflow, including the finance/tax policy required to decide when an issued document may be cancelled.
- Generated PDF originals, private object storage, authorized document download, immutable file-integrity records and document regression testing.
- Payment entry/allocation/reversal APIs and UI. Existing balance queries do not constitute a payment workflow.
- Email sending, durable outbox/retries, reminders, quotations/recurrence, dashboards/reports/exports, approval workflow UI, searchable audit, production deployment, monitoring, backups/recovery and user acceptance testing.

## Phase plan

| Phase | Current state | Next approach and rationale | Completion evidence |
|---|---|---|---|
| 00 Foundation | Implemented; revalidated locally | Keep the existing Next.js structure and locked dependencies. Prefer focused changes over rewrites. | Clean install, lint, types and build. |
| 01 Database | Implemented for development | Apply forward-only migrations only to an authorized target over verified TLS. Confirm backup/restore with the chosen Aiven plan. | Real TLS query and provider restore drill. |
| 02 Business rules | Documented; approvals pending | Obtain named approvals for entity mapping, tax, numbering, rounding, payment and correction policies. These cannot be inferred from artwork. | Signed decision packet and traceability checklist. |
| 03 Architecture | Implemented design and core schema | Extend only through forward migrations and protected API contracts; preserve immutable issue snapshots. | Reviewed migration/API change and schema tests. |
| 04 Design system | Implemented | Retain the established tokens/components and complete manual device, keyboard and contrast review. | Desktop/tablet/mobile/light/dark acceptance. |
| 05 Authentication/RBAC | Implemented for the current routes | Add permission and cross-entity negative tests whenever a new protected route is introduced. | Route-level authorization coverage. |
| 06 Billing configuration | Implemented technical foundation | Populate only approved legal/entity/tax/numbering/template data. Continue separating brands from legal issuers. | Entity readiness passes using approved records. |
| 07 Customer/catalog | Implemented; runtime acceptance pending | Validate production migration and manual accessibility/responsive workflows. Preserve historical document snapshots after archive/edit. | Configured-MySQL and manual acceptance evidence. |
| 08 Invoice engine | Implemented; runtime acceptance pending | Retain server-authoritative exact-decimal calculation and test any approved rounding/tax policy examples. | Calculation, API and manual finance-user tests. |
| 09 Lifecycle/issuance | Partially implemented | Keep the current atomic issue path. Add duplication, cancellation and adjustment routes only after the pending finance/tax correction policy specifies payment, tax and credit/debit-note treatment. | Concurrent issuance, immutability and approved cancellation/correction tests. |
| 10 PDF/documents | Not implemented | Choose private object storage and a renderer, generate from immutable issue snapshots, hash/store originals, and gate every preview/download by authorization. | PDF visual/regression, integrity and unauthorized-download tests. |
| 11 Archive/search | Partially implemented | Expand the existing bounded invoice list into approved filter/sort/detail/history flows without unbounded queries. | Filter composition, scope and pagination tests. |
| 12 Payments | Not implemented | Build receipts, allocations and reversals transactionally after overpayment/refund policy approval; never treat payment as an invoice lifecycle transition. | Partial/reversal/concurrency reconciliation tests. |
| 13 Email | Not implemented | Select a provider, then use a durable idempotent outbox with recipient confirmation, attachment integrity and failure states. | Sandbox delivery/retry tests. |
| 14 Jobs/reminders | Not implemented | Use a durable scheduler/outbox, not a web-process timer; revalidate document and payment state at send time. | Retry, duplicate-prevention and time-zone tests. |
| 15 Quotations/recurrence | Not implemented | Implement quotations separately from invoice series, conversion into revalidated drafts and pause-safe recurring schedules. | Linked conversion and duplicate-prevention tests. |
| 16 Reporting/exports | Not implemented | Define cancellation/credit/tax/currency treatment with finance before implementing reconciled reports and scoped exports. | Source-ledger reconciliation and export authorization tests. |
| 17 Approvals/audit | Partial audit foundation | Add configurable approval transitions and a permission-scoped, immutable audit search. | Sensitive-action traceability and negative transition tests. |
| 18 Security/privacy | Partial | Add endpoint-specific threat tests, headers, dependency review, private-file controls, retention and incident procedures. | Security test matrix and operational sign-off. |
| 19 QA | Partial | Add integration/E2E/PDF visual/accessibility/browser/performance suites as later capabilities arrive. | No release-blocking defects and agreed coverage. |
| 20 CI/CD | Partial | Keep CI gates; add preview deployment, migration checks, release notes and rollback verification after hosting is selected. | Promotion is blocked on every required check. |
| 21 Deployment | Not configured | Configure Vercel/domain/HTTPS/secrets, private storage/email networking, then apply reviewed migrations and smoke-test. | Production critical-path smoke test. |
| 22 Operations | Not configured | Add structured logs, alerting, managed backups, tested restores, RPO/RTO and incident runbooks. | Evidence of restore and alert exercises. |
| 23 UAT/launch | Not started | Test representative, authorized business workflows using approved entity/tax/template data and a controlled rollback plan. | Business sign-off and documented go-live decision. |
| 24 Maintenance | Not started | Establish owners, access reviews, dependency patching, recovery drills and an auditable release cadence. | Recurring maintenance evidence. |

## Quality changes made during this audit

1. Fixed draft-create duplicate-submission race recovery by retaining the idempotency key and payload fingerprint before the database write. A unique-key race can now return the winning draft/replay result instead of falling through to a generic error.
2. Removed three unused imports/parameters reported by lint.
3. Put the external font import before Tailwind's import, removing the production CSS import-order warning.

## Verification performed in this environment

- `npm ci` completed from the locked dependency graph.
- `npm run lint`, `npm run typecheck`, `npm run api:validate`, `npm run ui:validate`, `npm run finance:calculation-test` and a production build with non-secret build-only environment values passed.
- A disposable MySQL 8 container applied all 15 migrations, safely reran migrations, and safely reran the 22-permission/seven-role reference seed.
- `npm audit --omit=dev` reported no production dependency vulnerabilities. The full audit reports five high-severity findings in the development-only lint dependency chain `eslint-config-next -> fast-glob -> micromatch -> braces`; the lockfile currently offers no automated fix.

## Verification limits

- The supplied archive does not contain production environment values, an approved Aiven target, document storage, email provider, domain or business-owner/finance/tax approvals. No production migration, deployment, email delivery, document storage or restore drill was attempted.
- Browser/API contract tests could not complete in this sandbox: Turbopack cannot start its FSEvent stream, Webpack exhausts its sandbox watcher resource, and a production server correctly refuses the local non-TLS disposable MySQL database. These are environment limits, not successful runtime evidence.
- Phase 09 cancellation/correction and Phase 10 onward remain deliberately open until the missing policy/provider decisions are supplied and their technical work is completed.
