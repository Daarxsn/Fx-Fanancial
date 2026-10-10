import { createCsrfToken } from "@/lib/auth/csrf";
import { csrfCookieName, csrfCookieOptions } from "@/lib/auth/session";
import { jsonNoStore } from "@/lib/http/api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const token = createCsrfToken();
  const response = jsonNoStore({ data: { csrfToken: token } });
  response.cookies.set(csrfCookieName, token, csrfCookieOptions(15 * 60));
  return response;
}
