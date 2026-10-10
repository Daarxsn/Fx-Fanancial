import { randomUUID, createHash } from "node:crypto";
import { NextRequest } from "next/server";
import type { RowDataPacket } from "mysql2";
import { z } from "zod";
import { pool } from "@/lib/db/pool";
import { assertCsrf } from "@/lib/auth/csrf";
import { verifyPassword } from "@/lib/auth/password";
import { consumeRateLimit, clearEmailRateLimit } from "@/lib/auth/rate-limit";
import { requestSecurityContext, writeSecurityEvent } from "@/lib/auth/security-events";
import {
  csrfCookieName, csrfCookieOptions, newSessionSecret, resolveSessionToken,
  sessionCookieName, sessionCookieOptions, hashSessionToken,
} from "@/lib/auth/session";
import { AuthorizationError } from "@/lib/auth/authorize";
import { apiError, jsonNoStore } from "@/lib/http/api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  password: z.string().min(1).max(256),
}).strict();

type UserRow = RowDataPacket & {
  id: string;
  email: string;
  display_name: string;
  password_hash: string | null;
  account_status: string;
};

export async function POST(request: NextRequest) {
  try {
    await assertCsrf(request, { checkSession: false });
    const parsed = loginSchema.parse(await request.json());
    const context = requestSecurityContext(request);
    const emailLimit = await consumeRateLimit("EMAIL", parsed.email, 5);
    const ipLimit = await consumeRateLimit("IP", context.sourceIp ?? "unknown-source", 20);
    if (!emailLimit.allowed || !ipLimit.allowed) {
      await writeSecurityEvent(pool, {
        eventType: "auth.login.rate_limited",
        outcome: "BLOCKED",
        subject: parsed.email,
        sourceIp: context.sourceIp,
        userAgent: context.userAgent,
      });
      const response = jsonNoStore({ error: { code: "RATE_LIMITED", message: "Sign-in is temporarily unavailable. Try again later." } }, 429);
      response.headers.set("Retry-After", String(Math.max(emailLimit.retryAfterSeconds, ipLimit.retryAfterSeconds, 1)));
      return response;
    }

    const [rows] = await pool.execute<UserRow[]>(
      "SELECT id, email, display_name, password_hash, account_status FROM app_users WHERE email = ? LIMIT 1",
      [parsed.email],
    );
    const user = rows[0];
    const passwordMatches = await verifyPassword(parsed.password, user?.password_hash);
    if (!user || user.account_status !== "ACTIVE" || !user.password_hash || !passwordMatches) {
      await writeSecurityEvent(pool, {
        userId: user?.id ?? null,
        eventType: "auth.login.failed",
        outcome: "FAILURE",
        subject: parsed.email,
        sourceIp: context.sourceIp,
        userAgent: context.userAgent,
      });
      return apiError(new AuthorizationError("UNAUTHENTICATED"));
    }

    const sessionToken = newSessionSecret();
    const csrfToken = newSessionSecret();
    const sessionId = randomUUID();
    const tokenHash = hashSessionToken(sessionToken);
    const csrfHash = createHash("sha256").update(csrfToken).digest("hex");
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [lockedRows] = await connection.execute<UserRow[]>(
        "SELECT id, email, display_name, password_hash, account_status FROM app_users WHERE id = ? FOR UPDATE",
        [user.id],
      );
      const lockedUser = lockedRows[0];
      if (!lockedUser || lockedUser.account_status !== "ACTIVE" || lockedUser.password_hash !== user.password_hash) {
        await writeSecurityEvent(connection, {
          userId: user.id,
          eventType: "auth.login.failed",
          outcome: "FAILURE",
          subject: parsed.email,
          sourceIp: context.sourceIp,
          userAgent: context.userAgent,
          metadata: { reason: "account_changed_during_authentication" },
        });
        await connection.commit();
        return apiError(new AuthorizationError("UNAUTHENTICATED"));
      }

      await connection.execute(
        `INSERT INTO auth_sessions
          (id, user_id, token_hash, csrf_token_hash, created_at, last_seen_at, expires_at, source_ip_hash, user_agent_hash)
         VALUES (?, ?, ?, ?, NOW(3), NOW(3), DATE_ADD(NOW(3), INTERVAL 8 HOUR), ?, ?)`,
        [
          sessionId,
          user.id,
          tokenHash,
          csrfHash,
          context.sourceIp ? createHash("sha256").update(context.sourceIp).digest("hex") : null,
          context.userAgent ? createHash("sha256").update(context.userAgent).digest("hex") : null,
        ],
      );
      await connection.execute("UPDATE app_users SET last_login_at = NOW(3) WHERE id = ?", [user.id]);
      await writeSecurityEvent(connection, {
        userId: user.id,
        eventType: "auth.login.succeeded",
        outcome: "SUCCESS",
        subject: user.email,
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

    await clearEmailRateLimit(parsed.email).catch(() => undefined);
    const session = await resolveSessionToken(sessionToken);
    if (!session) throw new Error("SESSION_CREATION_FAILED");
    const response = jsonNoStore({
      data: {
        user: {
          id: session.userId,
          email: session.email,
          displayName: session.displayName,
          roles: session.roles,
          permissions: session.permissions,
          legalEntityIds: session.legalEntityIds,
        },
        expiresAt: session.expiresAt,
      },
    });
    response.cookies.set(sessionCookieName, sessionToken, sessionCookieOptions());
    response.cookies.set(csrfCookieName, csrfToken, csrfCookieOptions());
    return response;
  } catch (error) {
    return apiError(error);
  }
}
