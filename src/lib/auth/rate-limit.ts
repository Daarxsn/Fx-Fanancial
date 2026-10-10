import "server-only";

import { createHmac } from "node:crypto";
import type { RowDataPacket } from "mysql2";
import { pool } from "@/lib/db/pool";

const WINDOW_MS = 15 * 60 * 1000;

function bucketHash(scope: "EMAIL" | "IP" | "INVITATION", value: string): string {
  const key = process.env.SESSION_SECRET;
  if (!key || key.length < 32) throw new Error("SESSION_SECRET is not configured");
  return createHmac("sha256", key).update(`${scope}:${value}`).digest("hex");
}

export async function consumeRateLimit(
  scope: "EMAIL" | "IP" | "INVITATION",
  value: string,
  maximum: number,
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const key = bucketHash(scope, value);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute(
      `INSERT IGNORE INTO auth_rate_limits (bucket_key, scope_type, window_started_at, attempt_count)
       VALUES (?, ?, NOW(3), 0)`,
      [key, scope],
    );
    const [rows] = await connection.execute<(RowDataPacket & {
      window_started_at: Date; attempt_count: number; blocked_until: Date | null;
    })[]>(
      "SELECT window_started_at, attempt_count, blocked_until FROM auth_rate_limits WHERE bucket_key = ? FOR UPDATE",
      [key],
    );
    const bucket = rows[0];
    const now = Date.now();
    const windowStarted = new Date(bucket.window_started_at).getTime();
    const blockedUntil = bucket.blocked_until ? new Date(bucket.blocked_until).getTime() : 0;
    if (blockedUntil > now) {
      await connection.commit();
      return { allowed: false, retryAfterSeconds: Math.ceil((blockedUntil - now) / 1000) };
    }
    if (now - windowStarted >= WINDOW_MS) {
      await connection.execute(
        "UPDATE auth_rate_limits SET window_started_at = NOW(3), attempt_count = 1, blocked_until = NULL WHERE bucket_key = ?",
        [key],
      );
      await connection.commit();
      return { allowed: true, retryAfterSeconds: 0 };
    }
    if (Number(bucket.attempt_count) >= maximum) {
      const retryAfterSeconds = Math.max(1, Math.ceil((windowStarted + WINDOW_MS - now) / 1000));
      await connection.execute(
        "UPDATE auth_rate_limits SET blocked_until = DATE_ADD(NOW(3), INTERVAL ? SECOND) WHERE bucket_key = ?",
        [retryAfterSeconds, key],
      );
      await connection.commit();
      return { allowed: false, retryAfterSeconds };
    }
    await connection.execute(
      "UPDATE auth_rate_limits SET attempt_count = attempt_count + 1, blocked_until = NULL WHERE bucket_key = ?",
      [key],
    );
    await connection.commit();
    return { allowed: true, retryAfterSeconds: 0 };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function clearEmailRateLimit(email: string): Promise<void> {
  await pool.execute("DELETE FROM auth_rate_limits WHERE bucket_key = ?", [
    bucketHash("EMAIL", email.trim().toLowerCase()),
  ]);
}
