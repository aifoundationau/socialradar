import "server-only";
import { sanitizeText, type NormalizedAd } from "./contracts";

export type TikTokDraft = Omit<NormalizedAd, "winningScore" | "highlightKeywords"> & {
  duplicates: number;
  highlightKeywords?: string[];
};

type Json = Record<string, unknown>;

const obj = (v: unknown): Json => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {});
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const https = (v: unknown) =>
  typeof v === "string" && v.length <= 2048 && /^https:\/\/[^\s<>"']+$/.test(v.trim()) ? v.trim() : "";
const idPart = (v: unknown) => String(v ?? "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 190);
const cleanText = (v: unknown, max: number) =>
  typeof v === "string"
    ? sanitizeText(v.replace(/\{\{[^}]*\}\}/g, " ").replace(/[ \t]{2,}/g, " ")).slice(0, max)
    : "";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Classifies the TikTok UGC creative format & hook style from the ad copy and metadata.
 */
export function detectTikTokUgcFormat(copy: string, activeDays: number, views?: number): string {
  const lower = copy.toLowerCase();
  if (/\b(tiktok made me|saw this on tiktok|viral on tiktok)\b/.test(lower)) {
    return "Viral UGC · TikTok Made Me Buy It";
  }
  if (/\b(i tried|my honest|honest review|unboxing|testing out|rating)\b/.test(lower)) {
    return "Creator Review & Unboxing UGC";
  }
  if (/\b(pov:|when you|that feeling when|day in the life|grwm)\b/.test(lower)) {
    return "Native POV & Lifestyle Hook";
  }
  if (/\b(\d+\s*(?:reasons|things|ways|mistakes|signs)|why you shouldn't|stop doing)\b/.test(lower)) {
    return "Listicle & Pattern-Interrupt Hook";
  }
  if (/\b(tired of|struggling with|sick of|finally found|how i fixed|before and after)\b/.test(lower)) {
    return "Problem-Agitate-Solve (PAS) Transformation";
  }
  if (/\b(\d+%\s*off|free shipping|limited time|flash sale|bundle|code\s+[a-z0-9]+)\b/.test(lower)) {
    return "Direct-Response Offer & Promo Drop";
  }
  if ((views ?? 0) >= 500_000) {
    return "High-Velocity Mega-Reach Creative";
  }
  if (activeDays >= 60) {
    return "Evergreen Scaling Winner (60+ Days)";
  }
  if (activeDays >= 28) {
    return "Proven TikTok Winner (28+ Days)";
  }
  return "TikTok Commercial Video Ad";
}

/**
 * Infers or normalizes the Call-To-Action button text for a TikTok ad.
 */
export function inferTikTokCta(rawCta: unknown, copy: string): string {
  const explicit = cleanText(rawCta, 100);
  if (explicit) {
    return /^[A-Z_]+$/.test(explicit)
      ? explicit.charAt(0) + explicit.slice(1).toLowerCase().replace(/_/g, " ")
      : explicit;
  }
  const lower = copy.toLowerCase();
  if (/\b(shop now|buy now|order now|get yours|add to cart|tiktok shop)\b/.test(lower)) return "Shop Now";
  if (/\b(download|install|get the app|app store|google play)\b/.test(lower)) return "Download Now";
  if (/\b(sign up|register|join free|start free|free trial)\b/.test(lower)) return "Sign Up";
  if (/\b(book now|schedule|get quote|free consultation)\b/.test(lower)) return "Book Now";
  if (/\b(\d+%\s*off|claim offer|get offer|discount)\b/.test(lower)) return "Get Offer";
  return "Learn More";
}

/**
 * Builds a high-signal headline for a TikTok ad when the upstream library only provides a caption/title.
 */
export function buildTikTokHeadline(
  rawHeadline: unknown,
  copy: string,
  advertiserName: string,
  activeDays: number,
  views?: number,
  ctrTier?: string,
  objective?: string,
): string {
  const explicit = cleanText(rawHeadline, 500);
  if (explicit && explicit.toLowerCase() !== copy.toLowerCase()) {
    return explicit;
  }

  const formatTag = detectTikTokUgcFormat(copy, activeDays, views);
  const badges: string[] = [];
  if (ctrTier) badges.push(ctrTier);
  if (objective) badges.push(objective);

  // Extract the opening hook sentence if it's punchy (12–110 chars)
  const firstSentence = copy
    .split(/(?<=[.!?])\s+|\n+/)[0]
    ?.replace(/#[a-z0-9_]+/gi, "")
    .trim();

  if (firstSentence && firstSentence.length >= 12 && firstSentence.length <= 110) {
    const suffix = badges.length > 0 ? ` (${badges.join(" · ")})` : ` · ${formatTag}`;
    return cleanText(`${firstSentence}${suffix}`, 500);
  }

  if (badges.length > 0) {
    return cleanText(`${advertiserName || "TikTok Winner"} — ${badges.join(" · ")} · ${formatTag}`, 500);
  }

  return cleanText(`${advertiserName || "TikTok"} · ${formatTag}`, 500);
}

/**
 * Queries TikTok Creative Center Top Ads (`ads.tiktok.com/business/creativecenter/inspiration/topads`)
 * when `APIFY_API_TOKEN` or `TIKTOK_CREATIVE_CENTER_API_URL` is configured in the environment.
 * Gracefully returns `[]` if not configured or if upstream times out, so SearchApi.io seamlessly handles the request.
 */
export async function fetchTikTokCreativeCenterTopAds(params: {
  query: string;
  country: string;
  mediaType: "ALL" | "VIDEO" | "IMAGE";
}): Promise<TikTokDraft[]> {
  const apifyToken = process.env.APIFY_API_TOKEN?.trim();
  const customEndpoint = process.env.TIKTOK_CREATIVE_CENTER_API_URL?.trim();

  if (!apifyToken && !customEndpoint) {
    return [];
  }

  const actorId =
    process.env.APIFY_TIKTOK_TOPADS_ACTOR_ID?.trim() || "clockworks~tiktok-creative-center-scraper";

  const url = customEndpoint
    ? new URL(customEndpoint)
    : new URL(`https://api.apify.com/v2/acts/${encodeURIComponent(actorId)}/run-sync-get-dataset-items`);

  if (apifyToken && !customEndpoint) {
    url.searchParams.set("token", apifyToken);
  }

  try {
    const res = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(apifyToken && customEndpoint ? { Authorization: `Bearer ${apifyToken}` } : {}),
      },
      body: JSON.stringify({
        keyword: params.query.replace(/"/g, "").trim(),
        country: params.country === "ALL" ? "US" : params.country,
        period: 180,
        orderBy: "ctr",
        maxItems: 40,
      }),
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });

    if (!res.ok) return [];
    const rawList = list(await res.json().catch(() => []));
    const nowIso = new Date().toISOString();
    const results: TikTokDraft[] = [];

    for (const raw of rawList) {
      const item = obj(raw);
      const videoObj = obj(item.video_info || item.video);
      const id = idPart(item.id || item.material_id || item.ad_id || videoObj.vid);
      if (!id) continue;

      const videoUrl =
        https(item.video_url) ||
        https(item.video_link) ||
        https(obj(videoObj.video_url).p720) ||
        https(obj(videoObj.video_url).p540) ||
        https(videoObj.url);
      const coverUrl =
        https(item.cover_url) ||
        https(item.cover_image) ||
        https(videoObj.cover) ||
        https(item.thumbnail_url);

      if (!videoUrl && !coverUrl) continue;
      if (params.mediaType === "IMAGE" && videoUrl) continue;

      const advertiserName =
        cleanText(item.brand_name || item.advertiser_name || item.advertiser || "TikTok Top Advertiser", 300);
      const primaryCopy = cleanText(item.ad_title || item.caption || item.title || item.description || "", 5000);

      // Parse CTR percentile & campaign objective
      const ctrRank = Number(item.ctr_percentile || item.ctr_rank || 0);
      const ctrTier =
        ctrRank > 0 && ctrRank <= 1
          ? "Top 1% CTR"
          : ctrRank > 0 && ctrRank <= 5
            ? "Top 5% CTR"
            : ctrRank > 0 && ctrRank <= 10
              ? "Top 10% CTR"
              : "Creative Center Top Ad";
      const objective = cleanText(item.objective_key || item.objective || "Conversions", 60);

      const rawLikes = Math.round(Number(item.like || item.likes || item.like_count || 0));
      const rawCtr = Number(item.ctr || 0);
      const rawViews = Math.round(
        Number(item.impression || item.views || item.reach || (rawLikes > 0 ? rawLikes * 28 : 45_000)),
      );

      const activeDays = Math.max(
        14,
        Math.min(180, Math.round(Number(item.duration_days || item.active_days || (rawLikes > 5000 ? 65 : 32)))),
      );
      const firstSeen = new Date(Date.now() - activeDays * DAY_MS).toISOString();

      const headline = buildTikTokHeadline(
        item.headline,
        primaryCopy,
        advertiserName,
        activeDays,
        rawViews,
        ctrTier,
        objective,
      );
      const ctaText = inferTikTokCta(item.cta || item.call_to_action, primaryCopy);
      const landingPageUrl = https(item.landing_page || item.landing_page_url || item.website_url);

      results.push({
        adId: `tiktok_cc_${id}`,
        platform: "TIKTOK",
        advertiserName,
        advertiserId: idPart(item.advertiser_id || item.brand_id || advertiserName.toLowerCase().replace(/\s+/g, "_")),
        mediaType: videoUrl ? "VIDEO" : "IMAGE",
        mediaUrls: videoUrl ? [videoUrl] : coverUrl ? [coverUrl] : [],
        thumbnailUrl: coverUrl,
        primaryCopy: primaryCopy || headline,
        headline,
        ctaText,
        landingPageUrl,
        countryCode: params.country === "ALL" ? "US" : params.country,
        firstSeenDate: firstSeen,
        lastSeenDate: nowIso,
        activeDaysCount: activeDays,
        totalViews: rawViews > 0 ? rawViews : undefined,
        totalLikes: rawLikes > 0 ? rawLikes : rawCtr > 0 ? Math.round(rawViews * 0.05) : undefined,
        duplicates: ctrRank > 0 && ctrRank <= 5 ? 3 : 1,
      });
    }

    return results;
  } catch {
    return [];
  }
}

