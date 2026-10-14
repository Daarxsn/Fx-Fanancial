-- Phase 6A: preserve billing addresses and effective-dated mapping history.
-- MySQL 8 / InnoDB. Forward-only migration; do not edit after application.
-- Existing brand mappings without a start date are normalized to their recorded creation date.

ALTER TABLE legal_entities
  ADD COLUMN billing_address_json JSON NULL AFTER address_json;

UPDATE brand_legal_entities
   SET effective_from = DATE(created_at)
 WHERE effective_from IS NULL;

ALTER TABLE brand_legal_entities
  MODIFY effective_from DATETIME(3) NOT NULL,
  MODIFY effective_until DATETIME(3) NULL,
  DROP PRIMARY KEY,
  ADD PRIMARY KEY (brand_id, legal_entity_id, effective_from),
  ADD KEY ix_brand_entity_effective (legal_entity_id, effective_from, effective_until);

ALTER TABLE business_unit_legal_entities
  MODIFY effective_from DATETIME(3) NOT NULL,
  MODIFY effective_until DATETIME(3) NULL,
  DROP PRIMARY KEY,
  ADD PRIMARY KEY (business_unit_id, legal_entity_id, effective_from),
  ADD KEY ix_unit_entity_period (legal_entity_id, effective_from, effective_until);

ALTER TABLE brand_business_units
  MODIFY effective_from DATETIME(3) NOT NULL,
  MODIFY effective_until DATETIME(3) NULL,
  DROP PRIMARY KEY,
  ADD PRIMARY KEY (brand_id, business_unit_id, effective_from),
  ADD KEY ix_brand_unit_period (business_unit_id, effective_from, effective_until);
