import "server-only";

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
  return session;
}

export async function requirePermission(permission: string): Promise<SessionPrincipal> {
  const session = await requireActiveSession();
  if (!session.permissions.includes(permission)) throw new AuthorizationError("FORBIDDEN");
  return session;
}

export async function requireLegalEntityScope(legalEntityId: string): Promise<SessionPrincipal> {
  const session = await requireActiveSession();
  if (!session.legalEntityIds.includes(legalEntityId)) throw new AuthorizationError("FORBIDDEN");
  return session;
}

export async function requirePermissionForEntity(
  permission: string,
  legalEntityId: string,
): Promise<SessionPrincipal> {
  const session = await requirePermission(permission);
  if (!session.legalEntityIds.includes(legalEntityId)) throw new AuthorizationError("FORBIDDEN");
  return session;
}
