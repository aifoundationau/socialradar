import type { NormalizedAd } from "./contracts";

const VALID_HTTPS = /^https:\/\/[^\s<>"']+$/i;

function extractDomain(url?: string | null): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

export function isSocialOrAdLibraryUrl(url?: string | null): boolean {
  if (!url || !VALID_HTTPS.test(url)) return false;
  return /(?:facebook\.com\/|fb\.watch\/|instagram\.com\/|tiktok\.com\/|adstransparency\.google\.com\/|youtube\.com\/(?:watch|shorts)|youtu\.be\/)/i.test(
    url,
  );
}

/**
 * Resolves the exact URL of the social media post / ad library entry so clicking the link
 * underneath "Show less" on any search card takes the user straight to the social post or ad.
 */
export function resolveExactSocialPostUrl(
  ad: Pick<
    NormalizedAd,
    | "adId"
    | "platform"
    | "advertiserName"
    | "advertiserId"
    | "headline"
    | "landingPageUrl"
    | "countryCode"
    | "mediaUrls"
    | "socialPostUrl"
  >,
  searchQuery?: string,
): string {
  const stored = (ad.socialPostUrl || "").trim();
  if (stored && VALID_HTTPS.test(stored) && isSocialOrAdLibraryUrl(stored)) {
    return stored;
  }

  const country = encodeURIComponent((ad.countryCode || "AU").toUpperCase());
  const lookupTerm = (ad.advertiserName || ad.headline || searchQuery || "").trim();

  if (ad.platform === "META") {
    const archiveMatch = /^meta_(\d{6,})$/.exec(ad.adId);
    if (archiveMatch) {
      return `https://www.facebook.com/ads/library/?id=${archiveMatch[1]}`;
    }
    return `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${country}&q=${encodeURIComponent(lookupTerm)}&search_type=keyword_unordered&media_type=all`;
  }

  if (ad.platform === "TIKTOK") {
    const tiktokMatch = /^tiktok_(\d{8,})$/.exec(ad.adId);
    if (tiktokMatch) {
      return `https://library.tiktok.com/ads/detail/?ad_id=${tiktokMatch[1]}`;
    }
    const advParam = encodeURIComponent(lookupTerm);
    const region = encodeURIComponent(
      ad.countryCode === "AU" || ad.countryCode === "US" || ad.countryCode === "NZ"
        ? "GB"
        : ad.countryCode || "GB",
    );
    return `https://library.tiktok.com/ads?region=${region}&adv_name=${advParam}`;
  }

  // GOOGLE (YouTube / Google Ads Transparency Center)
  const ytUrl = ad.mediaUrls.find((u) => /^https:\/\/(?:www\.)?(?:youtube\.com\/|youtu\.be\/)/i.test(u));
  if (ytUrl) return ytUrl;

  const creativeMatch = /^google_(CR\d+)$/.exec(ad.adId);
  if (/^AR\d+$/.test(ad.advertiserId) && creativeMatch) {
    return `https://adstransparency.google.com/advertiser/${ad.advertiserId}/creative/${creativeMatch[1]}?region=${country}`;
  }
  const domain = extractDomain(ad.landingPageUrl);
  if (domain) {
    return `https://adstransparency.google.com/?region=${country}&domain=${encodeURIComponent(domain)}`;
  }
  if (/^AR\d+$/.test(ad.advertiserId)) {
    return `https://adstransparency.google.com/advertiser/${ad.advertiserId}?region=${country}`;
  }
  return stored && VALID_HTTPS.test(stored)
    ? stored
    : `https://adstransparency.google.com/?region=${country}`;
}
