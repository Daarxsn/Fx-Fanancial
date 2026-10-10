import "server-only";

import { createHmac, randomUUID } from "node:crypto";
import type { Pool, PoolConnection } from "mysql2/promise";
import type { ResultSetHeader } from "mysql2";

type QueryExecutor = Pool | PoolConnection;

function digest(value: string | null | undefined): string | null {
  if (!value) return null;
  const pepper = process.env.SESSION_SECRET;
  if (!pepper || pepper.length < 32) return null;
  return createHmac("sha256", pepper).update(value).digest("hex");
}

export async function writeSecurityEvent(
  executor: QueryExecutor,
  input: {
    userId?: string | null;
    eventType: string;
    outcome: "SUCCESS" | "FAILURE" | "BLOCKED";
    subject?: string | null;
    sourceIp?: string | null;
    userAgent?: string | null;
    metadata?: Record<string, string | number | boolean | null>;
  },
): Promise<void> {
  await executor.execute<ResultSetHeader>(
    `INSERT INTO security_events
      (id, user_id, event_type, outcome, subject_hash, source_ip_hash, user_agent_hash, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [randomUUID(), input.userId ?? null, input.eventType, input.outcome,
      digest(input.subject), digest(input.sourceIp), digest(input.userAgent),
      input.metadata ? JSON.stringify(input.metadata) : null],
  );
}

export function requestSecurityContext(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  const sourceIp = forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || null;
  return { sourceIp, userAgent: request.headers.get("user-agent") };
}
