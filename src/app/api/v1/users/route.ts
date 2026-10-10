import { NextRequest } from "next/server";
import type { RowDataPacket } from "mysql2";
import { pool } from "@/lib/db/pool";
import { requirePermission } from "@/lib/auth/authorize";
import { apiError, jsonNoStore } from "@/lib/http/api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requirePermission("users:manage");
    const limit = Number(request.nextUrl.searchParams.get("limit") ?? "25");
    const offset = Number(request.nextUrl.searchParams.get("offset") ?? "0");
    if (!Number.isInteger(limit) || limit < 1 || limit > 100 ||
        !Number.isSafeInteger(offset) || offset < 0 || offset > 1000000) {
      return jsonNoStore({ error: { code: "VALIDATION_ERROR", message: "Invalid page size or offset." } }, 400);
    }
    const [rows] = await pool.query(
      "SELECT u.id, u.email, u.display_name, u.account_status, u.created_at, u.last_login_at, " +
      "GROUP_CONCAT(DISTINCT r.role_key ORDER BY r.role_key SEPARATOR ',') AS role_keys, " +
      "COUNT(DISTINCT a.legal_entity_id) AS legal_entity_count " +
      "FROM app_users u LEFT JOIN user_roles ur ON ur.user_id=u.id " +
      "LEFT JOIN app_roles r ON r.id=ur.role_id LEFT JOIN user_legal_entity_access a ON a.user_id=u.id " +
      "GROUP BY u.id ORDER BY u.created_at DESC, u.id ASC LIMIT ? OFFSET ?",
      [limit, offset],
    ) as [Array<RowDataPacket & {
      id: string; email: string; display_name: string; account_status: string;
      created_at: Date; last_login_at: Date | null; role_keys: string | null; legal_entity_count: number;
    }>, unknown];
    return jsonNoStore({
      data: rows.map((row) => ({
        id: row.id,
        email: row.email,
        displayName: row.display_name,
        accountStatus: row.account_status,
        roleKeys: row.role_keys ? row.role_keys.split(",") : [],
        legalEntityCount: Number(row.legal_entity_count),
        createdAt: row.created_at,
        lastLoginAt: row.last_login_at,
      })),
      pagination: { limit, offset, hasMore: rows.length === limit },
    });
  } catch (error) { return apiError(error); }
}
