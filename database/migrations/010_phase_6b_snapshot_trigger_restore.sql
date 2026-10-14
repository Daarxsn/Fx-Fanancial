-- Phase 6B: make snapshot immutability triggers round-trip cleanly through mysqldump.
-- MySQL 8 / InnoDB. Forward-only migration; do not edit after application.
-- Migration 009 introduced the guards; this migration changes the trigger bodies to compound blocks
-- so logical dump/restore preserves them consistently.

DROP TRIGGER IF EXISTS trg_document_config_snapshot_no_update;
DROP TRIGGER IF EXISTS trg_document_config_snapshot_no_delete;

CREATE TRIGGER trg_document_config_snapshot_no_update
BEFORE UPDATE ON document_configuration_snapshots
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Document configuration snapshots are immutable';
END;

CREATE TRIGGER trg_document_config_snapshot_no_delete
BEFORE DELETE ON document_configuration_snapshots
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Document configuration snapshots are immutable';
END;
