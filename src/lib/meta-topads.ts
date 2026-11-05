import "server-only";
import { sanitizeText, type NormalizedAd } from "./contracts";

export type MetaDraft = Omit<NormalizedAd, "winningScore" | "highlightKeywords"> & {
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
 * Classifies the Meta creative format, omnichannel placement, and ad-set scaling tier.
 */
export function detectMetaCreativeFormat(params: {
  mediaType: "VIDEO" | "IMAGE" | "CAROUSEL" | "TEXT";
  copy: string;
  activeDays: number;
  duplicates: number;
  platformCount: number;
  cardCount: number;
}): string {
  const lower = params.copy.toLowerCase();
  const scalingBadge = params.duplicates >= 4 ? `${params.duplicates + 1} Ad Sets Scaling` : "";

  if (params.mediaType === "CAROUSEL" || params.cardCount > 1) {
    return scalingBadge
      ? `Advantage+ Carousel (${params.cardCount} Cards) · ${scalingBadge}`
      : `Multi-Card Carousel Winner (${params.cardCount} Cards)`;
  }

  if (params.mediaType === "VIDEO") {
    if (/\b(i tried|my honest|honest review|unboxing|pov:|grwm|obsessed)\b/.test(lower)) {
      return scalingBadge ? `Reels & Feed UGC Video · ${scalingBadge}` : "Reels & Feed Creator UGC Video";
    }
    if (params.activeDays >= 60) {
      return scalingBadge
        ? `Evergreen Video Winner (60+ Days) · ${scalingBadge}`
        : "Evergreen Meta Video Winner (60+ Days)";
    }
    return scalingBadge ? `Meta Video Ad · ${scalingBadge}` : "Facebook & Instagram Reels Video Ad";
  }

  if (/\b(\d+%\s*off|free shipping|bundle|limited time|flash sale|use code)\b/.test(lower)) {
    return scalingBadge ? `Direct-Response Offer · ${scalingBadge}` : "Direct-Response Offer Creative";
  }

  if (params.platformCount >= 3) {
    return scalingBadge
      ? `Advantage+ Omnichannel · ${scalingBadge}`
      : "Advantage+ Omnichannel Creative";
  }

  if (params.activeDays >= 60) {
    return "Evergreen Meta Winner (60+ Days)";
  }
  if (params.activeDays >= 28) {
    return "Proven Meta Winner (28+ Days)";
  }
  return "Facebook & Instagram Feed Ad";
}

/**
 * Normalizes or infers the Call-To-Action button label for a Meta ad.
 */
export function inferMetaCta(rawCta: unknown, copy: string, headline: string): string {
  const explicit = cleanText(rawCta, 100);
  if (explicit) {
    return /^[A-Z_]+$/.test(explicit)
      ? explicit.charAt(0) + explicit.slice(1).toLowerCase().replace(/_/g, " ")
      : explicit;
  }
  const combined = `${headline} ${copy}`.toLowerCase();
  if (/\b(shop now|buy now|order now|get yours|free shipping|bundle)\b/.test(combined)) return "Shop now";
  if (/\b(get offer|claim offer|\d+%\s*off|discount|use code)\b/.test(combined)) return "Get offer";
  if (/\b(sign up|register|join free|start free|free trial)\b/.test(combined)) return "Sign up";
  if (/\b(book now|schedule|appointment|free quote|get quote)\b/.test(combined)) return "Book now";
  if (/\b(download|install|get the app)\b/.test(combined)) return "Download";
  return "Learn more";
}

/**
 * Extracts and combines primary copy from `snapshot.body`, multi-card `snapshot.cards[]`, and `link_description`.
 */
export function buildMetaPrimaryCopy(snap: Json, cards: Json[]): string {
  const mainBody =
    cleanText(obj(snap.body).text, 4000) ||
    cleanText(snap.body, 4000) ||
    cleanText(cards[0]?.body, 4000);

  // Collect distinct carousel card titles/descriptions across cards 1..5
  const cardHighlights: string[] = [];
  if (cards.length > 1) {
    for (const c of cards.slice(0, 5)) {
      const cTitle = cleanText(c.title, 100);
      const cBody = cleanText(c.body, 140);
      const entry = cTitle && cBody && cTitle !== cBody ? `${cTitle}: ${cBody}` : cTitle || cBody;
      if (entry && !mainBody.includes(entry) && !cardHighlights.includes(entry)) {
        cardHighlights.push(entry);
      }
    }
  }

  const linkDesc =
    cleanText(snap.link_description, 300) || cleanText(cards[0]?.link_description, 300);

  const parts: string[] = [];
  if (mainBody) parts.push(mainBody);
  if (cardHighlights.length > 0) {
    parts.push(`Carousel Cards: ${cardHighlights.join(" | ")}`);
  }
  if (linkDesc && !mainBody.toLowerCase().includes(linkDesc.toLowerCase())) {
    parts.push(linkDesc);
  }

  return cleanText(parts.join(" — "), 5000);
}

/**
 * Synthesizes a high-signal headline for a Meta ad so Reels/Stories videos and dynamic templates never render blank.
 */
export function buildMetaHeadline(params: {
  rawTitle: unknown;
  cardTitle: unknown;
  linkDescription: unknown;
  caption: unknown;
  copy: string;
  advertiserName: string;
  activeDays: number;
  duplicates: number;
  mediaType: "VIDEO" | "IMAGE" | "CAROUSEL" | "TEXT";
  platformCount: number;
  cardCount: number;
}): string {
  const explicit =
    cleanText(params.rawTitle, 400) ||
    cleanText(params.cardTitle, 400) ||
    cleanText(params.linkDescription, 400);

  const formatBadge = detectMetaCreativeFormat({
    mediaType: params.mediaType,
    copy: params.copy,
    activeDays: params.activeDays,
    duplicates: params.duplicates,
    platformCount: params.platformCount,
    cardCount: params.cardCount,
  });

  if (explicit && explicit.length >= 4 && explicit.toLowerCase() !== params.advertiserName.toLowerCase()) {
    if (params.duplicates >= 4 && !explicit.includes("Ad Sets")) {
      return cleanText(`${explicit} · ${params.duplicates + 1} Ad Sets Scaling`, 500);
    }
    return explicit;
  }

  // Extract punchy above-the-fold opening sentence from primary copy
  const firstSentence = params.copy
    .split(/(?<=[.!?])\s+|\n+/)[0]
    ?.replace(/#[a-z0-9_]+/gi, "")
    .trim();

  if (firstSentence && firstSentence.length >= 10 && firstSentence.length <= 105) {
    return cleanText(`${firstSentence} · ${formatBadge}`, 500);
  }

  const captionDomain = cleanText(params.caption, 80);
  const brand = params.advertiserName || captionDomain || "Meta Advertiser";
  return cleanText(`${brand} · ${formatBadge}`, 500);
}

/**
 * Extracts verified reach/impressions or computes a deterministic view/like estimate
 * factoring in `collation_count` (ad set duplicates), `page_like_count`, and omnichannel placements.
 */
export function estimateMetaViewsAndLikes(params: {
  ad: Json;
  snap: Json;
  activeDays: number;
  duplicates: number;
  platformCount: number;
}): { totalViews: number; totalLikes: number } {
  const aaa = obj(params.ad.aaa_info);
  const euReach = Number(aaa.eu_total_reach || params.ad.eu_total_reach || params.ad.reach_estimate || 0);
  const pageLikes = Math.max(0, Number(params.snap.page_like_count || params.ad.page_like_count || 0));

  // Page authority bonus (log-scaled from verified page_like_count)
  const pageAuthorityBonus =
    pageLikes >= 1000 ? Math.round(Math.log10(pageLikes) * 4200) : 0;

  // Omnichannel placement multiplier (Facebook + Instagram + Messenger + Audience Network)
  const placementMultiplier = params.platformCount >= 4 ? 1.25 : params.platformCount >= 2 ? 1.12 : 1.0;

  const baseViews =
    euReach > 0
      ? euReach
      : Math.round(
          (params.activeDays * 1450 + params.duplicates * 6800 + pageAuthorityBonus + 12_000) *
            placementMultiplier,
        );

  const totalViews = Math.max(1500, baseViews);
  const totalLikes = Math.max(
    45,
    Math.round(totalViews * 0.038 + Math.min(8000, pageLikes * 0.015)),
  );

  return { totalViews, totalLikes };
}

/**
 * Optional external Meta Top-Ads connector (runs when `APIFY_API_TOKEN` + `APIFY_META_ADS_ACTOR_ID` or `META_TOPADS_API_URL` is set).
 * Returns `[]` gracefully when not configured so SearchApi.io `meta_ad_library` handles all requests natively.
 */
export async function fetchMetaExternalTopAds(params: {
  query: string;
  country: string;
  mediaType: "ALL" | "VIDEO" | "IMAGE";
}): Promise<MetaDraft[]> {
  const customUrl = process.env.META_TOPADS_API_URL?.trim();
  const apifyToken = process.env.APIFY_API_TOKEN?.trim();
  const actorId = process.env.APIFY_META_ADS_ACTOR_ID?.trim();

  if (!customUrl && (!apifyToken || !actorId)) {
    return [];
  }

  const endpoint = customUrl
    ? new URL(customUrl)
    : new URL(`https://api.apify.com/v2/acts/${encodeURIComponent(actorId!)}/run-sync-get-dataset-items`);

  if (apifyToken && !customUrl) {
    endpoint.searchParams.set("token", apifyToken);
  }

  try {
    const res = await fetch(endpoint.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(apifyToken && customUrl ? { Authorization: `Bearer ${apifyToken}` } : {}),
      },
      body: JSON.stringify({
        query: params.query.replace(/"/g, "").trim(),
        country: params.country === "ALL" ? "US" : params.country,
        mediaType: params.mediaType,
        maxItems: 40,
      }),
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });

    if (!res.ok) return [];
    const items = list(await res.json().catch(() => []));
    const nowIso = new Date().toISOString();
    const drafts: MetaDraft[] = [];

    for (const raw of items) {
      const item = obj(raw);
      const id = idPart(item.ad_archive_id || item.adArchiveID || item.id);
      if (!id) continue;

      const snap = obj(item.snapshot || item);
      const videoUrl = https(item.video_hd_url || item.video_sd_url || item.videoUrl);
      const imageUrl = https(item.original_image_url || item.imageUrl || item.thumbnailUrl);
      if (!videoUrl && !imageUrl) continue;

      const mediaType = videoUrl ? "VIDEO" : "IMAGE";
      if (params.mediaType === "VIDEO" && mediaType !== "VIDEO") continue;
      if (params.mediaType === "IMAGE" && mediaType !== "IMAGE") continue;

      const advertiserName = cleanText(item.page_name || snap.page_name || "Meta Top Advertiser", 300);
      const activeDays = Math.max(14, Math.round(Number(item.active_days || 45)));
      const firstSeen = new Date(Date.now() - activeDays * DAY_MS).toISOString();
      const duplicates = Math.max(1, Math.round(Number(item.collation_count || 4)) - 1);
      const primaryCopy = buildMetaPrimaryCopy(snap, []);
      const headline = buildMetaHeadline({
        rawTitle: snap.title || item.title,
        cardTitle: "",
        linkDescription: snap.link_description,
        caption: snap.caption,
        copy: primaryCopy,
        advertiserName,
        activeDays,
        duplicates,
        mediaType,
        platformCount: 4,
        cardCount: 1,
      });

      drafts.push({
        adId: `meta_top_${id}`,
        platform: "META",
        advertiserName,
        advertiserId: idPart(item.page_id || snap.page_id || advertiserName),
        mediaType,
        mediaUrls: [videoUrl || imageUrl],
        thumbnailUrl: imageUrl || videoUrl,
        primaryCopy: primaryCopy || headline,
        headline,
        ctaText: inferMetaCta(snap.cta_text || item.cta_text, primaryCopy, headline),
        landingPageUrl: https(snap.link_url || item.link_url),
        countryCode: params.country,
        firstSeenDate: firstSeen,
        lastSeenDate: nowIso,
        activeDaysCount: activeDays,
        duplicates,
      });
    }

    return drafts;
  } catch {
    return [];
  }
}

