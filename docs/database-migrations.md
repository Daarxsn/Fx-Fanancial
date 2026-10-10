# Database migration and connectivity operations

## Environment and safety

- Install with `npm ci` under Node.js 24.
- Local CLI scripts load `.env.local` first and then `.env` without replacing variables already supplied by the shell. Real values belong only in ignored `.env.local` or deployment secret stores.
- Required variables: `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_NAME`, `DATABASE_USER`, `DATABASE_PASSWORD`, `DATABASE_SSL`.
- Production must set `DATABASE_SSL=true`. The runtime pool, migration runner and seed script require TLS in production and validate server certificates.
- Use a dedicated development/integration database. Never point the migration or seed scripts at production during development.
- Migrations use MySQL multi-statements. MySQL DDL is not generally transactional; a failure can leave a partially applied migration. Stop, inspect the schema, restore from a verified backup or follow an approved repair procedure, then continue. Never edit an already-applied migration; add a new numbered migration.

## Verify a real remote TLS connection

From the repository root, after populating the required values in `.env.local` using the provider's connection details and CA guidance, run:

```bash
npm run db:verify
```

The command is intentionally strict: it refuses `DATABASE_SSL=false`, connects with `rejectUnauthorized: true`, performs `SELECT 1`, and checks that MySQL reports a non-empty `Ssl_cipher`. Success prints only a pass statement and TLS verification setting. Failure prints a generic error to avoid leaking hosts, account names, or database details. The Aiven TLS completion gate is not met until this command actually passes against the configured Aiven service.

Aiven supplies a per-service host and port and provides a project CA certificate in the service's connection information. Use the CA/hostname validation supported by the Node MySQL client and never disable certificate validation to work around certificate errors. See [Aiven's MySQL CLI connection guide](https://aiven.io/docs/products/mysql/howto/connect-from-cli).

## Apply pending migrations

Against a known, disposable database first:

```bash
npm run db:migrate
npm run db:migrate
```

The runner applies sorted SQL files from `database/migrations`, stores each successful filename and SHA-256 checksum in `schema_migrations`, and rejects a changed migration whose version is already recorded. The second command verifies that repeat execution is safe. The repository CI does this against a fresh MySQL 8 service.

## Seed safe reference records

```bash
npm run db:seed:reference
npm run db:seed:reference
```

This seed is idempotent and creates permission and role definitions only. It creates no user accounts and grants no permissions to roles; assign grants only after approval of the access-control policy. Reference seeding is blocked in production by default.

## Test evidence and scope

CI runs migrations 001 and 002 against a fresh disposable MySQL 8 instance, repeats the migration and seed commands, validates the migration ledger, asserts the deliberately broken connection path fails without printing connection details, and restores a logical dump into a separate database to compare base-table and migration-ledger counts.

CI's disposable, non-TLS database proves schema compatibility and operational mechanics; it does not prove connectivity to the live Aiven instance, CA/hostname verification, managed-provider backup retention, or real production restoration.

## Production preconditions

- Complete `npm run db:verify` against Aiven with TLS and certificate verification.
- Verify migration status and inspect schema using an authorized account.
- Review each migration and recovery plan before a production change.
- Verify the managed backup schedule/retention in the provider console and complete a separate-service restoration drill.
- Apply least-privilege runtime/migration/backup access policies.
- Review the current provider pricing and confirm budget before subscribing to a paid tier.
