-- Phase 03/05/06 expansion: identity, catalog, quotations, workflow, artifacts and configuration history.
-- MySQL 8.0+. Apply after 001_initial_schema.sql. Never apply directly to production without an approved backup.
-- This migration intentionally creates no users, tax rates, legal entities, credentials or production data.

CREATE TABLE IF NOT EXISTS app_users (
  id CHAR(36) NOT NULL PRIMARY KEY,
  email VARCHAR(320) NOT NULL,
  display_name VARCHAR(160) NOT NULL,
  identity_provider VARCHAR(80) NOT NULL,
  provider_subject VARCHAR(255) NOT NULL,
  account_status ENUM('INVITED','ACTIVE','SUSPENDED','DEACTIVATED') NOT NULL DEFAULT 'INVITED',
  last_login_at DATETIME(3) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_app_users_email (email),
  UNIQUE KEY uq_app_users_provider_subject (identity_provider, provider_subject)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS app_roles (
  id CHAR(36) NOT NULL PRIMARY KEY,
  role_key VARCHAR(80) NOT NULL,
  display_name VARCHAR(120) NOT NULL,
  description VARCHAR(500) NULL,
  is_system_role BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_app_roles_key (role_key)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS app_permissions (
  id CHAR(36) NOT NULL PRIMARY KEY,
  permission_key VARCHAR(120) NOT NULL,
  description VARCHAR(500) NULL,
  UNIQUE KEY uq_app_permissions_key (permission_key)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS user_roles (
  user_id CHAR(36) NOT NULL,
  role_id CHAR(36) NOT NULL,
  granted_by CHAR(36) NULL,
  granted_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id, role_id),
  CONSTRAINT fk_user_roles_user FOREIGN KEY (user_id) REFERENCES app_users(id),
  CONSTRAINT fk_user_roles_role FOREIGN KEY (role_id) REFERENCES app_roles(id),
  CONSTRAINT fk_user_roles_grantor FOREIGN KEY (granted_by) REFERENCES app_users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id CHAR(36) NOT NULL,
  permission_id CHAR(36) NOT NULL,
  granted_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (role_id, permission_id),
  CONSTRAINT fk_role_permissions_role FOREIGN KEY (role_id) REFERENCES app_roles(id),
  CONSTRAINT fk_role_permissions_permission FOREIGN KEY (permission_id) REFERENCES app_permissions(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS user_legal_entity_access (
  user_id CHAR(36) NOT NULL,
  legal_entity_id CHAR(36) NOT NULL,
  granted_by CHAR(36) NULL,
  granted_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id, legal_entity_id),
  CONSTRAINT fk_user_entity_access_user FOREIGN KEY (user_id) REFERENCES app_users(id),
  CONSTRAINT fk_user_entity_access_entity FOREIGN KEY (legal_entity_id) REFERENCES legal_entities(id),
  CONSTRAINT fk_user_entity_access_grantor FOREIGN KEY (granted_by) REFERENCES app_users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS catalog_items (
  id CHAR(36) NOT NULL PRIMARY KEY,
  item_code VARCHAR(80) NULL,
  item_type ENUM('PRODUCT','SERVICE') NOT NULL,
  name VARCHAR(255) NOT NULL,
  customer_description VARCHAR(1000) NOT NULL,
  internal_description VARCHAR(1000) NULL,
  unit_code VARCHAR(40) NOT NULL,
  default_unit_price DECIMAL(19,4) NOT NULL,
  currency CHAR(3) NOT NULL,
  default_tax_code VARCHAR(80) NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by CHAR(36) NULL,
  updated_by CHAR(36) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_catalog_item_code (item_code),
  KEY ix_catalog_items_name (name),
  KEY ix_catalog_items_active_type (is_active, item_type),
  CONSTRAINT fk_catalog_items_created_by FOREIGN KEY (created_by) REFERENCES app_users(id),
  CONSTRAINT fk_catalog_items_updated_by FOREIGN KEY (updated_by) REFERENCES app_users(id),
  CONSTRAINT ck_catalog_item_price_nonnegative CHECK (default_unit_price >= 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS quotations (
  id CHAR(36) NOT NULL PRIMARY KEY,
  legal_entity_id CHAR(36) NOT NULL,
  brand_id CHAR(36) NULL,
  customer_id CHAR(36) NOT NULL,
  quotation_number VARCHAR(80) NULL,
  status ENUM('DRAFT','SENT','ACCEPTED','REJECTED','EXPIRED','CANCELLED','CONVERTED') NOT NULL DEFAULT 'DRAFT',
  issue_date DATE NULL,
  valid_until DATE NULL,
  currency CHAR(3) NOT NULL,
  customer_snapshot JSON NULL,
  supplier_snapshot JSON NULL,
  subtotal DECIMAL(19,4) NOT NULL DEFAULT 0,
  discount_total DECIMAL(19,4) NOT NULL DEFAULT 0,
  tax_total DECIMAL(19,4) NOT NULL DEFAULT 0,
  grand_total DECIMAL(19,4) NOT NULL DEFAULT 0,
  converted_invoice_id CHAR(36) NULL,
  created_by CHAR(36) NULL,
  updated_by CHAR(36) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_quotation_number (legal_entity_id, quotation_number),
  KEY ix_quotations_customer_status (customer_id, status),
  CONSTRAINT fk_quotations_entity FOREIGN KEY (legal_entity_id) REFERENCES legal_entities(id),
  CONSTRAINT fk_quotations_brand FOREIGN KEY (brand_id) REFERENCES brands(id),
  CONSTRAINT fk_quotations_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
  CONSTRAINT fk_quotations_invoice FOREIGN KEY (converted_invoice_id) REFERENCES invoices(id),
  CONSTRAINT fk_quotations_created_by FOREIGN KEY (created_by) REFERENCES app_users(id),
  CONSTRAINT fk_quotations_updated_by FOREIGN KEY (updated_by) REFERENCES app_users(id),
  CONSTRAINT ck_quotation_totals_nonnegative CHECK (subtotal >= 0 AND discount_total >= 0 AND tax_total >= 0 AND grand_total >= 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS quotation_lines (
  id CHAR(36) NOT NULL PRIMARY KEY,
  quotation_id CHAR(36) NOT NULL,
  line_number INT UNSIGNED NOT NULL,
  catalog_item_id CHAR(36) NULL,
  description VARCHAR(1000) NOT NULL,
  unit_code VARCHAR(40) NOT NULL,
  quantity DECIMAL(19,4) NOT NULL,
  unit_price DECIMAL(19,4) NOT NULL,
  discount_amount DECIMAL(19,4) NOT NULL DEFAULT 0,
  tax_code VARCHAR(80) NULL,
  tax_rate DECIMAL(9,6) NOT NULL DEFAULT 0,
  tax_amount DECIMAL(19,4) NOT NULL DEFAULT 0,
  line_total DECIMAL(19,4) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_quotation_line_number (quotation_id, line_number),
  CONSTRAINT fk_quotation_lines_quotation FOREIGN KEY (quotation_id) REFERENCES quotations(id),
  CONSTRAINT fk_quotation_lines_catalog FOREIGN KEY (catalog_item_id) REFERENCES catalog_items(id),
  CONSTRAINT ck_quotation_line_values CHECK (quantity > 0 AND unit_price >= 0 AND discount_amount >= 0 AND tax_rate >= 0 AND tax_amount >= 0 AND line_total >= 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS approval_requests (
  id CHAR(36) NOT NULL PRIMARY KEY,
  resource_type VARCHAR(80) NOT NULL,
  resource_id CHAR(36) NOT NULL,
  action_key VARCHAR(80) NOT NULL,
  status ENUM('PENDING','APPROVED','REJECTED','WITHDRAWN','CANCELLED') NOT NULL DEFAULT 'PENDING',
  requested_by CHAR(36) NOT NULL,
  assigned_to CHAR(36) NULL,
  decided_by CHAR(36) NULL,
  request_reason TEXT NULL,
  decision_reason TEXT NULL,
  requested_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  decided_at DATETIME(3) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY ix_approval_inbox (status, assigned_to, requested_at),
  KEY ix_approval_resource (resource_type, resource_id, created_at),
  CONSTRAINT fk_approval_requested_by FOREIGN KEY (requested_by) REFERENCES app_users(id),
  CONSTRAINT fk_approval_assigned_to FOREIGN KEY (assigned_to) REFERENCES app_users(id),
  CONSTRAINT fk_approval_decided_by FOREIGN KEY (decided_by) REFERENCES app_users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS reminder_jobs (
  id CHAR(36) NOT NULL PRIMARY KEY,
  invoice_id CHAR(36) NOT NULL,
  reminder_type VARCHAR(80) NOT NULL,
  scheduled_at DATETIME(3) NOT NULL,
  status ENUM('SCHEDULED','PROCESSING','SENT','SKIPPED','FAILED','CANCELLED') NOT NULL DEFAULT 'SCHEDULED',
  attempt_count INT UNSIGNED NOT NULL DEFAULT 0,
  idempotency_key VARCHAR(160) NOT NULL,
  last_error_code VARCHAR(80) NULL,
  sent_at DATETIME(3) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_reminder_idempotency (idempotency_key),
  KEY ix_reminder_due (status, scheduled_at),
  CONSTRAINT fk_reminder_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS document_files (
  id CHAR(36) NOT NULL PRIMARY KEY,
  resource_type VARCHAR(80) NOT NULL,
  resource_id CHAR(36) NOT NULL,
  artifact_type ENUM('INVOICE_ORIGINAL','INVOICE_PAID_COPY','INVOICE_PARTIAL_COPY','INVOICE_CANCELLED_COPY','QUOTATION_PDF','ATTACHMENT','OTHER') NOT NULL,
  storage_provider VARCHAR(80) NOT NULL,
  storage_key VARCHAR(1000) NOT NULL,
  content_type VARCHAR(160) NOT NULL,
  byte_size BIGINT UNSIGNED NOT NULL,
  sha256 CHAR(64) NOT NULL,
  created_by CHAR(36) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_document_storage_key (storage_provider, storage_key(191)),
  KEY ix_document_resource (resource_type, resource_id, artifact_type),
  CONSTRAINT fk_document_created_by FOREIGN KEY (created_by) REFERENCES app_users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS email_outbox (
  id CHAR(36) NOT NULL PRIMARY KEY,
  resource_type VARCHAR(80) NOT NULL,
  resource_id CHAR(36) NOT NULL,
  recipient_email VARCHAR(320) NOT NULL,
  cc_json JSON NULL,
  subject VARCHAR(998) NOT NULL,
  body_text MEDIUMTEXT NOT NULL,
  status ENUM('QUEUED','PROCESSING','SENT','FAILED','CANCELLED') NOT NULL DEFAULT 'QUEUED',
  idempotency_key VARCHAR(160) NOT NULL,
  attempt_count INT UNSIGNED NOT NULL DEFAULT 0,
  provider_message_id VARCHAR(255) NULL,
  last_error_code VARCHAR(80) NULL,
  queued_by CHAR(36) NULL,
  queued_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  sent_at DATETIME(3) NULL,
  UNIQUE KEY uq_email_outbox_idempotency (idempotency_key),
  KEY ix_email_outbox_queue (status, queued_at),
  CONSTRAINT fk_email_outbox_queued_by FOREIGN KEY (queued_by) REFERENCES app_users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS legal_entity_config_versions (
  id CHAR(36) NOT NULL PRIMARY KEY,
  legal_entity_id CHAR(36) NOT NULL,
  version_number INT UNSIGNED NOT NULL,
  effective_from DATETIME(3) NOT NULL,
  config_snapshot JSON NOT NULL,
  change_reason VARCHAR(1000) NOT NULL,
  changed_by CHAR(36) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_entity_config_version (legal_entity_id, version_number),
  KEY ix_entity_config_effective (legal_entity_id, effective_from),
  CONSTRAINT fk_entity_config_entity FOREIGN KEY (legal_entity_id) REFERENCES legal_entities(id),
  CONSTRAINT fk_entity_config_changed_by FOREIGN KEY (changed_by) REFERENCES app_users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS brand_legal_entities (
  brand_id CHAR(36) NOT NULL,
  legal_entity_id CHAR(36) NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  effective_from DATE NULL,
  effective_until DATE NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (brand_id, legal_entity_id),
  CONSTRAINT fk_brand_entity_brand FOREIGN KEY (brand_id) REFERENCES brands(id),
  CONSTRAINT fk_brand_entity_entity FOREIGN KEY (legal_entity_id) REFERENCES legal_entities(id),
  CONSTRAINT ck_brand_entity_dates CHECK (effective_until IS NULL OR effective_from IS NULL OR effective_until >= effective_from)
) ENGINE=InnoDB;

-- Tax configuration is intentionally represented by approved codes/rules rather than hard-coded tax rates.
CREATE TABLE IF NOT EXISTS tax_rules (
  id CHAR(36) NOT NULL PRIMARY KEY,
  legal_entity_id CHAR(36) NOT NULL,
  tax_code VARCHAR(80) NOT NULL,
  display_name VARCHAR(160) NOT NULL,
  jurisdiction VARCHAR(120) NOT NULL,
  rate DECIMAL(9,6) NOT NULL,
  calculation_mode ENUM('EXCLUSIVE','INCLUSIVE') NOT NULL DEFAULT 'EXCLUSIVE',
  effective_from DATE NOT NULL,
  effective_until DATE NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  approved_by CHAR(36) NULL,
  approved_at DATETIME(3) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_tax_rule_version (legal_entity_id, tax_code, effective_from),
  KEY ix_tax_rules_active (legal_entity_id, is_active, effective_from),
  CONSTRAINT fk_tax_rules_entity FOREIGN KEY (legal_entity_id) REFERENCES legal_entities(id),
  CONSTRAINT fk_tax_rules_approver FOREIGN KEY (approved_by) REFERENCES app_users(id),
  CONSTRAINT ck_tax_rule_rate CHECK (rate >= 0),
  CONSTRAINT ck_tax_rule_dates CHECK (effective_until IS NULL OR effective_until >= effective_from)
) ENGINE=InnoDB;
