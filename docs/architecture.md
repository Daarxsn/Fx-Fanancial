# System Architecture

## Application

The application uses the Next.js App Router, React and TypeScript. Database access and sensitive operations remain server-side. Server-only modules must not be imported into client components.

## Data layer

- MySQL is the relational data store.
- `mysql2/promise` provides database access.
- Credentials are loaded from environment variables.
- TLS certificate verification must remain enabled.
- Schema changes must be tracked through versioned migrations.
- Financial values use exact decimal representations in the database.
- Transactions protect operations that require atomicity.

## Business boundaries

The parent company, brands and legal billing entities are distinct concepts. Do not assume every brand is a separate legal entity or has its own tax registration. Invoice lifecycle, payment state, approval state and communication-delivery state must be modeled independently.

## Invoice integrity

Drafts may be edited according to permissions. Issued invoices preserve an immutable snapshot of billing identity, customer details, line items, tax calculations and totals used at issuance. Corrections, cancellations and credit notes follow explicit, auditable business rules. Issued originals must not be silently overwritten. Invoice numbering must be unique and safe under concurrent requests.

## File storage

Issued documents and sensitive attachments use private storage. Downloads require server-side authorization. Source control must never contain real invoice PDFs or customer financial data.

## External services

The web application may be hosted on Vercel. MySQL, private file storage, email delivery and durable scheduled jobs are separate service concerns. Provider choices must account for current price, limits, region and reliability.

## Deployment

Development, preview and production environments must be isolated. Secrets are configured through environment settings, not committed. Production migrations require safeguards, compatibility checks and a recovery plan.
