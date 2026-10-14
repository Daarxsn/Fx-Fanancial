import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { pool } from "@/lib/db/pool";
import { assertCsrf } from "@/lib/auth/csrf";
import { requirePermission } from "@/lib/auth/authorize";
import { apiError, jsonNoStore } from "@/lib/http/api-response";
import { ConfigurationConflictError, ConfigurationNotReadyError } from "@/lib/configuration/errors";
import { captureDocumentConfigurationSnapshot, jsonValue } from "@/lib/configuration/service";
import { calendarDateSchema } from "@/lib/validation/configuration";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const issueSchema = z.object({ documentDate: calendarDateSchema }).strict();

type InvoiceRow = RowDataPacket & {
  id: string;
  legal_entity_id: string;
  brand_id: string | null;
  customer_id: string;
  document_type: "INVOICE" | "CREDIT_NOTE" | "DEBIT_NOTE";
  lifecycle_status: string;
  payment_terms_days: number;
  invoice_number: string | null;
  financial_year: string | null;
  invoice_date: Date | string | null;
  due_date: Date | string | null;
  currency: string;
  grand_total: string | number;
  issue_idempotency_key: string | null;
};

function sameRate(left: unknown, right: unknown): boolean {
  const a = Number(left);
  const b = Number(right);
  return Number.isFinite(a) && Number.isFinite(b) && Math.round(a * 1_000_000) === Math.round(b * 1_000_000);
}

function jsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch { /* invalid stored JSON is rejected by the domain checks below */ }
  }
  return {};
}

export async function POST(request: NextRequest, context: { params: Promise<{ invoiceId: string }> }) {
  let conn: Awaited<ReturnType<typeof pool.getConnection>> | undefined;
  try {
    await assertCsrf(request);
    const actor = await requirePermission("invoices:issue");
    const { invoiceId } = await context.params;
    if (!/^[0-9a-f-]{36}$/i.test(invoiceId)) {
      return jsonNoStore({ error: { code: "VALIDATION_ERROR", message: "invoiceId must be a UUID." } }, 400);
    }
    const idempotencyKey = request.headers.get("Idempotency-Key")?.trim() ?? "";
    if (!/^[\x21-\x7e]{16,128}$/.test(idempotencyKey)) {
      return jsonNoStore({ error: { code: "VALIDATION_ERROR", message: "Idempotency-Key must contain 16–128 visible ASCII characters." } }, 400);
    }
    const parsedBody = issueSchema.parse(await request.json());
    const documentDate = parsedBody.documentDate;

    conn = await pool.getConnection();
    await conn.beginTransaction();
    const [invoiceRows] = await conn.execute<InvoiceRow[]>(
      "SELECT id,legal_entity_id,brand_id,customer_id,document_type,lifecycle_status,payment_terms_days,invoice_number,financial_year,invoice_date,due_date,currency,grand_total,issue_idempotency_key FROM invoices WHERE id=? FOR UPDATE",
      [invoiceId],
    );
    if (!invoiceRows.length) {
      await conn.rollback();
      return jsonNoStore({ error: { code: "NOT_FOUND", message: "Invoice not found." } }, 404);
    }
    const invoice = invoiceRows[0];
    if (!actor.legalEntityIds.includes(invoice.legal_entity_id)) {
      await conn.rollback();
      return jsonNoStore({ error: { code: "NOT_FOUND", message: "Invoice not found in your assigned scope." } }, 404);
    }
    if (invoice.lifecycle_status === "ISSUED") {
      if (invoice.issue_idempotency_key !== idempotencyKey) {
        await conn.rollback();
        return jsonNoStore({ error: { code: "CONFIGURATION_CONFLICT", message: "This invoice has already been issued with a different idempotency key." } }, 409);
      }
      const [snapshots] = await conn.execute<(RowDataPacket & { id: string; configuration_sha256: string })[]>(
        "SELECT id,configuration_sha256 FROM document_configuration_snapshots WHERE resource_type=? AND resource_id=? LIMIT 1",
        [invoice.document_type, invoice.id],
      );
      if (!snapshots.length) throw new ConfigurationConflictError("Issued invoice has no immutable configuration snapshot; manual reconciliation is required.");
      await conn.commit();
      return jsonNoStore({ data: {
        id: invoice.id, status: invoice.lifecycle_status, invoiceNumber: invoice.invoice_number,
        financialYear: invoice.financial_year, invoiceDate: invoice.invoice_date, dueDate: invoice.due_date,
        currency: invoice.currency, grandTotal: String(invoice.grand_total),
        configurationSnapshotId: snapshots[0].id, configurationSha256: snapshots[0].configuration_sha256,
        idempotentReplay: true,
      } });
    }
    if (invoice.lifecycle_status !== "DRAFT") {
      await conn.rollback();
      return jsonNoStore({ error: { code: "CONFIGURATION_CONFLICT", message: "Only draft invoices can be issued." } }, 409);
    }
    if (invoice.document_type !== "INVOICE" && invoice.document_type !== "CREDIT_NOTE" && invoice.document_type !== "DEBIT_NOTE") {
      throw new ConfigurationConflictError("Only invoice and credit-note records can be issued through this endpoint.");
    }
    const [keyRows] = await conn.execute<(RowDataPacket & { id: string })[]>(
      "SELECT id FROM invoices WHERE legal_entity_id=? AND issue_idempotency_key=? AND id<>? LIMIT 1 FOR UPDATE",
      [invoice.legal_entity_id, idempotencyKey, invoice.id],
    );
    if (keyRows.length) throw new ConfigurationConflictError("Idempotency-Key has already been used for another invoice in this legal entity.");

    const [customers] = await conn.execute<(RowDataPacket & {
      id: string; name: string; email: string | null; phone: string | null; billing_address_json: unknown; tax_identifier: string | null;
    })[]>(
      "SELECT id,name,email,phone,billing_address_json,tax_identifier FROM customers WHERE id=? AND is_active=TRUE LIMIT 1 FOR UPDATE",
      [invoice.customer_id],
    );
    if (!customers.length) throw new ConfigurationNotReadyError("An active customer record is required before issuing this invoice.");
    const customer = customers[0];

    const [lineRows] = await conn.execute<(RowDataPacket & {
      id: string; line_number: number; tax_code: string | null; tax_rule_id: string | null; tax_registration_id: string | null;
      tax_rate: string | number; tax_amount: string | number; configured_tax_code: string | null; configured_rate: string | number | null;
    })[]>(
      "SELECT l.id,l.line_number,l.tax_code,l.tax_rule_id,l.tax_registration_id,l.tax_rate,l.tax_amount,r.tax_code AS configured_tax_code,r.rate AS configured_rate FROM invoice_lines l LEFT JOIN tax_rules r ON r.id=l.tax_rule_id WHERE l.invoice_id=? ORDER BY l.line_number FOR UPDATE",
      [invoice.id],
    );
    if (!lineRows.length) throw new ConfigurationNotReadyError("At least one invoice line is required before issuance.");

    const [entityRows] = await conn.execute<(RowDataPacket & { tax_setup_status: string })[]>(
      "SELECT tax_setup_status FROM legal_entities WHERE id=? FOR UPDATE", [invoice.legal_entity_id],
    );
    const taxStatus = entityRows[0]?.tax_setup_status;
    let taxRuleIds: string[] = [];
    let taxRegistrationIds: string[] = [];
    if (taxStatus === "APPROVED_CONFIGURED") {
      const invalid = lineRows.find((line) =>
        !line.tax_rule_id || !line.tax_registration_id || !line.tax_code ||
        line.configured_tax_code !== line.tax_code || !sameRate(line.tax_rate, line.configured_rate));
      if (invalid) throw new ConfigurationNotReadyError("Every line must reference an approved tax rule and registration, with a code and rate matching the stored line values.");
      taxRuleIds = [...new Set(lineRows.map((line) => String(line.tax_rule_id)))];
      taxRegistrationIds = [...new Set(lineRows.map((line) => String(line.tax_registration_id)))];
    } else if (taxStatus === "APPROVED_NOT_APPLICABLE") {
      const inconsistent = lineRows.some((line) =>
        line.tax_rule_id !== null || line.tax_registration_id !== null || line.tax_code !== null ||
        Number(line.tax_rate) !== 0 || Number(line.tax_amount) !== 0);
      if (inconsistent) throw new ConfigurationConflictError("The approved tax setup is not applicable; invoice lines must not contain tax rule references or calculated tax.");
    } else {
      throw new ConfigurationNotReadyError("A recorded, approved tax decision is required before invoice issuance.");
    }

    const snapshotResult = await captureDocumentConfigurationSnapshot(conn, {
      resourceType: invoice.document_type, resourceId: invoice.id, legalEntityId: invoice.legal_entity_id,
      brandId: invoice.brand_id, documentDate, actorId: actor.userId, taxRuleIds, taxRegistrationIds,
    });
    const [snapshotRows] = await conn.execute<(RowDataPacket & { configuration_snapshot: unknown })[]>(
      "SELECT configuration_snapshot FROM document_configuration_snapshots WHERE id=? LIMIT 1", [snapshotResult.snapshotId],
    );
    if (!snapshotRows.length) throw new ConfigurationConflictError("The configuration snapshot could not be reloaded after capture.");
    const configSnapshot = jsonObject(snapshotRows[0].configuration_snapshot);
    const supplierSnapshot = configSnapshot.legalEntity;
    if (!supplierSnapshot || typeof supplierSnapshot !== "object") {
      throw new ConfigurationNotReadyError("The approved supplier configuration snapshot is incomplete.");
    }
    const numberAllocation = jsonObject(configSnapshot.numberAllocation);
    const financialYearLabel = String(numberAllocation.financialYearLabel ?? "");
    if (!financialYearLabel) throw new ConfigurationNotReadyError("The approved numbering configuration did not produce a financial-year label.");
    const supplierForInvoice = { ...jsonObject(supplierSnapshot) };
    delete supplierForInvoice.bankDetails;
    const customerSnapshot = {
      customerId: customer.id, name: customer.name, email: customer.email, phone: customer.phone,
      billingAddress: jsonValue(customer.billing_address_json), taxIdentifier: customer.tax_identifier,
    };

    const [updated] = await conn.execute<ResultSetHeader>(
      "UPDATE invoices SET lifecycle_status='ISSUED',invoice_number=?,financial_year=?,invoice_date=?,due_date=DATE_ADD(?, INTERVAL payment_terms_days DAY),supplier_snapshot=?,customer_snapshot=?,issued_at=NOW(3),issued_by=?,issue_idempotency_key=?,updated_at=NOW(3) WHERE id=? AND lifecycle_status='DRAFT'",
      [snapshotResult.invoiceNumber, financialYearLabel, documentDate, documentDate, JSON.stringify(supplierForInvoice),
        JSON.stringify(customerSnapshot), actor.userId, idempotencyKey, invoice.id],
    );
    if (updated.affectedRows !== 1) throw new ConfigurationConflictError("Invoice state changed during issuance; retry after refreshing the invoice.");

    await conn.execute(
      "INSERT INTO audit_events (id,actor_id,action,entity_type,entity_id,outcome,before_json,after_json,correlation_id,change_reason) VALUES (?,?,'invoice.issued','invoice',?,'SUCCESS',?,?,?,?)",
      [randomUUID(),actor.userId,invoice.id,JSON.stringify({status:"DRAFT"}),
        JSON.stringify({status:"ISSUED",invoiceNumber:snapshotResult.invoiceNumber,configurationSnapshotId:snapshotResult.snapshotId,
          configurationSha256:snapshotResult.sha256}),randomUUID(),"Approved configuration validated and snapshotted during issuance"],
    );
    await conn.commit();
    return jsonNoStore({ data: {
      id: invoice.id, status: "ISSUED", invoiceNumber: snapshotResult.invoiceNumber,
      financialYear: financialYearLabel, invoiceDate: documentDate, currency: invoice.currency,
      grandTotal: String(invoice.grand_total), configurationSnapshotId: snapshotResult.snapshotId,
      configurationSha256: snapshotResult.sha256, idempotentReplay: false,
    } });
  } catch (error) {
    if (conn) try { await conn.rollback(); } catch { /* preserve original error */ }
    return apiError(error);
  } finally {
    conn?.release();
  }
}
