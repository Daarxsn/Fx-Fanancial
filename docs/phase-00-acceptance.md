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
- [x] Developer Mac working tree is verified clean and `main` is synchronized with `origin/main`.
- [x] Gitleaks secret scan passed on the current repository revision after checkout was configured to fetch full Git history.

## Evidence

- Current verified revision at the time of this record: `2121950b4fe3c1b9130f9ad8c45813261082df2b`.
- CI: https://github.com/Daarxsn/Fx-Fanancial/actions/runs/38029253509 — success for the tracked revision before this documentation update.
- Lockfile bootstrap: https://github.com/Daarxsn/Fx-Fanancial/actions/runs/38029253557 — success for the tracked revision before this documentation update.
- CI checkout uses `fetch-depth: 0`, so Gitleaks can inspect the intended Git history range. The earlier failure was caused by shallow history, not by a reported secret.
- `.nvmrc`, `package.json`, `package-lock.json`, `.env.example`, `.gitignore`, `CONTRIBUTING.md`, `SECURITY.md`, and `docs/environments.md` are committed.

## Environment conventions

- Local development: `.env.local`, dedicated non-production database and synthetic fixtures.
- CI/test: locked installs and build-only placeholders or disposable services; never production credentials/data.
- Staging: separate services and credentials; synthetic or approved sanitized data.
- Production: deployment-managed secrets, TLS, restricted access, backups and monitoring.

## Sign-off

Developer confirmed on 2026-10-10 that `git pull --ff-only origin main` succeeded, `git status -sb` showed `## main...origin/main` with no modified or untracked files, and both `git rev-parse HEAD` and `git rev-parse origin/main` returned `b295af5df234b4b000116618e35b1914700e457f`.

Phase 00 acceptance criteria are complete for the repository and application foundation. The workflow evidence is from the preceding tested revision; this documentation-only update triggers CI again. Reconfirm the updated run before treating its latest commit as CI-verified.

Phase 00 covers repository and application foundation. It does not imply database integration, migration execution, backup/restore drills or later application phases are complete.
