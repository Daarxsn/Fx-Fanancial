import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import type { RowDataPacket } from "mysql2";
import { z } from "zod";
import { pool } from "@/lib/db/pool";
import { assertCsrf } from "@/lib/auth/csrf";
import { AuthorizationError, requirePermission } from "@/lib/auth/authorize";
import { requestSecurityContext, writeSecurityEvent } from "@/lib/auth/security-events";
import { apiError, jsonNoStore } from "@/lib/http/api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const allowedRoles = ["system_admin", "finance_admin", "invoice_creator", "invoice_issuer", "payment_recorder", "approver", "auditor"] as const;
const patchSchema = z.object({
  accountStatus: z.enum(["ACTIVE", "SUSPENDED", "DEACTIVATED"]).optional(),
  roleKeys: z.array(z.enum(allowedRoles)).min(1).max(7).optional(),
  legalEntityIds: z.array(z.string().uuid()).max(100).optional(),
}).strict().refine((v) => v.accountStatus !== undefined || v.roleKeys !== undefined || v.legalEntityIds !== undefined,
  { message: "Provide at least one change." });

export async function GET(request: NextRequest) {
  try {
    await requirePermission("users:manage");
    const limit = Number(request.nextUrl.searchParams.get("limit") ?? "25");
    const offset = Number(request.nextUrl.searchParams.get("offset") ?? "0");
    if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(offset) || offset < 0 || offset > 1000000) {
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
        id: row.id, email: row.email, displayName: row.display_name,
        accountStatus: row.account_status, roleKeys: row.role_keys ? row.role_keys.split(",") : [],
        legalEntityCount: Number(row.legal_entity_count), createdAt: row.created_at, lastLoginAt: row.last_login_at,
      })),
      pagination: { limit, offset, hasMore: rows.length === limit },
    });
  } catch (error) { return apiError(error); }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ userId: string }> }) {
  try {
    await assertCsrf(request);
    const actor = await requirePermission("users:manage");
    const { userId } = await context.params;
    if (!/^[0-9a-f-]{36}$/i.test(userId)) {
      return jsonNoStore({ error: { code: "VALIDATION_ERROR", message: "userId must be a UUID." } }, 400);
    }
    if (userId === actor.userId) throw new AuthorizationError("FORBIDDEN");
    const parsed = patchSchema.parse(await request.json());
    if (parsed.roleKeys?.includes("system_admin") && !actor.roles.includes("system_admin")) {
      throw new AuthorizationError("FORBIDDEN");
    }
    if (parsed.legalEntityIds?.length) {
      const [entities] = await pool.query(
        "SELECT id FROM legal_entities WHERE is_active=TRUE AND id IN (" +
        parsed.legalEntityIds.map(() => "?").join(",") + ")",
        parsed.legalEntityIds,
      ) as [Array<RowDataPacket & { id: string }>, unknown];
      if (entities.length !== new Set(parsed.legalEntityIds).size) {
        return jsonNoStore({ error: { code: "VALIDATION_ERROR", message: "Every legal entity must exist and be active." } }, 422);
      }
    }

    const connection = await pool.getConnection();
    const securityContext = requestSecurityContext(request);
    let changed = false;
    try {
      await connection.beginTransaction();
      const [targets] = await connection.execute(
        "SELECT u.id, u.email, u.account_status, " +
        "EXISTS(SELECT 1 FROM user_roles ur JOIN app_roles r ON r.id=ur.role_id " +
        "WHERE ur.user_id=u.id AND r.role_key='system_admin') AS is_system_admin " +
        "FROM app_users u WHERE u.id=? FOR UPDATE",
        [userId],
      ) as [Array<RowDataPacket & { id: string; email: string; account_status: string; is_system_admin: number }>, unknown];
      const target = targets[0];
      if (!target) {
        await connection.rollback();
        return jsonNoStore({ error: { code: "NOT_FOUND", message: "User not found." } }, 404);
      }
      const resultingStatus = parsed.accountStatus ?? target.account_status;
      if (Number(target.is_system_admin) === 1 &&
          (resultingStatus !== "ACTIVE" || (parsed.roleKeys && !parsed.roleKeys.includes("system_admin")))) {
        const [countRows] = await connection.execute(
          "SELECT COUNT(*) AS count FROM app_users u JOIN user_roles ur ON ur.user_id=u.id " +
          "JOIN app_roles r ON r.id=ur.role_id WHERE u.account_status='ACTIVE' AND r.role_key='system_admin'",
        ) as [Array<RowDataPacket & { count: number }>, unknown];
        if (Number(countRows[0]?.count ?? 0) <= 1) {
          await connection.rollback();
          return jsonNoStore({ error: { code: "LAST_ADMIN", message: "The last active system administrator cannot be suspended or demoted." } }, 409);
        }
      }
      if (parsed.accountStatus !== undefined) {
        await connection.execute("UPDATE app_users SET account_status=? WHERE id=?", [parsed.accountStatus, userId]);
        changed = true;
      }
      if (parsed.roleKeys !== undefined) {
        const [roles] = await connection.query(
          "SELECT id, role_key FROM app_roles WHERE role_key IN (" + parsed.roleKeys.map(() => "?").join(",") + ")",
          parsed.roleKeys,
        ) as [Array<RowDataPacket & { id: string; role_key: string }>, unknown];
        if (new Set(roles.map((role) => role.role_key)).size !== new Set(parsed.roleKeys).size) {
          await connection.rollback();
          return jsonNoStore({ error: { code: "VALIDATION_ERROR", message: "One or more role templates are not configured." } }, 422);
        }
        await connection.execute("DELETE FROM user_roles WHERE user_id=?", [userId]);
        for (const role of roles) {
          await connection.execute("INSERT INTO user_roles (user_id, role_id, granted_by) VALUES (?, ?, ?)", [userId, role.id, actor.userId]);
        }
        changed = true;
      }
      if (parsed.legalEntityIds !== undefined) {
        await connection.execute("DELETE FROM user_legal_entity_access WHERE user_id=?", [userId]);
        for (const entityId of new Set(parsed.legalEntityIds)) {
          await connection.execute("INSERT INTO user_legal_entity_access (user_id, legal_entity_id, granted_by) VALUES (?, ?, ?)", [userId, entityId, actor.userId]);
        }
        changed = true;
      }
      if (changed) {
        await connection.execute(
          "UPDATE auth_sessions SET revoked_at=NOW(3), revoked_reason='ACCOUNT_OR_PRIVILEGE_CHANGED' WHERE user_id=? AND revoked_at IS NULL",
          [userId],
        );
        await connection.execute(
          "INSERT INTO audit_events (id, actor_id, action, entity_type, entity_id, outcome, after_json) VALUES (?, ?, 'auth.user.updated', 'app_user', ?, 'SUCCESS', ?)",
          [randomUUID(), actor.userId, userId, JSON.stringify(parsed)],
        );
        await writeSecurityEvent(connection, {
          userId: actor.userId, eventType: "auth.user.updated", outcome: "SUCCESS",
          subject: target.email, sourceIp: securityContext.sourceIp, userAgent: securityContext.userAgent,
          metadata: { targetUserId: userId, sessionRevoked: true },
        });
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally { connection.release(); }

    const [users] = await pool.execute(
      "SELECT id, email, display_name, account_status FROM app_users WHERE id=?",
      [userId],
    ) as [Array<RowDataPacket & { id: string; email: string; display_name: string; account_status: string }>, unknown];
    const [roles] = await pool.execute(
      "SELECT r.role_key FROM user_roles ur JOIN app_roles r ON r.id=ur.role_id WHERE ur.user_id=? ORDER BY r.role_key",
      [userId],
    ) as [Array<RowDataPacket & { role_key: string }>, unknown];
    const [scopes] = await pool.execute(
      "SELECT legal_entity_id FROM user_legal_entity_access WHERE user_id=? ORDER BY legal_entity_id",
      [userId],
    ) as [Array<RowDataPacket & { legal_entity_id: string }>, unknown];
    return jsonNoStore({ data: {
      id: users[0].id, email: users[0].email, displayName: users[0].display_name,
      accountStatus: users[0].account_status, roleKeys: roles.map((r) => r.role_key),
      legalEntityIds: scopes.map((r) => r.legal_entity_id), sessionsRevokedOnPrivilegeChange: changed,
    } });
  } catch (error) { return apiError(error); }
}
