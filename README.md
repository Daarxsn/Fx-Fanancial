# Falchion Xeniaa Invoice Management System

Internal invoice management platform built with Next.js App Router, React, TypeScript, and MySQL.

## Current status

The repository contains ten forward-only MySQL migrations, database verification and repeatable reference seeding, local-password authentication/session security with RBAC, company/brand/legal-entity/tax/numbering/template configuration, and a transactionally guarded invoice-issue endpoint with immutable configuration snapshots. The developer has verified the dedicated Aiven development database and can sign in locally. This is not yet production sign-off: Phase 02 business/finance/tax approvals and provider/deployment readiness gates remain open, and PDF rendering/private delivery plus later-phase workflows are not claimed as complete. See the [Phase 00–06 implementation tracker](docs/phase-00-06-implementation-tracker.md), [current repository audit](docs/repository-audit-phase-00-06.md), and [closure gates](docs/phase-00-06-closure-gates.md).

## Architecture

- Next.js App Router (no Vite)
- React and TypeScript
- MySQL via mysql2 with TLS certificate verification required in production
- Vercel is a planned web-hosting option; production deployment is not implied by this repository
- Invoice PDFs require private object storage before production use

## Requirements

- Node.js 24 (see `.nvmrc`)
- npm supplied with the selected Node.js release
- MySQL 8 for database integration tests and migrations

## Local development

1. Clone the repository.
2. Copy `.env.example` to `.env.local` and set environment-specific values locally. Never commit `.env.local`.
3. Install the committed dependency graph and run checks:

```bash
npm ci
npm run lint
npm run typecheck
npm run build
npm run dev
```

Database commands:

```bash
npm run db:migrate
npm run db:seed:reference
```

Only run migrations against a database you are authorized to change. The reference seed creates permission/role definitions but intentionally does not create users or grant permissions. See [database migration operations](docs/database-migrations.md).

## Security and contribution

Never commit credentials, `.env.local`, database dumps, customer financial data, issued invoices or production exports. Read [SECURITY.md](SECURITY.md), [CONTRIBUTING.md](CONTRIBUTING.md), [environment conventions](docs/environments.md), and [development rules](docs/development.md) before contributing.


## Closure status — Phases 01–06

The `phase-01-06-closure` branch contains an audit and proposed brand/UI refinements before Phase 07 begins. It replaces the generic logo treatment with a scalable SVG reconstruction informed by the uploaded brand reference, aligns CSS tokens to Gold `#DCAF51`, Saffron Red `#931314`, Charcoal `#111111`, Platinum `#F4F4F5` and White `#FFFFFF`, and shows reconstructed POS/Digitech/Coworks invoice layouts as reference-only designs in Settings. These SVGs are **not pixel copies** of the original library files.

Phase 07 customer/catalog work has not started. The complete Phase 01–06 closure gates are tracked in [docs/phase-00-06-closure-gates.md](docs/phase-00-06-closure-gates.md). External business/finance/tax sign-off, a provider-level Aiven restore drill, approved production values, and manual visual QA remain open until independently completed.
