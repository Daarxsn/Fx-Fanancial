# Development and Security Rules

## Required workflow

1. Inspect Git status before editing.
2. Make a focused change with a clear purpose.
3. Run lint, TypeScript and relevant tests.
4. Run the production build for meaningful application changes.
5. Review the staged diff before committing.
6. Never commit credentials or sensitive business data.

## Commands

```bash
npm ci
npm run dev
npm run lint
npx tsc --noEmit
npm run build
```

## Environment variables

Local credentials belong in `.env.local`. `.env.example` may contain variable names and safe placeholders only. Never commit real passwords, tokens, private keys, or production credentials.

## Security

- Validate input on the server.
- Enforce authorization on every protected operation.
- Use parameterized database queries.
- Keep TLS certificate verification enabled.
- Avoid logging credentials, session tokens or sensitive financial data.
- Use private file storage for invoices and attachments.
- Apply least-privilege access to databases and external services.

## Financial correctness

- Perform authoritative calculations on the server.
- Use decimal-safe representations for money.
- Document tax and rounding rules.
- Use transactions for atomic financial operations.
- Make retryable operations idempotent where appropriate.
- Preserve immutable issued-invoice snapshots.
- Record auditable history for sensitive changes.

## Production safety

Do not run destructive commands or production migrations without review. Do not use force-push to bypass repository history. A successful build does not prove database connectivity, authorization, email delivery or production behavior have been tested.
