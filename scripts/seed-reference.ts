import mysql from "mysql2/promise";
import { randomUUID } from "node:crypto";
import { loadProjectEnv } from "./load-env";
import { verifiedMysqlTlsOptions } from "../src/lib/db/tls-options";

loadProjectEnv();

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const permissions = [
  ["customers:read", "Read customer records"],
  ["customers:write", "Create and update customer records"],
  ["customers:archive", "Archive customer records"],
  ["catalog:read", "Read catalog items"],
  ["catalog:write", "Create and update catalog items"],
  ["catalog:archive", "Archive catalog items"],
  ["invoices:read", "Read invoices"],
  ["invoices:draft:create", "Create invoice drafts"],
  ["invoices:draft:update", "Update invoice drafts"],
  ["invoices:issue", "Issue invoices"],
  ["invoices:cancel", "Cancel invoices with a reason"],
  ["payments:read", "Read payments"],
  ["payments:record", "Record and allocate payments"],
  ["payments:reverse", "Reverse recorded payments"],
  ["quotations:read", "Read quotations"],
  ["quotations:write", "Create and update quotations"],
  ["approvals:read", "Read approval requests"],
  ["approvals:decide", "Approve or reject requests"],
  ["reports:read", "Read financial reports"],
  ["audit:read", "Read audit events"],
  ["users:manage", "Manage user access"],
  ["settings:manage", "Manage company and invoice settings"],
] as const;

const roles = [
  ["system_admin", "System administrator"],
  ["finance_admin", "Finance administrator"],
  ["invoice_creator", "Invoice creator"],
  ["invoice_issuer", "Invoice issuer"],
  ["payment_recorder", "Payment recorder"],
  ["approver", "Approver"],
  ["auditor", "Auditor / read-only"],
] as const;

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_REFERENCE_SEED !== "true") {
    throw new Error("Reference seed is blocked in production unless ALLOW_REFERENCE_SEED=true is explicitly set");
  }

  const sslSetting = requiredEnv("DATABASE_SSL").toLowerCase();
  if (sslSetting !== "true" && sslSetting !== "false") {
    throw new Error("DATABASE_SSL must be true or false");
  }
  if (process.env.NODE_ENV === "production" && sslSetting !== "true") {
    throw new Error("DATABASE_SSL=true is required in production");
  }

  const port = Number(requiredEnv("DATABASE_PORT"));
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("DATABASE_PORT must be a valid TCP port");
  }

  const connection = await mysql.createConnection({
    host: requiredEnv("DATABASE_HOST"),
    port,
    database: requiredEnv("DATABASE_NAME"),
    user: requiredEnv("DATABASE_USER"),
    password: requiredEnv("DATABASE_PASSWORD"),
    ...(sslSetting === "true" ? { ssl: verifiedMysqlTlsOptions() } : {}),
    connectTimeout: 10000,
  });

  try {
    await connection.beginTransaction();
    for (const [permissionKey, description] of permissions) {
      await connection.execute(
        `INSERT INTO app_permissions (id, permission_key, description)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE description = VALUES(description)`,
        [randomUUID(), permissionKey, description],
      );
    }

    for (const [roleKey, displayName] of roles) {
      await connection.execute(
        `INSERT INTO app_roles (id, role_key, display_name, description, is_system_role)
         VALUES (?, ?, ?, ?, TRUE)
         ON DUPLICATE KEY UPDATE display_name = VALUES(display_name), description = VALUES(description)`,
        [randomUUID(), roleKey, displayName, "Reference role; review and assign permissions explicitly before use."],
      );
    }

    // Deliberately do not grant any permissions to roles automatically.
    // Role mappings and user accounts require an approved access-control policy.
    await connection.commit();
    console.info(`Reference seed completed: ${permissions.length} permission definitions and ${roles.length} role definitions. No users or role grants were created.`);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    await connection.end();
  }
}

main().catch(async () => {
  console.error(
    "Reference seed failed. Check required DATABASE_* settings, migration status, TLS configuration, and database grants. Raw database diagnostics are intentionally suppressed.",
  );
  process.exitCode = 1;
});
