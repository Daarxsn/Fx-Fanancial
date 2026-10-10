import mysql from "mysql2/promise";
import type { RowDataPacket } from "mysql2";
import { loadProjectEnv } from "./load-env";

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
    ssl: { rejectUnauthorized: true },
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

main().catch(() => {
  console.error(
    "FAIL: Database/TLS verification did not complete. Check the required DATABASE_* values in your local environment, Aiven service status, network access/IP allowlist, and trusted CA configuration. Raw diagnostics are suppressed to protect credentials and infrastructure details.",
  );
  process.exitCode = 1;
});
