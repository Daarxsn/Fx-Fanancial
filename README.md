# Falchion Xeniaa Invoice Management System

Internal invoice management platform built with Next.js App Router, React, TypeScript, and MySQL.

## Current status

The repository contains the application scaffold, database pool/health checks, initial and expansion migrations, a migration runner, API validation/authorization primitives, early customer/catalog APIs, and CI. The full invoice workflow is not yet production-ready. See the [Phase 00–06 implementation tracker](docs/phase-00-06-implementation-tracker.md) and [repository audit](docs/repository-audit-phase-00-06.md) for open acceptance gates.

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
