import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { pool } from "@/lib/db/pool";
import { requirePermission } from "@/lib/auth/authorize";
import { apiError, jsonNoStore } from "@/lib/http/api-response";
import { customerCreateSchema } from "@/lib/validation/master-data";
import type { RowDataPacket, ResultSetHeader } from "mysql2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requirePermission("customers:read");
    const query = (request.nextUrl.searchParams.get("query") ?? "").trim().slice(0, 100);
    const status = request.nextUrl.searchParams.get("status") ?? "active";
    if (!["active", "archived", "all"].includes(status)) {
      return jsonNoStore({ error: { code: "VALIDATION_ERROR", message: "status must be active, archived, or all" } }, 400);
    }

    const pageSizeRaw = Number(request.nextUrl.searchParams.get("limit") ?? "25");
    if (!Number.isInteger(pageSizeRaw) || pageSizeRaw < 1 || pageSizeRaw > 100) {
      return jsonNoStore({ error: { code: "VALIDATION_ERROR", message: "limit must be between 1 and 100" } }, 400);
    }
    const cursor = Math.max(0, Number(request.nextUrl.searchParams.get("offset") ?? "0"));
    if (!Number.isSafeInteger(cursor) || cursor > 1000000) {
      return jsonNoStore({ error: { code: "VALIDATION_ERROR", message: "offset is out of range" } }, 400);
    }

    const clauses: string[] = [];
    const params: unknown[] = [];
    if (status !== "all") {
      clauses.push("is_active = ?");
      params.push(status === "active" ? 1 : 0);
    }
    if (query) {
      clauses.push("(name LIKE ? OR email LIKE ? OR phone LIKE ?)");
      const pattern = `%${query.replace(/[\\%_]/g, "\\$&")}%`;
      params.push(pattern, pattern, pattern);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const [rows] = await pool.execute<(RowDataPacket & {
      id: string; name: string; email: string | null; phone: string | null;
      billing_address_json: unknown; tax_identifier: string | null; is_active: number;
      created_at: Date; updated_at: Date;
    })[]>(
      `SELECT id, name, email, phone, billing_address_json, tax_identifier, is_active, created_at, updated_at
       FROM customers ${where} ORDER BY name ASC, id ASC LIMIT ? OFFSET ?`,
      [...params, pageSizeRaw, cursor],
    );
    return jsonNoStore({ data: rows, page: { limit: pageSizeRaw, offset: cursor, hasMore: rows.length === pageSizeRaw } });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requirePermission("customers:write");
    const body: unknown = await request.json();
    const parsed = customerCreateSchema.parse(body);
    const id = randomUUID();
    const email = parsed.email?.trim().toLowerCase() || null;
    const phone = parsed.phone?.trim() || null;
    const taxIdentifier = parsed.taxIdentifier?.trim() || null;
    const billingAddress = parsed.billingAddress ? JSON.stringify(parsed.billingAddress) : null;

    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO customers (id, name, email, phone, billing_address_json, tax_identifier, notes, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, TRUE)`,
      [id, parsed.name, email, phone, billingAddress, taxIdentifier, parsed.notes ?? null],
    );
    if (result.affectedRows !== 1) throw new Error("Insert failed");

    await pool.execute(
      `INSERT INTO audit_events (id, actor_id, action, entity_type, entity_id, outcome, after_json)
       VALUES (?, ?, 'customer.created', 'customer', ?, 'SUCCESS', ?)`,
      [randomUUID(), actor.userId, id, JSON.stringify({ name: parsed.name, email })],
    );

    return jsonNoStore({ data: { id, name: parsed.name, email, phone, isActive: true } }, 201);
  } catch (error) {
    return apiError(error);
  }
}
