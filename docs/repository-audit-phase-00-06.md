# Repository Audit — Phases 00–06

**Audit date:** 2026-10-09
**Audited ref:** `main` at `b6d17f29127e67e663334f96030d29428002a255`
**Scope:** GitHub repository tree and tracked source/configuration/documentation, plus the latest visible GitHub Actions result. This is not an audit of the developer's local working tree or production accounts.

## Executive result

**Phases 00–06 are not complete. Do not mark them signed off.** The repository contains a Next.js scaffold, early database infrastructure, a starter SQL schema, health endpoints, CI, and design/specification documents. It does not yet contain a working invoice-management application with authentication, complete domain services, full UI, or production-tested infrastructure.

Latest observed CI run for this audited ref: GitHub Actions run 12 completed successfully. The workflow currently installs with `npm install --no-audit`; it does not use a committed lockfile because none is present. A green scaffold build is not evidence that MySQL connectivity, migrations, authorization, or invoice workflows work.

## Phase-by-phase findings

### Phase 00 — Foundation

**Present**
- Public repository and a basic Next.js App Router/React/TypeScript scaffold.
- `.gitignore`, safe `.env.example`, README, architecture/development notes.
- CI workflow for lint, typecheck and production build.

**Outstanding**
- Commit a generated `package-lock.json` and switch CI to deterministic `npm ci`.
- Reconcile and inspect the developer's actual local working tree and remote history. This audit environment cannot inspect `/Users/Purvesh/Projects/falchion-invoice`.
- Verify no secrets were committed using a secret scanner and history-aware review; a safe-looking current tree alone cannot prove history is clean.
- Confirm clean-checkout build and documented local/staging/production environment conventions.
- Add contribution/security reporting guidance if required by the team's operating model.

**Gate:** not passed.

### Phase 01 — Database and infrastructure

**Present**
- Server-only `mysql2/promise` pool with required environment validation and bounded pool settings.
- TLS option uses certificate verification when `DATABASE_SSL=true`.
- Health helper pings the database and suppresses raw driver errors.
- Two health route handlers and one initial SQL migration.

**Outstanding**
- Execute a real query against Aiven using the real connection configuration and verify TLS/certificate validation without printing secrets.
- Test invalid credentials, timeout, unreachable host, pool exhaustion and health response behavior.
- Add versioned migration tooling with migration history, failure behavior, repeatability policy, and tested recovery/rollback strategy.
- Add safe, repeatable seed tooling for non-production fixtures. Do not seed invented company/tax values into production.
- Define and test backups, retention, access policy, restore procedure and recovery objectives.
- Compare actual hosting, database, private object storage, email and job-service costs before provider commitment.
- Confirm health endpoints expose only the intended readiness signal and have an explicit public/internal deployment policy.

**Gate:** not passed. A SQL file in Git is not proof it has been applied.

### Phase 02 — Product requirements and business rules

**Present**
- `docs/phase-02-business-rules.md` documents lifecycle separation, snapshot immutability, server-side money calculation, idempotency, audit and key open business decisions.
- The initial schema reflects a subset of the documented concepts.

**Outstanding**
- Business owner must approve legal billing entities, numbering/financial-year policy, tax and rounding, currency, payment terms, cancellation/credit-note policy, roles, approval thresholds, overpayments/refunds and PDF rules.
- Turn the requirements into a traceable feature/acceptance checklist and link every requirement to code/tests.
- Implement and test the actual transitions and invariants.

**Gate:** not passed until unresolved business/legal choices are approved and traced.

### Phase 03 — Schema and API

**Present**
- Initial SQL schema for legal entities, brands, customers, invoice sequences, invoices, invoice lines, payments, allocations and audit events.
- Architecture notes, OpenAPI document and health routes.

**Outstanding**
- Missing first-class schema for users, roles/permissions, catalog items/services, quotations, approvals, reminders, email/outbox jobs, file/PDF metadata and configuration history.
- Review foreign-key integrity, cross-entity/brand scoping, uniqueness and indexes against confirmed requirements.
- Add migration history/tooling and schema integration tests against the target MySQL version.
- Implement API handlers/services and runtime validation; OpenAPI routes are mostly planned contracts, not implemented endpoints.
- Add contract tests and keep OpenAPI synchronized with implementation.
- Ensure issued document snapshots are protected from mutation through service permissions and tests, not just JSON columns or documentation.

**Gate:** not passed.

### Phase 04 — UI foundation

**Present**
- Basic app layout, landing page and global stylesheet.
- UI design specification.

**Outstanding**
- Implement reusable app shell/navigation, responsive page layouts, accessible components and real loading/empty/error/success/confirmation states.
- Build customer/catalog/invoice/payment/settings screens using implemented APIs.
- Add keyboard/accessibility and viewport testing.
- Do not display fabricated metrics or actions that are not functional.

**Gate:** not passed.

### Phase 05 — Authentication and authorization

**Present**
- Security requirements, proposed roles, permission identifiers and threat/test matrix.

**Outstanding**
- Select and approve an identity provider/authentication strategy.
- Implement login/logout, secure sessions/cookies, account deactivation/revocation, rate limiting, CSRF protections as applicable, and security-event audit.
- Enforce default-deny authorization in server-side route/service boundaries and scope queries/downloads by permitted legal entity.
- Add negative authorization, cross-entity access, revoked-account, CSRF/session and download/export tests.
- Configure production secrets and provider settings outside the repository.

**Gate:** not passed. Do not expose financial functionality publicly before this gate passes.

### Phase 06 — Company, brand and legal entity configuration

**Present**
- Detailed specification distinguishes platform operator, commercial brands and legal billing entities.
- Initial migration has minimal `legal_entities` and `brands` tables.

**Outstanding**
- Confirm real business mappings and legal/tax/bank information with authorized business owners; do not invent these values.
- Implement complete schema and version/effective-date history for invoice-affecting configuration.
- Build permission-protected create/edit/deactivate UI and server validation.
- Implement configuration readiness checks and block issuance for inactive or incomplete legal entities.
- Add audit, permissions and cross-entity leakage tests.
- Verify existing issued snapshots remain unchanged after configuration edits.

**Gate:** not passed.

## Repository-level issues to resolve first

1. **No lockfile:** generate and commit a real lockfile from the chosen Node/npm environment; then use `npm ci` in CI.
2. **No local-state verification:** the local project directory is not mounted in this audit environment. Do not claim local diff is clean or that local changes have been pushed.
3. **No real database verification:** CI uses placeholder environment values and does not connect to Aiven.
4. **Spec vs implementation:** phases 02–06 are predominantly requirements documents; endpoint names in OpenAPI do not mean routes exist.
5. **Schema is only a starting point:** it lacks several domain tables and has not been verified through an actual migration run against MySQL.
6. **Security gate is open:** there is no working authentication/authorization layer in the tracked source.
7. **No production readiness evidence:** no restore drill, private file storage, configured email provider, or deployment verification has been demonstrated.

## Required order of work

1. Reconcile local and remote source safely; generate the lockfile; run clean-checkout lint/typecheck/build and a secret scan.
2. Implement migration tooling, complete schema incrementally, seed non-production fixtures, and verify Aiven TLS with an actual query.
3. Get the remaining business decisions approved and link requirements to tests.
4. Select and implement authentication/RBAC before building protected business routes.
5. Implement legal-entity/brand configuration and customer/catalog services with migrations, audit and authorization.
6. Build the application shell and screens against working APIs.
7. Add transactional invoice/payment services, PDFs, email/jobs, backups/restore, and end-to-end tests before production sign-off.

## Sign-off rule

Do not mark any phase complete because its specification is committed or the current scaffold builds. Mark it complete only when its listed acceptance gates have evidence: code, automated tests, real infrastructure verification where applicable, and owner approval for business/legal decisions.
