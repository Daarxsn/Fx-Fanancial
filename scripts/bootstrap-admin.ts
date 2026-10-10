import { createHash, createHmac, randomBytes, randomUUID, scrypt as scryptCallback } from "node:crypto";
import mysql from "mysql2/promise";
import { loadProjectEnv } from "./load-env";
import { verifiedMysqlTlsOptions } from "../src/lib/db/tls-options";

loadProjectEnv();

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error("Missing required bootstrap configuration");
  return value;
}

function passwordHash(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = randomBytes(16);
    scryptCallback(password, salt, 64, {
      N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024,
    }, (error, key) => {
      if (error) return reject(error);
      resolve("scrypt$32768$8$1$" + salt.toString("base64url") + "$" + (key as Buffer).toString("base64url"));
    });
  });
}

async function main() {
  if (requiredEnv("BOOTSTRAP_ADMIN_CONFIRM") !== "CREATE_FIRST_ADMIN") {
    throw new Error("Explicit first-admin confirmation is required");
  }
  const email = requiredEnv("BOOTSTRAP_ADMIN_EMAIL").toLowerCase();
  const displayName = requiredEnv("BOOTSTRAP_ADMIN_NAME");
  const password = requiredEnv("BOOTSTRAP_ADMIN_PASSWORD");
  const sessionSecret = requiredEnv("SESSION_SECRET");
  if (sessionSecret.length < 32) throw new Error("SESSION_SECRET is too short");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) throw new Error("Admin email is invalid");
  if (displayName.length > 160) throw new Error("Admin display name is too long");
  if (password.length < 12 || password.length > 128 || !password.trim()) {
    throw new Error("Admin password must contain 12–128 characters");
  }

  const sslSetting = requiredEnv("DATABASE_SSL").toLowerCase();
  if (sslSetting !== "true" && sslSetting !== "false") throw new Error("DATABASE_SSL must be true or false");
  if (process.env.NODE_ENV === "production" && sslSetting !== "true") {
    throw new Error("DATABASE_SSL=true is required in production");
  }
  const port = Number(requiredEnv("DATABASE_PORT"));
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Database port is invalid");

  const connection = await mysql.createConnection({
    host: requiredEnv("DATABASE_HOST"),
    port,
    database: requiredEnv("DATABASE_NAME"),
    user: requiredEnv("DATABASE_USER"),
    password: requiredEnv("DATABASE_PASSWORD"),
    ...(sslSetting === "true" ? { ssl: verifiedMysqlTlsOptions() } : {}),
    connectTimeout: 10000,
    multipleStatements: false,
  });

  const userId = randomUUID();
  const eventId = randomUUID();
  const pepperedEmailHash = createHmac("sha256", sessionSecret).update(email).digest("hex");
  const credentialHash = await passwordHash(password);
  const requestedScope = (process.env.BOOTSTRAP_ADMIN_LEGAL_ENTITY_IDS ?? "")
    .split(",").map((id) => id.trim()).filter(Boolean);
  for (const id of requestedScope) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Bootstrap legal-entity scope contains an invalid UUID");
  }

  try {
    await connection.beginTransaction();
    const [admins] = await connection.execute(
      "SELECT COUNT(*) AS count FROM user_roles ur JOIN app_roles r ON r.id=ur.role_id WHERE r.role_key='system_admin'",
    ) as [Array<{ count: number }>, unknown];
    if (Number(admins[0]?.count ?? 0) > 0) throw new Error("A system administrator is already assigned; bootstrap is one-time only");

    const [existing] = await connection.execute("SELECT id FROM app_users WHERE email = ? LIMIT 1", [email]) as [Array<{ id: string }>, unknown];
    if (existing.length) throw new Error("The configured bootstrap email already exists");

    const [roleRows] = await connection.execute("SELECT id FROM app_roles WHERE role_key='system_admin' LIMIT 1") as [Array<{ id: string }>, unknown];
    const [manageRows] = await connection.execute(
      "SELECT p.id FROM app_permissions p JOIN role_permissions rp ON rp.permission_id=p.id " +
      "WHERE rp.role_id=? AND p.permission_key='users:manage' LIMIT 1",
      [roleRows[0]?.id],
    ) as [Array<{ id: string }>, unknown];
    if (!roleRows.length || !manageRows.length) throw new Error("Reference role templates are missing; run the reference seed first");

    if (requestedScope.length) {
      const [entities] = await connection.query(
        "SELECT id FROM legal_entities WHERE is_active=TRUE AND id IN (" + requestedScope.map(() => "?").join(",") + ")",
        requestedScope,
      ) as [Array<{ id: string }>, unknown];
      if (entities.length !== new Set(requestedScope).size) throw new Error("Bootstrap legal-entity scope contains an inactive or unknown entity");
    }

    await connection.execute(
      "INSERT INTO app_users (id, email, display_name, identity_provider, provider_subject, password_hash, account_status) " +
      "VALUES (?, ?, ?, 'local_password', ?, ?, 'ACTIVE')",
      [userId, email, displayName, email, credentialHash],
    );
    await connection.execute("INSERT INTO user_roles (user_id, role_id, granted_by) VALUES (?, ?, NULL)", [userId, roleRows[0].id]);
    for (const entityId of new Set(requestedScope)) {
      await connection.execute(
        "INSERT INTO user_legal_entity_access (user_id, legal_entity_id, granted_by) VALUES (?, ?, NULL)",
        [userId, entityId],
      );
    }
    await connection.execute(
      "INSERT INTO audit_events (id, actor_id, action, entity_type, entity_id, outcome, after_json) " +
      "VALUES (?, ?, 'auth.bootstrap_admin.created', 'app_user', ?, 'SUCCESS', JSON_OBJECT('role', 'system_admin'))",
      [eventId, userId, userId],
    );
    await connection.execute(
      "INSERT INTO security_events (id, user_id, event_type, outcome, subject_hash, metadata_json) " +
      "VALUES (?, ?, 'auth.bootstrap_admin.created', 'SUCCESS', ?, JSON_OBJECT('method', 'one-time-bootstrap'))",
      [randomUUID(), userId, pepperedEmailHash],
    );
    await connection.commit();
    console.info("PASS: first system administrator created. The bootstrap cannot be used again after a system-admin role assignment exists.");
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    await connection.end();
  }
}

main().catch(() => {
  console.error("First-admin bootstrap failed. Check migrations, reference role templates, required BOOTSTRAP_ADMIN_* variables, and database/TLS configuration. Sensitive diagnostics are suppressed.");
  process.exitCode = 1;
});
