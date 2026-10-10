import { NextRequest } from "next/server";
import { assertCsrf } from "@/lib/auth/csrf";
import { getSession, sessionCookieName, csrfCookieName, sessionCookieOptions, csrfCookieOptions } from "@/lib/auth/session";
import { pool } from "@/lib/db/pool";
import { requestSecurityContext, writeSecurityEvent } from "@/lib/auth/security-events";
import { apiError, jsonNoStore } from "@/lib/http/api-response";
import { AuthorizationError } from "@/lib/auth/authorize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    await assertCsrf(request);
    const session = await getSession();
    if (!session) throw new AuthorizationError("UNAUTHENTICATED");
    const context = requestSecurityContext(request);
    await pool.execute(
      "UPDATE auth_sessions SET revoked_at=NOW(3), revoked_reason='USER_REVOKED_ALL' WHERE user_id=? AND revoked_at IS NULL",
      [session.userId],
    );
    await writeSecurityEvent(pool, {
      userId: session.userId,
      eventType: "auth.sessions.revoked_all",
      outcome: "SUCCESS",
      subject: session.email,
      sourceIp: context.sourceIp,
      userAgent: context.userAgent,
    });
    const response = jsonNoStore({ data: { loggedOut: true, sessionsRevoked: true } });
    response.cookies.set(sessionCookieName, "", { ...sessionCookieOptions(), maxAge: 0, expires: new Date(0) });
    response.cookies.set(csrfCookieName, "", { ...csrfCookieOptions(), maxAge: 0, expires: new Date(0) });
    return response;
  } catch (error) { return apiError(error); }
}
