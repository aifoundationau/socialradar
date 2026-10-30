import "server-only";
import { UpstreamError } from "./token-ledger";

const ENDPOINT = "https://www.searchapi.io/api/v1/search";

export type SearchApiJson = Record<string, unknown>;

/**
 * One GET against SearchApi.io. Any failure throws UpstreamError, so the token gate refunds the
 * caller. The API key travels in the Authorization header, never in the logged URL.
 */
export async function searchApi(engine: string, params: Record<string, string | undefined>): Promise<SearchApiJson> {
  const key = process.env.SEARCHAPI_API_KEY;
  if (!key) {
    console.error("[searchapi] SEARCHAPI_API_KEY is not set");
    throw new UpstreamError("Ad search is not configured yet.");
  }

  const url = new URL(ENDPOINT);
  url.searchParams.set("engine", engine);
  for (const [name, value] of Object.entries(params)) if (value) url.searchParams.set(name, value);

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
      signal: AbortSignal.timeout(25_000),
      cache: "no-store",
    });
  } catch (err) {
    console.error("[searchapi] request failed", engine, err);
    throw new UpstreamError("The ad library didn't respond. Please try again.");
  }

  const json = (await res.json().catch(() => null)) as SearchApiJson | null;
  // SearchApi reports an empty search as an `error` string on a 200 response. That's zero results, not a failure.
  if (res.ok && json && typeof json.error === "string" && /didn't return any results|no results/i.test(json.error)) {
    return {};
  }
  if (!res.ok || !json || typeof json.error === "string") {
    console.error("[searchapi] error response", engine, res.status, json?.error);
    throw new UpstreamError("The ad library search failed. Please try again.");
  }
  return json;
}
