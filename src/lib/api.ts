import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { idempotencyKey, type ErrorCode } from "./contracts";
import { AuthError } from "./firebase-admin";

export class ApiError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function jsonError(code: ErrorCode, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

/** Maps any thrown value to the standard error envelope. Never leaks internals. */
export function errorResponse(err: unknown) {
  if (err instanceof AuthError) {
    const status = { UNAUTHENTICATED: 401, FORBIDDEN: 403, UPSTREAM_FAILURE: 502 }[err.code];
    return jsonError(err.code, err.message, status);
  }
  if (err instanceof ApiError) return jsonError(err.code, err.message, err.status);
  if (err instanceof ZodError) {
    const msg = err.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ");
    return jsonError("INVALID_INPUT", msg.slice(0, 500), 400);
  }
  console.error("[api] unhandled error", err);
  return jsonError("INTERNAL", "Something went wrong. Please try again.", 500);
}

export function requireIdempotencyKey(req: Request): string {
  const parsed = idempotencyKey.safeParse(req.headers.get("x-idempotency-key") ?? "");
  if (!parsed.success) {
    throw new ApiError("INVALID_INPUT", "x-idempotency-key header is required (8-128 chars, A-Z a-z 0-9 _ -)", 400);
  }
  return parsed.data;
}

/** For non-charging mutations: the key is optional, but a malformed one is still rejected. */
export function optionalIdempotencyKey(req: Request): string | undefined {
  return req.headers.has("x-idempotency-key") ? requireIdempotencyKey(req) : undefined;
}

/** Parses JSON body with a size cap. */
export async function readJson(req: Request, maxBytes = 32_000): Promise<unknown> {
  const text = await req.text();
  if (text.length > maxBytes) throw new ApiError("INVALID_INPUT", "Request body too large", 413);
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError("INVALID_INPUT", "Body must be valid JSON", 400);
  }
}
