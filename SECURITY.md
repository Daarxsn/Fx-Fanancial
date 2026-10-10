# Security Policy

## Reporting a vulnerability

Do not publish exploitable details, credentials, customer information, or production data in a public issue. Contact the repository owner privately through GitHub's private vulnerability reporting feature if enabled, or use a private communication channel already agreed with the maintainers. Include affected commit/version, impact, reproduction steps and a suggested mitigation where safe.

## Handling requirements

- Keep secrets out of source control and logs.
- Store production credentials only in the deployment platform's secret store.
- Require TLS certificate verification for production database connections.
- Use least-privilege database and service credentials.
- Enforce authentication, permission checks and legal-entity scope server-side.
- Protect invoice PDFs and attachments with private storage and short-lived authorized access.
- Do not expose stack traces, SQL messages, tokens or sensitive financial data in API errors.
- Audit sensitive access and mutations while minimizing personal/financial data in audit payloads.
- Rotate credentials promptly if exposure is suspected and investigate the complete Git history.

## Scope and release gate

A green CI run is not a security certification. Before production, verify secret scanning, dependency advisories, authentication/session behavior, cross-entity authorization, backups and restoration, private artifact access and incident recovery procedures.
