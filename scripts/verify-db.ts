import mysql from "mysql2/promise";
import type { RowDataPacket } from "mysql2";
import { loadProjectEnv } from "./load-env";
import { verifiedMysqlTlsOptions } from "../src/lib/db/tls-options";

loadProjectEnv();

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function databasePort(): number {
  const port = Number(requiredEnv("DATABASE_PORT"));
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("DATABASE_PORT must be a valid TCP port");
  }
  return port;
}

function safeFailureCategory(error: unknown, depth = 0): string {
  if (depth > 2 || !error || typeof error !== "object") return "unclassified";

  const candidate = error as {
    code?: unknown;
    message?: unknown;
    cause?: unknown;
  };
  const code = typeof candidate.code === "string" ? candidate.code : "";
  const message = typeof candidate.message === "string" ? candidate.message : "";
  const combined = `${code} ${message}`;

  // This inspects errors only to select a fixed, non-sensitive label. It never prints
  // the underlying message, host, database, account, certificate contents or credentials.
  if (/Missing required environment variable|DATABASE_SSL=true is required|DATABASE_PORT must be|Set only one of DATABASE_SSL_CA_PATH/.test(message)) {
    return "configuration";
  }
  if (code === "ENOENT" || /Unable to load \.env/.test(message)) return "local-env-or-ca-file";
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return "dns-resolution";
  if (["ETIMEDOUT", "ECONNREFUSED", "ECONNRESET", "EHOSTUNREACH", "ENETUNREACH"].includes(code)) {
    return "network-or-ip-allowlist";
  }
  if (code === "ER_ACCESS_DENIED_ERROR" || /Access denied for user/i.test(message)) return "authentication-or-grants";
  if (code === "ER_BAD_DB_ERROR" || /Unknown database/i.test(message)) return "database-name";
  if (/CERT_|CERTIFICATE|TLS|SSL|HANDSHAKE|self.signed|issuer|hostname/i.test(combined)) {
    return "tls-certificate-or-handshake";
  }
  if (/Ssl_cipher|active TLS cipher|smoke query/i.test(message)) return "tls-or-query-verification";
  if (candidate.cause && typeof candidate.cause === "object") {
    const nested = safeFailureCategory(candidate.cause, depth + 1);
    if (nested !== "unclassified") return nested;
  }
  return "unclassified";
}

async function main(): Promise<void> {
  if (requiredEnv("DATABASE_SSL").toLowerCase() !== "true") {
    throw new Error("DATABASE_SSL=true is required for the verified TLS check");
  }

  const connection = await mysql.createConnection({
    host: requiredEnv("DATABASE_HOST"),
    port: databasePort(),
    database: requiredEnv("DATABASE_NAME"),
    user: requiredEnv("DATABASE_USER"),
    password: requiredEnv("DATABASE_PASSWORD"),
    ssl: verifiedMysqlTlsOptions(),
    connectTimeout: 10000,
    decimalNumbers: false,
  });

  try {
    const [result] = await connection.query<RowDataPacket[]>("SELECT 1 AS query_ok");
    if (Number(result[0]?.query_ok) !== 1) {
      throw new Error("Database smoke query did not return the expected result");
    }

    const [status] = await connection.query<RowDataPacket[]>(
      "SHOW SESSION STATUS LIKE 'Ssl_cipher'",
    );
    const cipher = status[0]?.Value;

    if (typeof cipher !== "string" || cipher.length === 0) {
      throw new Error("The server did not report an active TLS cipher");
    }

    console.info("PASS: SELECT 1 succeeded and MySQL reports an active TLS cipher.");
    console.info("Certificate verification was enabled (rejectUnauthorized=true).");
  } finally {
    await connection.end();
  }
}

main().catch((error: unknown) => {
  console.error(`FAIL: Database/TLS verification failed [${safeFailureCategory(error)}].`);
  console.error("Use the matching troubleshooting section in docs/database-migrations.md. Raw diagnostics are intentionally suppressed.");
  process.exitCode = 1;
});
