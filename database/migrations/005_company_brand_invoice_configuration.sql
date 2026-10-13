-- Phase 06: complete billing identity, brand, numbering, tax approval, templates and document config snapshots.
-- MySQL 8 / InnoDB. Forward-only migration; never edit after it has been recorded.
-- No legal identity, bank, tax-rate, numbering or template business values are seeded.

ALTER TABLE legal_entities
  ADD COLUMN country_code CHAR(2) NULL AFTER address_json,
  ADD COLUMN invoice_email VARCHAR(320) NULL AFTER country_code,
  ADD COLUMN invoice_phone VARCHAR(50) NULL AFTER invoice_email,
  ADD COLUMN website VARCHAR(255) NULL AFTER invoice_phone,
  ADD COLUMN locale VARCHAR(35) NULL AFTER currency,
  ADD COLUMN time_zone VARCHAR(80) NULL AFTER locale,
  ADD COLUMN logo_reference VARCHAR(1000) NULL AFTER time_zone,
  ADD COLUMN bank_details_json JSON NULL AFTER logo_reference,
  ADD COLUMN invoice_terms TEXT NULL AFTER bank_details_json,
  ADD COLUMN invoice_footer TEXT NULL AFTER invoice_terms,
  ADD COLUMN default_tax_code VARCHAR(80) NULL AFTER invoice_footer,
  ADD COLUMN tax_setup_status ENUM('UNCONFIGURED','APPROVED_NOT_APPLICABLE','APPROVED_CONFIGURED') NOT NULL DEFAULT 'UNCONFIGURED' AFTER default_tax_code,
  ADD COLUMN tax_setup_approval_reference VARCHAR(255) NULL AFTER tax_setup_status,
  ADD COLUMN tax_setup_approved_by CHAR(36) NULL AFTER tax_setup_approval_reference,
  ADD COLUMN tax_setup_approved_at DATETIME(3) NULL AFTER tax_setup_approved_by,
  ADD KEY ix_legal_entities_active_country (is_active, country_code),
  ADD CONSTRAINT fk_legal_entity_tax_setup_approver FOREIGN KEY (tax_setup_approved_by) REFERENCES app_users(id) ON DELETE RESTRICT;

ALTER TABLE brands
  ADD COLUMN description VARCHAR(1000) NULL AFTER code,
  ADD COLUMN logo_reference VARCHAR(1000) NULL AFTER description,
  ADD COLUMN theme_json JSON NULL AFTER logo_reference,
  ADD COLUMN default_template_key VARCHAR(80) NULL AFTER theme_json,
  ADD COLUMN updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) AFTER created_at;

ALTER TABLE tax_rules
  ADD COLUMN approval_reference VARCHAR(255) NULL AFTER approved_at,
  ADD COLUMN deactivated_at DATETIME(3) NULL AFTER approval_reference;

CREATE TABLE IF NOT EXISTS brand_config_versions (
  id CHAR(36) NOT NULL PRIMARY KEY,
  brand_id CHAR(36) NOT NULL,
  version_number INT UNSIGNED NOT NULL,
  effective_from DATETIME(3) NOT NULL,
  config_snapshot JSON NOT NULL,
  change_reason VARCHAR(1000) NOT NULL,
  changed_by CHAR(36) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_brand_config_version (brand_id, version_number),
  KEY ix_brand_config_effective (brand_id, effective_from),
  CONSTRAINT fk_brand_config_brand FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE RESTRICT,
  CONSTRAINT fk_brand_config_changed_by FOREIGN KEY (changed_by) REFERENCES app_users(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS invoice_numbering_configs (
  id CHAR(36) NOT NULL PRIMARY KEY,
  legal_entity_id CHAR(36) NOT NULL,
  document_type ENUM('INVOICE','CREDIT_NOTE','DEBIT_NOTE','QUOTATION') NOT NULL,
  series_code VARCHAR(80) NOT NULL,
  prefix VARCHAR(40) NOT NULL,
  suffix VARCHAR(40) NOT NULL DEFAULT '',
  sequence_width TINYINT UNSIGNED NOT NULL,
  include_financial_year BOOLEAN NOT NULL,
  sequence_scope ENUM('ENTITY_FINANCIAL_YEAR_DOCUMENT_TYPE') NOT NULL,
  financial_year_start_month TINYINT UNSIGNED NOT NULL,
  financial_year_start_day TINYINT UNSIGNED NOT NULL,
  time_zone VARCHAR(80) NOT NULL,
  version_number INT UNSIGNED NOT NULL,
  effective_from DATE NOT NULL,
  effective_until DATE NULL,
  approval_reference VARCHAR(255) NULL,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  created_by CHAR(36) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_numbering_entity_type_version (legal_entity_id, document_type, version_number),
  KEY ix_numbering_active_effective (legal_entity_id, document_type, is_active, effective_from, effective_until),
  CONSTRAINT fk_numbering_entity FOREIGN KEY (legal_entity_id) REFERENCES legal_entities(id) ON DELETE RESTRICT,
  CONSTRAINT fk_numbering_created_by FOREIGN KEY (created_by) REFERENCES app_users(id) ON DELETE RESTRICT,
  CONSTRAINT ck_numbering_width CHECK (sequence_width BETWEEN 1 AND 12),
  CONSTRAINT ck_numbering_month CHECK (financial_year_start_month BETWEEN 1 AND 12),
  CONSTRAINT ck_numbering_day CHECK (financial_year_start_day BETWEEN 1 AND 31),
  CONSTRAINT ck_numbering_dates CHECK (effective_until IS NULL OR effective_until >= effective_from)
) ENGINE=InnoDB;

-- The counter is deliberately independent of configuration versions: editing a prefix or template
-- must never reset/reuse issued sequence values within an entity/document type/financial year.
CREATE TABLE IF NOT EXISTS invoice_number_sequences (
  legal_entity_id CHAR(36) NOT NULL,
  document_type ENUM('INVOICE','CREDIT_NOTE','DEBIT_NOTE','QUOTATION') NOT NULL,
  financial_year_label VARCHAR(16) NOT NULL,
  next_value BIGINT UNSIGNED NOT NULL DEFAULT 1,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (legal_entity_id, document_type, financial_year_label),
  CONSTRAINT fk_number_sequence_entity FOREIGN KEY (legal_entity_id) REFERENCES legal_entities(id) ON DELETE RESTRICT,
  CONSTRAINT ck_number_sequence_positive CHECK (next_value >= 1)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS invoice_document_templates (
  id CHAR(36) NOT NULL PRIMARY KEY,
  legal_entity_id CHAR(36) NOT NULL,
  brand_id CHAR(36) NULL,
  document_type ENUM('INVOICE','CREDIT_NOTE','DEBIT_NOTE','QUOTATION') NOT NULL,
  template_key VARCHAR(80) NOT NULL,
  display_name VARCHAR(160) NOT NULL,
  version_number INT UNSIGNED NOT NULL,
  template_config JSON NOT NULL,
  effective_from DATE NOT NULL,
  effective_until DATE NULL,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  created_by CHAR(36) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_template_version (legal_entity_id, brand_id, document_type, template_key, version_number),
  KEY ix_template_active_effective (legal_entity_id, brand_id, document_type, is_active, effective_from, effective_until),
  CONSTRAINT fk_template_entity FOREIGN KEY (legal_entity_id) REFERENCES legal_entities(id) ON DELETE RESTRICT,
  CONSTRAINT fk_template_brand FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE RESTRICT,
  CONSTRAINT fk_template_created_by FOREIGN KEY (created_by) REFERENCES app_users(id) ON DELETE RESTRICT,
  CONSTRAINT ck_template_dates CHECK (effective_until IS NULL OR effective_until >= effective_from)
) ENGINE=InnoDB;

-- Append-only association from an issued business document to the exact configuration revision
-- used at issue time. Application APIs provide INSERT-only access to this table.
CREATE TABLE IF NOT EXISTS document_configuration_snapshots (
  id CHAR(36) NOT NULL PRIMARY KEY,
  resource_type ENUM('INVOICE','CREDIT_NOTE','DEBIT_NOTE','QUOTATION') NOT NULL,
  resource_id CHAR(36) NOT NULL,
  legal_entity_id CHAR(36) NOT NULL,
  brand_id CHAR(36) NULL,
  legal_entity_config_version_id CHAR(36) NULL,
  brand_config_version_id CHAR(36) NULL,
  numbering_config_id CHAR(36) NULL,
  template_id CHAR(36) NULL,
  tax_rule_ids JSON NULL,
  configuration_snapshot JSON NOT NULL,
  configuration_sha256 CHAR(64) NOT NULL,
  captured_by CHAR(36) NULL,
  captured_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_document_configuration_resource (resource_type, resource_id),
  KEY ix_document_config_entity (legal_entity_id, captured_at),
  CONSTRAINT fk_doc_config_entity FOREIGN KEY (legal_entity_id) REFERENCES legal_entities(id) ON DELETE RESTRICT,
  CONSTRAINT fk_doc_config_brand FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE RESTRICT,
  CONSTRAINT fk_doc_config_entity_version FOREIGN KEY (legal_entity_config_version_id) REFERENCES legal_entity_config_versions(id) ON DELETE RESTRICT,
  CONSTRAINT fk_doc_config_brand_version FOREIGN KEY (brand_config_version_id) REFERENCES brand_config_versions(id) ON DELETE RESTRICT,
  CONSTRAINT fk_doc_config_numbering FOREIGN KEY (numbering_config_id) REFERENCES invoice_numbering_configs(id) ON DELETE RESTRICT,
  CONSTRAINT fk_doc_config_template FOREIGN KEY (template_id) REFERENCES invoice_document_templates(id) ON DELETE RESTRICT,
  CONSTRAINT fk_doc_config_actor FOREIGN KEY (captured_by) REFERENCES app_users(id) ON DELETE RESTRICT
) ENGINE=InnoDB;
