-- Phase 06B: first-class business units and versioned legal-entity tax registrations.
-- MySQL 8 / InnoDB. Forward-only; never alter this file after it is recorded in schema_migrations.
-- This migration creates structure only. It does not add real company, tax or business-unit data.

CREATE TABLE IF NOT EXISTS legal_entity_tax_registrations (
  id CHAR(36) NOT NULL PRIMARY KEY,
  legal_entity_id CHAR(36) NOT NULL,
  registration_key VARCHAR(100) NOT NULL,
  version_number INT UNSIGNED NOT NULL,
  registration_type ENUM('GSTIN','VAT','TAX_ID','COMPANY_REGISTRATION','OTHER') NOT NULL,
  jurisdiction VARCHAR(120) NOT NULL,
  registration_number VARCHAR(160) NOT NULL,
  display_label VARCHAR(160) NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  effective_from DATE NOT NULL,
  effective_until DATE NULL,
  approval_reference VARCHAR(255) NOT NULL,
  approved_by CHAR(36) NOT NULL,
  approved_at DATETIME(3) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by CHAR(36) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_tax_registration_version (legal_entity_id, registration_key, version_number),
  KEY ix_tax_registration_effective (legal_entity_id, registration_type, is_active, effective_from, effective_until),
  CONSTRAINT fk_tax_registration_entity FOREIGN KEY (legal_entity_id) REFERENCES legal_entities(id) ON DELETE RESTRICT,
  CONSTRAINT fk_tax_registration_approver FOREIGN KEY (approved_by) REFERENCES app_users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_tax_registration_creator FOREIGN KEY (created_by) REFERENCES app_users(id) ON DELETE RESTRICT,
  CONSTRAINT ck_tax_registration_dates CHECK (effective_until IS NULL OR effective_until >= effective_from)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS business_units (
  id CHAR(36) NOT NULL PRIMARY KEY,
  code VARCHAR(40) NOT NULL,
  name VARCHAR(160) NOT NULL,
  description VARCHAR(1000) NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by CHAR(36) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_business_unit_code (code),
  CONSTRAINT fk_business_unit_creator FOREIGN KEY (created_by) REFERENCES app_users(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS business_unit_legal_entities (
  business_unit_id CHAR(36) NOT NULL,
  legal_entity_id CHAR(36) NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  effective_from DATE NOT NULL,
  effective_until DATE NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (business_unit_id, legal_entity_id),
  KEY ix_unit_entity_effective (legal_entity_id, effective_from, effective_until),
  CONSTRAINT fk_unit_entity_unit FOREIGN KEY (business_unit_id) REFERENCES business_units(id) ON DELETE RESTRICT,
  CONSTRAINT fk_unit_entity_entity FOREIGN KEY (legal_entity_id) REFERENCES legal_entities(id) ON DELETE RESTRICT,
  CONSTRAINT ck_unit_entity_dates CHECK (effective_until IS NULL OR effective_until >= effective_from)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS brand_business_units (
  brand_id CHAR(36) NOT NULL,
  business_unit_id CHAR(36) NOT NULL,
  effective_from DATE NOT NULL,
  effective_until DATE NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (brand_id, business_unit_id),
  KEY ix_brand_unit_effective (business_unit_id, effective_from, effective_until),
  CONSTRAINT fk_brand_unit_brand FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE RESTRICT,
  CONSTRAINT fk_brand_unit_unit FOREIGN KEY (business_unit_id) REFERENCES business_units(id) ON DELETE RESTRICT,
  CONSTRAINT ck_brand_unit_dates CHECK (effective_until IS NULL OR effective_until >= effective_from)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS business_unit_config_versions (
  id CHAR(36) NOT NULL PRIMARY KEY,
  business_unit_id CHAR(36) NOT NULL,
  version_number INT UNSIGNED NOT NULL,
  effective_from DATETIME(3) NOT NULL,
  config_snapshot JSON NOT NULL,
  change_reason VARCHAR(1000) NOT NULL,
  changed_by CHAR(36) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_business_unit_version (business_unit_id, version_number),
  KEY ix_business_unit_effective (business_unit_id, effective_from),
  CONSTRAINT fk_business_unit_version_unit FOREIGN KEY (business_unit_id) REFERENCES business_units(id) ON DELETE RESTRICT,
  CONSTRAINT fk_business_unit_version_actor FOREIGN KEY (changed_by) REFERENCES app_users(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

ALTER TABLE document_configuration_snapshots
  ADD COLUMN tax_registration_ids JSON NULL AFTER tax_rule_ids;
