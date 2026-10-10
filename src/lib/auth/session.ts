import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE_NAME = "fx_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;

export type SessionPrincipal = {
  userId: string;
  email: string;
  permissions: string[];
  legalEntityIds: string[];
  expiresAt: number;
};

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) {
    throw new Error("SESSION_SECRET must be configured with at least 32 characters");
  }
  return value;
}

function signature(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

function equalSignature(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createSessionToken(input: Omit<SessionPrincipal, "expiresAt">, now = Date.now()): string {
  if (!input.userId || !input.email) throw new Error("Session identity is incomplete");
  const payload = Buffer.from(JSON.stringify({
    ...input,
    expiresAt: Math.floor(now / 1000) + SESSION_MAX_AGE_SECONDS,
  })).toString("base64url");
  return `${payload}.${signature(payload)}`;
}

export function verifySessionToken(token: string, now = Date.now()): SessionPrincipal | null {
  const [payload, suppliedSignature, extra] = token.split(".");
  if (!payload || !suppliedSignature || extra) return null;

  let expected: string;
  try {
    expected = signature(payload);
  } catch {
    return null;
  }
  if (!equalSignature(suppliedSignature, expected)) return null;

  try {
    const value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<SessionPrincipal>;
    if (
      typeof value.userId !== "string" ||
      typeof value.email !== "string" ||
      !Array.isArray(value.permissions) ||
      !value.permissions.every((item) => typeof item === "string") ||
      !Array.isArray(value.legalEntityIds) ||
      !value.legalEntityIds.every((item) => typeof item === "string") ||
      typeof value.expiresAt !== "number" ||
      value.expiresAt <= Math.floor(now / 1000)
    ) return null;

    return value as SessionPrincipal;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<SessionPrincipal | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  return token ? verifySessionToken(token) : null;
}

export async function requireSession(): Promise<SessionPrincipal> {
  const session = await getSession();
  if (!session) throw new Error("UNAUTHENTICATED");
  return session;
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

export const sessionCookieName = COOKIE_NAME;
