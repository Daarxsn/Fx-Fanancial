-- Phase 07: customer and catalog CRUD foundations.
-- Forward-only MySQL 8 migration. Customers/catalog remain globally shared until an
-- authorized business decision explicitly approves legal-entity or brand scoping.
-- Existing issued-document snapshots are not backfilled from mutable master-data rows.

ALTER TABLE customers
  ADD COLUMN customer_code VARCHAR(80) NULL AFTER id,
  ADD COLUMN shipping_address_json JSON NULL AFTER billing_address_json,
  ADD COLUMN purchase_order_reference VARCHAR(160) NULL AFTER shipping_address_json,
  ADD COLUMN payment_terms_days SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER purchase_order_reference,
  ADD COLUMN record_version INT UNSIGNED NOT NULL DEFAULT 1 AFTER is_active,
  ADD COLUMN archived_at DATETIME(3) NULL AFTER record_version,
  ADD COLUMN archived_by CHAR(36) NULL AFTER archived_at,
  ADD COLUMN archive_reason VARCHAR(500) NULL AFTER archived_by,
  ADD COLUMN created_by CHAR(36) NULL AFTER archive_reason,
  ADD COLUMN updated_by CHAR(36) NULL AFTER created_by,
  ADD UNIQUE KEY uq_customers_customer_code (customer_code),
  ADD KEY ix_customers_phone (phone),
  ADD KEY ix_customers_tax_identifier (tax_identifier),
  ADD KEY ix_customers_active_name (is_active, name, id),
  ADD CONSTRAINT fk_customers_archived_by FOREIGN KEY (archived_by) REFERENCES app_users(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_customers_created_by FOREIGN KEY (created_by) REFERENCES app_users(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_customers_updated_by FOREIGN KEY (updated_by) REFERENCES app_users(id) ON DELETE RESTRICT,
  ADD CONSTRAINT ck_customers_payment_terms_nonnegative CHECK (payment_terms_days >= 0),
  ADD CONSTRAINT ck_customers_record_version_positive CHECK (record_version >= 1);

ALTER TABLE catalog_items
  ADD COLUMN record_version INT UNSIGNED NOT NULL DEFAULT 1 AFTER is_active,
  ADD COLUMN archived_at DATETIME(3) NULL AFTER record_version,
  ADD COLUMN archived_by CHAR(36) NULL AFTER archived_at,
  ADD COLUMN archive_reason VARCHAR(500) NULL AFTER archived_by,
  ADD KEY ix_catalog_items_active_name (is_active, name, id),
  ADD CONSTRAINT fk_catalog_items_archived_by FOREIGN KEY (archived_by) REFERENCES app_users(id) ON DELETE RESTRICT,
  ADD CONSTRAINT ck_catalog_items_record_version_positive CHECK (record_version >= 1);

CREATE TABLE IF NOT EXISTS customer_contacts (
  id CHAR(36) NOT NULL PRIMARY KEY,
  customer_id CHAR(36) NOT NULL,
  full_name VARCHAR(160) NOT NULL,
  job_title VARCHAR(120) NULL,
  email VARCHAR(320) NULL,
  phone VARCHAR(50) NULL,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY ix_customer_contacts_customer (customer_id, is_primary, full_name),
  KEY ix_customer_contacts_email (email),
  KEY ix_customer_contacts_phone (phone),
  CONSTRAINT fk_customer_contacts_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS customer_tax_identifiers (
  id CHAR(36) NOT NULL PRIMARY KEY,
  customer_id CHAR(36) NOT NULL,
  identifier_type VARCHAR(40) NOT NULL,
  country_code CHAR(2) NULL,
  jurisdiction VARCHAR(120) NULL,
  identifier_value VARCHAR(160) NOT NULL,
  normalized_identifier VARCHAR(160) NOT NULL,
  created_by CHAR(36) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY ix_customer_tax_ids_customer (customer_id, identifier_type),
  KEY ix_customer_tax_ids_normalized (normalized_identifier, country_code, identifier_type),
  CONSTRAINT fk_customer_tax_ids_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
  CONSTRAINT fk_customer_tax_ids_creator FOREIGN KEY (created_by) REFERENCES app_users(id) ON DELETE RESTRICT
) ENGINE=InnoDB;
