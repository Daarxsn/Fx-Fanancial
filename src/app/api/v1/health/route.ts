import { NextResponse } from "next/server";
import { checkDatabaseHealth } from "@/lib/db/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const database = await checkDatabaseHealth();

  return NextResponse.json(
    {
      status: database.status === "ok" ? "ok" : "degraded",
      checks: { database: database.status },
      checkedAt: database.checkedAt,
    },
    {
      status: database.status === "ok" ? 200 : 503,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
