import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { pool } from "@/lib/db/pool";
import { requirePermission } from "@/lib/auth/authorize";
import { assertCsrf } from "@/lib/auth/csrf";
import { apiError, jsonNoStore } from "@/lib/http/api-response";
import { customerCreateSchema } from "@/lib/validation/master-data";

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
    const limit = Number(request.nextUrl.searchParams.get("limit") ?? "25");
    const offset = Number(request.nextUrl.searchParams.get("offset") ?? "0");
    if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(offset) || offset < 0 || offset > 1000000) {
      return jsonNoStore({ error: { code: "VALIDATION_ERROR", message: "limit must be 1–100 and offset must be between 0 and 1000000" } }, 400);
    }

    const clauses: string[] = [];
    const params: unknown[] = [];
    if (status !== "all") {
      clauses.push("is_active = ?");
      params.push(status === "active" ? 1 : 0);
    }
    if (query) {
      clauses.push("(name LIKE ? OR email LIKE ? OR phone LIKE ?)");
      const escaped = query.replace(/[\\%_]/g, "\\$&");
      const pattern = `%${escaped}%`;
      params.push(pattern, pattern, pattern);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const [rows] = await pool.query<(RowDataPacket & {
      id: string; name: string; email: string | null; phone: string | null;
      billing_address_json: unknown; tax_identifier: string | null; is_active: number;
      created_at: Date; updated_at: Date;
    })[]>(
      `SELECT id, name, email, phone, billing_address_json, tax_identifier, is_active, created_at, updated_at
       FROM customers ${where} ORDER BY name ASC, id ASC LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );
    return jsonNoStore({
      data: rows.map((row) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        phone: row.phone,
        billingAddress: row.billing_address_json,
        taxIdentifier: row.tax_identifier,
        isActive: Boolean(row.is_active),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
      pagination: { limit, offset, hasMore: rows.length === limit },
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await assertCsrf(request);
    const actor = await requirePermission("customers:write");
    const parsed = customerCreateSchema.parse(await request.json());
    const id = randomUUID();
    const email = parsed.email?.trim().toLowerCase() || null;
    const phone = parsed.phone?.trim() || null;
    const taxIdentifier = parsed.taxIdentifier?.trim() || null;
    const billingAddress = parsed.billingAddress ? JSON.stringify(parsed.billingAddress) : null;
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();
      const [result] = await connection.execute<ResultSetHeader>(
        `INSERT INTO customers (id, name, email, phone, billing_address_json, tax_identifier, notes, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, TRUE)`,
        [id, parsed.name, email, phone, billingAddress, taxIdentifier, parsed.notes ?? null],
      );
      if (result.affectedRows !== 1) throw new Error("Customer creation failed");
      await connection.execute(
        `INSERT INTO audit_events (id, actor_id, action, entity_type, entity_id, outcome, after_json)
         VALUES (?, ?, 'customer.created', 'customer', ?, 'SUCCESS', ?)`,
        [randomUUID(), actor.userId, id, JSON.stringify({ name: parsed.name, email })],
      );
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    return jsonNoStore({
      data: {
        id,
        name: parsed.name,
        email,
        phone,
        billingAddress: parsed.billingAddress ?? null,
        taxIdentifier,
        notes: parsed.notes ?? null,
        isActive: true,
      },
    }, 201);
  } catch (error) {
    return apiError(error);
  }
}
