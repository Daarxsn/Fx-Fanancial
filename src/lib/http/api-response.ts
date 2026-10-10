import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthorizationError } from "@/lib/auth/authorize";
import { CsrfError } from "@/lib/auth/csrf";

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function noStoreHeaders(requestId: string) {
  return {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Request-Id": requestId,
  };
}

export function apiError(error: unknown) {
  const requestId = randomUUID();
  let status = 500;
  let code = "INTERNAL_ERROR";
  let message = "The request could not be completed";
  let fields: Record<string, string> | undefined;

  if (error instanceof AuthorizationError) {
    status = error.code === "UNAUTHENTICATED" ? 401 : 403;
    code = error.code;
    message = error.code === "UNAUTHENTICATED"
      ? "Authentication required"
      : "You do not have permission to perform this action";
  } else if (error instanceof CsrfError) {
    status = 403;
    code = "CSRF_INVALID";
    message = "The request could not be verified. Refresh the page and try again.";
  } else if (error instanceof ZodError) {
    status = 422;
    code = "VALIDATION_ERROR";
    message = "The request contains invalid fields";
    fields = {};
    for (const issue of error.issues) {
      const key = issue.path.length ? issue.path.join(".") : "_";
      fields[key] ??= issue.message;
    }
  } else if (error instanceof SyntaxError) {
    status = 400;
    code = "MALFORMED_JSON";
    message = "The request body must be valid JSON";
  }

  return NextResponse.json(
    { error: { code, message, ...(fields ? { fields } : {}), requestId } },
    { status, headers: noStoreHeaders(requestId) },
  );
}

/**
 * Adds a request ID to every JSON API response and applies the shared success/error envelope.
 * The optional pagination input is normalized into meta.pagination for existing list handlers.
 */
export function jsonNoStore(body: unknown, status = 200) {
  const requestId = randomUUID();
  let payload = body;

  if (isRecord(body) && isRecord(body.error)) {
    payload = {
      ...body,
      error: { ...body.error, requestId },
    };
  } else if (isRecord(body) && Object.prototype.hasOwnProperty.call(body, "data")) {
    const { page, pagination, meta, ...rest } = body;
    const paginationValue = pagination ?? page;
    payload = {
      ...rest,
      meta: {
        ...(isRecord(meta) ? meta : {}),
        requestId,
        ...(paginationValue !== undefined ? { pagination: paginationValue } : {}),
      },
    };
  }

  return NextResponse.json(payload, {
    status,
    headers: noStoreHeaders(requestId),
  });
}
