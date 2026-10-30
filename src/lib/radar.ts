import "server-only";
import { createHash } from "node:crypto";
import type { DocumentReference } from "firebase-admin/firestore";
import { db } from "./firebase-admin";
import { ApiError } from "./api";
import {
  NormalizedAdSchema,
  PROVEN_WINNER_DAYS,
  RadarCacheDocSchema,
  sanitizeText,
  type NormalizedAd,
  type RadarCacheDoc,
  type RadarSearchRequest,
  type RadarSearchResponse,
} from "./contracts";
import { searchApi } from "./searchapi";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
/** Part of every cache key: bump it when normalization changes so stale result sets aren't served. */
const CACHE_VERSION = "3";
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_RESULTS = 40;

// TikTok's library only covers ads shown in the EU/EEA, Switzerland and the UK (Digital Services Act).
const TIKTOK_COUNTRIES = new Set(
  "AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE IS LI NO CH GB".split(" "),
);
const DOMAIN = /^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i;

type Json = Record<string, unknown>;
type Draft = Omit<NormalizedAd, "winningScore"> & { duplicates: number };
type LibraryResult = { drafts: Draft[]; notice: string };
type SearchResult = Omit<RadarSearchResponse, "balanceAfter">;

// ---------- Untrusted upstream JSON ----------
const obj = (v: unknown): Json => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {});
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
// Catalog ads carry unfilled templates such as "{{product.name}}"; those read as empty.
const text = (v: unknown, max: number) =>
  typeof v === "string" ? sanitizeText(v.replace(/\{\{[^}]*\}\}/g, " ").replace(/[ \t]{2,}/g, " ")).slice(0, max) : "";
/** "SHOP_NOW" → "Shop now". */
const ctaLabel = (v: unknown) => {
  const t = text(v, 100);
  return /^[A-Z_]+$/.test(t) ? t.charAt(0) + t.slice(1).toLowerCase().replace(/_/g, " ") : t;
};
const https = (v: unknown) => (typeof v === "string" && v.length <= 2048 && /^https:\/\/[^\s<>"']+$/.test(v) ? v : "");
const idPart = (v: unknown) => String(v ?? "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 190);
const daysBetween = (first: string, last: string) =>
  Math.max(1, Math.round((Date.parse(last) - Date.parse(first)) / DAY_MS) + 1);

function isoDate(v: unknown): string | null {
  const ms = typeof v === "number" ? (v < 1e12 ? v * 1000 : v) : typeof v === "string" ? Date.parse(v) : NaN;
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

// ---------- Public API ----------

/** Cache key. provenWinnersOnly is applied when serving, so both settings share one upstream search. */
export function radarQueryHash(req: RadarSearchRequest): string {
  const key = [CACHE_VERSION, req.platform, req.query.toLowerCase(), req.country, req.mediaType].join("\u0000");
  return createHash("sha256").update(key).digest("hex");
}

/** Serves `radar_cache/{queryHash}` if it is under 24 hours old, otherwise searches the ad library. */
export async function runRadarSearch(req: RadarSearchRequest, queryHash: string): Promise<SearchResult> {
  const ref = db.collection("radar_cache").doc(queryHash);
  const cached = await readCache(ref);
  if (cached && Date.parse(cached.expiresAt) > Date.now()) return serve(cached, req, true);

  const { drafts, notice } = await searchLibrary(req);
  const now = Date.now();
  const doc: RadarCacheDoc = {
    queryHash,
    platform: req.platform,
    query: req.query,
    country: req.country,
    mediaType: req.mediaType,
    ads: rank(drafts),
    notice,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + CACHE_TTL_MS).toISOString(),
  };
  try {
    // normalized_ads/* is what /api/radar/remix reads, so the client never supplies ad content.
    const batch = db.batch();
    for (const ad of doc.ads) batch.set(db.collection("normalized_ads").doc(ad.adId), ad);
    batch.set(ref, doc);
    await batch.commit();
  } catch (err) {
    console.error("[radar] failed to store results", queryHash, err);
  }
  return serve(doc, req, false);
}

/** A replayed (already paid) request gets the stored results for its query, however old. */
export async function replayRadarSearch(req: RadarSearchRequest, queryHash: string): Promise<SearchResult> {
  const cached = await readCache(db.collection("radar_cache").doc(queryHash));
  if (!cached) throw new ApiError("INVALID_INPUT", "That search didn't finish. Please search again.", 409);
  return serve(cached, req, true);
}

async function readCache(ref: DocumentReference): Promise<RadarCacheDoc | null> {
  const snap = await ref.get();
  const parsed = snap.exists ? RadarCacheDocSchema.safeParse(snap.data()) : null;
  return parsed?.success ? parsed.data : null;
}

function serve(doc: RadarCacheDoc, req: RadarSearchRequest, cached: boolean): SearchResult {
  const ads = req.provenWinnersOnly ? doc.ads.filter((ad) => ad.activeDaysCount >= PROVEN_WINNER_DAYS) : doc.ads;
  return { ads, unfilteredCount: doc.ads.length, cached, queryHash: doc.queryHash, fetchedAt: doc.createdAt, notice: doc.notice };
}

/**
 * Winning score = activeDaysCount × 2.5 + duplicateCreativeCount × 10. Results are sorted on the raw
 * score; the stored value is capped at 100 to fit the NormalizedAd contract.
 */
function rank(drafts: Draft[]): NormalizedAd[] {
  const seen = new Set<string>();
  return drafts
    .flatMap(({ duplicates, ...draft }) => {
      if (seen.has(draft.adId)) return [];
      seen.add(draft.adId);
      const raw = draft.activeDaysCount * 2.5 + duplicates * 10;
      const parsed = NormalizedAdSchema.safeParse({ ...draft, winningScore: Math.min(100, Math.round(raw)) });
      return parsed.success ? [{ ad: parsed.data, raw }] : [];
    })
    .sort((a, b) => b.raw - a.raw)
    .slice(0, MAX_RESULTS)
    .map(({ ad }) => ad);
}

function searchLibrary(req: RadarSearchRequest): Promise<LibraryResult> {
  switch (req.platform) {
    case "META":
      return searchMeta(req);
    case "TIKTOK":
      return searchTikTok(req);
    case "GOOGLE":
      return searchGoogle(req);
  }
}

// ---------- Meta Ad Library ----------
async function searchMeta(req: RadarSearchRequest): Promise<LibraryResult> {
  const json = await searchApi("meta_ad_library", {
    q: req.query,
    country: req.country,
    active_status: "active",
    media_type: req.mediaType === "ALL" ? undefined : req.mediaType.toLowerCase(),
  });
  const now = new Date().toISOString();

  const drafts = list(json.ads).flatMap((raw): Draft[] => {
    const ad = obj(raw);
    const snap = obj(ad.snapshot);
    const id = idPart(ad.ad_archive_id);
    const first = isoDate(ad.start_date);
    if (!id || !first) return [];
    const last = isoDate(ad.end_date) ?? now;
    const cards = list(snap.cards).map(obj);
    const card = cards[0] ?? {};
    const videos = [...list(snap.videos).map(obj), ...cards];
    const images = [...list(snap.images).map(obj), ...cards];
    const videoUrls = videos.map((v) => https(v.video_hd_url) || https(v.video_sd_url)).filter(Boolean);
    const imageUrls = images.map((i) => https(i.original_image_url) || https(i.resized_image_url)).filter(Boolean);

    return [
      {
        adId: `meta_${id}`,
        platform: "META",
        advertiserName: text(ad.page_name, 300) || text(snap.page_name, 300),
        advertiserId: idPart(ad.page_id ?? snap.page_id),
        mediaType: videoUrls.length ? "VIDEO" : cards.length > 1 ? "CAROUSEL" : "IMAGE",
        mediaUrls: (videoUrls.length ? videoUrls : imageUrls).slice(0, 20),
        thumbnailUrl: videos.map((v) => https(v.video_preview_image_url)).find(Boolean) || imageUrls[0] || "",
        primaryCopy: text(obj(snap.body).text, 5000) || text(snap.body, 5000) || text(card.body, 5000),
        headline: text(snap.title, 500) || text(card.title, 500),
        ctaText: text(snap.cta_text, 100) || text(card.cta_text, 100),
        landingPageUrl: https(snap.link_url) || https(card.link_url),
        countryCode: req.country,
        firstSeenDate: first,
        lastSeenDate: last,
        activeDaysCount: daysBetween(first, last),
        // collation_count counts every ad sharing this creative, including this one.
        duplicates: Math.max(0, Number(ad.collation_count) - 1 || 0),
      },
    ];
  });
  return { drafts, notice: "" };
}

// ---------- TikTok Ads Library ----------
async function searchTikTok(req: RadarSearchRequest): Promise<LibraryResult> {
  const covered = TIKTOK_COUNTRIES.has(req.country);
  // Widest reach first: long-running, well-funded ads are the likeliest winners.
  const json = await searchApi("tiktok_ads_library", {
    q: req.query,
    country: covered ? req.country : "ALL",
    sort_by: "unique_users_seen_high_to_low",
  });
  const now = new Date().toISOString();

  const drafts = list(json.ads).flatMap((raw): Draft[] => {
    const ad = obj(raw);
    const id = idPart(ad.id);
    const first = isoDate(ad.first_shown_datetime);
    if (!id || !first || ad.is_unavailable === true) return [];
    const last = isoDate(ad.last_shown_datetime) ?? now;
    const video = https(ad.video_link);
    const images = list(ad.image_urls).map(https).filter(Boolean);
    const mediaType = video || ad.format === "video" ? "VIDEO" : images.length > 1 ? "CAROUSEL" : "IMAGE";
    // TikTok has no media filter upstream.
    if (req.mediaType !== "ALL" && (mediaType === "VIDEO") !== (req.mediaType === "VIDEO")) return [];

    return [
      {
        adId: `tiktok_${id}`,
        platform: "TIKTOK",
        advertiserName: text(ad.advertiser, 300),
        advertiserId: idPart(ad.advertiser_id),
        mediaType,
        mediaUrls: (video ? [video] : images).slice(0, 20),
        thumbnailUrl: https(ad.cover_image) || images[0] || "",
        primaryCopy: text(ad.title, 5000),
        headline: "",
        ctaText: "",
        landingPageUrl: "",
        countryCode: covered ? req.country : "EU",
        firstSeenDate: first,
        lastSeenDate: last,
        activeDaysCount: daysBetween(first, last),
        duplicates: 0,
      },
    ];
  });

  const notice = covered
    ? ""
    : `TikTok's ad library only covers ads shown in Europe, so these results aren't limited to ${req.country}.`;
  return { drafts, notice };
}

// ---------- Google Ads Transparency Center (Search, YouTube, Display) ----------
// Credit budget: a search by website is 1 request; by keyword it is 2 (advertiser lookup + list), or 3
// when the whole phrase matches no advertiser. Creatives and copy are only fetched when an ad is
// remixed (see enrichGoogleAd), because each detail lookup is another credit.

/**
 * The Transparency Center only searches by advertiser or domain, and advertiser names rarely contain a
 * phrase like "running shoes". So try the whole query, then its longest word, taking matching
 * advertisers first and a matching domain otherwise.
 */
async function findGoogleTarget(req: RadarSearchRequest): Promise<{ target: Record<string, string>; matched: string } | null> {
  const longestWord = req.query
    .split(/\s+/)
    .filter((w) => w.length >= 4)
    .sort((a, b) => b.length - a.length)[0];
  for (const q of [...new Set([req.query, longestWord ?? req.query])]) {
    const found = await searchApi("google_ads_transparency_center_advertiser_search", {
      q,
      region: req.country,
      num_advertisers: "5",
      num_domains: "3",
    });
    const ids = list(found.advertisers)
      .map((a) => String(obj(a).id ?? ""))
      .filter((id) => /^AR\d+$/.test(id))
      .slice(0, 3);
    if (ids.length) return { target: { advertiser_id: ids.join(",") }, matched: q };
    const domain = list(found.domains)
      .map((d) => String(obj(d).name ?? ""))
      .find((d) => DOMAIN.test(d));
    if (domain) return { target: { domain: domain.toLowerCase() }, matched: q };
  }
  return null;
}

async function searchGoogle(req: RadarSearchRequest): Promise<LibraryResult> {
  let target: Record<string, string>;
  let notice = "";
  if (DOMAIN.test(req.query)) {
    target = { domain: req.query.toLowerCase() };
  } else {
    const found = await findGoogleTarget(req);
    if (!found) {
      return {
        drafts: [],
        notice: `Google's ad library is searched by advertiser, and none matched "${req.query}". Try a brand name or a website like nike.com.`,
      };
    }
    target = found.target;
    if (found.matched !== req.query) notice = `Google's ad library is searched by advertiser, so these are ads from advertisers matching "${found.matched}".`;
  }

  const json = await searchApi("google_ads_transparency_center", {
    ...target,
    region: req.country,
    ad_format: req.mediaType === "ALL" ? undefined : req.mediaType.toLowerCase(),
    num: "40",
  });

  // Most Google ads are Search text ads; their copy is what gets modelled.
  const drafts = list(json.ad_creatives).flatMap((raw): Draft[] => {
    const c = obj(raw);
    const id = idPart(c.id);
    const first = isoDate(c.first_shown_datetime);
    const last = isoDate(c.last_shown_datetime);
    if (!id || !first || !last || (c.format !== "video" && c.format !== "image" && c.format !== "text")) return [];
    const advertiser = obj(c.advertiser);
    const domain = typeof c.target_domain === "string" && DOMAIN.test(c.target_domain) ? c.target_domain : "";

    return [
      {
        adId: `google_${id}`,
        platform: "GOOGLE",
        advertiserName: text(advertiser.name, 300),
        advertiserId: idPart(advertiser.id),
        mediaType: c.format === "video" ? "VIDEO" : c.format === "text" ? "TEXT" : "IMAGE",
        mediaUrls: [],
        thumbnailUrl: "",
        primaryCopy: "",
        headline: "",
        ctaText: "",
        landingPageUrl: domain ? `https://${domain}` : "",
        countryCode: req.country,
        firstSeenDate: first,
        lastSeenDate: last,
        activeDaysCount: Math.max(1, Math.round(Number(c.total_days_shown)) || daysBetween(first, last)),
        duplicates: 0,
      },
    ];
  });
  return { drafts, notice };
}

/** True for a Google ad whose creative and copy haven't been fetched yet. */
export const needsGoogleDetails = (ad: NormalizedAd) =>
  ad.platform === "GOOGLE" && !ad.thumbnailUrl && !ad.headline && !ad.primaryCopy && !ad.mediaUrls.length;

/**
 * Fills in a Google ad's creative and copy from its detail page (1 SearchApi credit). Best effort:
 * on any failure the ad comes back unchanged and the remix works from what's known.
 */
export async function enrichGoogleAd(ad: NormalizedAd): Promise<NormalizedAd> {
  let v: Json;
  try {
    const json = await searchApi("google_ads_transparency_center_ad_details", {
      advertiser_id: ad.advertiserId,
      creative_id: ad.adId.replace(/^google_/, ""),
    });
    v = obj(list(json.variations)[0]);
  } catch {
    return ad;
  }
  const videoId = typeof v.video_id === "string" && /^[\w-]{6,20}$/.test(v.video_id) ? v.video_id : "";
  const media = https(v.video_link) || https(v.image);
  const enriched = NormalizedAdSchema.safeParse({
    ...ad,
    mediaUrls: media ? [media] : ad.mediaUrls,
    thumbnailUrl:
      https(v.thumbnail) || https(v.image) || (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : ad.thumbnailUrl),
    primaryCopy: text(v.description, 5000) || text(v.snippet, 5000) || ad.primaryCopy,
    headline: text(v.long_headline, 500) || text(v.title, 500) || text(v.product_name, 500) || ad.headline,
    ctaText: ctaLabel(v.call_to_action) || ad.ctaText,
    landingPageUrl: https(v.link) || https(v.displayed_link) || ad.landingPageUrl,
  });
  return enriched.success ? enriched.data : ad;
}
