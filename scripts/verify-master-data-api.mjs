import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import mysql from "mysql2/promise";

const baseUrl = process.env.API_TEST_BASE_URL ?? "http://127.0.0.1:3002";
const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret || sessionSecret.length < 32) {
  throw new Error("SESSION_SECRET must be set to a CI-only value of at least 32 characters");
}

const connection = await mysql.createConnection({
  host: process.env.DATABASE_HOST ?? "127.0.0.1",
  port: Number(process.env.DATABASE_PORT ?? "3306"),
  database: process.env.DATABASE_NAME ?? "falchion_ci",
  user: process.env.DATABASE_USER ?? "root",
  password: process.env.DATABASE_PASSWORD ?? "",
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: true } : undefined,
  connectTimeout: 10000,
});

const userId = randomUUID();
const sessionEmail = `phase3-api-${userId}@example.invalid`;
try {
  await connection.execute(
    `INSERT INTO app_users
       (id, email, display_name, identity_provider, provider_subject, account_status)
     VALUES (?, ?, ?, 'ci-contract-test', ?, 'ACTIVE')`,
    [userId, sessionEmail, "Phase 03 API Contract Test", userId],
  );
} finally {
  await connection.end();
}

const payload = Buffer.from(JSON.stringify({
  userId,
  email: sessionEmail,
  permissions: ["customers:read", "customers:write", "catalog:read", "catalog:write"],
  legalEntityIds: [],
  expiresAt: Math.floor(Date.now() / 1000) + 3600,
})).toString("base64url");
const signature = createHmac("sha256", sessionSecret).update(payload).digest("base64url");
const cookie = `fx_session=${payload}.${signature}`;

async function request(path, options = {}) {
  const response = await fetch(new URL(path, baseUrl), {
    ...options,
    headers: {
      Cookie: cookie,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers ?? {}),
    },
    cache: "no-store",
  });
  const requestId = response.headers.get("x-request-id");
  const body = await response.json();
  assert.ok(requestId, `X-Request-Id missing on ${path}`);
  if (body?.meta?.requestId) assert.equal(body.meta.requestId, requestId, `meta.requestId mismatch on ${path}`);
  if (body?.error?.requestId) assert.equal(body.error.requestId, requestId, `error.requestId mismatch on ${path}`);
  return { response, body, requestId };
}

function assertPage(body, limit) {
  assert.ok(Array.isArray(body.data), "list response data must be an array");
  assert.equal(body.meta.pagination.limit, limit);
  assert.equal(typeof body.meta.pagination.offset, "number");
  assert.equal(typeof body.meta.pagination.hasMore, "boolean");
  assert.equal("page" in body, false, "legacy top-level page field must be normalized");
}

const suffix = userId.replaceAll("-", "").slice(0, 10);
const customerName = `Phase 03 Contract Customer ${suffix}`;
const customerEmail = `customer-${suffix}@example.invalid`;

const createCustomer = await request("/api/v1/customers", {
  method: "POST",
  body: JSON.stringify({ name: customerName, email: customerEmail }),
});
assert.equal(createCustomer.response.status, 201, "customer create status");
assert.equal(createCustomer.body.data.name, customerName);
assert.equal(createCustomer.body.data.email, customerEmail);
assert.equal(createCustomer.body.data.isActive, true);
assert.ok(createCustomer.body.meta.requestId);
assert.equal("billing_address_json" in createCustomer.body.data, false);

const listCustomers = await request(`/api/v1/customers?query=${encodeURIComponent(customerName)}&status=all&limit=25&offset=0`);
assert.equal(listCustomers.response.status, 200, "customer list status");
assertPage(listCustomers.body, 25);
assert.ok(listCustomers.body.data.some((row) => row.id === createCustomer.body.data.id));
assert.equal("billing_address_json" in (listCustomers.body.data[0] ?? {}), false);

const itemCode = `PH3-${suffix.toUpperCase()}`;
const createCatalog = await request("/api/v1/catalog/items", {
  method: "POST",
  body: JSON.stringify({
    itemCode,
    itemType: "SERVICE",
    name: `Phase 03 Contract Service ${suffix}`,
    customerDescription: "CI-only catalog contract fixture",
    internalDescription: "Not production data",
    unitCode: "unit",
    defaultUnitPrice: "12.3400",
    currency: "INR",
    defaultTaxCode: "",
  }),
});
assert.equal(createCatalog.response.status, 201, "catalog create status");
assert.equal(createCatalog.body.data.itemCode, itemCode);
assert.equal(createCatalog.body.data.defaultUnitPrice, "12.3400");
assert.equal(createCatalog.body.data.currency, "INR");
assert.equal(createCatalog.body.data.isActive, true);
assert.equal("default_unit_price" in createCatalog.body.data, false);

const listCatalog = await request(`/api/v1/catalog/items?query=${encodeURIComponent(itemCode)}&status=all&limit=25&offset=0`);
assert.equal(listCatalog.response.status, 200, "catalog list status");
assertPage(listCatalog.body, 25);
assert.ok(listCatalog.body.data.some((row) => row.id === createCatalog.body.data.id));
assert.equal(typeof listCatalog.body.data.find((row) => row.id === createCatalog.body.data.id)?.defaultUnitPrice, "string");

const invalidCustomer = await request("/api/v1/customers", {
  method: "POST",
  body: JSON.stringify({ name: "   ", unexpected: "must be rejected" }),
});
assert.equal(invalidCustomer.response.status, 422, "invalid input must return 422");
assert.equal(invalidCustomer.body.error.code, "VALIDATION_ERROR");
assert.equal(typeof invalidCustomer.body.error.fields.name, "string");
assert.ok(invalidCustomer.body.error.requestId);

console.log("PASS: implemented customer/catalog routes match response envelope, requestId header, pagination, camelCase fields, exact-decimal serialization and validation error contracts.");
