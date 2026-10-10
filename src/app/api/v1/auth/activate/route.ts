import { createHash, randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import type { RowDataPacket } from "mysql2";
import { z } from "zod";
import { pool } from "@/lib/db/pool";
import { assertCsrf } from "@/lib/auth/csrf";
import { hashPassword, validatePasswordPolicy } from "@/lib/auth/password";
import { consumeRateLimit } from "@/lib/auth/rate-limit";
import { requestSecurityContext, writeSecurityEvent } from "@/lib/auth/security-events";
import { apiError, jsonNoStore } from "@/lib/http/api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const activationSchema = z.object({
  token: z.string().min(32).max(256),
  password: z.string().min(1).max(256),
}).strict();

type InvitationRow = RowDataPacket & {
  id: string;
  user_id: string;
  email: string;
  account_status: string;
  consumed_at: Date | null;
  revoked_at: Date | null;
  expires_at_unix: number;
};

export async function POST(request: NextRequest) {
  try {
    await assertCsrf(request, { checkSession: false });
    const parsed = activationSchema.parse(await request.json());
    const policyError = validatePasswordPolicy(parsed.password);
    if (policyError) return jsonNoStore({
      error: { code: "PASSWORD_POLICY", message: policyError },
    }, 422);

    const limited = await consumeRateLimit("INVITATION", parsed.token, 10);
    const context = requestSecurityContext(request);
    if (!limited.allowed) {
      await writeSecurityEvent(pool, {
        eventType: "auth.invitation.activation_rate_limited",
        outcome: "BLOCKED",
        subject: parsed.token,
        sourceIp: context.sourceIp,
        userAgent: context.userAgent,
      });
      const response = jsonNoStore({ error: { code: "RATE_LIMITED", message: "Activation is temporarily unavailable. Try again later." } }, 429);
      response.headers.set("Retry-After", String(limited.retryAfterSeconds));
      return response;
    }

    const tokenHash = createHash("sha256").update(parsed.token).digest("hex");
    const [rows] = await pool.execute<InvitationRow[]>(
      `SELECT i.id, i.user_id, i.consumed_at, i.revoked_at, UNIX_TIMESTAMP(i.expires_at) AS expires_at_unix,
              u.email, u.account_status
         FROM account_invitation_tokens i
         JOIN app_users u ON u.id = i.user_id
        WHERE i.token_hash = ? LIMIT 1`,
      [tokenHash],
    );
    const invite = rows[0];
    const currentlyValid = invite && invite.account_status === "INVITED" &&
      !invite.consumed_at && !invite.revoked_at && Number(invite.expires_at_unix) * 1000 > Date.now();
    if (!invite || !currentlyValid) {
      await writeSecurityEvent(pool, {
        eventType: "auth.invitation.activation_failed",
        outcome: "FAILURE",
        subject: parsed.token,
        sourceIp: context.sourceIp,
        userAgent: context.userAgent,
      });
      return jsonNoStore({ error: { code: "INVITATION_INVALID", message: "This invitation is invalid, expired or already used." } }, 400);
    }

    const passwordHash = await hashPassword(parsed.password);
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [lockedRows] = await connection.execute<InvitationRow[]>(
        `SELECT i.id, i.user_id, i.consumed_at, i.revoked_at, UNIX_TIMESTAMP(i.expires_at) AS expires_at_unix,
                u.email, u.account_status
           FROM account_invitation_tokens i
           JOIN app_users u ON u.id = i.user_id
          WHERE i.id = ? FOR UPDATE`,
        [invite.id],
      );
      const locked = lockedRows[0];
      if (!locked || locked.account_status !== "INVITED" || locked.consumed_at ||
          locked.revoked_at || Number(locked.expires_at_unix) * 1000 <= Date.now()) {
        await connection.rollback();
        return jsonNoStore({ error: { code: "INVITATION_INVALID", message: "This invitation is invalid, expired or already used." } }, 400);
      }

      await connection.execute(
        "UPDATE app_users SET password_hash = ?, account_status = 'ACTIVE' WHERE id = ? AND account_status = 'INVITED'",
        [passwordHash, locked.user_id],
      );
      await connection.execute(
        "UPDATE account_invitation_tokens SET consumed_at = NOW(3) WHERE id = ? AND consumed_at IS NULL",
        [locked.id],
      );
      await connection.execute(
        "UPDATE account_invitation_tokens SET revoked_at = NOW(3) WHERE user_id = ? AND id <> ? AND revoked_at IS NULL",
        [locked.user_id, locked.id],
      );
      await connection.execute(
        `INSERT INTO audit_events (id, actor_id, action, entity_type, entity_id, outcome, after_json)
         VALUES (?, NULL, 'auth.account.activated', 'app_user', ?, 'SUCCESS', JSON_OBJECT('method', 'invitation'))`,
        [randomUUID(), locked.user_id],
      );
      await writeSecurityEvent(connection, {
        userId: locked.user_id,
        eventType: "auth.account.activated",
        outcome: "SUCCESS",
        subject: locked.email,
        sourceIp: context.sourceIp,
        userAgent: context.userAgent,
      });
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    return jsonNoStore({ data: { activated: true, message: "Account activated. Sign in to continue." } });
  } catch (error) {
    return apiError(error);
  }
}
