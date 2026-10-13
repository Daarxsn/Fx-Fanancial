import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { pool } from "@/lib/db/pool";

export type LegalEntityRecord = RowDataPacket & {
  id: string; legal_name: string; display_name: string; registration_number: string | null; tax_identifier: string | null;
  address_json: unknown; country_code: string | null; invoice_email: string | null; invoice_phone: string | null;
  website: string | null; currency: string; locale: string | null; time_zone: string | null;
  logo_reference: string | null; bank_details_json: unknown; invoice_terms: string | null; invoice_footer: string | null;
  default_tax_code: string | null; tax_setup_status: string; tax_setup_approval_reference: string | null;
  is_active: number; created_at: Date; updated_at: Date;
};

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return "{" + Object.keys(record).sort().map((key) => JSON.stringify(key) + ":" + canonicalJson(record[key])).join(",") + "}";
  }
  return JSON.stringify(value) ?? "null";
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function jsonValue(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch { /* malformed stored JSON is handled as an empty, not-ready address */ }
  }
  return {};
}

/** Never return raw bank details from general list/detail APIs. */
export function publicLegalEntity(row: LegalEntityRecord) {
  const bank = jsonValue(row.bank_details_json);
  const accountNumber = typeof bank.accountNumber === "string" ? bank.accountNumber : "";
  return {
    id: row.id, legalName: row.legal_name, displayName: row.display_name,
    registrationNumber: row.registration_number, taxIdentifier: row.tax_identifier,
    address: jsonValue(row.address_json), countryCode: row.country_code,
    invoiceEmail: row.invoice_email, invoicePhone: row.invoice_phone, website: row.website,
    currency: row.currency, locale: row.locale, timeZone: row.time_zone, logoReference: row.logo_reference,
    bankDetailsConfigured: Object.values(bank).some((v) => typeof v === "string" && v.trim().length > 0),
    bankAccountLast4: accountNumber.length >= 4 ? accountNumber.slice(-4) : null,
    invoiceTerms: row.invoice_terms, invoiceFooter: row.invoice_footer, defaultTaxCode: row.default_tax_code,
    taxSetupStatus: row.tax_setup_status, taxSetupApprovalReference: row.tax_setup_approval_reference,
    isActive: Boolean(row.is_active), createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

export async function recordAudit(
  conn: PoolConnection,
  actorId: string,
  action: string,
  entityType: string,
  entityId: string,
  reason: string,
  before: unknown,
  after: unknown,
) {
  await conn.execute(
    `INSERT INTO audit_events (id, actor_id, action, entity_type, entity_id, outcome, before_json, after_json, correlation_id)
     VALUES (?, ?, ?, ?, ?, 'SUCCESS', ?, ?, ?)`,
    [randomUUID(), actorId, action, entityType, entityId,
      before === null ? null : JSON.stringify(before), after === null ? null : JSON.stringify(after), reason.slice(0, 128)],
  );
}

export async function loadEntity(conn: PoolConnection, id: string): Promise<LegalEntityRecord | null> {
  const [rows] = await conn.execute<LegalEntityRecord[]>(
    `SELECT id, legal_name, display_name, registration_number, tax_identifier, address_json, country_code,
      invoice_email, invoice_phone, website, currency, locale, time_zone, logo_reference, bank_details_json,
      invoice_terms, invoice_footer, default_tax_code, tax_setup_status, tax_setup_approval_reference,
      is_active, created_at, updated_at
     FROM legal_entities WHERE id = ? LIMIT 1`, [id]);
  return rows[0] ?? null;
}

export async function captureLegalEntityConfigVersion(
  conn: PoolConnection, row: LegalEntityRecord, actorId: string, reason: string,
): Promise<{ id: string; versionNumber: number; snapshot: Record<string, unknown> }> {
  const [prior] = await conn.execute<(RowDataPacket & { version_number: number })[]>(
    "SELECT version_number FROM legal_entity_config_versions WHERE legal_entity_id = ? ORDER BY version_number DESC LIMIT 1 FOR UPDATE",
    [row.id],
  );
  const versionNumber = Number(prior[0]?.version_number ?? 0) + 1;
  const snapshot = {
    schemaVersion: 1, legalEntityId: row.id, legalName: row.legal_name, displayName: row.display_name,
    registrationNumber: row.registration_number, taxIdentifier: row.tax_identifier, address: jsonValue(row.address_json),
    countryCode: row.country_code, invoiceEmail: row.invoice_email, invoicePhone: row.invoice_phone,
    website: row.website, currency: row.currency, locale: row.locale, timeZone: row.time_zone,
    logoReference: row.logo_reference, bankDetails: jsonValue(row.bank_details_json),
    invoiceTerms: row.invoice_terms, invoiceFooter: row.invoice_footer, defaultTaxCode: row.default_tax_code,
    taxSetupStatus: row.tax_setup_status, taxSetupApprovalReference: row.tax_setup_approval_reference,
    isActive: Boolean(row.is_active),
  };
  const serialized = canonicalJson(snapshot);
  const id = randomUUID();
  await conn.execute(
    `INSERT INTO legal_entity_config_versions
      (id, legal_entity_id, version_number, effective_from, config_snapshot, change_reason, changed_by)
     VALUES (?, ?, ?, NOW(3), ?, ?, ?)`,
    [id, row.id, versionNumber, serialized, reason, actorId],
  );
  return { id, versionNumber, snapshot };
}

export async function assertEntityScope(actor: { legalEntityIds: string[] }, legalEntityId: string) {
  if (!actor.legalEntityIds.includes(legalEntityId)) {
    const error = new Error("FORBIDDEN");
    error.name = "EntityScopeError";
    throw error;
  }
}

export async function readinessForEntity(legalEntityId: string) {
  const entity = await loadEntityFromPool(legalEntityId);
  if (!entity) return { legalEntityId, ready: false, checks: [{ key: "entity", passed: false, message: "Legal entity was not found or is outside the available scope." }] };
  const address = jsonValue(entity.address_json);
  const checks: { key: string; passed: boolean; message: string }[] = [
    { key: "active", passed: Boolean(entity.is_active), message: "Legal entity must be active." },
    { key: "legalName", passed: Boolean(entity.legal_name.trim()), message: "Legal supplier name is required." },
    { key: "address", passed: Boolean(address.line1 && address.city && address.postalCode && address.countryCode && entity.country_code), message: "Registered address must include line 1, city, postal code, and country." },
    { key: "currency", passed: /^[A-Z]{3}$/.test(entity.currency), message: "An explicit document currency must be configured." },
    { key: "taxApproval", passed: entity.tax_setup_status !== "UNCONFIGURED" && Boolean(entity.tax_setup_approval_reference), message: "Tax setup must have a recorded finance/tax approval, including an explicit not-applicable decision where appropriate." },
  ];
  const [taxRows] = await pool.execute<(RowDataPacket & { n: number })[]>(
    `SELECT COUNT(*) AS n FROM tax_rules
      WHERE legal_entity_id = ? AND is_active = TRUE AND approved_at IS NOT NULL
        AND approval_reference IS NOT NULL AND effective_from <= CURRENT_DATE()
        AND (effective_until IS NULL OR effective_until >= CURRENT_DATE())`, [legalEntityId]);
  const hasTax = Number(taxRows[0]?.n ?? 0) > 0;
  checks.push({ key: "taxRules", passed: entity.tax_setup_status === "APPROVED_NOT_APPLICABLE" || (entity.tax_setup_status === "APPROVED_CONFIGURED" && hasTax), message: "An active approved tax rule or an explicitly approved not-applicable decision is required." });
  const [numberingRows] = await pool.execute<(RowDataPacket & { n: number })[]>(
    `SELECT COUNT(DISTINCT document_type) AS n FROM invoice_numbering_configs
      WHERE legal_entity_id = ? AND is_active = TRUE AND effective_from <= CURRENT_DATE()
        AND (effective_until IS NULL OR effective_until >= CURRENT_DATE())
        AND approval_reference IS NOT NULL`, [legalEntityId]);
  checks.push({ key: "numbering", passed: Number(numberingRows[0]?.n ?? 0) >= 1, message: "At least one active, approved document numbering series must be configured." });
  const [templateRows] = await pool.execute<(RowDataPacket & { n: number })[]>(
    `SELECT COUNT(*) AS n FROM invoice_document_templates
      WHERE legal_entity_id = ? AND document_type = 'INVOICE' AND is_active = TRUE
        AND effective_from <= CURRENT_DATE() AND (effective_until IS NULL OR effective_until >= CURRENT_DATE())`, [legalEntityId]);
  checks.push({ key: "invoiceTemplate", passed: Number(templateRows[0]?.n ?? 0) >= 1, message: "An active invoice template must be selected and effective today." });
  return { legalEntityId, ready: checks.every((check) => check.passed), checks };
}

async function loadEntityFromPool(id: string): Promise<LegalEntityRecord | null> {
  const [rows] = await pool.execute<LegalEntityRecord[]>(
    `SELECT id, legal_name, display_name, registration_number, tax_identifier, address_json, country_code,
      invoice_email, invoice_phone, website, currency, locale, time_zone, logo_reference, bank_details_json,
      invoice_terms, invoice_footer, default_tax_code, tax_setup_status, tax_setup_approval_reference,
      is_active, created_at, updated_at FROM legal_entities WHERE id = ? LIMIT 1`, [id]);
  return rows[0] ?? null;
}
