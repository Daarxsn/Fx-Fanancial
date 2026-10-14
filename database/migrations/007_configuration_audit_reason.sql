-- Phase 6A: ensure configuration audit records retain an explicit change reason.
-- MySQL 8 / InnoDB. New migration only; never edit after it has been recorded.
-- Existing audit rows remain valid with a NULL reason because their original reason was
-- incorrectly stored in correlation_id and cannot be reconstructed with certainty.

ALTER TABLE audit_events
  ADD COLUMN change_reason VARCHAR(1000) NULL AFTER correlation_id;
