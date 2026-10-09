import "server-only";

import mysql from "mysql2/promise";

function requiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

const port = Number(requiredEnv("DATABASE_PORT"));

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("DATABASE_PORT must be a valid TCP port");
}

const globalForMySQL = globalThis as typeof globalThis & {
  mysqlPool?: mysql.Pool;
};

export const pool =
  globalForMySQL.mysqlPool ??
  mysql.createPool({
    host: requiredEnv("DATABASE_HOST"),
    port,
    database: requiredEnv("DATABASE_NAME"),
    user: requiredEnv("DATABASE_USER"),
    password: requiredEnv("DATABASE_PASSWORD"),
    ssl: {
      rejectUnauthorized: true,
    },
    waitForConnections: true,
    connectionLimit: 5,
    maxIdle: 2,
    idleTimeout: 60000,
    queueLimit: 10,
    connectTimeout: 10000,
    enableKeepAlive: true,
    decimalNumbers: false,
  });

if (process.env.NODE_ENV !== "production") {
  globalForMySQL.mysqlPool = pool;
}
