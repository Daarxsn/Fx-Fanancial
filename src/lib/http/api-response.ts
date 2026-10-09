import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthorizationError } from "@/lib/auth/authorize";

export function apiError(error: unknown) {
  if (error instanceof AuthorizationError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.code === "UNAUTHENTICATED" ? "Authentication required" : "You do not have permission to perform this action" } },
      { status: error.code === "UNAUTHENTICATED" ? 401 : 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "The request contains invalid fields", fields: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })) } },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "The request could not be completed" } },
    { status: 500, headers: { "Cache-Control": "no-store" } },
  );
}

export function jsonNoStore(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}
