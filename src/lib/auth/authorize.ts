import "server-only";

import { pool } from "@/lib/db/pool";
import { getSession, type SessionPrincipal } from "@/lib/auth/session";

export class AuthorizationError extends Error {
  constructor(public readonly code: "UNAUTHENTICATED" | "FORBIDDEN") {
    super(code);
    this.name = "AuthorizationError";
  }
}

export async function requireActiveSession(): Promise<SessionPrincipal> {
  const session = await getSession();
  if (!session) throw new AuthorizationError("UNAUTHENTICATED");

  // Re-check current account status on every protected request so deactivation takes effect
  // without waiting for a stateless cookie to expire.
  const [rows] = await pool.execute<Array<{ account_status: string } & import("mysql2").RowDataPacket>>(
    "SELECT account_status FROM app_users WHERE id = ? LIMIT 1",
    [session.userId],
  );
  if (rows.length !== 1 || rows[0].account_status !== "ACTIVE") {
    throw new AuthorizationError("UNAUTHENTICATED");
  }

  return session;
}

export async function requirePermission(permission: string): Promise<SessionPrincipal> {
  const session = await requireActiveSession();
  if (!session.permissions.includes(permission)) {
    throw new AuthorizationError("FORBIDDEN");
  }
  return session;
}

export async function requireLegalEntityScope(legalEntityId: string): Promise<SessionPrincipal> {
  const session = await requireActiveSession();
  if (!session.legalEntityIds.includes(legalEntityId)) {
    throw new AuthorizationError("FORBIDDEN");
  }
  return session;
}
