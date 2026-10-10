# Database backup, restoration, and access policy

**Scope:** Falchion Invoice MySQL 8 / Aiven candidate deployment  
**Status:** Access/backup policy defined. CI demonstrated a logical dump/restore with synthetic MySQL 8 data on 2026-10-10; this does not prove provider-managed Aiven backup retention or a production recovery drill.

## 1. Data classification and access

Invoice, customer, tax, payment, audit, and document metadata are confidential business/financial data.

- Use separate credentials for local development, CI, staging, migrations, backups, and application runtime. Do not reuse a production credential in local development or CI.
- The runtime account should have only the DML privileges needed by application services. Use a separate migration account for schema DDL, and a backup account with the minimum read/lock/metadata privileges supported by the selected backup tool.
- Do not use the database administrator account in the deployed application.
- Require TLS with certificate/hostname validation for remote connections. Production must set `DATABASE_SSL=true`; never downgrade to plaintext to work around a connection failure.
- Restrict network ingress to approved service egress addresses/private networking where supported. Rotate credentials after suspected exposure or staff/access changes.
- Grant database access individually, record the business purpose and expiry for temporary access, and review access at least quarterly and on role changes.
- Never include passwords, connection URLs, query parameters containing secrets, customer data, or raw driver errors in application logs, CI logs, tickets, or screenshots.
- Store exported backups encrypted at rest in a private destination with separate access controls. Never store backup files in Git, public buckets, or the web application's public directory.

## 2. Managed backups and targets

Aiven's published MySQL documentation describes daily full backups and continuously recorded binary logs for point-in-time recovery. Backup retention depends on the selected service plan; confirm the actual plan's retention and restore options in the Aiven Console before relying on them.

Operational policy to approve before production:
- Verify the managed backup schedule and retention after creating/upgrading the service.
- Target recovery point objective (RPO): 24 hours maximum data loss for the initial release, with point-in-time recovery used where available. Business owner must approve this target.
- Target recovery time objective (RTO): 4 hours to restore database service for the initial release. Business owner must approve this target and adjust for service size.
- In addition to managed backups, create an encrypted logical export at least daily when production data is present. Keep 7 daily and 4 weekly copies in a separate private storage location, subject to retention/legal requirements.
- Keep encryption keys separate from the storage account and backup data. Limit restore/decrypt privileges to designated operators.
- Monitor backup freshness and alert when a backup/export misses its defined schedule. Do not treat a backup job's exit code as proof of restorability.

## 3. Encrypted logical backup (operator procedure)

Use a trusted MySQL client that supports TLS verification. Obtain the CA certificate from the database provider's authenticated console and store it outside the repository. Do not paste credentials into shell history.

Example (the client prompts for the password; output is written to a local file):

```bash
umask 077
mkdir -p "$HOME/private-db-backups"
chmod 700 "$HOME/private-db-backups"
mysqldump \
  --host="$DATABASE_HOST" \
  --port="$DATABASE_PORT" \
  --user="$DATABASE_USER" \
  --password \
  --ssl-mode=VERIFY_IDENTITY \
  --ssl-ca="$AIVEN_CA_CERT_PATH" \
  --single-transaction \
  --routines --triggers --events --hex-blob \
  "$DATABASE_NAME" > "$HOME/private-db-backups/falchion-$(date +%Y%m%dT%H%M%S).sql"
```

The shell must have `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_USER`, `DATABASE_NAME`, and `AIVEN_CA_CERT_PATH` set locally. The password is entered at the client prompt, not as a command-line argument. A successful dump still needs to be encrypted before it is transferred to off-host storage. Confirm the backup file is non-empty, record its checksum and completion time, and securely remove temporary plaintext after verifying the encrypted copy.

## 4. Restoration drill and recovery

- At least monthly, restore the latest backup to a separate disposable database/service. Never test restoration by overwriting production.
- Record backup timestamp, source revision/schema migration versions, restore start/end, row/table verification, and the operator who approved the test. Do not include sensitive rows in the evidence.
- Verify schema and migration ledger, table counts, sample aggregates, character encoding, and application smoke tests; verify that access controls remain least-privilege after restore.
- For point-in-time recovery, restore to a new service/database and validate it before changing application configuration.
- Keep a written cutover/rollback plan. Do not reverse production DDL blindly. Prefer an approved forward-fix migration when a destructive rollback could lose financial history.
- A test restore in CI validates the dump/restore mechanics for a synthetic MySQL database. It does not prove the provider's production backups, retention, or RPO/RTO.

## 5. Incident response

If credentials or a backup are exposed: revoke/rotate the affected credential, restrict access, assess access logs and affected data, preserve evidence, notify the designated security/business owner, and document remediation. Do not delete logs needed for investigation.
