# Phase 05 — Authentication and Role-Based Access Control

**Status:** Security design baseline only. Authentication and authorization are not considered active until the implementation and security tests pass.

## Security boundary

- All business data and mutations are private by default.
- Authentication establishes the user identity; authorization separately decides whether that identity may perform an action on a resource.
- Enforce authorization on the server for every page loader, Route Handler, server action, file/PDF download and background job.
- Never rely on hidden UI controls, client-supplied role names, or untrusted headers for authorization.
- Every data query must be scoped to the user's permitted company/legal entities where applicable.
- Do not expose invoice/customer/payment information from a public health endpoint or unauthenticated API.

## Identity provider decision

Choose one supported identity strategy before implementing sessions:
1. Managed OIDC identity provider with MFA and organization-managed accounts; or
2. A deliberately selected application authentication library with secure password hashing, account recovery and MFA policy.

Do not roll a custom password/session system casually. Confirm whether users must sign in using company-managed email and whether Google/Microsoft SSO is required. Provider secrets must be deployment secrets, never repository files.

## Minimum roles and permissions

Role names are starting points; confirm the actual staff roster and separation-of-duties policy before assigning users.

- **System administrator:** manage system configuration and access; financial actions should still be explicitly permissioned and audited.
- **Finance administrator:** manage legal entities, numbering configuration, invoice/payment workflows and finance reports as approved.
- **Invoice creator:** create/edit drafts and view permitted records; cannot issue/cancel unless separately granted.
- **Invoice issuer:** issue invoices within assigned legal-entity scope.
- **Payment recorder:** record and allocate payments within assigned scope; reversal requires separate permission.
- **Approver:** approve/reject requests within configured thresholds; cannot approve their own request if separation-of-duties requires it.
- **Auditor/read-only:** view permitted records and audit events; no financial mutation.
- **Viewer:** read-only access to assigned resources.

Use permission identifiers such as `customers:read`, `customers:write`, `invoices:read`, `invoices:draft:create`, `invoices:draft:update`, `invoices:issue`, `invoices:cancel`, `payments:read`, `payments:record`, `payments:reverse`, `reports:read`, `audit:read`, `users:manage`, and `settings:manage`.

## Session and cookie requirements

- Use the selected provider/library's maintained session mechanism.
- Session cookies must be `HttpOnly`, `Secure` in production, and use an appropriate `SameSite` policy.
- Avoid storing session tokens in localStorage or sessionStorage.
- Rotate/invalidate sessions on sign-in, sign-out, password reset and privilege changes as supported by the chosen identity strategy.
- Apply CSRF protections to cookie-authenticated state-changing requests.
- Set idle/absolute expiration according to business security policy.
- Require re-authentication or step-up authentication for sensitive operations if the chosen provider supports it.

## Authorization and resource scoping

- Default deny: a permission must be explicitly granted.
- Check permission and legal-entity scope in the same server-side service path that loads/mutates the resource.
- Avoid insecure direct object references: knowing an invoice UUID must not grant access to it.
- Use consistent 401/403/404 semantics, including deliberate 404 concealment for inaccessible resources where appropriate.
- Separate configuration management from invoice issuance and payment reversal permissions.
- Restrict audit logs and exports because they may contain sensitive financial data.
- Background jobs must use an explicit service identity and re-check the current resource state before acting.

## Audit and account lifecycle

- Audit sign-in/security events without storing credentials or tokens.
- Record actor, action, target, time, outcome and safe metadata for role changes and sensitive financial operations.
- Provide controlled invitation/deactivation flows; deactivate access promptly when staff leave.
- Do not hard-code production administrator accounts or bootstrap passwords.
- Define recovery and emergency-access procedures; emergency access must be limited and auditable.

## Security test matrix

- Unauthenticated access to protected pages/routes is rejected.
- Authenticated user without permission receives a denial.
- User assigned to one legal entity cannot access another entity's invoices or PDFs.
- Client-provided role/scope values cannot elevate privileges.
- Session cookie flags and expiry are verified in production-like settings.
- CSRF protections are verified for cookie-authenticated writes.
- Revoked/deactivated accounts lose access.
- Permission checks apply to exports, file downloads and background jobs.
- Logs contain no passwords, session tokens or database secrets.

## Decisions required

- Identity provider and SSO requirements.
- User list, roles, legal-entity scope and permission assignments.
- MFA and account recovery requirements.
- Session lifetime and re-authentication policy.
- Separation-of-duties rules for approvals, issuance and payment reversals.

## Acceptance criteria

- [x] Threat boundaries and default-deny policy documented.
- [x] Starter roles and permission identifiers documented.
- [ ] Identity strategy selected and configured.
- [ ] Sessions and login/logout implemented securely.
- [ ] Server-side resource-scoped authorization implemented.
- [ ] Security and cross-entity access tests pass.
- [ ] Audit events for authentication and permission changes are verified.

Do not expose financial functionality publicly until authentication and authorization are implemented and tested.
