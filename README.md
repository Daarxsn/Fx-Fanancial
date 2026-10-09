# Falchion Xeniaa Invoice Management System

Internal invoice management platform built with Next.js App Router, React, TypeScript, and MySQL.

## Status

Phase 00: repository documentation and foundation in progress. The existing local application has not yet been pushed to this repository.

## Architecture

- Next.js App Router (no Vite)
- React and TypeScript
- MySQL via mysql2, with TLS certificate verification
- Vercel as intended web hosting
- Private storage for issued invoice PDFs

## Development checks

```bash
npm ci
npm run lint
npx tsc --noEmit
npm run build
```

Never commit `.env.local`, secrets, database dumps, or customer financial data.

See [architecture](docs/architecture.md) and [development rules](docs/development.md).
