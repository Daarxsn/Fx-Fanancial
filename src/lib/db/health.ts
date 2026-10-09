import "server-only";

import { pool } from "@/lib/db/pool";

export type DatabaseHealth =
  | { status: "ok"; checkedAt: string }
  | { status: "error"; checkedAt: string };

export async function checkDatabaseHealth(): Promise<DatabaseHealth> {
  const checkedAt = new Date().toISOString();

  try {
    const connection = await pool.getConnection();

    try {
      await connection.ping();
    } finally {
      connection.release();
    }

    return { status: "ok", checkedAt };
  } catch {
    // Do not expose hostnames, usernames, credentials, or driver errors to callers.
    return { status: "error", checkedAt };
  }
}
