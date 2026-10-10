import "server-only";

import mysql from "mysql2/promise";
import { verifiedMysqlTlsOptions } from "@/lib/db/tls-options";

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function readPort(): number {
  const rawPort = requiredEnv("DATABASE_PORT");
  const port = Number(rawPort);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("DATABASE_PORT must be a valid TCP port");
  }

  return port;
}

const globalForMySQL = globalThis as typeof globalThis & {
  mysqlPool?: mysql.Pool;
};

function createPool(): mysql.Pool {
  const sslSetting = process.env.DATABASE_SSL?.trim().toLowerCase();

  if (sslSetting !== "true" && sslSetting !== "false") {
    throw new Error("DATABASE_SSL must be set to true or false");
  }
  if (process.env.NODE_ENV === "production" && sslSetting !== "true") {
    throw new Error("DATABASE_SSL=true is required in production");
  }

  return mysql.createPool({
    host: requiredEnv("DATABASE_HOST"),
    port: readPort(),
    database: requiredEnv("DATABASE_NAME"),
    user: requiredEnv("DATABASE_USER"),
    password: requiredEnv("DATABASE_PASSWORD"),
    ...(sslSetting === "true" ? { ssl: verifiedMysqlTlsOptions() } : {}),
    waitForConnections: true,
    connectionLimit: 5,
    maxIdle: 2,
    idleTimeout: 60000,
    queueLimit: 10,
    connectTimeout: 10000,
    enableKeepAlive: true,
    decimalNumbers: false,
  });
}

export const pool =
  process.env.NODE_ENV === "production"
    ? createPool()
    : (globalForMySQL.mysqlPool ??= createPool());
