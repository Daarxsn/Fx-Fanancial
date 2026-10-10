import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { resolveSessionToken, readSessionTokenFromRequest, readCsrfTokenFromRequest } from "@/lib/auth/session";

export type CsrfFailureReason = "ORIGIN_MISSING" | "ORIGIN_MISMATCH" | "CROSS_SITE" | "TOKEN_MISSING" | "TOKEN_MISMATCH" | "SESSION_INVALID" | "SESSION_TOKEN_MISMATCH";

export class CsrfError extends Error {
  constructor(public readonly reason: CsrfFailureReason) {
    super("CSRF_INVALID");
    this.name = "CsrfError";
  }
}

function constantTimeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function assertSameOrigin(request: NextRequest): void {
  const source = request.headers.get("origin") ?? request.headers.get("referer");
  if (!source) throw new CsrfError("ORIGIN_MISSING");
  try {
    if (new URL(source).origin !== request.nextUrl.origin) throw new CsrfError("ORIGIN_MISMATCH");
  } catch {
    throw new CsrfError("ORIGIN_MISMATCH");
  }
  if (request.headers.get("sec-fetch-site") === "cross-site") throw new CsrfError("CROSS_SITE");
}

export function createCsrfToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function assertCsrf(
  request: NextRequest,
  options: { checkSession?: boolean } = {},
): Promise<void> {
  assertSameOrigin(request);
  const cookieToken = readCsrfTokenFromRequest(request);
  const headerToken = request.headers.get("x-csrf-token");
  if (!cookieToken || !headerToken) throw new CsrfError("TOKEN_MISSING");
  if (!constantTimeEqual(cookieToken, headerToken)) throw new CsrfError("TOKEN_MISMATCH");
  if (options.checkSession === false) return;

  const rawSession = readSessionTokenFromRequest(request);
  if (!rawSession) return;
  const session = await resolveSessionToken(rawSession);
  if (!session) throw new CsrfError("SESSION_INVALID");
  if (!constantTimeEqual(
    createHash("sha256").update(cookieToken).digest("hex"),
    session.csrfTokenHash,
  )) throw new CsrfError("SESSION_TOKEN_MISMATCH");
}
