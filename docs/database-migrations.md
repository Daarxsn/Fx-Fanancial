# Database migration operations

## Preconditions

- Use a dedicated database for local development or integration tests.
- Confirm the selected host/database and current backup before applying migrations.
- Production must set `DATABASE_SSL=true`; the migration runner refuses plaintext in production.
- Set the required `DATABASE_*` values in your local ignored `.env.local` or deployment secret store. Never commit or paste credentials.
- Migrations run with MySQL multi-statements enabled. MySQL DDL is not generally transactional: a failure can leave a partially applied migration. Stop, inspect the schema, recover from a verified backup or approved repair procedure, and only then continue. Never edit an already-applied migration; add a new numbered migration.

## Apply pending migrations

After installing project dependencies:

```bash
npm run db:migrate
```

The runner applies SQL files in lexical order from `database/migrations`, records each successful file and SHA-256 checksum in `schema_migrations`, and rejects a changed file whose version has already been recorded. It stops on first failure. It does not seed production data and does not claim a migration is safe merely because the runner exists.

## Verify a real connection

Use the health endpoint only after the deployment environment is configured. It pings the database and returns a generic status; it does not prove that all migrations are applied. For migration verification, inspect `schema_migrations` using an authorized database client without printing credentials in logs.

## Still required before production

- Run the migrations against a disposable MySQL 8 database and review the resulting schema.
- Test connection failure paths and a valid TLS connection to Aiven.
- Perform and record a backup/restore drill.
- Review each migration and its recovery plan.
- Confirm current provider pricing and production access controls.
