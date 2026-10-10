import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { resolveSessionToken, readSessionTokenFromRequest, readCsrfTokenFromRequest } from "@/lib/auth/session";

export class CsrfError extends Error {
  constructor() { super("CSRF_INVALID"); this.name = "CsrfError"; }
}

function constantTimeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function assertSameOrigin(request: NextRequest): void {
  const source = request.headers.get("origin") ?? request.headers.get("referer");
  if (!source) throw new CsrfError();
  try {
    if (new URL(source).origin !== request.nextUrl.origin) throw new CsrfError();
  } catch {
    throw new CsrfError();
  }
  if (request.headers.get("sec-fetch-site") === "cross-site") throw new CsrfError();
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
  if (!cookieToken || !headerToken || !constantTimeEqual(cookieToken, headerToken)) throw new CsrfError();
  if (options.checkSession === false) return;

  const rawSession = readSessionTokenFromRequest(request);
  if (!rawSession) return;
  const session = await resolveSessionToken(rawSession);
  if (!session || !constantTimeEqual(
    createHash("sha256").update(cookieToken).digest("hex"),
    session.csrfTokenHash,
  )) throw new CsrfError();
}
