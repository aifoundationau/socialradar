import "server-only";

const PRIVATE_IP = /^(?:10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|::1$|::$|f[cd][0-9a-f]{2}:|fe80:)/i;

/**
 * The visitor's public IP from the proxy headers (first public address), or "" if there is none, as in
 * local development. Without it, an IP lookup would locate the server instead of the visitor.
 */
export function clientIp(headers: Headers): string {
  const candidates = [
    headers.get("cf-connecting-ip"),
    headers.get("true-client-ip"),
    headers.get("x-real-ip"),
    ...(headers.get("x-forwarded-for") || "").split(","),
  ];
  for (const raw of candidates) {
    const ip = (raw || "").trim().replace(/^\[|\]$/g, "").replace(/^::ffff:/i, "");
    if (ip && /^[0-9a-f.:]+$/i.test(ip) && !PRIVATE_IP.test(ip)) return ip;
  }
  return "";
}

/** ISO country from an edge header the visitor can't set (Vercel, Cloudflare), or "". */
export function edgeCountry(headers: Headers): string {
  const raw = (headers.get("x-vercel-ip-country") || headers.get("cf-ipcountry") || "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(raw) ? raw : "";
}

const COUNTRY_TTL_MS = 60 * 60 * 1000;
const COUNTRY_CACHE_MAX = 5000;
const countryCache = new Map<string, { at: number; country: string }>();

/**
 * The visitor's country, worked out on the server only: an edge header, otherwise an ipwho.is lookup of
 * the visitor's IP (cached for an hour per IP). Returns "" when it can't be determined. Browser-supplied
 * headers such as x-user-country are deliberately ignored, because the visitor controls them.
 */
export async function resolveRequestCountry(req: Request): Promise<string> {
  const edge = edgeCountry(req.headers);
  if (edge) return edge;

  const ip = clientIp(req.headers);
  // With no visitor IP, only local development may look up "self" (the server is the visitor's machine).
  const cacheKey = ip || (process.env.NODE_ENV !== "production" ? "self" : "");
  if (!cacheKey) return "";

  const hit = countryCache.get(cacheKey);
  if (hit && Date.now() - hit.at < COUNTRY_TTL_MS) return hit.country;

  try {
    const res = await fetch(ip ? `https://ipwho.is/${encodeURIComponent(ip)}` : "https://ipwho.is/", {
      signal: AbortSignal.timeout(3000),
      cache: "no-store",
    });
    const data = res.ok ? ((await res.json()) as { success?: boolean; country_code?: unknown }) : null;
    const country =
      data?.success && typeof data.country_code === "string" && /^[A-Za-z]{2}$/.test(data.country_code)
        ? data.country_code.toUpperCase()
        : "";
    if (country) {
      if (countryCache.size >= COUNTRY_CACHE_MAX) countryCache.clear();
      countryCache.set(cacheKey, { at: Date.now(), country });
    }
    return country;
  } catch {
    return "";
  }
}
