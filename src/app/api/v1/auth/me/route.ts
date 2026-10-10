import { getSession } from "@/lib/auth/session";
import { apiError, jsonNoStore } from "@/lib/http/api-response";
import { AuthorizationError } from "@/lib/auth/authorize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) throw new AuthorizationError("UNAUTHENTICATED");
    return jsonNoStore({
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
  } catch (error) {
    return apiError(error);
  }
}
