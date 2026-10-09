# Phase 00 — Repository and Application Foundation

- [x] Repository exists and is public.
- [x] Architecture and development guidance committed.
- [x] Safe environment template and secret-ignore rules committed.
- [x] Next.js App Router scaffold files committed.
- [x] CI workflow configured for locked installs, lint, TypeScript, secret scanning and production build.
- [x] Node.js major version documented in `.nvmrc`.
- [x] Contribution, security reporting and environment conventions committed.
- [x] `package-lock.json` generated and committed on `main` in commit `3cc779dc0c`.
- [ ] Verify the committed lockfile matches `package.json` through a fresh `npm ci` run on the latest commit.
- [ ] The lockfile bootstrap workflow passes `npm ci`, lint, typecheck and production build and commits the lockfile.
- [ ] Main CI passes after the lockfile commit.
- [ ] A clean clone can install and build using only documented steps.
- [ ] Local working tree is reconciled with remote `main` and verified clean.
- [ ] Secret scan has passed over the tracked repository and Git history; any historical exposure has been assessed and rotated if needed.

## Current limitations

This repository audit can commit GitHub files and inspect remote CI but cannot inspect the developer's Mac working tree or run commands on that machine. The lockfile bootstrap workflow generates and tests the lockfile in GitHub Actions; do not consider Phase 00 signed off until the resulting commit exists and all remaining gates are evidenced.

Phase 00 is not signed off until every unchecked item passes.
