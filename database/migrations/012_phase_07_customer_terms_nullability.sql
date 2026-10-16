-- Phase 07 follow-up: distinguish an explicitly approved zero-day term from unknown terms.
-- Migration 011 is immutable; its initial zero default is removed before the field is exposed
-- as a business setting. No issue-time invoice snapshots are modified.
ALTER TABLE customers
  MODIFY COLUMN payment_terms_days SMALLINT UNSIGNED NULL DEFAULT NULL;
UPDATE customers SET payment_terms_days = NULL WHERE payment_terms_days = 0;
