import assert from "node:assert/strict";
import { createHmac, randomBytes, randomUUID, scrypt as scryptCallback } from "node:crypto";
import mysql from "mysql2/promise";

const baseUrl = process.env.API_TEST_BASE_URL ?? "http://127.0.0.1:3002";
const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret || sessionSecret.length < 32) throw new Error("A CI-only SESSION_SECRET of at least 32 characters is required");

const db = await mysql.createConnection({
  host: process.env.DATABASE_HOST ?? "127.0.0.1",
  port: Number(process.env.DATABASE_PORT ?? "3306"),
  database: process.env.DATABASE_NAME ?? "falchion_ci",
  user: process.env.DATABASE_USER ?? "root",
  password: process.env.DATABASE_PASSWORD ?? "",
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: true } : undefined,
  connectTimeout: 10000,
});

function hashPassword(password) {
  return new Promise((resolve, reject) => {
    const salt = randomBytes(16);
    scryptCallback(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, key) => {
      if (error) return reject(error);
      resolve("scrypt$32768$8$1$" + salt.toString("base64url") + "$" + key.toString("base64url"));
    });
  });
}

const EXPECTED_PERMISSION_KEYS = [
  "customers:read",
  "customers:write",
  "customers:archive",
  "catalog:read",
  "catalog:write",
  "catalog:archive",
  "invoices:read",
  "invoices:draft:create",
  "invoices:draft:update",
  "invoices:issue",
  "invoices:cancel",
  "payments:read",
  "payments:record",
  "payments:reverse",
  "quotations:read",
  "quotations:write",
  "approvals:read",
  "approvals:decide",
  "reports:read",
  "audit:read",
  "users:manage",
  "settings:manage"
];

// Exact CI baseline. Catch accidental permission additions/removals without changing the production
// rule that an already-customized role mapping is not overwritten by a repeat seed.
const EXPECTED_ROLE_GRANTS = {
  "system_admin": [
    "users:manage",
    "settings:manage",
    "audit:read"
  ],
  "finance_admin": [
    "customers:read",
    "customers:write",
    "customers:archive",
    "catalog:read",
    "catalog:write",
    "catalog:archive",
    "invoices:read",
    "invoices:draft:create",
    "invoices:draft:update",
    "invoices:issue",
    "invoices:cancel",
    "payments:read",
    "payments:record",
    "payments:reverse",
    "quotations:read",
    "quotations:write",
    "approvals:read",
    "approvals:decide",
    "reports:read",
    "audit:read",
    "settings:manage"
  ],
  "invoice_creator": [
    "customers:read",
    "customers:write",
    "catalog:read",
    "invoices:read",
    "invoices:draft:create",
    "invoices:draft:update",
    "quotations:read",
    "quotations:write"
  ],
  "invoice_issuer": [
    "customers:read",
    "catalog:read",
    "invoices:read",
    "invoices:issue",
    "quotations:read"
  ],
  "payment_recorder": [
    "customers:read",
    "invoices:read",
    "payments:read",
    "payments:record"
  ],
  "approver": [
    "invoices:read",
    "quotations:read",
    "approvals:read",
    "approvals:decide"
  ],
  "auditor": [
    "customers:read",
    "catalog:read",
    "invoices:read",
    "payments:read",
    "quotations:read",
    "approvals:read",
    "reports:read",
    "audit:read"
  ]
};

async function seedUser(roleKey, email, status = "ACTIVE", password = "Phase Five Strong Password!", legalEntityIds = []) {
  const userId = randomUUID();
  const hash = status === "ACTIVE" ? await hashPassword(password) : null;
  await db.execute(
    "INSERT INTO app_users (id,email,display_name,identity_provider,provider_subject,password_hash,account_status) VALUES (?,?,?,'local_password',?,?,?)",
    [userId, email, "Phase 05 CI User", email, hash, status],
  );
  const [roles] = await db.execute("SELECT id FROM app_roles WHERE role_key=? LIMIT 1", [roleKey]);
  assert.equal(roles.length, 1, `role template ${roleKey} exists`);
  await db.execute("INSERT INTO user_roles (user_id,role_id) VALUES (?,?)", [userId, roles[0].id]);
  for (const legalEntityId of new Set(legalEntityIds)) {
    await db.execute(
      "INSERT INTO user_legal_entity_access (user_id, legal_entity_id, granted_by) VALUES (?, ?, NULL)",
      [userId, legalEntityId],
    );
  }
  return { userId, email, password };
}

function cookiePairs(response) {
  const getSetCookie = response.headers.getSetCookie?.bind(response.headers);
  const rows = getSetCookie ? getSetCookie() : [response.headers.get("set-cookie")].filter(Boolean);
  return rows.map((row) => row.split(";")[0]).filter(Boolean);
}
function cookieHeader(jar) {
  return [...jar.entries()].map(([key, value]) => key + "=" + value).join("; ");
}
function applyCookies(jar, response) {
  for (const pair of cookiePairs(response)) {
    const index = pair.indexOf("=");
    if (index < 0) continue;
    const key = pair.slice(0, index);
    const value = pair.slice(index + 1);
    if (!value) jar.delete(key);
    else jar.set(key, value);
  }
}
function assertRequestId(response, body) {
  const requestId = response.headers.get("x-request-id");
  assert.ok(requestId, "X-Request-Id must be returned");
  if (body?.meta?.requestId) assert.equal(body.meta.requestId, requestId);
  if (body?.error?.requestId) assert.equal(body.error.requestId, requestId);
}
async function call(path, options = {}, jar = new Map(), { csrf = true } = {}) {
  const method = (options.method ?? "GET").toUpperCase();
  const headers = { ...(options.headers ?? {}) };
  if (jar.size) headers.Cookie = cookieHeader(jar);
  if (options.body) headers["Content-Type"] ??= "application/json";
  if (method !== "GET" && method !== "HEAD") {
    headers.Origin ??= baseUrl;
    headers["Sec-Fetch-Site"] ??= "same-origin";
    if (csrf && jar.get("fx_csrf")) headers["X-CSRF-Token"] ??= jar.get("fx_csrf");
  }
  const response = await fetch(new URL(path, baseUrl), { ...options, headers, cache: "no-store" });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  assertRequestId(response, body);
  applyCookies(jar, response);
  return { response, body, jar };
}
async function getCsrf() {
  const jar = new Map();
  const response = await fetch(new URL("/api/v1/auth/csrf", baseUrl), { cache: "no-store" });
  const body = await response.json();
  assertRequestId(response, body);
  applyCookies(jar, response);
  assert.equal(typeof jar.get("fx_csrf"), "string");
  assert.equal(body.data.csrfToken, jar.get("fx_csrf"));
  const setCookies = cookiePairs(response);
  const csrfSetCookie = setCookies.find((item) => item.startsWith("fx_csrf="));
  assert.ok(csrfSetCookie);
  const rawHeaders = response.headers.getSetCookie?.() ?? [response.headers.get("set-cookie") ?? ""];
  const csrfHeader = rawHeaders.find((item) => item.startsWith("fx_csrf=")) ?? "";
  assert.match(csrfHeader, /SameSite=Strict/i);
  assert.doesNotMatch(csrfHeader, /HttpOnly/i);
  return jar;
}
async function login(user) {
  const jar = await getCsrf();
  const result = await call("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: user.email, password: user.password }),
  }, jar);
  assert.equal(result.response.status, 200, "login should succeed for active account with correct credentials; received " + result.response.status + " " + JSON.stringify(result.body?.error ?? null));
  assert.equal(result.body.data.user.email, user.email);
  assert.ok(Array.isArray(result.body.data.user.roles));
  assert.ok(Array.isArray(result.body.data.user.permissions));
  assert.ok(jar.get("fx_session"));
  assert.equal(JSON.stringify(result.body).includes(jar.get("fx_session")), false, "raw session token must never appear in response JSON");
  const rawHeaders = result.response.headers.getSetCookie?.() ?? [result.response.headers.get("set-cookie") ?? ""];
  const sessionHeader = rawHeaders.find((item) => item.startsWith("fx_session=")) ?? "";
  const csrfHeader = rawHeaders.find((item) => item.startsWith("fx_csrf=")) ?? "";
  assert.match(sessionHeader, /HttpOnly/i, "session cookie must be HttpOnly");
  assert.match(sessionHeader, /SameSite=Lax/i);
  assert.match(sessionHeader, /Path=\//i);
  assert.doesNotMatch(sessionHeader, /Secure/i, "development cookie is non-Secure; production config enables Secure");
  assert.doesNotMatch(csrfHeader, /HttpOnly/i, "CSRF cookie needs to be readable by same-origin client code");
  return { jar, body: result.body };
}
async function expectStatus(promise, status, label) {
  const result = await promise;
  assert.equal(result.response.status, status, label);
  return result;
}
function assertPage(body, limit) {
  assert.ok(Array.isArray(body.data), "list response data must be an array");
  assert.equal(body.meta.pagination.limit, limit);
  assert.equal(typeof body.meta.pagination.offset, "number");
  assert.equal(typeof body.meta.pagination.hasMore, "boolean");
  assert.equal("page" in body, false, "legacy top-level page field must not be returned");
}

async function assertRoleGrantMatrix() {
  const [permissionRows] = await db.execute("SELECT permission_key FROM app_permissions ORDER BY permission_key");
  assert.deepEqual(permissionRows.map((row) => row.permission_key).sort(), [...EXPECTED_PERMISSION_KEYS].sort(),
    "permission catalog must match the reviewed baseline exactly");

  const [mappingRows] = await db.execute(
    `SELECT r.role_key, p.permission_key
       FROM app_roles r
       LEFT JOIN role_permissions rp ON rp.role_id = r.id
       LEFT JOIN app_permissions p ON p.id = rp.permission_id
      ORDER BY r.role_key, p.permission_key`,
  );
  const actualGrants = Object.fromEntries(Object.keys(EXPECTED_ROLE_GRANTS).map((roleKey) => [roleKey, []]));
  for (const row of mappingRows) {
    assert.ok(Object.hasOwn(actualGrants, row.role_key),
      "unexpected role template must not silently enter the reference baseline: " + row.role_key);
    if (row.permission_key) actualGrants[row.role_key].push(row.permission_key);
  }
  assert.deepEqual(Object.keys(actualGrants).sort(), Object.keys(EXPECTED_ROLE_GRANTS).sort(),
    "all seven reviewed role templates must exist, with no unknown role template");
  for (const [roleKey, permissions] of Object.entries(EXPECTED_ROLE_GRANTS)) {
    assert.deepEqual(actualGrants[roleKey].sort(), [...permissions].sort(),
      "least-privilege grants for " + roleKey + " must match the reviewed matrix exactly");
  }
  console.log("PASS: all 22 permission definitions and all seven exact role-grant templates match the least-privilege baseline.");
}

async function assertRoleSurface(roleKey, session) {
  const expected = EXPECTED_ROLE_GRANTS[roleKey];
  assert.ok(expected, "role must have a reviewed grant template: " + roleKey);
  const profile = await call("/api/v1/auth/me", {}, session.jar);
  assert.equal(profile.response.status, 200, roleKey + " can read its own session profile");
  assert.deepEqual(profile.body.data.user.roles, [roleKey], roleKey + " session role must be database-derived");
  assert.deepEqual([...profile.body.data.user.permissions].sort(), [...expected].sort(),
    roleKey + " effective session permissions must equal the database grant matrix");

  for (const surface of [
    { path: "/api/v1/customers?limit=1&offset=0", permission: "customers:read" },
    { path: "/api/v1/catalog/items?limit=1&offset=0", permission: "catalog:read" },
  ]) {
    const result = await call(surface.path, {}, session.jar);
    const allowed = expected.includes(surface.permission);
    assert.equal(result.response.status, allowed ? 200 : 403,
      roleKey + (allowed ? " must be allowed to read " : " must be denied reading ") + surface.permission);
    if (!allowed) assert.equal(result.body.error.code, "FORBIDDEN");
  }

  for (const surface of [
    { path: "/api/v1/customers", permission: "customers:write", body: { name: "RBAC regression fixture" } },
    { path: "/api/v1/catalog/items", permission: "catalog:write", body: {} },
  ]) {
    if (expected.includes(surface.permission)) continue;
    const result = await call(surface.path, { method: "POST", body: JSON.stringify(surface.body) }, session.jar);
    assert.equal(result.response.status, 403, roleKey + " must be denied " + surface.permission);
    assert.equal(result.body.error.code, "FORBIDDEN");
  }

  const users = await call("/api/v1/users?limit=1&offset=0", {}, session.jar);
  const canManageUsers = expected.includes("users:manage");
  assert.equal(users.response.status, canManageUsers ? 200 : 403,
    roleKey + (canManageUsers ? " must be allowed to manage users" : " must not access the user directory"));
  if (!canManageUsers) assert.equal(users.body.error.code, "FORBIDDEN");
}

try {
  await assertRoleGrantMatrix();
  const suffix = randomUUID().replaceAll("-", "").slice(0, 10);
  const testLegalEntityId = randomUUID();
  await db.execute(
    "INSERT INTO legal_entities (id, legal_name, display_name, address_json, currency, is_active) " +
    "VALUES (?, ?, ?, JSON_OBJECT('line1', 'CI-only fixture'), 'INR', TRUE)",
    [testLegalEntityId, "CI Test Legal Entity " + suffix, "CI Test Entity " + suffix],
  );
  const staff = await seedUser("invoice_creator", "staff-" + suffix + "@example.invalid");
  const viewer = await seedUser("auditor", "viewer-" + suffix + "@example.invalid", "ACTIVE", "Viewer Strong Password #5!", [testLegalEntityId]);
  const admin = await seedUser("system_admin", "admin-" + suffix + "@example.invalid", "ACTIVE", "Admin Strong Password #5!");
  const suspended = await seedUser("auditor", "suspended-" + suffix + "@example.invalid", "SUSPENDED", "Suspended Password #5!");
  const issuer = await seedUser("invoice_issuer", "issuer-" + suffix + "@example.invalid", "ACTIVE", "Issuer Strong Password #5!");
  const paymentRecorder = await seedUser("payment_recorder", "payments-" + suffix + "@example.invalid", "ACTIVE", "Payment Strong Password #5!");
  const approver = await seedUser("approver", "approver-" + suffix + "@example.invalid", "ACTIVE", "Approver Strong Password #5!");

  for (const path of ["/api/v1/customers", "/api/v1/catalog/items", "/api/v1/users"]) {
    const anonymous = await expectStatus(call(path), 401, "unauthenticated reads must be denied: " + path);
    assert.equal(anonymous.body.error.code, "UNAUTHENTICATED");
  }

  for (const path of ["/", "/customers"]) {
    const pageResponse = await fetch(new URL(path, baseUrl), { redirect: "manual", cache: "no-store" });
    assert.ok([307, 308].includes(pageResponse.status), `anonymous workspace page ${path} must redirect to sign-in`);
    const redirectTarget = pageResponse.headers.get("location");
    assert.ok(redirectTarget && new URL(redirectTarget, baseUrl).pathname === "/login", `anonymous workspace page ${path} redirects to /login`);
  }
  const forgedPayload = Buffer.from(JSON.stringify({
    userId: staff.userId, email: staff.email, permissions: ["users:manage", "customers:write"],
    legalEntityIds: ["all"], expiresAt: Math.floor(Date.now() / 1000) + 3600,
  })).toString("base64url");
  const forgedSignature = createHmac("sha256", sessionSecret).update(forgedPayload).digest("base64url");
  const forged = await call("/api/v1/users", { headers: { Cookie: "fx_session=" + forgedPayload + "." + forgedSignature } });
  assert.equal(forged.response.status, 401, "client-claimed signed permission payload without a database session must not authenticate");

  const staffSession = await login(staff);
  const noCsrf = await expectStatus(
    call("/api/v1/customers", { method: "POST", body: JSON.stringify({ name: "CSRF bypass attempt" }) }, staffSession.jar, { csrf: false }),
    403,
    "unsafe session-authenticated request without CSRF token must be denied",
  );
  assert.equal(noCsrf.body.error.code, "CSRF_INVALID");
  const wrongOrigin = await expectStatus(
    call("/api/v1/customers", {
      method: "POST",
      headers: { Origin: "https://untrusted.example", "Sec-Fetch-Site": "cross-site" },
      body: JSON.stringify({ name: "Cross-origin CSRF attempt" }),
    }, staffSession.jar),
    403,
    "cross-origin unsafe request must be denied",
  );
  assert.equal(wrongOrigin.body.error.code, "CSRF_INVALID");
  const wrongCsrf = await expectStatus(
    call("/api/v1/customers", {
      method: "POST",
      headers: { "X-CSRF-Token": "wrong-token-value" },
      body: JSON.stringify({ name: "Invalid CSRF token attempt" }),
    }, staffSession.jar),
    403,
    "wrong CSRF token must be denied",
  );
  assert.equal(wrongCsrf.body.error.code, "CSRF_INVALID");

  const customerName = "Phase 05 Auth Test Customer " + suffix;
  const created = await call("/api/v1/customers", {
    method: "POST", body: JSON.stringify({ name: customerName, email: "customer-" + suffix + "@example.invalid" }),
  }, staffSession.jar);
  assert.equal(created.response.status, 201, "authorized staff role can create a customer");
  assert.equal(created.body.data.name, customerName);
  const list = await call("/api/v1/customers?query=" + encodeURIComponent(customerName) + "&status=all&limit=25&offset=0", {}, staffSession.jar);
  assert.equal(list.response.status, 200);
  assertPage(list.body, 25);
  assert.ok(list.body.data.some((row) => row.id === created.body.data.id));
  assert.equal("billing_address_json" in list.body.data[0], false);

  // Phase 6A: identity, sensitive billing details, mappings and historical integrity.
  const phase6aFinance = await seedUser("finance_admin", "phase6a-finance-" + suffix + "@example.invalid", "ACTIVE",
    "Phase 6A Finance Password #5!", [testLegalEntityId]);
  const phase6aSession = await login(phase6aFinance);
  const accountNumber = "1234567890123456";
  async function createPhase6aEntity(label, bankDetails = undefined) {
    const body = {
      legalName: "Phase 6A Legal Entity " + label + " " + suffix,
      displayName: "Phase 6A Entity " + label + " " + suffix,
      registrationNumber: "CI-REG-" + label + "-" + suffix,
      taxIdentifier: "",
      address: { line1: "10 Example Road", city: "Pune", state: "Maharashtra", postalCode: "411001", countryCode: "IN" },
      billingAddress: { line1: "Finance Office", city: "Pune", state: "Maharashtra", postalCode: "411002", countryCode: "IN" },
      countryCode: "IN", currency: "INR", invoiceEmail: "billing-" + label.toLowerCase() + "-" + suffix + "@example.invalid",
      invoicePhone: "+91-2000000000", website: "https://example.invalid", locale: "en-IN", timeZone: "Asia/Kolkata",
      logoReference: "asset://phase6a/" + label.toLowerCase(), invoiceTerms: "CI only — payment terms are a test fixture.",
      invoiceFooter: "CI fixture footer", defaultTaxCode: "", taxSetupStatus: "UNCONFIGURED",
      changeReason: "Phase 6A automated acceptance fixture", ...(bankDetails ? { bankDetails } : {}),
    };
    const result = await call("/api/v1/legal-entities", { method: "POST", body: JSON.stringify(body) }, phase6aSession.jar);
    assert.equal(result.response.status, 201, "finance administrator creates Phase 6A legal entity: " + JSON.stringify(result.body?.error ?? null));
    assert.ok(result.body.data.id);
    assert.deepEqual(result.body.data.billingAddress, body.billingAddress, "billing address is persisted separately from registered address");
    return result;
  }
  const entityAResult = await createPhase6aEntity("A", {
    accountName: "CI Only Account", bankName: "Example Test Bank", accountNumber,
    ifsc: "TEST0000123", swift: "TESTINBB",
  });
  const entityBResult = await createPhase6aEntity("B");
  const entityA = entityAResult.body.data;
  const entityB = entityBResult.body.data;
  assert.equal(entityA.bankAccountLast4, "3456");
  assert.equal(entityA.bankDetailsConfigured, true);
  assert.equal("bankDetails" in entityA, false, "ordinary API responses must never return full bank details");
  assert.equal(JSON.stringify(entityAResult.body).includes(accountNumber), false, "legal-entity create response must mask the complete bank account number");

  const entityAudit = await db.execute(
    "SELECT change_reason,before_json,after_json FROM audit_events WHERE entity_type='legal_entity' AND entity_id=? ORDER BY created_at DESC LIMIT 1",
    [entityA.id],
  );
  assert.equal(entityAudit[0].length, 1);
  assert.equal(entityAudit[0][0].change_reason, "Phase 6A automated acceptance fixture");
  const auditAfter = typeof entityAudit[0][0].after_json === "string" ? JSON.parse(entityAudit[0][0].after_json) : entityAudit[0][0].after_json;
  assert.equal(auditAfter.bankAccountLast4, "3456");
  assert.equal(JSON.stringify(auditAfter).includes(accountNumber), false, "audit before/after JSON must not expose full bank account numbers");

  const entityUpdate = await call("/api/v1/legal-entities/" + entityA.id, {
    method: "PATCH",
    body: JSON.stringify({ invoiceFooter: "Updated CI-only footer", changeReason: "Phase 6A version history acceptance update" }),
  }, phase6aSession.jar);
  assert.equal(entityUpdate.response.status, 200, "legal entity update must create a new version");
  assert.equal(entityUpdate.body.data.invoiceFooter, "Updated CI-only footer");
  const entityDetail = await call("/api/v1/legal-entities/" + entityA.id, {}, phase6aSession.jar);
  assert.equal(entityDetail.response.status, 200);
  assert.ok(entityDetail.body.data.versions.length >= 2, "each legal entity edit must preserve version metadata");
  assert.equal(JSON.stringify(entityDetail.body).includes(accountNumber), false, "legal entity detail and version metadata must not expose bank account numbers");

  const nonFinanceEntityOperator = await seedUser("system_admin", "phase6a-operator-" + suffix + "@example.invalid", "ACTIVE",
    "Phase 6A Operator Password #5!", [entityA.id]);
  const operatorSession = await login(nonFinanceEntityOperator);
  const forbiddenBankUpdate = await call("/api/v1/legal-entities/" + entityA.id, {
    method: "PATCH",
    body: JSON.stringify({ bankDetails: { accountName: "CI Only Account", bankName: "Example Test Bank", accountNumber: "1111222233334444" },
      changeReason: "Attempted bank change by non-finance administrator" }),
  }, operatorSession.jar);
  assert.equal(forbiddenBankUpdate.response.status, 403, "bank detail changes require finance_admin even with settings:manage");
  assert.equal(JSON.stringify(forbiddenBankUpdate.body).includes(accountNumber), false);

  const brandCode = "P6A-" + suffix.toUpperCase();
  const brandCreated = await call("/api/v1/brands", {
    method: "POST",
    body: JSON.stringify({ name: "Phase 6A Test Brand " + suffix, code: brandCode,
      description: "CI-only commercial brand", logoReference: "asset://phase6a/brand",
      theme: { accentColor: "#DCAF51", presentationStyle: "STANDARD" }, defaultTemplateKey: "STANDARD",
      legalEntityIds: [entityA.id], changeReason: "Phase 6A brand creation fixture" }),
  }, phase6aSession.jar);
  assert.equal(brandCreated.response.status, 201, "brand creation with explicit entity mapping should succeed: " + JSON.stringify(brandCreated.body?.error ?? null));
  const invalidBrandAccent = await call("/api/v1/brands", {
    method: "POST",
    body: JSON.stringify({ name: "Invalid Accent Brand " + suffix, code: "BADACC-" + suffix.toUpperCase(),
      theme: { accentColor: "#123456" }, legalEntityIds: [entityA.id], changeReason: "Reject an accent outside the approved palette" }),
  }, phase6aSession.jar);
  assert.equal(invalidBrandAccent.response.status, 422, "brand creation must reject unapproved brand-guide accent colours");
  const brandId = brandCreated.body.data.id;
  const brandMoved = await call("/api/v1/brands/" + brandId, {
    method: "PATCH",
    body: JSON.stringify({ legalEntityIds: [entityB.id], changeReason: "Phase 6A brand mapping history acceptance update" }),
  }, phase6aSession.jar);
  assert.equal(brandMoved.response.status, 200, "brand mapping can be explicitly changed");
  assert.deepEqual(brandMoved.body.data.legalEntityIds, [entityB.id]);
  const [brandLinks] = await db.execute(
    "SELECT legal_entity_id,effective_from,effective_until,is_default FROM brand_legal_entities WHERE brand_id=? ORDER BY effective_from",
    [brandId],
  );
  assert.equal(brandLinks.length, 2, "old brand mapping row is retained rather than deleted");
  assert.ok(brandLinks.find((row) => row.legal_entity_id === entityA.id)?.effective_until, "removed brand mapping has an effective end");
  assert.equal(brandLinks.find((row) => row.legal_entity_id === entityB.id)?.effective_until ?? null, null, "new mapping is active");
  const [brandVersions] = await db.execute("SELECT COUNT(*) AS n FROM brand_config_versions WHERE brand_id=?", [brandId]);
  assert.equal(Number(brandVersions[0].n), 2, "brand updates append a configuration version");

  // Phase 6B: incomplete entity configuration must block issuance without allocating a number.
  const [issueCustomerRows] = await db.execute(
    "SELECT id FROM customers WHERE id=? AND is_active=TRUE LIMIT 1",
    [created.body.data.id],
  );
  assert.equal(issueCustomerRows.length,1,"issuance test uses an active CI customer");
  const incompleteInvoiceId=randomUUID();
  await db.execute(
    "INSERT INTO invoices (id,legal_entity_id,brand_id,customer_id,document_type,lifecycle_status,payment_terms_days,currency,subtotal,discount_total,tax_total,grand_total) VALUES (?, ?, NULL, ?, 'INVOICE','DRAFT',30,'INR',100.0000,0,0,100.0000)",
    [incompleteInvoiceId,testLegalEntityId,created.body.data.id],
  );
  await db.execute(
    "INSERT INTO invoice_lines (id,invoice_id,line_number,description,quantity,unit_price,discount_amount,tax_rate,tax_code,tax_rule_id,tax_registration_id,tax_amount,line_total) VALUES (?,?,1,'CI issue gate line',1.0000,100.0000,0,0,NULL,NULL,NULL,0,100.0000)",
    [randomUUID(),incompleteInvoiceId],
  );
  const blockedIncompleteIssue=await call("/api/v1/invoices/"+incompleteInvoiceId+"/issue",{
    method:"POST",headers:{"Idempotency-Key":"ci-incomplete-"+suffix.toLowerCase()+"-001"},
    body:JSON.stringify({documentDate:new Date().toISOString().slice(0,10)}),
  },phase6aSession.jar);
  assert.equal(blockedIncompleteIssue.response.status,409,"unconfigured tax setup blocks issuance");
  assert.equal(blockedIncompleteIssue.body.error.code,"CONFIGURATION_NOT_READY");

  // Complete positive Phase 6B path: approved setup -> issue -> immutable snapshot -> safe idempotent replay.
  const phase6bSuffix=suffix.toUpperCase();
  const phase6bTaxCode="P6B_STD_"+phase6bSuffix;
  const approvalUpdate=await call("/api/v1/legal-entities/"+entityA.id,{
    method:"PATCH",
    body:JSON.stringify({taxSetupStatus:"APPROVED_CONFIGURED",
      taxSetupApprovalReference:"CI-ENTITY-APPROVAL-"+phase6bSuffix,defaultTaxCode:phase6bTaxCode,
      changeReason:"Phase 6B API issuance fixture: approve synthetic tax configuration"}),
  },phase6aSession.jar);
  assert.equal(approvalUpdate.response.status,200,"finance administrator can set a test-only approved tax decision: "+JSON.stringify(approvalUpdate.body?.error??null));
  assert.equal(approvalUpdate.body.data.taxSetupStatus,"APPROVED_CONFIGURED");

  const regResult=await call("/api/v1/legal-entities/"+entityA.id+"/tax-registrations",{
    method:"POST",
    body:JSON.stringify({registrationKey:"P6B_REG_"+phase6bSuffix,registrationType:"OTHER",
      jurisdiction:"CI-JURISDICTION",registrationNumber:"CI-REG-NUM-"+phase6bSuffix,
      displayLabel:"Synthetic CI registration",isPrimary:true,effectiveFrom:"2020-01-01",effectiveUntil:"",
      approvalReference:"CI-REG-APPROVAL-"+phase6bSuffix,changeReason:"Phase 6B synthetic registration fixture"}),
  },phase6aSession.jar);
  assert.equal(regResult.response.status,201,"approved test registration can be created: "+JSON.stringify(regResult.body?.error??null));
  const phase6bRegistrationId=regResult.body.data.id;
  const phase6bRegistrationKey="P6B_REG_"+phase6bSuffix;

  // Regression test: mysql2 may decode DATE columns into JavaScript Date objects.
  // A second version must close an open-ended prior version at the day before the new start.
  const [registrationRevisionDates]=await db.execute(
    "SELECT DATE_FORMAT(CURRENT_DATE(),'%Y-%m-%d') AS today, DATE_FORMAT(DATE_ADD(CURRENT_DATE(),INTERVAL 1 DAY),'%Y-%m-%d') AS nextDay",
  );
  const registrationRevision=await call("/api/v1/legal-entities/"+entityA.id+"/tax-registrations",{
    method:"POST",
    body:JSON.stringify({registrationKey:phase6bRegistrationKey,registrationType:"OTHER",
      jurisdiction:"CI-JURISDICTION",registrationNumber:"CI-REG-REVISION-"+phase6bSuffix,
      displayLabel:"Synthetic next-day registration revision",isPrimary:true,effectiveFrom:registrationRevisionDates[0].nextDay,effectiveUntil:"",
      approvalReference:"CI-REG-REVISION-APPROVAL-"+phase6bSuffix,changeReason:"Phase 6B regression: open-ended registration revision"}),
  },phase6aSession.jar);
  assert.equal(registrationRevision.response.status,201,"registration revision must compare MySQL DATE values correctly: "+JSON.stringify(registrationRevision.body?.error??null));
  assert.equal(registrationRevision.body.data.versionNumber,2,"registration version number increments");
  const [registrationHistory]=await db.execute(
    "SELECT version_number,DATE_FORMAT(effective_from,'%Y-%m-%d') AS effective_from_date,DATE_FORMAT(effective_until,'%Y-%m-%d') AS effective_until_date FROM legal_entity_tax_registrations WHERE legal_entity_id=? AND registration_key=? ORDER BY version_number",
    [entityA.id,phase6bRegistrationKey],
  );
  assert.equal(registrationHistory.length,2,"both tax registration versions must be preserved");
  assert.equal(registrationHistory[0].effective_from_date,"2020-01-01");
  assert.equal(registrationHistory[0].effective_until_date,registrationRevisionDates[0].today,
    "previous version ends on the calendar day before the new version starts");
  assert.equal(registrationHistory[1].effective_from_date,registrationRevisionDates[0].nextDay);
  assert.equal(registrationHistory[1].effective_until_date,null,"new version remains open-ended");
  console.log("PASS: tax registration version dates preserve the old effective period and create the next version.");

  // One primary registration per type and jurisdiction is allowed; two primaries for the
  // same type and jurisdiction may not have overlapping effective periods.
  const otherJurisdictionPrimary=await call("/api/v1/legal-entities/"+entityA.id+"/tax-registrations",{
    method:"POST",
    body:JSON.stringify({registrationKey:"P6B_OTHER_PRIMARY_"+phase6bSuffix,registrationType:"OTHER",
      jurisdiction:"CI-OTHER-JURISDICTION",registrationNumber:"CI-OTHER-PRIMARY-"+phase6bSuffix,
      displayLabel:"Synthetic primary registration in a second jurisdiction",isPrimary:true,effectiveFrom:"2020-01-01",effectiveUntil:"",
      approvalReference:"CI-OTHER-PRIMARY-APPROVAL-"+phase6bSuffix,changeReason:"Phase 6B primary registration jurisdiction isolation"}),
  },phase6aSession.jar);
  assert.equal(otherJurisdictionPrimary.response.status,201,
    "a primary registration for the same type in another jurisdiction must be allowed: "+JSON.stringify(otherJurisdictionPrimary.body?.error??null));
  const duplicatePrimary=await call("/api/v1/legal-entities/"+entityA.id+"/tax-registrations",{
    method:"POST",
    body:JSON.stringify({registrationKey:"P6B_DUP_PRIMARY_"+phase6bSuffix,registrationType:"OTHER",
      jurisdiction:"CI-JURISDICTION",registrationNumber:"CI-DUP-PRIMARY-"+phase6bSuffix,
      displayLabel:"Synthetic overlapping primary registration",isPrimary:true,effectiveFrom:"2020-01-01",effectiveUntil:"",
      approvalReference:"CI-DUP-PRIMARY-APPROVAL-"+phase6bSuffix,changeReason:"Phase 6B reject duplicate primary registration"}),
  },phase6aSession.jar);
  assert.equal(duplicatePrimary.response.status,409,"overlapping primary registrations in the same jurisdiction must be rejected");
  assert.equal(duplicatePrimary.body.error.code,"CONFIGURATION_CONFLICT");
  console.log("PASS: primary tax registration uniqueness is scoped by registration type and jurisdiction.");

  const taxRuleResult=await call("/api/v1/tax-rules",{
    method:"POST",
    body:JSON.stringify({legalEntityId:entityA.id,taxCode:phase6bTaxCode,displayName:"Synthetic CI tax rule",
      jurisdiction:"CI-JURISDICTION",ratePercent:"18",calculationMode:"EXCLUSIVE",effectiveFrom:"2020-01-01",
      effectiveUntil:"",approvalReference:"CI-TAX-APPROVAL-"+phase6bSuffix,
      changeReason:"Phase 6B synthetic approved tax-rule fixture"}),
  },phase6aSession.jar);
  assert.equal(taxRuleResult.response.status,201,"approved test tax rule can be created: "+JSON.stringify(taxRuleResult.body?.error??null));
  const phase6bTaxRuleId=taxRuleResult.body.data.id;

  // Second jurisdiction fixture proves each invoice line's registration must match its rule.
  const otherRegResult=await call("/api/v1/legal-entities/"+entityA.id+"/tax-registrations",{
    method:"POST",
    body:JSON.stringify({registrationKey:"P6B_OTHER_REG_"+phase6bSuffix,registrationType:"OTHER",
      jurisdiction:"CI-OTHER-JURISDICTION",registrationNumber:"CI-OTHER-REG-NUM-"+phase6bSuffix,
      displayLabel:"Synthetic second-jurisdiction registration",isPrimary:false,effectiveFrom:"2020-01-01",effectiveUntil:"",
      approvalReference:"CI-OTHER-REG-APPROVAL-"+phase6bSuffix,changeReason:"Phase 6B mismatched-line registration fixture"}),
  },phase6aSession.jar);
  assert.equal(otherRegResult.response.status,201,"second-jurisdiction synthetic registration can be created: "+JSON.stringify(otherRegResult.body?.error??null));
  const phase6bOtherRegistrationId=otherRegResult.body.data.id;

  const otherTaxRuleResult=await call("/api/v1/tax-rules",{
    method:"POST",
    body:JSON.stringify({legalEntityId:entityA.id,taxCode:"P6B_ALT_"+phase6bSuffix,displayName:"Synthetic second-jurisdiction tax rule",
      jurisdiction:"CI-OTHER-JURISDICTION",ratePercent:"18",calculationMode:"EXCLUSIVE",effectiveFrom:"2020-01-01",
      effectiveUntil:"",approvalReference:"CI-OTHER-TAX-APPROVAL-"+phase6bSuffix,
      changeReason:"Phase 6B mismatched-line tax-rule fixture"}),
  },phase6aSession.jar);
  assert.equal(otherTaxRuleResult.response.status,201,"second-jurisdiction synthetic tax rule can be created: "+JSON.stringify(otherTaxRuleResult.body?.error??null));
  const phase6bOtherTaxRuleId=otherTaxRuleResult.body.data.id;
  const phase6bOtherTaxCode=otherTaxRuleResult.body.data.taxCode;

  const numberingResult=await call("/api/v1/numbering-configs",{
    method:"POST",
    body:JSON.stringify({legalEntityId:entityA.id,documentType:"INVOICE",seriesCode:"P6B_"+phase6bSuffix,
      prefix:"P6B-"+phase6bSuffix+"-",suffix:"",sequenceWidth:5,includeFinancialYear:true,
      financialYearStartMonth:4,financialYearStartDay:1,timeZone:"Asia/Kolkata",
      effectiveFrom:"2020-01-01",effectiveUntil:"",approvalReference:"CI-NUMBER-APPROVAL-"+phase6bSuffix,
      activate:true,changeReason:"Phase 6B synthetic approved invoice series"}),
  },phase6aSession.jar);
  assert.equal(numberingResult.response.status,201,"finance-approved test numbering series can be activated: "+JSON.stringify(numberingResult.body?.error??null));
  const phase6bNumberingId=numberingResult.body.data.id;

  const templateConfig={pageSize:"A4",orientation:"PORTRAIT",layout:"STANDARD",accentColor:"#931314",
    showLogo:true,showTaxBreakdown:true,showBankDetails:false,showPaymentTerms:true,
    showCustomerTaxIdentifier:false,showFooter:true,footerText:"Synthetic Phase 6B CI template"};
  const templateResult=await call("/api/v1/document-templates",{
    method:"POST",
    body:JSON.stringify({legalEntityId:entityA.id,documentType:"INVOICE",templateKey:"P6B_DEFAULT",
      displayName:"Synthetic CI invoice template",templateConfig,effectiveFrom:"2020-01-01",
      effectiveUntil:"",activate:true,changeReason:"Phase 6B synthetic invoice template"}),
  },phase6aSession.jar);
  assert.equal(templateResult.response.status,201,"test invoice template can be activated: "+JSON.stringify(templateResult.body?.error??null));
  const phase6bTemplateId=templateResult.body.data.templateId;

  const issueDate=new Date().toISOString().slice(0,10);
  const currencyMismatchInvoiceId=randomUUID();
  await db.execute(
    "INSERT INTO invoices (id,legal_entity_id,brand_id,customer_id,document_type,lifecycle_status,payment_terms_days,currency,subtotal,discount_total,tax_total,grand_total) VALUES (?, ?, NULL, ?, 'INVOICE','DRAFT',30,'USD',100.0000,0,18.0000,118.0000)",
    [currencyMismatchInvoiceId,entityA.id,created.body.data.id],
  );
  await db.execute(
    "INSERT INTO invoice_lines (id,invoice_id,line_number,description,quantity,unit_price,discount_amount,tax_rate,tax_code,tax_rule_id,tax_registration_id,tax_amount,line_total) VALUES (?,?,1,'CI unsupported currency line',1.0000,100.0000,0,18.000000,?,?,?,18.0000,118.0000)",
    [randomUUID(),currencyMismatchInvoiceId,phase6bTaxCode,phase6bTaxRuleId,phase6bRegistrationId],
  );
  const blockedCurrencyIssue=await call("/api/v1/invoices/"+currencyMismatchInvoiceId+"/issue",{
    method:"POST",headers:{"Idempotency-Key":"p6b-currency-"+phase6bSuffix.toLowerCase()+"-001"},
    body:JSON.stringify({documentDate:issueDate}),
  },phase6aSession.jar);
  assert.equal(blockedCurrencyIssue.response.status,409,"unapproved multi-currency issuance must be blocked");
  assert.equal(blockedCurrencyIssue.body.error.code,"CONFIGURATION_NOT_READY");
  const [currencyMismatchRows]=await db.execute("SELECT lifecycle_status FROM invoices WHERE id=?",[currencyMismatchInvoiceId]);
  assert.equal(currencyMismatchRows[0].lifecycle_status,"DRAFT","currency mismatch must not issue the invoice");
  const [currencyMismatchSnapshots]=await db.execute("SELECT id FROM document_configuration_snapshots WHERE resource_type='INVOICE' AND resource_id=?",[currencyMismatchInvoiceId]);
  assert.equal(currencyMismatchSnapshots.length,0,"blocked currency mismatch must not capture an issue snapshot or allocate a document configuration");
  console.log("PASS: issuance blocks unsupported currency and leaves the draft unissued.");

  const issuedInvoiceId=randomUUID();
  await db.execute(
    "INSERT INTO invoices (id,legal_entity_id,brand_id,customer_id,document_type,lifecycle_status,payment_terms_days,currency,subtotal,discount_total,tax_total,grand_total) VALUES (?, ?, NULL, ?, 'INVOICE','DRAFT',30,'INR',100.0000,0,18.0000,118.0000)",
    [issuedInvoiceId,entityA.id,created.body.data.id],
  );
  await db.execute(
    "INSERT INTO invoice_lines (id,invoice_id,line_number,description,quantity,unit_price,discount_amount,tax_rate,tax_code,tax_rule_id,tax_registration_id,tax_amount,line_total) VALUES (?,?,1,'CI taxable line',1.0000,100.0000,0,18.000000,?,?,?,18.0000,118.0000)",
    [randomUUID(),issuedInvoiceId,phase6bTaxCode,phase6bTaxRuleId,phase6bRegistrationId],
  );
  const issueKey="p6b-happy-"+phase6bSuffix.toLowerCase()+"-001";
  const issueResult=await call("/api/v1/invoices/"+issuedInvoiceId+"/issue",{
    method:"POST",headers:{"Idempotency-Key":issueKey},body:JSON.stringify({documentDate:issueDate}),
  },phase6aSession.jar);
  assert.equal(issueResult.response.status,200,"approved in-scope draft invoice issues successfully: "+JSON.stringify(issueResult.body?.error??null));
  assert.equal(issueResult.body.data.status,"ISSUED");
  assert.equal(issueResult.body.data.idempotentReplay,false);
  assert.match(issueResult.body.data.invoiceNumber,/^P6B-/);
  assert.match(issueResult.body.data.configurationSha256,/^[0-9a-f]{64}$/);

  const [issuedRows]=await db.execute(
    "SELECT lifecycle_status,invoice_number,financial_year,issue_idempotency_key,supplier_snapshot FROM invoices WHERE id=?",
    [issuedInvoiceId],
  );
  assert.equal(issuedRows.length,1);
  assert.equal(issuedRows[0].lifecycle_status,"ISSUED");
  assert.equal(issuedRows[0].invoice_number,issueResult.body.data.invoiceNumber);
  assert.equal(issuedRows[0].issue_idempotency_key,issueKey);
  assert.equal(JSON.stringify(issuedRows[0].supplier_snapshot).includes(accountNumber),false,
    "legacy supplier snapshots must not persist the full bank account");

  const [issuedSnapshots]=await db.execute(
    "SELECT id,configuration_snapshot,configuration_sha256,numbering_config_id,template_id FROM document_configuration_snapshots WHERE resource_type='INVOICE' AND resource_id=?",
    [issuedInvoiceId],
  );
  assert.equal(issuedSnapshots.length,1);
  assert.equal(issuedSnapshots[0].id,issueResult.body.data.configurationSnapshotId);
  assert.equal(issuedSnapshots[0].configuration_sha256,issueResult.body.data.configurationSha256);
  assert.equal(issuedSnapshots[0].numbering_config_id,phase6bNumberingId);
  assert.equal(issuedSnapshots[0].template_id,phase6bTemplateId);
  const issueSnapshot=typeof issuedSnapshots[0].configuration_snapshot==="string"
    ?JSON.parse(issuedSnapshots[0].configuration_snapshot):issuedSnapshots[0].configuration_snapshot;
  assert.ok(issueSnapshot.selectedTaxRules.some(row=>row.id===phase6bTaxRuleId));
  assert.ok(issueSnapshot.selectedTaxRegistrations.some(row=>row.id===phase6bRegistrationId));
  assert.ok(issueSnapshot.legalEntityConfigVersion?.id,"issued snapshot retains its exact legal-entity configuration version reference");

  const issueReplay=await call("/api/v1/invoices/"+issuedInvoiceId+"/issue",{
    method:"POST",headers:{"Idempotency-Key":issueKey},body:JSON.stringify({documentDate:issueDate}),
  },phase6aSession.jar);
  assert.equal(issueReplay.response.status,200,"same idempotency key returns original issuance result");
  assert.equal(issueReplay.body.data.idempotentReplay,true);
  assert.equal(issueReplay.body.data.invoiceNumber,issueResult.body.data.invoiceNumber);
  assert.equal(issueReplay.body.data.configurationSha256,issueResult.body.data.configurationSha256);

  const conflictingReplay=await call("/api/v1/invoices/"+issuedInvoiceId+"/issue",{
    method:"POST",headers:{"Idempotency-Key":issueKey+"-DIFFERENT"},body:JSON.stringify({documentDate:issueDate}),
  },phase6aSession.jar);
  assert.equal(conflictingReplay.response.status,409,"a different idempotency key cannot reissue the issued invoice");
  assert.equal(conflictingReplay.body.error.code,"CONFIGURATION_CONFLICT");

  // Both rules and both registrations are individually valid, but each invoice line is
  // deliberately paired with the other jurisdiction's registration. Issuance must reject it.
  const mismatchedTaxInvoiceId=randomUUID();
  await db.execute(
    "INSERT INTO invoices (id,legal_entity_id,brand_id,customer_id,document_type,lifecycle_status,payment_terms_days,currency,subtotal,discount_total,tax_total,grand_total) VALUES (?, ?, NULL, ?, 'INVOICE','DRAFT',30,'INR',200.0000,0,36.0000,236.0000)",
    [mismatchedTaxInvoiceId,entityA.id,created.body.data.id],
  );
  await db.execute(
    "INSERT INTO invoice_lines (id,invoice_id,line_number,description,quantity,unit_price,discount_amount,tax_rate,tax_code,tax_rule_id,tax_registration_id,tax_amount,line_total) VALUES (?,?,1,'CI mismatched jurisdiction line A',1.0000,100.0000,0,18.000000,?,?,?,18.0000,118.0000)",
    [randomUUID(),mismatchedTaxInvoiceId,phase6bTaxCode,phase6bTaxRuleId,phase6bOtherRegistrationId],
  );
  await db.execute(
    "INSERT INTO invoice_lines (id,invoice_id,line_number,description,quantity,unit_price,discount_amount,tax_rate,tax_code,tax_rule_id,tax_registration_id,tax_amount,line_total) VALUES (?,?,2,'CI mismatched jurisdiction line B',1.0000,100.0000,0,18.000000,?,?,?,18.0000,118.0000)",
    [randomUUID(),mismatchedTaxInvoiceId,phase6bOtherTaxCode,phase6bOtherTaxRuleId,phase6bRegistrationId],
  );
  const mismatchedTaxIssue=await call("/api/v1/invoices/"+mismatchedTaxInvoiceId+"/issue",{
    method:"POST",headers:{"Idempotency-Key":"p6b-tax-pair-"+phase6bSuffix.toLowerCase()+"-001"},
    body:JSON.stringify({documentDate:issueDate}),
  },phase6aSession.jar);
  assert.equal(mismatchedTaxIssue.response.status,409,"a line cannot use a registration from a different tax jurisdiction");
  assert.equal(mismatchedTaxIssue.body.error.code,"CONFIGURATION_NOT_READY");
  const [mismatchedInvoiceState]=await db.execute("SELECT lifecycle_status FROM invoices WHERE id=?",[mismatchedTaxInvoiceId]);
  assert.equal(mismatchedInvoiceState[0].lifecycle_status,"DRAFT","failed tax-jurisdiction validation must leave the invoice as draft");
  const [mismatchedSnapshots]=await db.execute(
    "SELECT id FROM document_configuration_snapshots WHERE resource_type='INVOICE' AND resource_id=?",[mismatchedTaxInvoiceId],
  );
  assert.equal(mismatchedSnapshots.length,0,"failed validation must not persist a configuration snapshot");
  console.log("PASS: issuance rejects cross-jurisdiction line/registration pairings and rolls back the issue transaction.");

  console.log("PASS: Phase 6B end-to-end issue path validates finance-approved rules, reserves and persists the invoice number, stores the immutable configuration snapshot/hash, masks bank details in the supplier snapshot, and enforces same-key replay/conflicting-key rejection.");

  // Debit notes share the transactional numbering/snapshot path but use their own document-type series.
  const debitNumbering=await call("/api/v1/numbering-configs",{
    method:"POST",
    body:JSON.stringify({legalEntityId:entityA.id,documentType:"DEBIT_NOTE",seriesCode:"P6B_DN_"+phase6bSuffix,
      prefix:"P6B-DN-"+phase6bSuffix+"-",suffix:"",sequenceWidth:5,includeFinancialYear:true,
      financialYearStartMonth:4,financialYearStartDay:1,timeZone:"Asia/Kolkata",effectiveFrom:"2020-01-01",
      effectiveUntil:"",approvalReference:"CI-DN-NUM-APPROVAL-"+phase6bSuffix,activate:true,
      changeReason:"Phase 6B debit-note series fixture"}),
  },phase6aSession.jar);
  assert.equal(debitNumbering.response.status,201,"debit-note series must be configurable");
  const debitTemplate=await call("/api/v1/document-templates",{
    method:"POST",
    body:JSON.stringify({legalEntityId:entityA.id,documentType:"DEBIT_NOTE",templateKey:"DEBIT",
      displayName:"Synthetic debit note template",templateConfig:{...templateConfig,showBankDetails:false},
      effectiveFrom:"2020-01-01",effectiveUntil:"",activate:true,
      changeReason:"Phase 6B debit-note template fixture"}),
  },phase6aSession.jar);
  assert.equal(debitTemplate.response.status,201,"debit-note template must be configurable");
  const debitNoteId=randomUUID();
  await db.execute(
    "INSERT INTO invoices (id,legal_entity_id,brand_id,customer_id,document_type,lifecycle_status,payment_terms_days,currency,subtotal,discount_total,tax_total,grand_total) VALUES (?, ?, NULL, ?, 'DEBIT_NOTE','DRAFT',30,'INR',100.0000,0,18.0000,118.0000)",
    [debitNoteId,entityA.id,created.body.data.id],
  );
  await db.execute(
    "INSERT INTO invoice_lines (id,invoice_id,line_number,description,quantity,unit_price,discount_amount,tax_rate,tax_code,tax_rule_id,tax_registration_id,tax_amount,line_total) VALUES (?,?,1,'CI debit-note line',1.0000,100.0000,0,18.000000,?,?,?,18.0000,118.0000)",
    [randomUUID(),debitNoteId,phase6bTaxCode,phase6bTaxRuleId,phase6bRegistrationId],
  );
  const debitIssue=await call("/api/v1/invoices/"+debitNoteId+"/issue",{
    method:"POST",headers:{"Idempotency-Key":"p6b-debit-"+phase6bSuffix.toLowerCase()+"-001"},
    body:JSON.stringify({documentDate:issueDate}),
  },phase6aSession.jar);
  assert.equal(debitIssue.response.status,200,"debit note issues through the secured transactional path: "+JSON.stringify(debitIssue.body?.error??null));
  assert.match(debitIssue.body.data.invoiceNumber,/^P6B-DN-/);
  const [debitSnapshotRows]=await db.execute(
    "SELECT resource_type,configuration_sha256,numbering_config_id,template_id FROM document_configuration_snapshots WHERE resource_id=?",
    [debitNoteId],
  );
  assert.equal(debitSnapshotRows.length,1);
  assert.equal(debitSnapshotRows[0].resource_type,"DEBIT_NOTE");
  assert.equal(debitSnapshotRows[0].numbering_config_id,debitNumbering.body.data.id);
  assert.equal(debitSnapshotRows[0].template_id,debitTemplate.body.data.templateId);
  assert.equal(debitSnapshotRows[0].configuration_sha256,debitIssue.body.data.configurationSha256);
  console.log("PASS: debit notes use their own approved numbering series and preserve the selected immutable configuration snapshot.");

  const unitCode = "P6A_" + suffix.toUpperCase();
  const unitCreated = await call("/api/v1/business-units", {
    method: "POST",
    body: JSON.stringify({ code: unitCode, name: "Phase 6A Unit " + suffix, description: "CI-only organization unit",
      legalEntityIds: [entityB.id], brandIds: [brandId], changeReason: "Phase 6A business unit creation fixture" }),
  }, phase6aSession.jar);
  assert.equal(unitCreated.response.status, 201, "business unit requires and accepts explicit valid mappings: " + JSON.stringify(unitCreated.body?.error ?? null));
  const unitId = unitCreated.body.data.id;
  const unitDetail = await call("/api/v1/business-units/" + unitId, {}, phase6aSession.jar);
  assert.equal(unitDetail.response.status, 200);
  assert.deepEqual(unitDetail.body.data.legalEntities.map((row) => row.id), [entityB.id]);
  assert.deepEqual(unitDetail.body.data.brandIds, [brandId]);
  const unitMoved = await call("/api/v1/business-units/" + unitId, {
    method: "PATCH",
    body: JSON.stringify({ legalEntityIds: [entityA.id], brandIds: [], changeReason: "Phase 6A unit mapping history acceptance update" }),
  }, phase6aSession.jar);
  assert.equal(unitMoved.response.status, 200, "business unit mappings can be explicitly changed");
  const [unitEntityLinks] = await db.execute(
    "SELECT legal_entity_id,effective_from,effective_until,is_primary FROM business_unit_legal_entities WHERE business_unit_id=? ORDER BY effective_from",
    [unitId],
  );
  assert.equal(unitEntityLinks.length, 2, "old business-unit entity mapping row is retained rather than deleted");
  assert.ok(unitEntityLinks.find((row) => row.legal_entity_id === entityB.id)?.effective_until);
  assert.equal(unitEntityLinks.find((row) => row.legal_entity_id === entityA.id)?.effective_until ?? null, null);
  const [unitBrandLinks] = await db.execute("SELECT effective_until FROM brand_business_units WHERE business_unit_id=?", [unitId]);
  assert.equal(unitBrandLinks.length, 1, "removed unit-brand mapping remains in the historical mapping table");
  assert.ok(unitBrandLinks[0].effective_until);

  // A related entity can be deactivated after configuration is created. This must not trap
  // an active business unit in a state where it cannot itself be deactivated, and inactive
  // legal entities must not permit their brands/business units to be reactivated.
  const recoveryUnit=await call("/api/v1/business-units",{
    method:"POST",
    body:JSON.stringify({code:"P6A_REC_"+suffix.toUpperCase(),name:"Phase 6A Recovery Unit "+suffix,
      description:"CI-only deactivation regression",legalEntityIds:[entityB.id],brandIds:[brandId],
      changeReason:"Phase 6A deactivation regression fixture"}),
  },phase6aSession.jar);
  assert.equal(recoveryUnit.response.status,201,"test recovery unit can be created before entity deactivation");
  const brandOff=await call("/api/v1/brands/"+brandId,{
    method:"PATCH",body:JSON.stringify({isActive:false,changeReason:"Phase 6A deactivation regression: disable brand"}),
  },phase6aSession.jar);
  assert.equal(brandOff.response.status,200,"mapped brand can be deactivated");
  const prematureEntityOff=await call("/api/v1/legal-entities/"+entityB.id,{
    method:"PATCH",body:JSON.stringify({isActive:false,changeReason:"Phase 6A negative test: refuse while mapped unit is active"}),
  },phase6aSession.jar);
  assert.equal(prematureEntityOff.response.status,409,"legal entity cannot deactivate while a mapped business unit remains active");
  const unitOff=await call("/api/v1/business-units/"+recoveryUnit.body.data.id,{
    method:"PATCH",body:JSON.stringify({isActive:false,changeReason:"Phase 6A deactivation regression: disable unit"}),
  },phase6aSession.jar);
  assert.equal(unitOff.response.status,200,"business unit can be deactivated after its mapped brand is inactive: "+JSON.stringify(unitOff.body?.error??null));
  const entityOff=await call("/api/v1/legal-entities/"+entityB.id,{
    method:"PATCH",body:JSON.stringify({isActive:false,changeReason:"Phase 6A deactivation regression: disable entity"}),
  },phase6aSession.jar);
  assert.equal(entityOff.response.status,200,"legal entity can be deactivated after all mapped brands and units are inactive");
  const unitReactivation=await call("/api/v1/business-units/"+recoveryUnit.body.data.id,{
    method:"PATCH",body:JSON.stringify({isActive:true,changeReason:"Phase 6A negative test: cannot reactivate unit"}),
  },phase6aSession.jar);
  assert.equal(unitReactivation.response.status,409,"business unit cannot reactivate while a mapped entity is inactive");
  const brandReactivation=await call("/api/v1/brands/"+brandId,{
    method:"PATCH",body:JSON.stringify({isActive:true,changeReason:"Phase 6A negative test: cannot reactivate brand"}),
  },phase6aSession.jar);
  assert.equal(brandReactivation.response.status,409,"brand cannot reactivate while its mapped entity is inactive");
  console.log("PASS: inactive entity mappings do not block deactivation, and mapped brands/business units cannot be reactivated inconsistently.");

  const outsider = await seedUser("finance_admin", "phase6a-outsider-" + suffix + "@example.invalid", "ACTIVE",
    "Phase 6A Outsider Password #5!", [testLegalEntityId]);
  const outsiderSession = await login(outsider);
  const outOfScopeInvoiceId=randomUUID();
  await db.execute(
    "INSERT INTO invoices (id,legal_entity_id,brand_id,customer_id,document_type,lifecycle_status,payment_terms_days,currency,subtotal,discount_total,tax_total,grand_total) VALUES (?, ?, NULL, ?, 'INVOICE','DRAFT',0,'INR',0,0,0,0)",
    [outOfScopeInvoiceId,entityA.id,created.body.data.id],
  );
  const hiddenInvoiceIssue=await call("/api/v1/invoices/"+outOfScopeInvoiceId+"/issue",{
    method:"POST",headers:{"Idempotency-Key":"ci-out-of-scope-"+suffix.toLowerCase()},
    body:JSON.stringify({documentDate:new Date().toISOString().slice(0,10)}),
  },outsiderSession.jar);
  assert.equal(hiddenInvoiceIssue.response.status,404,"out-of-scope invoice is concealed from a finance administrator without that entity grant");
  assert.equal(hiddenInvoiceIssue.body.error.code,"NOT_FOUND");

  const scopedBrands = await call("/api/v1/brands?status=all", {}, outsiderSession.jar);
  assert.equal(scopedBrands.response.status, 200);
  assert.equal(scopedBrands.body.data.some((row) => row.id === brandId), false, "brand list must not leak across legal-entity scope");
  const hiddenBrand = await call("/api/v1/brands/" + brandId, {}, outsiderSession.jar);
  assert.equal(hiddenBrand.response.status, 404, "out-of-scope brand details must be hidden");
  const hiddenUnit = await call("/api/v1/business-units/" + unitId, {}, outsiderSession.jar);
  assert.equal(hiddenUnit.response.status, 404, "out-of-scope business-unit details must be hidden");
  const invalidCrossScopeBrand = await call("/api/v1/brands", {
    method: "POST",
    body: JSON.stringify({ name: "Out-of-scope Brand", code: "XSC-" + suffix.toUpperCase(),
      legalEntityIds: [entityB.id], changeReason: "Attempted cross-scope mapping" }),
  }, outsiderSession.jar);
  assert.equal(invalidCrossScopeBrand.response.status, 403, "brand mapping cannot be created outside caller's legal-entity scope");
  console.log("PASS: Phase 6A integration tests cover registered/billing identity, bank masking and finance-only writes, audit reason and safe before/after data, legal-entity/brand/business-unit versioning, historical mapping retention and cross-entity scope isolation.");

  const financeAdmin = await seedUser("finance_admin", "finance-" + suffix + "@example.invalid", "ACTIVE",
    "Finance Admin Strong Password #5!");
  const financeSession = await login(financeAdmin);
  const itemCode = "PH5-" + suffix.toUpperCase();
  const item = await call("/api/v1/catalog/items", {
    method: "POST",
    body: JSON.stringify({
      itemCode, itemType: "SERVICE", name: "Phase 05 CI service",
      customerDescription: "CI-only auth test fixture", internalDescription: "Not production data",
      unitCode: "unit", defaultUnitPrice: "12.3400", currency: "INR", defaultTaxCode: "",
    }),
  }, financeSession.jar);
  assert.equal(item.response.status, 201);
  assert.equal(item.body.data.defaultUnitPrice, "12.3400");

  // Phase 7: customer CRUD, duplicate warnings, optimistic concurrency, child records and safe archive.
  const phase7CustomerName = "Phase 07 Customer " + suffix;
  const phase7CustomerCode = "P7-" + suffix.toUpperCase();
  const phase7Customer = await call("/api/v1/customers", {
    method: "POST",
    body: JSON.stringify({
      customerCode: phase7CustomerCode, name: phase7CustomerName,
      email: "phase7-" + suffix + "@example.invalid", phone: "+91-900000" + suffix.slice(0, 6),
      billingAddress: { line1: "12 CI Lane", city: "Pune", state: "Maharashtra", postalCode: "411001", countryCode: "IN" },
      shippingAddress: { line1: "Delivery Bay 2", city: "Pune", postalCode: "411002", countryCode: "IN" },
      purchaseOrderReference: "CI-PO-" + suffix, paymentTermsDays: 30,
      contacts: [{ fullName: "Phase 7 Contact", jobTitle: "Accounts", email: "contact-" + suffix + "@example.invalid", phone: "+91-9111111111", isPrimary: true }],
      taxIdentifiers: [{ identifierType: "OTHER", countryCode: "IN", jurisdiction: "CI only", identifierValue: "TAX-" + suffix }],
    }),
  }, financeSession.jar);
  assert.equal(phase7Customer.response.status, 201, "customer CRUD accepts customer billing, shipping, contact and tax identifier details");
  assert.equal(phase7Customer.body.data.recordVersion, 1);
  const phase7CustomerId = phase7Customer.body.data.id;

  const customerCodeSearch = await call("/api/v1/customers?query=" + encodeURIComponent(phase7CustomerCode) + "&status=active&limit=10&offset=0", {}, financeSession.jar);
  assert.equal(customerCodeSearch.response.status, 200);
  assert.ok(customerCodeSearch.body.data.some(row => row.id === phase7CustomerId), "customer search matches normalized customer code");
  const excessiveCustomerLimit = await call("/api/v1/customers?limit=101", {}, financeSession.jar);
  assert.equal(excessiveCustomerLimit.response.status, 400, "customer pagination limit is server-capped");
  const excessiveCustomerOffset = await call("/api/v1/customers?offset=1000001", {}, financeSession.jar);
  assert.equal(excessiveCustomerOffset.response.status, 400, "customer pagination offset is bounded");
  const privilegedTaxSearch = await call("/api/v1/customers?query=" + encodeURIComponent("TAX-" + suffix) + "&status=all", {}, financeSession.jar);
  assert.ok(privilegedTaxSearch.body.data.some(row => row.id === phase7CustomerId), "finance/settings admins can search customer tax identifiers");
  const restrictedTaxSearch = await call("/api/v1/customers?query=" + encodeURIComponent("TAX-" + suffix) + "&status=all", {}, staffSession.jar);
  assert.equal(restrictedTaxSearch.response.status, 200);
  assert.equal(restrictedTaxSearch.body.meta.pagination.total, 0, "ordinary customer readers cannot search for restricted tax identifier values");

  const scopedFinance = await seedUser("finance_admin", "scoped-finance-" + suffix + "@example.invalid", "ACTIVE",
    "Scoped Finance Strong Password #7!", [testLegalEntityId]);
  const scopedFinanceSession = await login(scopedFinance);
  const linkedInvoiceId = randomUUID();
  await db.execute(
    "INSERT INTO invoices (id,legal_entity_id,customer_id,document_type,lifecycle_status,currency,grand_total) VALUES (?, ?, ?, 'INVOICE', 'DRAFT', 'INR', '24.6800')",
    [linkedInvoiceId, testLegalEntityId, phase7CustomerId],
  );
  const linkedInvoiceLineId = randomUUID();
  await db.execute(
    "INSERT INTO invoice_lines (id,invoice_id,catalog_item_id,line_number,description,quantity,unit_price,discount_amount,tax_rate,tax_code,tax_rule_id,tax_amount,line_total) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [linkedInvoiceLineId, linkedInvoiceId, item.body.data.id, "Phase 05 CI service", "2.0000", "12.3400", "0.0000", "0.000000", null, null, "0.0000", "24.6800"],
  );
  const linkedQuotationId = randomUUID();
  await db.execute(
    "INSERT INTO quotations (id,legal_entity_id,customer_id,status,currency,grand_total) VALUES (?, ?, ?, 'DRAFT', 'INR', '49.0000')",
    [linkedQuotationId, testLegalEntityId, phase7CustomerId],
  );

  const unprivilegedSensitiveCreate = await call("/api/v1/customers", {
    method: "POST",
    body: JSON.stringify({ name: "Forbidden Tax Customer " + suffix, taxIdentifiers: [{ identifierType: "OTHER", countryCode: "IN", identifierValue: "FORBIDDEN-TAX-" + suffix }] }),
  }, staffSession.jar);
  assert.equal(unprivilegedSensitiveCreate.response.status, 403, "customer writers without settings:manage cannot create restricted tax identifiers");
  const unprivilegedSensitiveUpdate = await call("/api/v1/customers/" + phase7CustomerId, {
    method: "PATCH",
    body: JSON.stringify({ expectedVersion: 1, taxIdentifiers: [{ identifierType: "OTHER", countryCode: "IN", identifierValue: "FORBIDDEN-UPDATE-" + suffix }] }),
  }, staffSession.jar);
  assert.equal(unprivilegedSensitiveUpdate.response.status, 403, "customer writers without settings:manage cannot replace restricted tax identifiers");
  const unprivilegedSensitiveImport = await call("/api/v1/customers/import?mode=validate", {
    method: "POST", headers: { "Content-Type": "text/csv" },
    body: "name,taxIdentifier\r\nForbidden import,FORBIDDEN-CSV-" + suffix,
  }, staffSession.jar);
  assert.equal(unprivilegedSensitiveImport.response.status, 403, "customer CSV imports enforce sensitive-field permission server-side");
  const childTaxDuplicate = await call("/api/v1/customers", {
    method: "POST",
    body: JSON.stringify({ name: "Distinct Customer " + suffix, email: "distinct-" + suffix + "@example.invalid",
      taxIdentifiers: [{ identifierType: "OTHER", countryCode: "IN", identifierValue: "TAX-" + suffix }] }),
  }, financeSession.jar);
  assert.equal(childTaxDuplicate.response.status, 201);
  assert.ok(childTaxDuplicate.body.duplicateWarnings?.some(w => w.id === phase7CustomerId && w.matchOn?.includes("taxIdentifier")),
    "duplicate detection includes normalized child tax identifiers, not only the legacy primary field");
  const duplicateCustomer = await call("/api/v1/customers", {
    method: "POST",
    body: JSON.stringify({ name: phase7CustomerName, email: "phase7-" + suffix + "@example.invalid" }),
  }, financeSession.jar);
  assert.equal(duplicateCustomer.response.status, 201, "potential duplicates are warnings and do not silently merge or prevent deliberate creation");
  assert.ok(duplicateCustomer.body.duplicateWarnings?.some((warning) => warning.id === phase7CustomerId),
    "customer create returns duplicate candidates for an explicit user decision");

  const phase7Detail = await call("/api/v1/customers/" + phase7CustomerId, {}, financeSession.jar);
  assert.equal(phase7Detail.response.status, 200);
  assert.equal(phase7Detail.body.data.contacts[0].fullName, "Phase 7 Contact");
  assert.equal(phase7Detail.body.data.taxIdentifiers[0].identifierValue, "TAX-" + suffix);
  assert.equal(phase7Detail.body.data.billingAddress.city, "Pune");
  assert.equal(phase7Detail.body.data.shippingAddress.postalCode, "411002");
  assert.equal(phase7Detail.body.data.recordVersion, 1);

  assert.equal(phase7Detail.body.data.referenceCounts.invoices, null, "invoice counts remain hidden without legal-entity scope");
  assert.equal(phase7Detail.body.data.referenceCounts.quotations, null, "quotation counts remain hidden without legal-entity scope");
  assert.equal("linkedInvoices" in phase7Detail.body.data, false, "linked invoice metadata is not exposed without legal-entity scope");
  const scopedCustomerDetail = await call("/api/v1/customers/" + phase7CustomerId, {}, scopedFinanceSession.jar);
  assert.equal(scopedCustomerDetail.response.status, 200);
  assert.equal(scopedCustomerDetail.body.data.referenceCounts.invoices, 1);
  assert.equal(scopedCustomerDetail.body.data.referenceCounts.quotations, 1);
  assert.ok(scopedCustomerDetail.body.data.linkedInvoices.some(invoice => invoice.id === linkedInvoiceId),
    "authorized users see linked invoices only within their legal-entity scope");
  assert.ok(scopedCustomerDetail.body.data.linkedQuotations.some(quotation => quotation.id === linkedQuotationId),
    "authorized users see linked quotations only within their legal-entity scope");

  const updatedCustomer = await call("/api/v1/customers/" + phase7CustomerId, {
    method: "PATCH",
    body: JSON.stringify({
      expectedVersion: 1, name: phase7CustomerName + " Updated",
      billingAddress: null, purchaseOrderReference: "CI-PO-UPDATED-" + suffix,
      contacts: [{ fullName: "Updated CI Contact", email: "updated-" + suffix + "@example.invalid", isPrimary: true }],
      taxIdentifiers: [{ identifierType: "OTHER", countryCode: "IN", jurisdiction: "CI only", identifierValue: "TAX-UPDATED-" + suffix }],
    }),
  }, financeSession.jar);
  assert.equal(updatedCustomer.response.status, 200, "customer PATCH supports versioned updates and child record replacement");
  assert.equal(updatedCustomer.body.data.recordVersion, 2);
  assert.equal(updatedCustomer.body.data.name, phase7CustomerName + " Updated");
  assert.ok(updatedCustomer.body.duplicateWarnings);
  const staleCustomerUpdate = await call("/api/v1/customers/" + phase7CustomerId, {
    method: "PATCH", body: JSON.stringify({ expectedVersion: 1, name: "Stale customer overwrite" }),
  }, financeSession.jar);
  assert.equal(staleCustomerUpdate.response.status, 409, "stale customer edit is rejected rather than overwriting newer data");

  // Link a receipt so archive has to preserve and report a historical relationship.
  await db.execute(
    "INSERT INTO payments (id,customer_id,amount,currency,payment_date,method,status,recorded_by) VALUES (?,?,?, ?,CURDATE(),'OTHER','RECORDED',?)",
    [randomUUID(), phase7CustomerId, "10.0000", "INR", financeAdmin.userId],
  );
  const archivedCustomer = await call("/api/v1/customers/" + phase7CustomerId + "/archive", {
    method: "POST", body: JSON.stringify({ expectedVersion: 2, reason: "Phase 7 CI archive acceptance" }),
  }, financeSession.jar);
  assert.equal(archivedCustomer.response.status, 200, "archive is a soft archive and preserves linked historic records");
  assert.equal(archivedCustomer.body.data.isActive, false);
  assert.equal(archivedCustomer.body.data.referenceCounts.payments, 1);
  assert.equal(archivedCustomer.body.data.referenceCounts.invoices, 1);
  assert.equal(archivedCustomer.body.data.referenceCounts.quotations, 1);
  const archivedCustomerDetail = await call("/api/v1/customers/" + phase7CustomerId, {}, financeSession.jar);
  assert.equal(archivedCustomerDetail.response.status, 200, "archived customers remain accessible for historic references");
  assert.equal(archivedCustomerDetail.body.data.isActive, false);
  const archivedCustomerList = await call("/api/v1/customers?query=" + encodeURIComponent(phase7CustomerName + " Updated") + "&status=archived", {}, financeSession.jar);
  assert.equal(archivedCustomerList.response.status, 200);
  assert.ok(archivedCustomerList.body.data.some((row) => row.id === phase7CustomerId));
  const archivedCustomerUpdate = await call("/api/v1/customers/" + phase7CustomerId, {
    method: "PATCH", body: JSON.stringify({ expectedVersion: 3, name: "Cannot edit archived customer" }),
  }, financeSession.jar);
  assert.equal(archivedCustomerUpdate.response.status, 409, "archived customer cannot be edited as active master data");

  // Phase 7: catalog detail/update/soft archive, exact decimal serialization and duplicate code rejection.
  const itemDetail = await call("/api/v1/catalog/items/" + item.body.data.id, {}, financeSession.jar);
  assert.equal(itemDetail.response.status, 200);
  assert.equal(itemDetail.body.data.recordVersion, 1);
  const itemUpdated = await call("/api/v1/catalog/items/" + item.body.data.id, {
    method: "PATCH", body: JSON.stringify({ expectedVersion: 1, name: "Phase 07 Updated Service " + suffix, defaultUnitPrice: "12.3401" }),
  }, financeSession.jar);
  assert.equal(itemUpdated.response.status, 200);
  assert.equal(itemUpdated.body.data.recordVersion, 2);
  assert.equal(itemUpdated.body.data.defaultUnitPrice, "12.3401");
  const [unchangedInvoiceLine] = await db.execute(
    "SELECT description,unit_price,line_total FROM invoice_lines WHERE id=?",
    [linkedInvoiceLineId],
  );
  assert.equal(unchangedInvoiceLine[0].description, "Phase 05 CI service", "editing the catalog must not rewrite an invoice-line description already copied into a document");
  assert.equal(unchangedInvoiceLine[0].unit_price, "12.3400", "editing a default catalog price must not rewrite an existing invoice line");
  assert.equal(unchangedInvoiceLine[0].line_total, "24.6800", "editing the catalog must not rewrite an existing line total");

  const staleItemUpdate = await call("/api/v1/catalog/items/" + item.body.data.id, {
    method: "PATCH", body: JSON.stringify({ expectedVersion: 1, name: "Stale item overwrite" }),
  }, financeSession.jar);
  assert.equal(staleItemUpdate.response.status, 409, "stale catalog edit is rejected");
  const duplicateItemCode = await call("/api/v1/catalog/items", {
    method: "POST", body: JSON.stringify({
      itemCode, itemType: "SERVICE", name: "Conflicting SKU", customerDescription: "Duplicate code test",
      unitCode: "unit", defaultUnitPrice: "1.0000", currency: "INR",
    }),
  }, financeSession.jar);
  assert.equal(duplicateItemCode.response.status, 409, "duplicate item/SKU codes are rejected by the server");
  const archivedItem = await call("/api/v1/catalog/items/" + item.body.data.id + "/archive", {
    method: "POST", body: JSON.stringify({ expectedVersion: 2, reason: "Phase 7 CI archive acceptance" }),
  }, financeSession.jar);
  assert.equal(archivedItem.response.status, 200);
  assert.equal(archivedItem.body.data.isActive, false);
  const archivedItemDetail = await call("/api/v1/catalog/items/" + item.body.data.id, {}, financeSession.jar);
  assert.equal(archivedItemDetail.response.status, 200, "archived catalog items stay readable for history");
  assert.equal(archivedItemDetail.body.data.isActive, false);
  const [customerAuditRows] = await db.execute(
    "SELECT action,after_json FROM audit_events WHERE entity_type='customer' AND entity_id=? ORDER BY created_at",
    [phase7CustomerId],
  );
  assert.ok(customerAuditRows.some((entry) => entry.action === "customer.updated"));
  assert.ok(customerAuditRows.some((entry) => entry.action === "customer.archived"));
  assert.equal(JSON.stringify(customerAuditRows).includes("TAX-UPDATED-" + suffix), false,
    "customer audit metadata logs changed field names, not tax identifier values");
  console.log("PASS: Phase 7 customer/catalog tests cover CRUD, contact/tax details, duplicate warnings, exact-decimal edits, optimistic concurrency, permissioned soft archive, historical references and audit redaction.");

  // Phase 7 CSV import/export: dry run never writes; commit is explicit and atomic; exports are permission-aware.
  const csvCell = (value) => `"${String(value).replaceAll('"','""')}"`;
  const csvCustomerCode = "CSV-" + suffix.toUpperCase();
  const customerCsv = [
    "customerCode,name,email,phone,billingAddressJson,shippingAddressJson,purchaseOrderReference,paymentTermsDays,taxIdentifier",
    [csvCustomerCode, "CSV Import Customer " + suffix, "csv-" + suffix + "@example.invalid", "+91-9222222222",
      JSON.stringify({line1:"CSV Address",city:"Pune",countryCode:"IN"}), "", "CSV-PO-" + suffix, "15", ""].map(csvCell).join(","),
  ].join("\r\n");
  const csvPreview = await call("/api/v1/customers/import?mode=validate", {
    method: "POST", headers: { "Content-Type": "text/csv" }, body: customerCsv,
  }, financeSession.jar);
  assert.equal(csvPreview.response.status, 200, "valid customer CSV previews without writes");
  assert.equal(csvPreview.body.data.valid, true);
  const csvBeforeCommit = await call("/api/v1/customers?query=" + encodeURIComponent(csvCustomerCode), {}, financeSession.jar);
  assert.equal(csvBeforeCommit.body.meta.pagination.total, 0, "validation-only CSV preview does not create rows");
  const csvCommitted = await call("/api/v1/customers/import?mode=commit", {
    method: "POST", headers: { "Content-Type": "text/csv" }, body: customerCsv,
  }, financeSession.jar);
  assert.equal(csvCommitted.response.status, 201, "a separately requested valid CSV commit creates the records atomically");
  assert.equal(csvCommitted.body.data.createdCount, 1);
  const duplicateCustomerCsv = [
    "customerCode,name,email",
    ["CSV-DUP-" + suffix.toUpperCase(), phase7CustomerName + " Updated", "csv-duplicate-" + suffix + "@example.invalid"].map(csvCell).join(","),
  ].join("\r\n");
  const duplicateCustomerPreview = await call("/api/v1/customers/import?mode=validate", {
    method: "POST", headers: { "Content-Type": "text/csv" }, body: duplicateCustomerCsv,
  }, financeSession.jar);
  assert.equal(duplicateCustomerPreview.response.status, 200);
  assert.ok(duplicateCustomerPreview.body.data.duplicateWarnings.length, "customer import reports possible duplicate names");
  const duplicateCustomerBlocked = await call("/api/v1/customers/import?mode=commit", {
    method: "POST", headers: { "Content-Type": "text/csv" }, body: duplicateCustomerCsv,
  }, financeSession.jar);
  assert.equal(duplicateCustomerBlocked.response.status, 409, "server blocks duplicate customer import until explicit confirmation");
  assert.equal(duplicateCustomerBlocked.body.error.code, "DUPLICATE_CONFIRMATION_REQUIRED");
  assert.equal(duplicateCustomerBlocked.body.data.requiresDuplicateConfirmation, true);
  const duplicateCustomerNotCreated = await call("/api/v1/customers?query=CSV-DUP-" + suffix.toUpperCase() + "&status=all", {}, financeSession.jar);
  assert.equal(duplicateCustomerNotCreated.body.meta.pagination.total, 0, "blocked duplicate import writes no rows");
  const duplicateCustomerConfirmed = await call("/api/v1/customers/import?mode=commit&confirmDuplicates=true", {
    method: "POST", headers: { "Content-Type": "text/csv" }, body: duplicateCustomerCsv,
  }, financeSession.jar);
  assert.equal(duplicateCustomerConfirmed.response.status, 201, "explicitly confirmed duplicate customer import can commit atomically");

  const invalidCsvPreview = await call("/api/v1/customers/import?mode=validate", {
    method: "POST", headers: { "Content-Type": "text/csv" },
    body: "customerCode,name,paymentTermsDays\r\nBAD-ROW,Invalid Terms,70000",
  }, financeSession.jar);
  assert.equal(invalidCsvPreview.response.status, 422, "invalid CSV rows produce row-level validation reports");
  assert.equal(invalidCsvPreview.body.report.errors[0].rowNumber, 2);
  const customerExport = await fetch(new URL("/api/v1/customers/export?status=all", baseUrl), {
    headers: { Cookie: cookieHeader(financeSession.jar) }, cache: "no-store",
  });
  assert.equal(customerExport.status, 200, "authorized finance admin can export customer CSV");
  assert.match(customerExport.headers.get("content-type") ?? "", /text\/csv/i);
  const customerExportText = await customerExport.text();
  assert.ok(customerExportText.includes("customerCode,name,email"));
  assert.ok(customerExportText.includes(csvCustomerCode));
  const ordinaryExport = await fetch(new URL("/api/v1/customers/export?status=all", baseUrl), {
    headers: { Cookie: cookieHeader(staffSession.jar) }, cache: "no-store",
  });
  assert.equal(ordinaryExport.status, 200);
  const ordinaryExportText = await ordinaryExport.text();
  assert.doesNotMatch(ordinaryExportText.split("\r\n")[0], /internalNotes|taxIdentifier|contactsJson|taxIdentifiersJson/,
    "customer CSV does not include privileged notes or tax identifier columns for ordinary customer readers");

  const csvItemCode = "CSV-ITEM-" + suffix.toUpperCase();
  const catalogCsv = [
    "itemCode,itemType,name,customerDescription,internalDescription,unitCode,defaultUnitPrice,currency,defaultTaxCode",
    [csvItemCode, "SERVICE", "CSV Catalog Service " + suffix, "CSV-only service description", "Internal CSV note",
      "hour", "7.2500", "INR", ""].map(csvCell).join(","),
  ].join("\r\n");
  const catalogPreview = await call("/api/v1/catalog/items/import?mode=validate", {
    method: "POST", headers: { "Content-Type": "text/csv" }, body: catalogCsv,
  }, financeSession.jar);
  assert.equal(catalogPreview.response.status, 200);
  assert.equal(catalogPreview.body.data.valid, true);
  const catalogCommitted = await call("/api/v1/catalog/items/import?mode=commit", {
    method: "POST", headers: { "Content-Type": "text/csv" }, body: catalogCsv,
  }, financeSession.jar);
  assert.equal(catalogCommitted.response.status, 201);
  assert.equal(catalogCommitted.body.data.createdCount, 1);
  const duplicateCatalogCsv = [
    "itemCode,itemType,name,customerDescription,unitCode,defaultUnitPrice,currency",
    ["CSV-DUP-ITEM-" + suffix.toUpperCase(), "SERVICE", "Phase 07 Updated Service " + suffix, "Duplicate-name fixture", "hour", "5.0000", "INR"].map(csvCell).join(","),
  ].join("\r\n");
  const duplicateCatalogPreview = await call("/api/v1/catalog/items/import?mode=validate", {
    method: "POST", headers: { "Content-Type": "text/csv" }, body: duplicateCatalogCsv,
  }, financeSession.jar);
  assert.equal(duplicateCatalogPreview.response.status, 200);
  assert.ok(duplicateCatalogPreview.body.data.duplicateWarnings.length, "catalog import reports possible duplicate names");
  const duplicateCatalogBlocked = await call("/api/v1/catalog/items/import?mode=commit", {
    method: "POST", headers: { "Content-Type": "text/csv" }, body: duplicateCatalogCsv,
  }, financeSession.jar);
  assert.equal(duplicateCatalogBlocked.response.status, 409, "server blocks duplicate catalog import until explicit confirmation");
  assert.equal(duplicateCatalogBlocked.body.error.code, "DUPLICATE_CONFIRMATION_REQUIRED");
  const duplicateCatalogConfirmed = await call("/api/v1/catalog/items/import?mode=commit&confirmDuplicates=true", {
    method: "POST", headers: { "Content-Type": "text/csv" }, body: duplicateCatalogCsv,
  }, financeSession.jar);
  assert.equal(duplicateCatalogConfirmed.response.status, 201, "explicitly confirmed duplicate catalog import can commit atomically");

  const catalogExport = await fetch(new URL("/api/v1/catalog/items/export?status=all", baseUrl), {
    headers: { Cookie: cookieHeader(financeSession.jar) }, cache: "no-store",
  });
  assert.equal(catalogExport.status, 200);
  const catalogExportText = await catalogExport.text();
  assert.ok(catalogExportText.includes(csvItemCode));
  assert.ok(catalogExportText.includes("7.2500"), "catalog export retains exact decimal text");
  console.log("PASS: Phase 7 CSV tests cover validation-only preview, atomic commit, row-numbered errors, customer/catalog exports, exact decimal values and permission-aware sensitive columns.");

  const invalid = await call("/api/v1/customers", {
    method: "POST", body: JSON.stringify({ name: "   ", unexpected: "rejected" }),
  }, staffSession.jar);
  assert.equal(invalid.response.status, 422);
  assert.equal(invalid.body.error.code, "VALIDATION_ERROR");

  const invalidEmail = await call("/api/v1/customers", {
    method: "POST", body: JSON.stringify({ name: "Invalid email " + suffix, email: "not-an-email" }),
  }, financeSession.jar);
  assert.equal(invalidEmail.response.status, 422, "customer email values must pass email validation");
  const invalidTaxCountry = await call("/api/v1/customers", {
    method: "POST", body: JSON.stringify({ name: "Invalid tax country " + suffix,
      taxIdentifiers: [{ identifierType: "OTHER", countryCode: "USA", identifierValue: "NOT-A-REAL-TAX-ID" }] }),
  }, financeSession.jar);
  assert.equal(invalidTaxCountry.response.status, 422, "tax identifier country code must be a two-letter uppercase code");
  const invalidDecimal = await call("/api/v1/catalog/items", {
    method: "POST", body: JSON.stringify({ itemType: "SERVICE", name: "Invalid decimal " + suffix,
      customerDescription: "validation fixture", unitCode: "hour", defaultUnitPrice: "01.00000", currency: "INR" }),
  }, financeSession.jar);
  assert.equal(invalidDecimal.response.status, 422, "catalog default price must use a non-negative exact decimal with at most four fractional digits");
  const invalidCurrency = await call("/api/v1/catalog/items", {
    method: "POST", body: JSON.stringify({ itemType: "SERVICE", name: "Invalid currency " + suffix,
      customerDescription: "validation fixture", unitCode: "hour", defaultUnitPrice: "1.0000", currency: "inr" }),
  }, financeSession.jar);
  assert.equal(invalidCurrency.response.status, 422, "catalog currency must be a three-letter uppercase code");
  const overlongCustomerName = await call("/api/v1/customers", {
    method: "POST", body: JSON.stringify({ name: "X".repeat(256) }),
  }, financeSession.jar);
  assert.equal(overlongCustomerName.response.status, 422, "customer name length is bounded by schema");
  const invalidItemType = await call("/api/v1/catalog/items", {
    method: "POST", body: JSON.stringify({ itemType: "OTHER", name: "Invalid enum " + suffix,
      customerDescription: "validation fixture", unitCode: "hour", defaultUnitPrice: "1.0000", currency: "INR" }),
  }, financeSession.jar);
  assert.equal(invalidItemType.response.status, 422, "catalog item type is restricted to PRODUCT or SERVICE");


  const viewerSession = await login(viewer);
  const viewerProfile = await call("/api/v1/auth/me", {}, viewerSession.jar);
  assert.equal(viewerProfile.response.status, 200);
  assert.deepEqual(viewerProfile.body.data.user.legalEntityIds, [testLegalEntityId], "entity scope is resolved from the database, not a client claim");
  const viewerList = await call("/api/v1/customers?limit=25&offset=0", {}, viewerSession.jar);
  assert.equal(viewerList.response.status, 200, "read-only role can read customers");
  const viewerWrite = await expectStatus(
    call("/api/v1/customers", { method: "POST", body: JSON.stringify({ name: "Forbidden read-only write" }) }, viewerSession.jar),
    403,
    "read-only role cannot create customers",
  );
  assert.equal(viewerWrite.body.error.code, "FORBIDDEN");
  await expectStatus(call("/api/v1/users", {}, viewerSession.jar), 403, "read-only role cannot access user administration");

  const suspendedLoginCsrf = await getCsrf();
  const suspendedAttempt = await call("/api/v1/auth/login", {
    method: "POST", body: JSON.stringify({ email: suspended.email, password: suspended.password }),
  }, suspendedLoginCsrf);
  assert.equal(suspendedAttempt.response.status, 401, "suspended account cannot log in");

  const adminSession = await login(admin);

  // Exercise every role against every currently implemented protected master-data/user route.
  // System administrators are deliberately not implicit superusers of finance records.
  const issuerSession = await login(issuer);
  const paymentRecorderSession = await login(paymentRecorder);
  const approverSession = await login(approver);
  for (const [roleKey, session] of [
    ["system_admin", adminSession],
    ["finance_admin", financeSession],
    ["invoice_creator", staffSession],
    ["invoice_issuer", issuerSession],
    ["payment_recorder", paymentRecorderSession],
    ["approver", approverSession],
    ["auditor", viewerSession],
  ]) {
    await assertRoleSurface(roleKey, session);
  }

  const selfAdminChange = await expectStatus(
    call("/api/v1/users/" + admin.userId, {
      method: "PATCH", body: JSON.stringify({ accountStatus: "SUSPENDED" }),
    }, adminSession.jar),
    403,
    "administrator cannot modify their own privileged account through the user-admin endpoint",
  );
  assert.equal(selfAdminChange.body.error.code, "FORBIDDEN");

  const financePrivilegeEscalation = await expectStatus(
    call("/api/v1/users/invitations", {
      method: "POST",
      body: JSON.stringify({
        email: "forbidden-admin-" + suffix + "@example.invalid",
        displayName: "Forbidden Admin Invitation",
        roleKeys: ["system_admin"],
        legalEntityIds: [],
      }),
    }, financeSession.jar),
    403,
    "finance administrator without users:manage cannot invite or assign users",
  );
  assert.equal(financePrivilegeEscalation.body.error.code, "FORBIDDEN");

  const invitation = await call("/api/v1/users/invitations", {
    method: "POST",
    body: JSON.stringify({
      email: "invitee-" + suffix + "@example.invalid",
      displayName: "Invited CI User",
      roleKeys: ["auditor"],
      legalEntityIds: [],
    }),
  }, adminSession.jar);
  assert.equal(invitation.response.status, 201, "system admin with users:manage can create invitation");
  assert.ok(invitation.body.data.activationToken);
  const invitee = { email: invitation.body.data.email, password: "Invitee Strong Password #5!" };

  const activationCsrf = await getCsrf();
  const activated = await call("/api/v1/auth/activate", {
    method: "POST",
    body: JSON.stringify({ token: invitation.body.data.activationToken, password: invitee.password }),
  }, activationCsrf);
  assert.equal(activated.response.status, 200, "valid invitation activates an account");
  assert.equal(activated.body.data.activated, true);
  const activationReplayCsrf = await getCsrf();
  const replay = await call("/api/v1/auth/activate", {
    method: "POST",
    body: JSON.stringify({ token: invitation.body.data.activationToken, password: "Another Strong Password #5!" }),
  }, activationReplayCsrf);
  assert.equal(replay.response.status, 400, "invitation token is single-use");

  const inviteeSession = await login(invitee);
  assert.ok(inviteeSession.body.data.user.permissions.includes("customers:read"));
  assert.ok(!inviteeSession.body.data.user.permissions.includes("customers:write"), "auditor role has no customer write permission");
  const roleChange = await call("/api/v1/users/" + invitation.body.data.userId, {
    method: "PATCH", body: JSON.stringify({ roleKeys: ["invoice_creator"] }),
  }, adminSession.jar);
  assert.equal(roleChange.response.status, 200);
  assert.equal(roleChange.body.data.sessionsRevokedOnPrivilegeChange, true);
  const staleAfterPrivilegeChange = await expectStatus(call("/api/v1/customers", {}, inviteeSession.jar), 401, "role change revokes existing sessions");
  assert.equal(staleAfterPrivilegeChange.body.error.code, "UNAUTHENTICATED");

  const newInviteeSession = await login(invitee);
  const suspend = await call("/api/v1/users/" + invitation.body.data.userId, {
    method: "PATCH", body: JSON.stringify({ accountStatus: "SUSPENDED" }),
  }, adminSession.jar);
  assert.equal(suspend.response.status, 200);
  const staleAfterSuspend = await expectStatus(call("/api/v1/customers", {}, newInviteeSession.jar), 401, "account suspension revokes sessions immediately");
  assert.equal(staleAfterSuspend.body.error.code, "UNAUTHENTICATED");

  const oldStaffCookie = cookieHeader(new Map(staffSession.jar));
  const logout = await call("/api/v1/auth/logout", { method: "POST", body: "{}" }, staffSession.jar);
  assert.equal(logout.response.status, 200);
  const afterLogout = await call("/api/v1/customers", { headers: { Cookie: oldStaffCookie } });
  assert.equal(afterLogout.response.status, 401, "logout revokes the database session, even if an old cookie is replayed");

  const scopeRemoved = await call("/api/v1/users/" + viewer.userId, {
    method: "PATCH",
    body: JSON.stringify({ legalEntityIds: [] }),
  }, adminSession.jar);
  assert.equal(scopeRemoved.response.status, 200, "authorized administrator can change legal-entity scope");
  assert.deepEqual(scopeRemoved.body.data.legalEntityIds, []);
  assert.equal(scopeRemoved.body.data.sessionsRevokedOnPrivilegeChange, true);
  const staleAfterScopeChange = await expectStatus(
    call("/api/v1/customers", {}, viewerSession.jar),
    401,
    "removing a user's entity scope revokes the prior session",
  );
  assert.equal(staleAfterScopeChange.body.error.code, "UNAUTHENTICATED");

  const revokeSession = await login(viewer);
  const revokedAll = await call("/api/v1/auth/sessions/revoke-all", { method: "POST", body: "{}" }, revokeSession.jar);
  assert.equal(revokedAll.response.status, 200);
  const afterRevokeAll = await call("/api/v1/customers", { headers: { Cookie: cookieHeader(revokeSession.jar) } });
  assert.equal(afterRevokeAll.response.status, 401, "revoke-all invalidates existing session tokens");

  const absoluteExpiryUser = await seedUser("auditor", "absolute-expiry-" + suffix + "@example.invalid", "ACTIVE", "Absolute Expiry Password #5!");
  const absoluteExpirySession = await login(absoluteExpiryUser);
  const [absoluteSessionRows] = await db.execute(
    "SELECT id FROM auth_sessions WHERE user_id=? AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 1",
    [absoluteExpiryUser.userId],
  );
  assert.equal(absoluteSessionRows.length, 1);
  await db.execute("UPDATE auth_sessions SET created_at=DATE_SUB(NOW(3), INTERVAL 9 HOUR), expires_at=DATE_SUB(NOW(3), INTERVAL 1 SECOND) WHERE id=?", [absoluteSessionRows[0].id]);
  const absoluteExpired = await expectStatus(call("/api/v1/customers", {}, absoluteExpirySession.jar), 401, "absolute session expiry is enforced");
  assert.equal(absoluteExpired.body.error.code, "UNAUTHENTICATED");

  const idleExpiryUser = await seedUser("auditor", "idle-expiry-" + suffix + "@example.invalid", "ACTIVE", "Idle Expiry Password #5!");
  const idleExpirySession = await login(idleExpiryUser);
  const [idleSessionRows] = await db.execute(
    "SELECT id FROM auth_sessions WHERE user_id=? AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 1",
    [idleExpiryUser.userId],
  );
  assert.equal(idleSessionRows.length, 1);
  await db.execute("UPDATE auth_sessions SET last_seen_at=DATE_SUB(NOW(3), INTERVAL 31 MINUTE) WHERE id=?", [idleSessionRows[0].id]);
  const idleExpired = await expectStatus(call("/api/v1/customers", {}, idleExpirySession.jar), 401, "idle session expiry is enforced");
  assert.equal(idleExpired.body.error.code, "UNAUTHENTICATED");

  const rateCsrf = await getCsrf();
  for (let attempt = 0; attempt < 5; attempt++) {
    const result = await call("/api/v1/auth/login", {
      method: "POST", body: JSON.stringify({ email: "rate-" + suffix + "@example.invalid", password: "Incorrect Strong Password" }),
    }, rateCsrf);
    assert.equal(result.response.status, 401, "failed credentials use a generic response before the threshold");
  }
  const rateLimited = await call("/api/v1/auth/login", {
    method: "POST", body: JSON.stringify({ email: "rate-" + suffix + "@example.invalid", password: "Incorrect Strong Password" }),
  }, rateCsrf);
  assert.equal(rateLimited.response.status, 429, "account-based login throttle activates at the configured threshold");
  assert.ok(Number(rateLimited.response.headers.get("retry-after")) > 0);

  const dbSessions = await db.execute("SELECT COUNT(*) AS count FROM auth_sessions WHERE user_id=?", [staff.userId]);
  assert.ok(Number(dbSessions[0][0].count) >= 1);
  console.log("PASS: Phase 05B authorization tests cover the exact seven-role grant matrix, effective session permissions, role-by-role reads/writes of every implemented protected data surface, anonymous denial, CSRF, account lifecycle, privilege escalation prevention, scope-change session revocation and rate limiting; customer/catalog API contracts and decimal serialization also pass.");
} finally {
  await db.end();
}
