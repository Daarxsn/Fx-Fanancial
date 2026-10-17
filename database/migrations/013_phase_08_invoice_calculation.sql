-- Phase 08: draft invoice calculation inputs and server-authoritative totals.
-- Forward-only MySQL 8 migration. Preserve Phase 6B immutable issuance safeguards.
-- All money and quantity remain DECIMAL(19,4); configured tax rates remain percentages DECIMAL(9,6).
ALTER TABLE invoices
  ADD COLUMN record_version INT UNSIGNED NOT NULL DEFAULT 1 AFTER lifecycle_status,
  ADD KEY ix_invoices_entity_status_date (legal_entity_id, lifecycle_status, invoice_date, id),
  ADD CONSTRAINT ck_invoices_record_version_positive CHECK (record_version >= 1);
ALTER TABLE invoice_lines
  ADD COLUMN line_kind ENUM('ITEM','CHARGE') NOT NULL DEFAULT 'ITEM' AFTER line_number,
  ADD COLUMN discount_type ENUM('AMOUNT','PERCENT') NOT NULL DEFAULT 'AMOUNT' AFTER discount_amount,
  ADD COLUMN discount_value DECIMAL(19,4) NOT NULL DEFAULT 0.0000 AFTER discount_type,
  ADD COLUMN tax_calculation_mode ENUM('EXCLUSIVE','INCLUSIVE') NOT NULL DEFAULT 'EXCLUSIVE' AFTER tax_registration_id,
  ADD CONSTRAINT ck_invoice_line_discount_value_nonnegative CHECK (discount_value >= 0);
