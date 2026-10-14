import "server-only";
import { AuthorizationError } from "@/lib/auth/authorize";
import type { SessionPrincipal } from "@/lib/auth/session";

/** Financial configuration requires an explicitly assigned finance-administrator role.
 * settings:manage alone is not approval authority: a system administrator must not implicitly
 * approve tax registrations/rates or activate a financial number series.
 */
export function requireFinanceConfigurationApprover(actor: SessionPrincipal): SessionPrincipal {
  if (!actor.roles.includes("finance_admin")) throw new AuthorizationError("FORBIDDEN");
  return actor;
}
