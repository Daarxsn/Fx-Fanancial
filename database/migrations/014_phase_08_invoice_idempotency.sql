-- Phase 08 follow-up: bind invoice draft idempotency keys to the first accepted request payload.
-- Forward-only MySQL 8 migration.
ALTER TABLE invoices
  ADD COLUMN idempotency_payload_sha256 CHAR(64) NULL AFTER idempotency_key,
  ADD CONSTRAINT ck_invoice_idempotency_payload_hash CHECK (
    idempotency_payload_sha256 IS NULL OR idempotency_payload_sha256 REGEXP '^[0-9a-f]{64}$'
  );
