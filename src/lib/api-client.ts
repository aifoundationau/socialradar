import { clientAuth } from "./firebase-client";
import type { ErrorCode } from "./contracts";

export class ApiClientError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

export const newIdempotencyKey = () => crypto.randomUUID();

/**
 * Calls an Ad Radar API route as the signed-in user. Mutations always carry an
 * `x-idempotency-key`; pass the same key when retrying the same user action.
 * Throws ApiClientError carrying the server's error envelope.
 */
export async function apiFetch<T>(
  path: string,
  opts: { method?: "POST" | "PUT" | "PATCH" | "DELETE"; body?: unknown; idempotencyKey?: string } = {},
): Promise<T> {
  const user = clientAuth().currentUser;
  if (!user) throw new ApiClientError("UNAUTHENTICATED", "Please sign in again.", 401);

  const res = await fetch(path, {
    method: opts.method ?? "POST",
    headers: {
      Authorization: `Bearer ${await user.getIdToken()}`,
      "Content-Type": "application/json",
      "x-idempotency-key": opts.idempotencyKey ?? newIdempotencyKey(),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiClientError(
      json?.error?.code ?? "INTERNAL",
      json?.error?.message ?? `Request failed (${res.status})`,
      res.status,
    );
  }
  return json as T;
}

export const errorMessage = (err: unknown) =>
  err instanceof Error ? err.message : "Something went wrong. Please try again.";
