-- Phase 03 schema refinement: immutable issue evidence, note numbering, typed workflow links.
-- MySQL 8.0+. Forward-only: do not edit previously applied migrations 001/002.
-- Review any pre-existing business rows before production; MySQL DDL may partially commit on failure.

-- Keep number sequences distinct by legal entity, financial year and document type.
ALTER TABLE invoice_sequences
  ADD COLUMN document_type ENUM('INVOICE','CREDIT_NOTE','DEBIT_NOTE') NOT NULL DEFAULT 'INVOICE' AFTER financial_year,
  DROP INDEX uq_invoice_sequence_scope,
  ADD UNIQUE KEY uq_invoice_sequence_scope (legal_entity_id, financial_year, document_type);

-- Preserve credit/debit note lineage and ensure the number uniqueness scope includes document type.
ALTER TABLE invoices
  MODIFY COLUMN document_type ENUM('INVOICE','CREDIT_NOTE','DEBIT_NOTE') NOT NULL DEFAULT 'INVOICE',
  ADD COLUMN related_invoice_id CHAR(36) NULL AFTER brand_id,
  ADD COLUMN adjustment_reason VARCHAR(1000) NULL AFTER cancellation_reason,
  DROP INDEX uq_invoice_number,
  ADD UNIQUE KEY uq_invoice_number_scope (legal_entity_id, financial_year, document_type, invoice_number),
  ADD KEY ix_invoices_entity_date (legal_entity_id, invoice_date, id),
  ADD KEY ix_invoices_related_invoice (related_invoice_id),
  ADD CONSTRAINT fk_invoices_related_invoice FOREIGN KEY (related_invoice_id) REFERENCES invoices(id) ON DELETE RESTRICT;

-- Keep the selected catalog/tax rule as a draft reference; issue-time rule values are captured in the snapshot.
ALTER TABLE invoice_lines
  ADD COLUMN catalog_item_id CHAR(36) NULL AFTER invoice_id,
  ADD COLUMN tax_code VARCHAR(80) NULL AFTER tax_rate,
  ADD COLUMN tax_rule_id CHAR(36) NULL AFTER tax_code,
  ADD KEY ix_invoice_lines_catalog_item (catalog_item_id),
  ADD KEY ix_invoice_lines_tax_rule (tax_rule_id),
  ADD CONSTRAINT fk_invoice_lines_catalog_item FOREIGN KEY (catalog_item_id) REFERENCES catalog_items(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_invoice_lines_tax_rule FOREIGN KEY (tax_rule_id) REFERENCES tax_rules(id) ON DELETE RESTRICT;

-- Immutable issue-time evidence: application DB role must have INSERT/SELECT but no UPDATE/DELETE on this table.
-- snapshot_json includes supplier/customer values, ordered lines, applied tax rule values, totals, currency,
-- dates, numbering-policy version and rounding/calculation-policy version.
CREATE TABLE IF NOT EXISTS invoice_issue_snapshots (
  id CHAR(36) NOT NULL PRIMARY KEY,
  invoice_id CHAR(36) NOT NULL,
  schema_version VARCHAR(32) NOT NULL,
  calculation_policy_version VARCHAR(80) NOT NULL,
  snapshot_json JSON NOT NULL,
  snapshot_sha256 CHAR(64) NOT NULL,
  created_by CHAR(36) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_invoice_issue_snapshot (invoice_id),
  UNIQUE KEY uq_invoice_issue_snapshot_hash (invoice_id, snapshot_sha256),
  CONSTRAINT fk_issue_snapshot_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE RESTRICT,
  CONSTRAINT fk_issue_snapshot_actor FOREIGN KEY (created_by) REFERENCES app_users(id) ON DELETE RESTRICT,
  CONSTRAINT ck_issue_snapshot_hash CHECK (snapshot_sha256 REGEXP '^[0-9a-f]{64}$')
) ENGINE=InnoDB;

-- Separate quotation counter; quotations never consume invoice/credit/debit-note sequences.
CREATE TABLE IF NOT EXISTS quotation_sequences (
  id CHAR(36) NOT NULL PRIMARY KEY,
  legal_entity_id CHAR(36) NOT NULL,
  financial_year VARCHAR(20) NOT NULL,
  last_number BIGINT UNSIGNED NOT NULL DEFAULT 0,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_quotation_sequence_scope (legal_entity_id, financial_year),
  CONSTRAINT fk_quotation_sequences_entity FOREIGN KEY (legal_entity_id) REFERENCES legal_entities(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

-- Record receipt reversal separately rather than relying only on mutable status columns.
-- Initial contract is one full reversal per receipt; partial reversals require an approved future policy.
CREATE TABLE IF NOT EXISTS payment_reversal_events (
  id CHAR(36) NOT NULL PRIMARY KEY,
  payment_id CHAR(36) NOT NULL,
  amount DECIMAL(19,4) NOT NULL,
  currency CHAR(3) NOT NULL,
  reason VARCHAR(1000) NOT NULL,
  reversed_by CHAR(36) NOT NULL,
  reversed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  idempotency_key VARCHAR(160) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_payment_reversal_once (payment_id),
  UNIQUE KEY uq_payment_reversal_idempotency (idempotency_key),
  KEY ix_payment_reversal_actor_date (reversed_by, reversed_at),
  CONSTRAINT fk_payment_reversal_payment FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE RESTRICT,
  CONSTRAINT fk_payment_reversal_actor FOREIGN KEY (reversed_by) REFERENCES app_users(id) ON DELETE RESTRICT,
  CONSTRAINT ck_payment_reversal_amount CHECK (amount > 0)
) ENGINE=InnoDB;

-- Add an explicit legal-entity scope and typed foreign-key targets to approval requests.
-- resource_type/resource_id remain during transition for compatibility; newly written rows must use
-- exactly one typed target (invoice_id or quotation_id) and set legal_entity_id in service validation.
ALTER TABLE approval_requests
  ADD COLUMN legal_entity_id CHAR(36) NULL AFTER resource_id,
  ADD COLUMN invoice_id CHAR(36) NULL AFTER legal_entity_id,
  ADD COLUMN quotation_id CHAR(36) NULL AFTER invoice_id,
  ADD KEY ix_approval_entity_inbox (legal_entity_id, status, requested_at),
  ADD CONSTRAINT fk_approval_entity FOREIGN KEY (legal_entity_id) REFERENCES legal_entities(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_approval_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_approval_quotation FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE RESTRICT;

-- Actor references are now enforceable because app_users exists after migration 002.
ALTER TABLE invoices
  ADD CONSTRAINT fk_invoices_issued_by_user FOREIGN KEY (issued_by) REFERENCES app_users(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_invoices_cancelled_by_user FOREIGN KEY (cancelled_by) REFERENCES app_users(id) ON DELETE RESTRICT;

ALTER TABLE payments
  ADD CONSTRAINT fk_payments_recorded_by_user FOREIGN KEY (recorded_by) REFERENCES app_users(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_payments_reversed_by_user FOREIGN KEY (reversed_by) REFERENCES app_users(id) ON DELETE RESTRICT;

ALTER TABLE audit_events
  ADD CONSTRAINT fk_audit_actor_user FOREIGN KEY (actor_id) REFERENCES app_users(id) ON DELETE RESTRICT;
