import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { pool } from "@/lib/db/pool";
import { requirePermission } from "@/lib/auth/authorize";
import { apiError, jsonNoStore } from "@/lib/http/api-response";
import { catalogItemCreateSchema } from "@/lib/validation/master-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requirePermission("catalog:read");
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
      clauses.push("(name LIKE ? OR item_code LIKE ?)");
      const escaped = query.replace(/[\\%_]/g, "\\$&");
      params.push(`%${escaped}%`, `%${escaped}%`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const [rows] = await pool.execute<(RowDataPacket & {
      id: string; item_code: string | null; item_type: string; name: string;
      customer_description: string; unit_code: string; default_unit_price: string;
      currency: string; default_tax_code: string | null; is_active: number;
      created_at: Date; updated_at: Date;
    })[]>(
      `SELECT id, item_code, item_type, name, customer_description, unit_code,
              default_unit_price, currency, default_tax_code, is_active, created_at, updated_at
       FROM catalog_items ${where} ORDER BY name ASC, id ASC LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );
    return jsonNoStore({ data: rows, page: { limit, offset, hasMore: rows.length === limit } });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requirePermission("catalog:write");
    const parsed = catalogItemCreateSchema.parse(await request.json());
    const id = randomUUID();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();
      await connection.execute<ResultSetHeader>(
        `INSERT INTO catalog_items
          (id, item_code, item_type, name, customer_description, internal_description,
           unit_code, default_unit_price, currency, default_tax_code, is_active, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE, ?, ?)`,
        [
          id, parsed.itemCode?.trim() || null, parsed.itemType, parsed.name,
          parsed.customerDescription, parsed.internalDescription ?? null,
          parsed.unitCode, parsed.defaultUnitPrice, parsed.currency,
          parsed.defaultTaxCode ?? null, actor.userId, actor.userId,
        ],
      );
      await connection.execute(
        `INSERT INTO audit_events (id, actor_id, action, entity_type, entity_id, outcome, after_json)
         VALUES (?, ?, 'catalog_item.created', 'catalog_item', ?, 'SUCCESS', ?)`,
        [randomUUID(), actor.userId, id, JSON.stringify({
          itemCode: parsed.itemCode || null,
          itemType: parsed.itemType,
          name: parsed.name,
          currency: parsed.currency,
          defaultUnitPrice: parsed.defaultUnitPrice,
        })],
      );
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    return jsonNoStore({ data: { id, itemCode: parsed.itemCode || null, itemType: parsed.itemType, name: parsed.name, defaultUnitPrice: parsed.defaultUnitPrice, currency: parsed.currency, isActive: true } }, 201);
  } catch (error) {
    return apiError(error);
  }
}
