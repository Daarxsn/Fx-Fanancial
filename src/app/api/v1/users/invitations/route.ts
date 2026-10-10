import { createHash, randomBytes, randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import type { RowDataPacket } from "mysql2";
import { z } from "zod";
import { pool } from "@/lib/db/pool";
import { assertCsrf } from "@/lib/auth/csrf";
import { requirePermission, AuthorizationError } from "@/lib/auth/authorize";
import { consumeRateLimit } from "@/lib/auth/rate-limit";
import { requestSecurityContext, writeSecurityEvent } from "@/lib/auth/security-events";
import { apiError, jsonNoStore } from "@/lib/http/api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const roleKeys = ["system_admin", "finance_admin", "invoice_creator", "invoice_issuer", "payment_recorder", "approver", "auditor"] as const;
const invitationSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  displayName: z.string().trim().min(1).max(160),
  roleKeys: z.array(z.enum(roleKeys)).min(1).max(7),
  legalEntityIds: z.array(z.string().uuid()).max(100).default([]),
}).strict();

export async function POST(request: NextRequest) {
  try {
    await assertCsrf(request);
    const actor = await requirePermission("users:manage");
    const parsed = invitationSchema.parse(await request.json());
    if (parsed.roleKeys.includes("system_admin") && !actor.roles.includes("system_admin")) {
      throw new AuthorizationError("FORBIDDEN");
    }

    const throttled = await consumeRateLimit("INVITATION", `admin:${actor.userId}`, 20);
    if (!throttled.allowed) {
      const response = jsonNoStore({ error: { code: "RATE_LIMITED", message: "Invitation creation is temporarily unavailable." } }, 429);
      response.headers.set("Retry-After", String(throttled.retryAfterSeconds));
      return response;
    }

    const [existing] = await pool.execute<(RowDataPacket & { id: string })[]>(
      "SELECT id FROM app_users WHERE email = ? LIMIT 1",
      [parsed.email],
    );
    if (existing.length) {
      return jsonNoStore({ error: { code: "CONFLICT", message: "An account with this email already exists." } }, 409);
    }

    const [roleRows] = await pool.query<(RowDataPacket & { id: string; role_key: string })[]>(
      `SELECT id, role_key FROM app_roles WHERE role_key IN (${parsed.roleKeys.map(() => "?").join(",")})`,
      [...new Set(parsed.roleKeys)],
    );
    if (new Set(roleRows.map((row) => row.role_key)).size !== new Set(parsed.roleKeys).size) {
      return jsonNoStore({ error: { code: "CONFIGURATION_INCOMPLETE", message: "One or more requested role templates are not configured." } }, 409);
    }

    if (parsed.legalEntityIds.length) {
      const [entities] = await pool.query<(RowDataPacket & { id: string })[]>(
        `SELECT id FROM legal_entities WHERE id IN (${parsed.legalEntityIds.map(() => "?").join(",")}) AND is_active = TRUE`,
        parsed.legalEntityIds,
      );
      if (entities.length !== new Set(parsed.legalEntityIds).size) {
        return jsonNoStore({ error: { code: "VALIDATION_ERROR", message: "Every legal entity must exist and be active." } }, 422);
      }
    }

    const userId = randomUUID();
    const invitationId = randomUUID();
    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const context = requestSecurityContext(request);
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute(
        `INSERT INTO app_users
          (id, email, display_name, identity_provider, provider_subject, password_hash, account_status)
         VALUES (?, ?, ?, 'local_password', ?, NULL, 'INVITED')`,
        [userId, parsed.email, parsed.displayName, parsed.email],
      );
      for (const role of roleRows) {
        if (!parsed.roleKeys.includes(role.role_key as typeof roleKeys[number])) continue;
        await connection.execute(
          "INSERT INTO user_roles (user_id, role_id, granted_by) VALUES (?, ?, ?)",
          [userId, role.id, actor.userId],
        );
      }
      for (const entityId of new Set(parsed.legalEntityIds)) {
        await connection.execute(
          "INSERT INTO user_legal_entity_access (user_id, legal_entity_id, granted_by) VALUES (?, ?, ?)",
          [userId, entityId, actor.userId],
        );
      }
      await connection.execute(
        `INSERT INTO account_invitation_tokens (id, user_id, token_hash, expires_at, created_by)
         VALUES (?, ?, ?, DATE_ADD(NOW(3), INTERVAL 24 HOUR), ?)`,
        [invitationId, userId, tokenHash, actor.userId],
      );
      await connection.execute(
        `INSERT INTO audit_events (id, actor_id, action, entity_type, entity_id, outcome, after_json)
         VALUES (?, ?, 'auth.invitation.created', 'app_user', ?, 'SUCCESS', ?)`,
        [randomUUID(), actor.userId, userId, JSON.stringify({
          email: parsed.email, roleKeys: [...new Set(parsed.roleKeys)],
          legalEntityIds: [...new Set(parsed.legalEntityIds)], expiresInHours: 24,
        })],
      );
      await writeSecurityEvent(connection, {
        userId: actor.userId,
        eventType: "auth.invitation.created",
        outcome: "SUCCESS",
        subject: parsed.email,
        sourceIp: context.sourceIp,
        userAgent: context.userAgent,
        metadata: { invitedUserId: userId, roleCount: new Set(parsed.roleKeys).size },
      });
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    // The current repository has no configured email provider. Return the single-use bearer
    // token only to an authenticated users:manage caller, once, over the private no-store API.
    // Do not log it; deliver it to the invitee through the organization's approved secure channel.
    return jsonNoStore({
      data: {
        userId,
        email: parsed.email,
        displayName: parsed.displayName,
        roleKeys: [...new Set(parsed.roleKeys)],
        legalEntityIds: [...new Set(parsed.legalEntityIds)],
        activationToken: token,
        expiresInHours: 24,
        delivery: "manual-secure-channel",
      },
    }, 201);
  } catch (error) {
    return apiError(error);
  }
}
