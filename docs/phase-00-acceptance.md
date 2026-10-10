# Phase 00 — Repository and Application Foundation

## Acceptance checklist

- [x] Repository exists and is public.
- [x] Architecture and development guidance committed.
- [x] Safe environment template and secret-ignore rules committed.
- [x] Next.js App Router scaffold files committed.
- [x] CI workflow runs locked dependency installation, lint, TypeScript, secret scanning and production build.
- [x] Node.js major version documented in `.nvmrc`.
- [x] Contribution, security reporting and environment conventions committed.
- [x] `package-lock.json` is committed and `npm ci` passes on GitHub Actions.
- [x] Lockfile bootstrap workflow passes on the current repository revision.
- [x] Main CI passes on the current repository revision.
- [x] A clean GitHub Actions checkout installs dependencies, lints, type-checks and builds using documented Node.js 24 setup.
- [ ] Developer Mac working tree is verified clean and `main` is synchronized with `origin/main`.
- [x] Gitleaks secret scan passed on the current repository revision after checkout was configured to fetch full Git history.

## Evidence

- Current verified revision at the time of this record: `2121950b4fe3c1b9130f9ad8c45813261082df2b`.
- CI: https://github.com/Daarxsn/Fx-Fanancial/actions/runs/38028829948 — success.
- Lockfile bootstrap: https://github.com/Daarxsn/Fx-Fanancial/actions/runs/38028829946 — success.
- CI checkout uses `fetch-depth: 0`, so Gitleaks can inspect the intended Git history range. The earlier failure was caused by shallow history, not by a reported secret.
- `.nvmrc`, `package.json`, `package-lock.json`, `.env.example`, `.gitignore`, `CONTRIBUTING.md`, `SECURITY.md`, and `docs/environments.md` are committed.

## Environment conventions

- Local development: `.env.local`, dedicated non-production database and synthetic fixtures.
- CI/test: locked installs and build-only placeholders or disposable services; never production credentials/data.
- Staging: separate services and credentials; synthetic or approved sanitized data.
- Production: deployment-managed secrets, TLS, restricted access, backups and monitoring.

## Remaining sign-off

The only remaining Phase 00 acceptance item is a local confirmation from the developer's Mac that the pull completed and the working tree is clean. GitHub Actions cannot inspect the local working tree. Run:

```bash
git status -sb
git rev-parse HEAD
git rev-parse origin/main
```

Sign off Phase 00 only when `git status -sb` shows no modified/untracked files and the two hashes match the latest `origin/main` revision.

Phase 00 covers repository and application foundation. It does not imply database integration, migration execution, backup/restore drills or later application phases are complete.
