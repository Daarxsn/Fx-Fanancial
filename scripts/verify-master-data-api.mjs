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
  if (options.body) headers["Content-Type"] = "application/json";
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
      theme: { accent: "#b51f32", style: "ci" }, defaultTemplateKey: "STANDARD",
      legalEntityIds: [entityA.id], changeReason: "Phase 6A brand creation fixture" }),
  }, phase6aSession.jar);
  assert.equal(brandCreated.response.status, 201, "brand creation with explicit entity mapping should succeed: " + JSON.stringify(brandCreated.body?.error ?? null));
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
  const invalid = await call("/api/v1/customers", {
    method: "POST", body: JSON.stringify({ name: "   ", unexpected: "rejected" }),
  }, staffSession.jar);
  assert.equal(invalid.response.status, 422);
  assert.equal(invalid.body.error.code, "VALIDATION_ERROR");

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
