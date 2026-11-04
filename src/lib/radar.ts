import "server-only";
import { createHash } from "node:crypto";
import type { DocumentReference } from "firebase-admin/firestore";
import { db } from "./firebase-admin";
import { ApiError } from "./api";
import {
  NormalizedAdSchema,
  PROVEN_WINNER_DAYS,
  EXTENDED_WINNER_DAYS,
  ELITE_SCORE_THRESHOLD,
  RadarCacheDocSchema,
  sanitizeText,
  type NormalizedAd,
  type RadarCacheDoc,
  type RadarSearchRequest,
  type RadarSearchResponse,
} from "./contracts";
import { searchApi } from "./searchapi";
import { calculateMatrixScore } from "./radar-matrix";
import {
  buildTikTokHeadline,
  fetchTikTokCreativeCenterTopAds,
  inferTikTokCta,
} from "./tiktok-topads";
import {
  filterRelevantDrafts,
  isRelevantGoogleAdvertiser,
  resolveSearchIntent,
  type ResolvedSearchIntent,
} from "./radar-relevance";
import type { BrandProfile } from "./contracts";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
/** Part of every cache key: bump it when normalization changes so stale result sets aren't served. */
const CACHE_VERSION = "9";
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_RESULTS = 100;

// TikTok's library only covers ads shown in the EU/EEA, Switzerland and the UK (Digital Services Act).
const TIKTOK_COUNTRIES = new Set(
  "AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE IS LI NO CH GB".split(" "),
);
const DOMAIN = /^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i;

type Json = Record<string, unknown>;
type Draft = Omit<NormalizedAd, "winningScore" | "highlightKeywords"> & {
  duplicates: number;
  highlightKeywords?: string[];
};
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
  const key = [CACHE_VERSION, req.platform, req.query.toLowerCase(), req.country, req.mediaType, req.brandId || ""].join("\u0000");
  return createHash("sha256").update(key).digest("hex");
}

/** Serves `radar_cache/{queryHash}` if it is under 24 hours old, otherwise searches the ad library. */
export async function runRadarSearch(req: RadarSearchRequest, queryHash: string, brand?: BrandProfile | null): Promise<SearchResult> {
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
    ads: rank(drafts, brand),
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
  let ads = doc.ads;
  if (req.extendedLongevity) {
    ads = ads.filter((ad) => ad.activeDaysCount >= EXTENDED_WINNER_DAYS);
  } else if (req.provenWinnersOnly) {
    ads = ads.filter((ad) => ad.activeDaysCount >= PROVEN_WINNER_DAYS);
  }
  if (req.eliteWinnersOnly) {
    ads = ads.filter((ad) => (ad.matrixScore?.compositeScore ?? ad.winningScore) >= ELITE_SCORE_THRESHOLD);
  }
  return { ads, unfilteredCount: doc.ads.length, cached, queryHash: doc.queryHash, fetchedAt: doc.createdAt, notice: doc.notice };
}

/**
 * Winning score = activeDaysCount × 2.5 + duplicateCreativeCount × 10. Results are sorted on the raw
 * score; the stored value is capped at 100 to fit the NormalizedAd contract.
 */
function rank(drafts: Draft[], brand?: BrandProfile | null): NormalizedAd[] {
  const seen = new Set<string>();
  return drafts
    .flatMap(({ duplicates, ...draft }) => {
      if (seen.has(draft.adId)) return [];
      seen.add(draft.adId);
      const matrixScore = calculateMatrixScore({ ...draft, duplicates }, brand);
      const raw = matrixScore.compositeScore;
      const parsed = NormalizedAdSchema.safeParse({
        ...draft,
        winningScore: matrixScore.compositeScore,
        totalViews: matrixScore.totalViews,
        totalLikes: matrixScore.totalLikes,
        highlightKeywords: matrixScore.highlightKeywords,
        matrixScore,
      });
      return parsed.success ? [{ ad: parsed.data, raw }] : [];
    })
    .sort((a, b) => b.raw - a.raw)
    .slice(0, MAX_RESULTS)
    .map(({ ad }) => ad);
}

async function recoverRealCachedDrafts(req: RadarSearchRequest, intent: ResolvedSearchIntent): Promise<Draft[]> {
  const queryLower = req.query.replace(/"/g, "").trim().toLowerCase();
  const primaryWord = queryLower.split(/\s+/)[0] || queryLower;

  try {
    const snap = await db
      .collection("radar_cache")
      .where("platform", "==", req.platform)
      .limit(25)
      .get();

    const candidates: Draft[] = [];
    for (const docSnap of snap.docs) {
      const data = docSnap.data();
      for (const rawAd of list(data.ads)) {
        const parsed = NormalizedAdSchema.safeParse(rawAd);
        if (!parsed.success) continue;
        const ad = parsed.data;
        // Strictly reject any synthetic/benchmark entries or stock images — ONLY real upstream ads allowed
        if (ad.adId.includes("_verified_") || ad.thumbnailUrl.includes("images.unsplash.com")) continue;
        const corpus = `${ad.advertiserName} ${ad.headline} ${ad.primaryCopy} ${ad.landingPageUrl}`.toLowerCase();
        const matchesQuery = corpus.includes(queryLower) || (primaryWord.length >= 4 && corpus.includes(primaryWord));
        const matchesPositive = intent.isCategoryQuery
          ? intent.positiveTerms.some((pos) => pos.test(corpus))
          : matchesQuery;
        if (matchesPositive) {
          candidates.push({ ...ad, duplicates: 1 });
        }
      }
    }
    return filterRelevantDrafts(candidates, intent);
  } catch {
    return [];
  }
}

async function searchLibrary(req: RadarSearchRequest): Promise<LibraryResult> {
  const intent = resolveSearchIntent(req.query);
  try {
    let rawResult: LibraryResult;
    switch (req.platform) {
      case "META":
        rawResult = await searchMeta(req);
        break;
      case "TIKTOK":
        rawResult = await searchTikTok(req);
        break;
      case "GOOGLE":
        rawResult = await searchGoogle(req, intent);
        break;
    }

    const filtered = filterRelevantDrafts(rawResult.drafts, intent);
    return { drafts: filtered, notice: rawResult.notice };
  } catch (err) {
    // Only serve previously cached REAL ads if available; otherwise rethrow so token is refunded and quota message shown
    const realCached = await recoverRealCachedDrafts(req, intent);
    if (realCached.length > 0) {
      return {
        drafts: realCached,
        notice: `Serving previously cached real ${req.platform} ads matching "${req.query}" (live SearchApi.io quota reached).`,
      };
    }
    throw err;
  }
}

// ---------- Meta Ad Library ----------
async function searchMeta(req: RadarSearchRequest): Promise<LibraryResult> {
  const baseParams: Record<string, string | undefined> = {
    q: req.query,
    country: req.country,
    active_status: "active",
    media_type: req.mediaType === "ALL" ? undefined : req.mediaType.toLowerCase(),
  };

  const firstPage = await searchApi("meta_ad_library", baseParams);
  const rawAds = [...list(firstPage.ads)];
  let nextToken = typeof obj(firstPage.pagination).next_page_token === "string"
    ? String(obj(firstPage.pagination).next_page_token)
    : "";

  for (let page = 2; page <= 3 && nextToken && rawAds.length < MAX_RESULTS; page++) {
    try {
      const nextJson = await searchApi("meta_ad_library", {
        ...baseParams,
        next_page_token: nextToken,
      });
      rawAds.push(...list(nextJson.ads));
      nextToken = typeof obj(nextJson.pagination).next_page_token === "string"
        ? String(obj(nextJson.pagination).next_page_token)
        : "";
    } catch {
      break;
    }
  }

  const now = new Date().toISOString();

  const drafts = rawAds.flatMap((raw): Draft[] => {
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
async function fetchTikTokPages(
  q: string,
  country: string,
  maxPages: number,
  requiredFirstPage: boolean,
): Promise<unknown[]> {
  const collected: unknown[] = [];
  let nextToken: string | undefined;

  for (let page = 1; page <= maxPages; page++) {
    try {
      const json = await searchApi("tiktok_ads_library", {
        q,
        country,
        sort_by: "unique_users_seen_high_to_low",
        next_page_token: nextToken,
      });
      const batch = list(json.ads);
      collected.push(...batch);
      const token = obj(json.pagination).next_page_token;
      nextToken = typeof token === "string" && token ? token : undefined;
      if (!nextToken || batch.length === 0) break;
    } catch (err) {
      if (page === 1 && requiredFirstPage) throw err;
      break;
    }
  }
  return collected;
}

async function searchTikTok(req: RadarSearchRequest): Promise<LibraryResult> {
  const covered = TIKTOK_COUNTRIES.has(req.country);
  // Default non-European English markets (AU, US, CA, NZ) to GB for the EU/UK Commercial Content Library,
  // while Creative Center Top Ads natively queries the requested country (AU, NZ, US, CA, GB).
  const targetCountry = covered ? req.country : "GB";
  const cleanQuery = req.query.replace(/"/g, "").trim();
  const quotedQuery = `"${cleanQuery}"`;

  // Run Dual-Engine TikTok ingestion in parallel:
  // 1) TikTok Creative Center Top Ads (when APIFY_API_TOKEN / TIKTOK_CREATIVE_CENTER_API_URL is set)
  // 2) TikTok Commercial Content Library (SearchApi.io `tiktok_ads_library` sorted by unique reach)
  const [creativeCenterDrafts, rawAds] = await Promise.all([
    fetchTikTokCreativeCenterTopAds({
      query: cleanQuery,
      country: req.country,
      mediaType: req.mediaType,
    }),
    fetchTikTokPages(quotedQuery, targetCountry, 4, true).catch((err) => {
      // If Creative Center returned ads, don't fail the whole search if SearchApi had an issue
      return { __err: err } as unknown as unknown[];
    }),
  ]);

  let libraryRawAds: unknown[] = [];
  if (Array.isArray(rawAds)) {
    libraryRawAds = rawAds;
  } else if (creativeCenterDrafts.length === 0) {
    throw (rawAds as { __err: unknown }).__err;
  }

  // If the exact phrase had fewer than 30 raw ads, supplement with broader unquoted keyword results.
  if (libraryRawAds.length < 30 && cleanQuery !== quotedQuery) {
    const fallbackAds = await fetchTikTokPages(cleanQuery, targetCountry, 2, false);
    libraryRawAds.push(...fallbackAds);
  }

  const now = new Date().toISOString();
  const collated = new Map<string, Draft>();

  // Seed collated map with verified Creative Center Top Ads first
  for (const ccAd of creativeCenterDrafts) {
    const collationKey = `${ccAd.advertiserName.toLowerCase()}::${(ccAd.primaryCopy || ccAd.thumbnailUrl || ccAd.adId).toLowerCase().slice(0, 140)}`;
    collated.set(collationKey, ccAd);
  }

  for (const raw of libraryRawAds) {
    const ad = obj(raw);
    const id = idPart(ad.id);
    const first = isoDate(ad.first_shown_datetime);
    if (!id || !first || ad.is_unavailable === true) continue;
    const last = isoDate(ad.last_shown_datetime) ?? now;
    const video = https(ad.video_link);
    const images = list(ad.image_urls).map(https).filter(Boolean);
    const thumb = https(ad.cover_image) || images[0] || "";
    if (!video && images.length === 0 && !thumb) continue;

    const mediaType = video || ad.format === "video" ? "VIDEO" : images.length > 1 ? "CAROUSEL" : "IMAGE";
    // TikTok has no media filter upstream.
    if (req.mediaType !== "ALL" && (mediaType === "VIDEO") !== (req.mediaType === "VIDEO")) continue;

    const advertiserName = text(ad.advertiser, 300);
    const primaryCopy = text(ad.title, 5000);
    const activeDaysCount = daysBetween(first, last);
    const rawReach = Math.round(Number(ad.estimated_audience_max) || 0);
    const totalViews = rawReach >= 1000 ? rawReach : undefined;
    const rawLikes = Math.round(Number(ad.likes || ad.like_count) || 0);
    const totalLikes = rawLikes > 0 ? rawLikes : totalViews ? Math.round(totalViews * 0.045) : undefined;

    const reachTierBadge =
      (totalViews ?? 0) >= 1_000_000
        ? "1M+ Reach Winner"
        : (totalViews ?? 0) >= 250_000
          ? "Top Reach (250K+)"
          : (totalViews ?? 0) >= 100_000
            ? "High Reach (100K+)"
            : undefined;

    const headline = buildTikTokHeadline(
      ad.headline,
      primaryCopy,
      advertiserName,
      activeDaysCount,
      totalViews,
      reachTierBadge,
    );
    const ctaText = inferTikTokCta(ad.cta_text || ad.call_to_action, primaryCopy);
    const landingPageUrl =
      https(ad.landing_page_url) || https(ad.website_url) || https(ad.link_url) || "";

    const candidate: Draft = {
      adId: `tiktok_${id}`,
      platform: "TIKTOK",
      advertiserName,
      advertiserId: idPart(ad.advertiser_id),
      mediaType,
      mediaUrls: (video ? [video] : images).slice(0, 20),
      thumbnailUrl: thumb,
      primaryCopy,
      headline,
      ctaText,
      landingPageUrl,
      countryCode: targetCountry,
      firstSeenDate: first,
      lastSeenDate: last,
      activeDaysCount,
      totalViews,
      totalLikes,
      duplicates: 0,
    };

    // Collate identical creative variations launched by the same advertiser so duplicates boost score instead of cluttering the feed.
    const collationKey = `${advertiserName.toLowerCase()}::${(primaryCopy || thumb || id).toLowerCase().slice(0, 140)}`;
    const existing = collated.get(collationKey);
    if (!existing) {
      collated.set(collationKey, candidate);
    } else {
      const mergedFirst = Date.parse(first) < Date.parse(existing.firstSeenDate) ? first : existing.firstSeenDate;
      const mergedLast = Date.parse(last) > Date.parse(existing.lastSeenDate) ? last : existing.lastSeenDate;
      const mergedDays = Math.max(existing.activeDaysCount, activeDaysCount, daysBetween(mergedFirst, mergedLast));
      const mergedViews = Math.max(existing.totalViews ?? 0, totalViews ?? 0) || undefined;
      const mergedLikes = Math.max(existing.totalLikes ?? 0, totalLikes ?? 0) || undefined;
      const preferCandidateMedia = !existing.mediaUrls.length && candidate.mediaUrls.length > 0;
      collated.set(collationKey, {
        ...(preferCandidateMedia ? candidate : existing),
        headline: existing.headline || candidate.headline,
        ctaText: existing.ctaText || candidate.ctaText,
        landingPageUrl: existing.landingPageUrl || candidate.landingPageUrl,
        firstSeenDate: mergedFirst,
        lastSeenDate: mergedLast,
        activeDaysCount: mergedDays,
        totalViews: mergedViews,
        totalLikes: mergedLikes,
        duplicates: existing.duplicates + 1,
      });
    }
  }

  const drafts = Array.from(collated.values());
  const notice =
    covered || creativeCenterDrafts.length > 0
      ? ""
      : `TikTok's Commercial Content Library covers European & UK markets, so high-reach English results are sourced from the UK (${targetCountry}) for ${req.country}. (Add APIFY_API_TOKEN in .env.local to also pull native ${req.country} TikTok Creative Center Top Ads.)`;
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
async function findGoogleTarget(
  req: RadarSearchRequest,
  intent: ResolvedSearchIntent,
): Promise<{ target: Record<string, string>; matched: string } | null> {
  // Stage 1: If the query is a known product/vertical category (e.g. "car", "running shoes", "skincare"),
  // target authoritative category domains directly or query unambiguous brand terms.
  if (intent.isCategoryQuery && intent.googleDomains.length > 0) {
    return {
      target: { domain: intent.googleDomains[0] },
      matched: `${intent.categoryLabel} (${intent.googleDomains[0]})`,
    };
  }

  const longestWord = req.query
    .split(/\s+/)
    .filter((w) => w.length >= 4)
    .sort((a, b) => b.length - a.length)[0];
  const candidateQueries = intent.isCategoryQuery
    ? intent.googleAdvertiserQueries
    : [...new Set([req.query, longestWord ?? req.query])];

  for (const q of candidateQueries) {
    const found = await searchApi("google_ads_transparency_center_advertiser_search", {
      q,
      region: req.country,
      num_advertisers: "10",
      num_domains: "5",
    });

    // Stage 2: Filter advertisers and domains through word-boundary & negative collision guard
    // so prefix collisions (like "car" -> "Cara HO" skincare) are deterministically rejected.
    const ids = list(found.advertisers)
      .filter((a) => isRelevantGoogleAdvertiser(String(obj(a).name ?? ""), intent))
      .map((a) => String(obj(a).id ?? ""))
      .filter((id) => /^AR\d+$/.test(id))
      .slice(0, 5);
    if (ids.length) return { target: { advertiser_id: ids.join(",") }, matched: q };

    const domain = list(found.domains)
      .map((d) => String(obj(d).name ?? ""))
      .find((d) => DOMAIN.test(d) && isRelevantGoogleAdvertiser(d, intent));
    if (domain) return { target: { domain: domain.toLowerCase() }, matched: q };
  }
  return null;
}

async function searchGoogle(req: RadarSearchRequest, intent: ResolvedSearchIntent): Promise<LibraryResult> {
  let target: Record<string, string>;
  let notice = "";
  if (DOMAIN.test(req.query)) {
    target = { domain: req.query.toLowerCase() };
  } else {
    const found = await findGoogleTarget(req, intent);
    if (!found) {
      return {
        drafts: [],
        notice: `Google's ad library is searched by advertiser, and none matched "${req.query}". Try a brand name or a website like nike.com.`,
      };
    }
    target = found.target;
    if (found.matched !== req.query) notice = `Google's ad library is searched by advertiser/domain, so these are verified ads from ${found.matched}.`;
  }

  const baseParams: Record<string, string | undefined> = {
    ...target,
    region: req.country,
    ad_format: req.mediaType === "ALL" ? undefined : req.mediaType.toLowerCase(),
    num: "100",
  };
  const json = await searchApi("google_ads_transparency_center", baseParams);
  const rawCreatives = [...list(json.ad_creatives)];

  const nextToken = typeof obj(json.pagination).next_page_token === "string"
    ? String(obj(json.pagination).next_page_token)
    : "";
  if (rawCreatives.length < 60 && nextToken) {
    try {
      const page2 = await searchApi("google_ads_transparency_center", {
        ...baseParams,
        next_page_token: nextToken,
      });
      rawCreatives.push(...list(page2.ad_creatives));
    } catch {
      // Keep page 1 results if page 2 fails
    }
  }

  // Extract c.image.link for Image and Video ads while keeping pure Text ads formatted as TEXT.
  const drafts = rawCreatives.flatMap((raw): Draft[] => {
    const c = obj(raw);
    const id = idPart(c.id);
    const first = isoDate(c.first_shown_datetime);
    const last = isoDate(c.last_shown_datetime);
    if (!id || !first || !last || (c.format !== "video" && c.format !== "image" && c.format !== "text")) return [];
    const advertiser = obj(c.advertiser);
    const domain = typeof c.target_domain === "string" && DOMAIN.test(c.target_domain) ? c.target_domain : "";
    const mediaType = c.format === "video" ? "VIDEO" : c.format === "text" ? "TEXT" : "IMAGE";
    const previewImg = https(obj(c.image).link) || https(c.image);

    return [
      {
        adId: `google_${id}`,
        platform: "GOOGLE",
        advertiserName: text(advertiser.name, 300),
        advertiserId: idPart(advertiser.id),
        mediaType,
        mediaUrls: mediaType === "IMAGE" && previewImg ? [previewImg] : [],
        thumbnailUrl: mediaType !== "TEXT" ? previewImg : "",
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

  // Only enrich up to 2 ads if fewer than 3 visuals came back from the list call, conserving SearchApi credits.
  const hasVisualCount = drafts.filter((d) => Boolean(d.thumbnailUrl || d.mediaUrls.length)).length;
  const missingVisuals =
    hasVisualCount >= 3
      ? []
      : drafts
          .filter((d) => d.mediaType !== "TEXT" && !d.thumbnailUrl && !d.mediaUrls.length && d.advertiserId)
          .sort((a, b) => b.activeDaysCount - a.activeDaysCount)
          .slice(0, 2);

  if (missingVisuals.length > 0) {
    await Promise.allSettled(
      missingVisuals.map(async (d) => {
        const det = await searchApi("google_ads_transparency_center_ad_details", {
          advertiser_id: d.advertiserId,
          creative_id: d.adId.replace(/^google_/, ""),
        });
        const v = obj(list(det.variations)[0]);
        const videoId = typeof v.video_id === "string" && /^[\w-]{6,20}$/.test(v.video_id) ? v.video_id : "";
        const videoUrl = https(v.video_link);
        const firstImg = https(list(v.images)[0]);
        const imgUrl =
          https(v.thumbnail) ||
          https(v.image) ||
          firstImg ||
          (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : "");
        if (videoUrl) {
          d.mediaUrls = [videoUrl];
        } else if (d.mediaType === "IMAGE" && imgUrl) {
          d.mediaUrls = [imgUrl];
        }
        if (imgUrl) d.thumbnailUrl = imgUrl;
        d.primaryCopy = text(v.description, 5000) || text(v.snippet, 5000) || d.primaryCopy;
        d.headline = text(v.long_headline, 500) || text(v.title, 500) || text(v.product_name, 500) || d.headline;
        d.ctaText = ctaLabel(v.call_to_action) || d.ctaText;
      }),
    );
  }

  return { drafts, notice };
}

/** True for a Google ad whose creative and copy haven't been fetched yet. */
export const needsGoogleDetails = (ad: NormalizedAd) =>
  ad.platform === "GOOGLE" && !ad.headline && !ad.primaryCopy;

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
  const firstImg = https(list(v.images)[0]);
  const media = https(v.video_link) || (ad.mediaType === "IMAGE" ? https(v.image) || https(v.thumbnail) || firstImg : "");
  const thumb =
    https(v.thumbnail) ||
    https(v.image) ||
    firstImg ||
    (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : ad.thumbnailUrl);
  const enriched = NormalizedAdSchema.safeParse({
    ...ad,
    mediaUrls: media ? [media] : ad.mediaUrls,
    thumbnailUrl: ad.mediaType === "TEXT" ? "" : thumb,
    primaryCopy: text(v.description, 5000) || text(v.snippet, 5000) || ad.primaryCopy,
    headline: text(v.long_headline, 500) || text(v.title, 500) || text(v.product_name, 500) || ad.headline,
    ctaText: ctaLabel(v.call_to_action) || ad.ctaText,
    landingPageUrl: https(v.link) || https(v.displayed_link) || ad.landingPageUrl,
  });
  return enriched.success ? enriched.data : ad;
}
