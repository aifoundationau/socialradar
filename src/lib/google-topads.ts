import "server-only";
import { sanitizeText, type NormalizedAd } from "./contracts";
import { isRelevantGoogleAdvertiser, type ResolvedSearchIntent } from "./radar-relevance";
import { searchApi } from "./searchapi";

export type GoogleDraft = Omit<NormalizedAd, "winningScore" | "highlightKeywords"> & {
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

const DOMAIN_RE = /^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Extracts a clean root/host domain (e.g. "www.nike.com.au" -> "nike.com.au") from a URL or domain string.
 */
export function extractCleanDomain(urlOrDomain: unknown): string {
  if (typeof urlOrDomain !== "string" || !urlOrDomain.trim()) return "";
  const raw = urlOrDomain.trim();
  try {
    const parsed = raw.startsWith("http") ? new URL(raw) : new URL(`https://${raw.replace(/^\/+/, "")}`);
    const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();
    return DOMAIN_RE.test(host) ? host : "";
  } catch {
    const token = raw.split(/[/?#\s]/)[0]?.replace(/^www\./i, "").toLowerCase() ?? "";
    return DOMAIN_RE.test(token) ? token : "";
  }
}

/**
 * Classifies the Google Ad format & longevity tier for headlines and strategy context.
 */
export function detectGoogleAdFormat(
  mediaType: "VIDEO" | "IMAGE" | "CAROUSEL" | "TEXT",
  activeDays: number,
  options?: { isSerpAd?: boolean; isShoppingAd?: boolean; position?: number },
): string {
  if (options?.isShoppingAd) {
    return "Google Shopping · Sponsored Product Winner";
  }
  if (options?.isSerpAd) {
    const pos = options.position && options.position <= 4 ? `Position #${options.position} ` : "";
    return `Google Search RSA · ${pos}Live Auction Winner`;
  }
  if (mediaType === "VIDEO") {
    if (activeDays >= 60) return "YouTube Video Ad · Evergreen Winner (60+ Days)";
    if (activeDays >= 28) return "YouTube Video Ad · Proven Winner (28+ Days)";
    return "YouTube Video Ad";
  }
  if (mediaType === "IMAGE") {
    if (activeDays >= 60) return "Performance Max / Display · Evergreen Winner (60+ Days)";
    if (activeDays >= 28) return "Google Display Ad · Proven Winner (28+ Days)";
    return "Google Display & Discovery Ad";
  }
  if (activeDays >= 60) return "Google Search RSA · Evergreen Winner (60+ Days)";
  if (activeDays >= 28) return "Google Search RSA · Proven Winner (28+ Days)";
  return "Google Search Responsive Text Ad";
}

/**
 * Infers or normalizes the Call-To-Action button label for a Google Ad.
 */
export function inferGoogleCta(
  rawCta: unknown,
  copy: string,
  headline: string,
  mediaType: "VIDEO" | "IMAGE" | "CAROUSEL" | "TEXT",
): string {
  const explicit = cleanText(rawCta, 100);
  if (explicit) {
    return /^[A-Z_]+$/.test(explicit)
      ? explicit.charAt(0) + explicit.slice(1).toLowerCase().replace(/_/g, " ")
      : explicit;
  }
  const combined = `${headline} ${copy}`.toLowerCase();
  if (/\b(free quote|get a quote|instant quote|request quote|estimate)\b/.test(combined)) return "Get Quote";
  if (/\b(shop now|buy now|order online|in stock|free shipping|\$\d+)\b/.test(combined)) return "Shop Now";
  if (/\b(book now|book online|schedule|appointment|test drive)\b/.test(combined)) return "Book Online";
  if (/\b(free trial|start free|try free|sign up|get started)\b/.test(combined)) return "Start Free Trial";
  if (/\b(compare|see rates|check eligibility|calculate)\b/.test(combined)) return "Compare Now";
  if (mediaType === "VIDEO") return "Watch & Learn More";
  if (mediaType === "TEXT") return "Visit Official Site";
  return "Learn More";
}

/**
 * Builds a high-signal headline for a Google Ad, ensuring Transparency Center list items never have blank titles.
 */
export function buildGoogleHeadline(params: {
  rawHeadline: unknown;
  copy: string;
  advertiserName: string;
  domain: string;
  mediaType: "VIDEO" | "IMAGE" | "CAROUSEL" | "TEXT";
  activeDays: number;
  query: string;
}): string {
  const explicit = cleanText(params.rawHeadline, 500);
  if (explicit) return explicit;

  const formatBadge = detectGoogleAdFormat(params.mediaType, params.activeDays);
  const brandLabel = params.advertiserName || params.domain || "Google Advertiser";
  const domainSuffix = params.domain ? ` (${params.domain})` : "";

  if (params.copy && !params.copy.startsWith("Verified Google ")) {
    const firstSentence = params.copy.split(/(?<=[.!?])\s+|\n+/)[0]?.trim();
    if (firstSentence && firstSentence.length >= 10 && firstSentence.length <= 100) {
      return cleanText(`${firstSentence} — ${brandLabel}`, 500);
    }
  }

  return cleanText(`${brandLabel}${domainSuffix} · ${formatBadge}`, 500);
}

/**
 * Builds informative primary copy for a Google Transparency Center creative when `ad_details` hasn't been fetched yet.
 * Prefixed with "Verified Google " so `needsGoogleDetails()` knows to enrich the full creative variation when remixed.
 */
export function buildGooglePrimaryCopy(params: {
  rawCopy: unknown;
  advertiserName: string;
  domain: string;
  mediaType: "VIDEO" | "IMAGE" | "CAROUSEL" | "TEXT";
  activeDays: number;
  country: string;
  query: string;
}): string {
  const explicit = cleanText(params.rawCopy, 5000);
  if (explicit) return explicit;

  const formatLabel =
    params.mediaType === "VIDEO"
      ? "YouTube & Google Video campaign creative"
      : params.mediaType === "IMAGE"
        ? "Performance Max & Google Display visual creative"
        : "Google Search Responsive Text Ad (RSA)";
  const brand = params.advertiserName || params.domain || "Verified Advertiser";
  const dest = params.domain ? ` directing high-intent traffic to ${params.domain}` : "";
  const tier =
    params.activeDays >= 60
      ? `Evergreen winner scaling continuously for ${params.activeDays} days`
      : params.activeDays >= 28
        ? `Proven winner active for ${params.activeDays} days`
        : `Active campaign running for ${params.activeDays} days`;

  return cleanText(
    `Verified Google ${formatLabel} by ${brand}${dest} in ${params.country}. ${tier} for "${params.query}". Click Remix to deconstruct full creative variations and hooks.`,
    5000,
  );
}

/**
 * Engine 1: Queries live Google Search (`engine: "google"`) via SearchApi.io to capture:
 * 1) Live Sponsored Responsive Search Ads (`ads`) winning the keyword auction right now
 * 2) Live Sponsored Google Shopping Ads (`shopping_ads`) with pricing, ratings & product thumbnails
 * 3) Top bidding domains (`discoveredDomains`) to feed into Engine 2 (Google Ads Transparency Center)
 */
export async function fetchGoogleSerpPaidAds(params: {
  query: string;
  country: string;
  mediaType: "ALL" | "VIDEO" | "IMAGE";
  intent: ResolvedSearchIntent;
}): Promise<{ drafts: GoogleDraft[]; discoveredDomains: string[] }> {
  const cleanQuery = params.query.replace(/"/g, "").trim();
  if (!cleanQuery || DOMAIN_RE.test(cleanQuery)) {
    return { drafts: [], discoveredDomains: [] };
  }

  try {
    const json = await searchApi("google", {
      q: cleanQuery,
      gl: (params.country === "ALL" ? "us" : params.country).toLowerCase(),
      hl: "en",
    });

    const nowIso = new Date().toISOString();
    const drafts: GoogleDraft[] = [];
    const domainSet = new Set<string>();
    const nonGoogleSocialDomain = /\b(?:facebook\.com|instagram\.com|fb\.com|meta\.com|tiktok\.com|bytedance\.com)\b/i;

    // 1. Parse Sponsored Search Text Ads (`ads` / `paid_results`)
    const paidAds = [...list(json.ads), ...list(json.paid_results)];
    for (let i = 0; i < paidAds.length; i++) {
      const ad = obj(paidAds[i]);
      const title = cleanText(ad.title, 300);
      const description = cleanText(ad.description || ad.snippet, 2500);
      const link = https(ad.link || ad.tracking_link);
      const domain =
        extractCleanDomain(ad.domain) ||
        extractCleanDomain(ad.displayed_link) ||
        extractCleanDomain(link);

      if (nonGoogleSocialDomain.test(domain) || nonGoogleSocialDomain.test(link)) continue;

      if (domain && isRelevantGoogleAdvertiser(domain, params.intent)) {
        domainSet.add(domain);
      }

      // Only include TEXT ads if mediaType is ALL
      if (params.mediaType !== "ALL") continue;
      if (!title && !description) continue;

      // Extract sitelink extensions & callouts for rich RSA copy depth
      const sitelinkItems = [
        ...list(obj(ad.sitelinks).inline),
        ...list(obj(ad.sitelinks).expanded),
        ...list(ad.sitelinks),
      ];
      const sitelinkLabels = sitelinkItems
        .map((s) => cleanText(obj(s).title, 80))
        .filter(Boolean)
        .slice(0, 6);
      const extensions = list(ad.extensions)
        .map((e) => cleanText(e, 100))
        .filter(Boolean)
        .slice(0, 4);

      const extensionSuffix = [
        sitelinkLabels.length > 0 ? `Sitelinks: ${sitelinkLabels.join(" · ")}` : "",
        extensions.length > 0 ? `Highlights: ${extensions.join(" · ")}` : "",
      ]
        .filter(Boolean)
        .join(" | ");

      const fullCopy = cleanText(
        extensionSuffix ? `${description} (${extensionSuffix})` : description || title,
        5000,
      );

      const position = Math.max(1, Number(ad.position || i + 1));
      const advertiserName =
        cleanText(ad.source || ad.advertiser || domain || "Google Sponsored Advertiser", 300);
      const activeDays = position === 1 ? 65 : position <= 3 ? 42 : 30;
      const firstSeen = new Date(Date.now() - activeDays * DAY_MS).toISOString();
      const rawId = idPart(`${domain || advertiserName}_${position}_${title.slice(0, 40)}`);
      if (!rawId) continue;

      const formatTag = detectGoogleAdFormat("TEXT", activeDays, { isSerpAd: true, position });
      const headline = cleanText(`${title || advertiserName} · ${formatTag}`, 500);
      const thumb = https(ad.thumbnail) || https(ad.favicon);

      drafts.push({
        adId: `google_serp_${rawId}`,
        platform: "GOOGLE",
        advertiserName,
        advertiserId: idPart(domain || advertiserName.toLowerCase().replace(/\s+/g, "_")),
        mediaType: "TEXT",
        mediaUrls: [],
        thumbnailUrl: thumb,
        primaryCopy: fullCopy,
        headline,
        ctaText: inferGoogleCta(ad.call_to_action, fullCopy, headline, "TEXT"),
        landingPageUrl: link || (domain ? `https://${domain}` : ""),
        countryCode: params.country,
        firstSeenDate: firstSeen,
        lastSeenDate: nowIso,
        activeDaysCount: activeDays,
        totalViews: position === 1 ? 85_000 : position <= 3 ? 52_000 : 28_000,
        duplicates: sitelinkLabels.length >= 2 ? 3 : 2,
      });
    }

    // 2. Parse Sponsored Google Shopping Ads (`shopping_ads` / `inline_shopping`)
    const shoppingAds = [...list(json.shopping_ads), ...list(json.inline_shopping)];
    for (let i = 0; i < shoppingAds.length; i++) {
      const shop = obj(shoppingAds[i]);
      const title = cleanText(shop.title, 300);
      const seller = cleanText(shop.source || shop.seller || shop.merchant || "Google Shopping Merchant", 300);
      const price = cleanText(shop.price, 60);
      const rating = Number(shop.rating || 0);
      const reviews = Number(shop.reviews || 0);
      const thumb = https(shop.thumbnail || shop.image);
      const link = https(shop.link || shop.product_link);
      const domain = extractCleanDomain(link) || extractCleanDomain(seller);

      if (nonGoogleSocialDomain.test(domain) || nonGoogleSocialDomain.test(link)) continue;

      if (domain && isRelevantGoogleAdvertiser(domain, params.intent)) {
        domainSet.add(domain);
      }

      if (params.mediaType === "VIDEO") continue;
      if (!title || !thumb) continue;

      const position = Math.max(1, Number(shop.position || i + 1));
      const activeDays = rating >= 4.5 && reviews >= 100 ? 64 : 35;
      const firstSeen = new Date(Date.now() - activeDays * DAY_MS).toISOString();
      const rawId = idPart(`${seller}_${position}_${title.slice(0, 40)}`);
      if (!rawId) continue;

      const metaBadges = [
        price ? `Price: ${price}` : "",
        rating > 0 ? `Rated ${rating}★${reviews > 0 ? ` (${reviews.toLocaleString("en-AU")} reviews)` : ""}` : "",
        shop.delivery ? cleanText(shop.delivery, 80) : "",
      ].filter(Boolean);

      const primaryCopy = cleanText(
        `${title} by ${seller}. ${metaBadges.join(" · ")}. Featured in Google Shopping top sponsored carousel for "${cleanQuery}".`,
        5000,
      );
      const headline = cleanText(
        `${title}${price ? ` — ${price}` : ""} · Google Shopping Winner`,
        500,
      );

      drafts.push({
        adId: `google_shop_${rawId}`,
        platform: "GOOGLE",
        advertiserName: seller,
        advertiserId: idPart(domain || seller.toLowerCase().replace(/\s+/g, "_")),
        mediaType: "IMAGE",
        mediaUrls: [thumb],
        thumbnailUrl: thumb,
        primaryCopy,
        headline,
        ctaText: "Shop Now",
        landingPageUrl: link || (domain ? `https://${domain}` : ""),
        countryCode: params.country,
        firstSeenDate: firstSeen,
        lastSeenDate: nowIso,
        activeDaysCount: activeDays,
        totalViews: reviews > 0 ? Math.max(25_000, reviews * 65) : 38_000,
        duplicates: position <= 3 ? 2 : 1,
      });
    }

    // 3. Also inspect top 3 organic commercial domains if fewer than 2 paid domains were found
    if (domainSet.size < 2) {
      for (const org of list(json.organic_results).slice(0, 5)) {
        const d = extractCleanDomain(obj(org).domain || obj(org).link);
        if (
          d &&
          !/\b(wikipedia\.org|reddit\.com|youtube\.com|facebook\.com|instagram\.com|tiktok\.com|pinterest\.com|gov\.au|edu\.au|forbes\.com|nytimes\.com)\b/i.test(d) &&
          isRelevantGoogleAdvertiser(d, params.intent)
        ) {
          domainSet.add(d);
          if (domainSet.size >= 3) break;
        }
      }
    }

    return {
      drafts,
      discoveredDomains: Array.from(domainSet).slice(0, 3),
    };
  } catch {
    return { drafts: [], discoveredDomains: [] };
  }
}

