-- Phase 6B: bind invoice lines to approved tax configuration and make issue retries idempotent.
-- MySQL 8 / InnoDB. Forward-only migration; never edit after application.
-- Existing drafts retain NULL tax references and must be revalidated before issuance.

ALTER TABLE invoices
  ADD COLUMN issue_idempotency_key VARCHAR(128) NULL AFTER idempotency_key,
  DROP INDEX uq_invoice_number,
  ADD UNIQUE KEY uq_invoice_number_entity_type (legal_entity_id, document_type, financial_year, invoice_number),
  ADD UNIQUE KEY uq_invoice_issue_idempotency (legal_entity_id, issue_idempotency_key);

ALTER TABLE invoice_lines
  ADD COLUMN tax_code VARCHAR(80) NULL AFTER tax_rate,
  ADD COLUMN tax_rule_id CHAR(36) NULL AFTER tax_code,
  ADD COLUMN tax_registration_id CHAR(36) NULL AFTER tax_rule_id,
  ADD KEY ix_invoice_lines_tax_rule (tax_rule_id),
  ADD KEY ix_invoice_lines_tax_registration (tax_registration_id),
  ADD CONSTRAINT fk_invoice_line_tax_rule FOREIGN KEY (tax_rule_id) REFERENCES tax_rules(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_invoice_line_tax_registration FOREIGN KEY (tax_registration_id) REFERENCES legal_entity_tax_registrations(id) ON DELETE RESTRICT;

-- Configuration snapshots are append-only records tied to the transaction that issues a document.
CREATE TRIGGER trg_document_config_snapshot_no_update
BEFORE UPDATE ON document_configuration_snapshots
FOR EACH ROW
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Document configuration snapshots are immutable';

CREATE TRIGGER trg_document_config_snapshot_no_delete
BEFORE DELETE ON document_configuration_snapshots
FOR EACH ROW
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Document configuration snapshots are immutable';
