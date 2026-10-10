import { NextRequest } from "next/server";
import { assertCsrf } from "@/lib/auth/csrf";
import { getSession, sessionCookieName, csrfCookieName, sessionCookieOptions, csrfCookieOptions } from "@/lib/auth/session";
import { pool } from "@/lib/db/pool";
import { requestSecurityContext, writeSecurityEvent } from "@/lib/auth/security-events";
import { jsonNoStore, apiError } from "@/lib/http/api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    await assertCsrf(request);
    const session = await getSession();
    const context = requestSecurityContext(request);
    if (session) {
      await pool.execute(
        "UPDATE auth_sessions SET revoked_at = NOW(3), revoked_reason = 'USER_LOGOUT' WHERE id = ? AND revoked_at IS NULL",
        [session.sessionId],
      );
      await writeSecurityEvent(pool, {
        userId: session.userId,
        eventType: "auth.logout",
        outcome: "SUCCESS",
        subject: session.email,
        sourceIp: context.sourceIp,
        userAgent: context.userAgent,
      });
    }
    const response = jsonNoStore({ data: { loggedOut: true } });
    response.cookies.set(sessionCookieName, "", { ...sessionCookieOptions(), maxAge: 0, expires: new Date(0) });
    response.cookies.set(csrfCookieName, "", { ...csrfCookieOptions(), maxAge: 0, expires: new Date(0) });
    return response;
  } catch (error) {
    return apiError(error);
  }
}
