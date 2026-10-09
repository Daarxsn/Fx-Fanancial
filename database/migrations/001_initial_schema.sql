-- Phase 01/02 initial schema.
-- Apply only after confirming the target database and backup policy.
-- MySQL 8.0+; monetary columns use DECIMAL, not floating point.

CREATE TABLE IF NOT EXISTS legal_entities (
  id CHAR(36) NOT NULL PRIMARY KEY,
  legal_name VARCHAR(255) NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  registration_number VARCHAR(100) NULL,
  tax_identifier VARCHAR(100) NULL,
  address_json JSON NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'INR',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS brands (
  id CHAR(36) NOT NULL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  code VARCHAR(40) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_brands_code (code)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS customers (
  id CHAR(36) NOT NULL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(320) NULL,
  phone VARCHAR(50) NULL,
  billing_address_json JSON NULL,
  tax_identifier VARCHAR(100) NULL,
  notes TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY ix_customers_name (name),
  KEY ix_customers_email (email)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS invoice_sequences (
  id CHAR(36) NOT NULL PRIMARY KEY,
  legal_entity_id CHAR(36) NOT NULL,
  financial_year VARCHAR(20) NOT NULL,
  last_number BIGINT UNSIGNED NOT NULL DEFAULT 0,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_invoice_sequence_scope (legal_entity_id, financial_year),
  CONSTRAINT fk_invoice_sequences_entity FOREIGN KEY (legal_entity_id) REFERENCES legal_entities(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS invoices (
  id CHAR(36) NOT NULL PRIMARY KEY,
  legal_entity_id CHAR(36) NOT NULL,
  brand_id CHAR(36) NULL,
  customer_id CHAR(36) NOT NULL,
  document_type ENUM('INVOICE','CREDIT_NOTE') NOT NULL DEFAULT 'INVOICE',
  lifecycle_status ENUM('DRAFT','ISSUED','CANCELLED') NOT NULL DEFAULT 'DRAFT',
  payment_terms_days INT UNSIGNED NOT NULL DEFAULT 0,
  invoice_number VARCHAR(80) NULL,
  financial_year VARCHAR(20) NULL,
  invoice_date DATE NULL,
  due_date DATE NULL,
  currency CHAR(3) NOT NULL DEFAULT 'INR',
  supplier_snapshot JSON NULL,
  customer_snapshot JSON NULL,
  subtotal DECIMAL(19,4) NOT NULL DEFAULT 0,
  discount_total DECIMAL(19,4) NOT NULL DEFAULT 0,
  tax_total DECIMAL(19,4) NOT NULL DEFAULT 0,
  grand_total DECIMAL(19,4) NOT NULL DEFAULT 0,
  notes TEXT NULL,
  issued_at DATETIME(3) NULL,
  issued_by CHAR(36) NULL,
  cancelled_at DATETIME(3) NULL,
  cancelled_by CHAR(36) NULL,
  cancellation_reason TEXT NULL,
  idempotency_key VARCHAR(128) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_invoice_number (legal_entity_id, financial_year, invoice_number),
  UNIQUE KEY uq_invoice_idempotency (idempotency_key),
  KEY ix_invoices_customer (customer_id),
  KEY ix_invoices_status_date (lifecycle_status, invoice_date),
  CONSTRAINT fk_invoices_entity FOREIGN KEY (legal_entity_id) REFERENCES legal_entities(id),
  CONSTRAINT fk_invoices_brand FOREIGN KEY (brand_id) REFERENCES brands(id),
  CONSTRAINT fk_invoices_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
  CONSTRAINT ck_invoice_totals_nonnegative CHECK (subtotal >= 0 AND discount_total >= 0 AND tax_total >= 0 AND grand_total >= 0),
  CONSTRAINT ck_invoice_issued_fields CHECK (lifecycle_status <> 'ISSUED' OR (invoice_number IS NOT NULL AND invoice_date IS NOT NULL AND issued_at IS NOT NULL AND supplier_snapshot IS NOT NULL AND customer_snapshot IS NOT NULL)),
  CONSTRAINT ck_invoice_cancelled_fields CHECK (lifecycle_status <> 'CANCELLED' OR (cancelled_at IS NOT NULL AND cancellation_reason IS NOT NULL))
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS invoice_lines (
  id CHAR(36) NOT NULL PRIMARY KEY,
  invoice_id CHAR(36) NOT NULL,
  line_number INT UNSIGNED NOT NULL,
  description VARCHAR(1000) NOT NULL,
  quantity DECIMAL(19,4) NOT NULL,
  unit_price DECIMAL(19,4) NOT NULL,
  discount_amount DECIMAL(19,4) NOT NULL DEFAULT 0,
  tax_rate DECIMAL(9,6) NOT NULL DEFAULT 0,
  tax_amount DECIMAL(19,4) NOT NULL DEFAULT 0,
  line_total DECIMAL(19,4) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_invoice_line_number (invoice_id, line_number),
  CONSTRAINT fk_invoice_lines_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id),
  CONSTRAINT ck_invoice_line_values CHECK (quantity > 0 AND unit_price >= 0 AND discount_amount >= 0 AND tax_rate >= 0 AND tax_amount >= 0 AND line_total >= 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS payments (
  id CHAR(36) NOT NULL PRIMARY KEY,
  customer_id CHAR(36) NOT NULL,
  amount DECIMAL(19,4) NOT NULL,
  currency CHAR(3) NOT NULL,
  payment_date DATE NOT NULL,
  method VARCHAR(40) NOT NULL,
  reference VARCHAR(160) NULL,
  status ENUM('RECORDED','REVERSED') NOT NULL DEFAULT 'RECORDED',
  notes TEXT NULL,
  recorded_by CHAR(36) NULL,
  reversed_at DATETIME(3) NULL,
  reversed_by CHAR(36) NULL,
  reversal_reason TEXT NULL,
  idempotency_key VARCHAR(128) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_payment_idempotency (idempotency_key),
  KEY ix_payments_customer_date (customer_id, payment_date),
  CONSTRAINT fk_payments_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
  CONSTRAINT ck_payment_amount CHECK (amount > 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS payment_allocations (
  id CHAR(36) NOT NULL PRIMARY KEY,
  payment_id CHAR(36) NOT NULL,
  invoice_id CHAR(36) NOT NULL,
  amount DECIMAL(19,4) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_payment_invoice_allocation (payment_id, invoice_id),
  KEY ix_allocations_invoice (invoice_id),
  CONSTRAINT fk_allocations_payment FOREIGN KEY (payment_id) REFERENCES payments(id),
  CONSTRAINT fk_allocations_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id),
  CONSTRAINT ck_allocation_amount CHECK (amount > 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS audit_events (
  id CHAR(36) NOT NULL PRIMARY KEY,
  actor_id CHAR(36) NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id CHAR(36) NOT NULL,
  outcome ENUM('SUCCESS','FAILURE') NOT NULL DEFAULT 'SUCCESS',
  before_json JSON NULL,
  after_json JSON NULL,
  correlation_id VARCHAR(128) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY ix_audit_entity (entity_type, entity_id, created_at),
  KEY ix_audit_actor (actor_id, created_at)
) ENGINE=InnoDB;
