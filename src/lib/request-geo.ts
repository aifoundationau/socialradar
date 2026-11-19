import "server-only";

/**
 * Which request headers can be trusted for the visitor's country and IP. A header is only trustworthy when the
 * hosting platform overwrites it on every request; anywhere else it's whatever the browser chose to send.
 * - "vercel" (the default on Vercel, which sets VERCEL=1): x-vercel-ip-country (+ city/region/coordinates) and
 *   x-real-ip / x-forwarded-for.
 * - "cloudflare": cf-ipcountry and cf-connecting-ip. Set GEO_TRUST=cloudflare only if every request reaches the
 *   app through Cloudflare (direct traffic to the origin blocked); otherwise anyone can send these headers.
 * - "none" (the default anywhere else, e.g. Firebase App Hosting): no header is trusted, so the country is
 *   unknown. A free-access window limited to some countries then doesn't apply; windows open to all countries do.
 */
export type GeoTrust = "vercel" | "cloudflare" | "none";

export function getGeoTrust(): GeoTrust {
  const configured = (process.env.GEO_TRUST || "").trim().toLowerCase();
  if (configured === "vercel" || configured === "cloudflare" || configured === "none") return configured;
  return process.env.VERCEL ? "vercel" : "none";
}

const PRIVATE_IP = /^(?:10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|::1$|::$|f[cd][0-9a-f]{2}:|fe80:)/i;

/**
 * The visitor's public IP from the platform's trusted header, or "" when there isn't one (an untrusted host, or
 * local development). Without it, an IP lookup would locate the server instead of the visitor.
 */
export function clientIp(headers: Headers): string {
  const trust = getGeoTrust();
  const candidates =
    trust === "vercel"
      ? [headers.get("x-real-ip"), (headers.get("x-forwarded-for") || "").split(",")[0]]
      : trust === "cloudflare"
        ? [headers.get("cf-connecting-ip")]
        : [];
  for (const raw of candidates) {
    const ip = (raw || "").trim().replace(/^\[|\]$/g, "").replace(/^::ffff:/i, "");
    if (ip && /^[0-9a-f.:]+$/i.test(ip) && !PRIVATE_IP.test(ip)) return ip;
  }
  return "";
}

/** ISO country from the platform's trusted edge header (see getGeoTrust), or "". */
export function edgeCountry(headers: Headers): string {
  const trust = getGeoTrust();
  const raw =
    trust === "vercel"
      ? headers.get("x-vercel-ip-country")
      : trust === "cloudflare"
        ? headers.get("cf-ipcountry")
        : null;
  const code = (raw || "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : "";
}

const COUNTRY_TTL_MS = 60 * 60 * 1000;
const COUNTRY_CACHE_MAX = 5000;
const countryCache = new Map<string, { at: number; country: string }>();

/**
 * The visitor's country, worked out on the server only: the platform's trusted edge header, otherwise an
 * ipwho.is lookup of the visitor's trusted IP (cached for an hour per IP). Returns "" when it can't be
 * determined, and callers treat "" as "not in any limited country" (fail closed). Headers the browser can set,
 * such as x-user-country, are never used.
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
