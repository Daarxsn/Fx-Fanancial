-- Phase 08: preserve the unit used on the invoice line itself.
-- Invoice unit codes are snapshotted per line and do not follow later catalog edits.
ALTER TABLE invoice_lines
  ADD COLUMN unit_code VARCHAR(40) NOT NULL DEFAULT 'unit' AFTER description;
