# Contributing

## Before changing code

1. Use the supported Node.js version declared in `.nvmrc` and the npm version used by CI.
2. Pull the latest `main`; do not rewrite shared history or force-push.
3. Check `git status --short` and preserve unrelated local changes.
4. Create a focused branch for non-trivial work and open a pull request when practical.
5. Keep changes scoped, typed, and covered by tests.

## Required validation

Run these commands before requesting review:

```bash
npm ci
npm run lint
npm run typecheck
npm run build
```

Add or update automated tests for business rules, authorization, database behavior, and regressions. A successful build alone is not sufficient for financial or security-sensitive changes.

## Code standards

- Use Next.js App Router, React and TypeScript. Do not introduce Vite.
- Validate untrusted input on the server; never trust client-supplied totals or permissions.
- Use parameterized SQL and database transactions where operations must be atomic.
- Use exact decimal strings/DECIMAL for money; avoid binary floating-point calculations.
- Keep API error responses safe and do not return SQL errors, stack traces or secrets.
- Preserve issued invoice snapshots and audit sensitive actions.
- Keep components accessible and responsive.
- Document environment variables in `.env.example` using safe placeholders only.

## Commits and reviews

Use clear imperative commit messages, for example `fix(api): validate customer update input`. Review the diff for accidental secrets, generated files, unrelated changes and sensitive data before committing. Require CI to pass before merging. Do not bypass failing checks or use force-push to resolve conflicts.

## Data and secrets

Never commit `.env.local`, credentials, tokens, private keys, database dumps, customer records, issued invoices or production exports. Report suspected credential exposure immediately and rotate the affected credential; removing it from the latest commit is not enough if it entered Git history.
