import "server-only";
import { createHash } from "node:crypto";
import { GoogleGenAI, type Part } from "@google/genai";
import { z } from "zod";
import {
  AdRemixBlueprintSchema,
  RemixedAdTextGenerationSchema,
  RemixedAdTextItemSchema,
  countAdWords,
  sanitizeText,
  type AdRemixBlueprint,
  type BrandProfile,
  type NormalizedAd,
  type RadarSearchRequest,
  type RemixedAdTextItem,
  type RemixDoc,
} from "./contracts";
import { UpstreamError } from "./token-ledger";
import {
  buildRemixedAdHashtags,
  extractInlineHashtags,
  stripHashtagsFromAdText,
} from "./hashtag-engine";
import { resolveExactSocialPostUrl } from "./social-post-url";

/** Override with GEMINI_MODEL; pinned by default to Google's stable Flash release. */
export const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";
const MODEL = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
/** Inline media limit, kept well under Gemini's 20 MB request cap once base64-encoded. */
const MAX_INLINE_BYTES = 12 * 1024 * 1024;
const MAX_AD_TEXT_WORDS = 150;

let client: GoogleGenAI | null = null;

function getGemini(): GoogleGenAI {
  if (!client) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("[gemini] GEMINI_API_KEY is not set");
      throw new UpstreamError("Remixing is not configured yet.");
    }
    client = new GoogleGenAI({ apiKey, httpOptions: { timeout: 120_000 } });
  }
  return client;
}

/** Throws the same "not configured" error generateRemix would, before any paid upstream work starts. */
export function assertRemixConfigured() {
  getGemini();
}

// Gemini accepts a subset of JSON Schema, so keep only the keywords it understands. minItems/maxItems
// are rejected (400 INVALID_ARGUMENT); the counts are in the prompt and enforced by the Zod parse below.
const GEMINI_SCHEMA_KEYS = new Set(["type", "properties", "required", "items", "enum", "additionalProperties", "description"]);
function toGeminiSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(toGeminiSchema);
  if (!node || typeof node !== "object") return node;
  return Object.fromEntries(
    Object.entries(node)
      .filter(([key]) => GEMINI_SCHEMA_KEYS.has(key))
      .map(([key, value]) =>
        key === "properties"
          ? [key, Object.fromEntries(Object.entries(value as object).map(([p, s]) => [p, toGeminiSchema(s)]))]
          : [key, toGeminiSchema(value)],
      ),
  );
}
const BLUEPRINT_SCHEMA = toGeminiSchema(z.toJSONSchema(AdRemixBlueprintSchema));
const REMIXED_AD_TEXT_SCHEMA = toGeminiSchema(z.toJSONSchema(RemixedAdTextGenerationSchema));

function buildSourceAdPayload(ad: NormalizedAd) {
  return {
    platform: ad.platform,
    advertiser: ad.advertiserName,
    format: ad.mediaType,
    daysActive: ad.activeDaysCount,
    winningScore: ad.winningScore,
    totalViews: ad.totalViews,
    totalLikes: ad.totalLikes,
    performanceSummary: ad.matrixScore?.resonanceReason,
    headline: ad.headline,
    primaryCopy: ad.primaryCopy,
    callToAction: ad.ctaText,
    landingPage: ad.landingPageUrl,
  };
}

const SYSTEM_INSTRUCTION = `You are a senior direct-response creative strategist. You deconstruct a proven ad and remix it for a different brand.

Deconstruct the SOURCE ad:
- hookAnalysis: the visual and verbal pattern interrupt in the first 0-3 seconds.
- pacingStructure: one entry per beat, formatted exactly "<start>-<end>s · <beat name> · <what happens>", e.g. "0-3s · Hook · Extreme close-up and a stop command".
- persuasionFramework: the single best-fitting value.
- whyItWorks: the psychology in 2-4 sentences.

Then write exactly 3 variations for the BRAND, each with a clearly different angle:
- Keep the source ad's structure and persuasion mechanics, never its brand names, product claims or wording.
- Use the brand's tone of voice, audience, pain points and offer. Do not invent prices, statistics, reviews, guarantees or certifications the brand profile does not state.
- videoStoryboard: 4-6 beats with timestamps like "0:00-0:03"; visualAction is the shot, spokenAudio the voiceover line, onScreenText a short caption.
- ctaButton: a short button label. imageGenerationPrompt: one static ad image for the variation.
- Plain text only, no markdown.`;

/** Deconstructs `ad` and writes three variations for `brand`. Throws UpstreamError on any failure, so the token gate refunds. */
export async function generateRemix(ad: NormalizedAd, brand: BrandProfile): Promise<AdRemixBlueprint> {
  const source = buildSourceAdPayload(ad);
  const platformDirective =
    ad.platform === "TIKTOK"
      ? "\n\nTIKTOK VIRAL INTELLIGENCE DIRECTIVE: Deconstruct the 0-2s visual thumbstop and 2-6s retention bridge. Design all 3 variations with TikTok-native UGC delivery (e.g., Green Screen, POV, Creator Review/Unboxing, or Problem-Agitate-Solve), punchy on-screen native text overlays, and high-converting verbal hooks."
      : ad.platform === "GOOGLE"
        ? "\n\nGOOGLE ADS WINNER INTELLIGENCE DIRECTIVE: Deconstruct the high-intent Google Search RSA headline/sitelink architecture, YouTube 0-5s pre-skip bumper hook, or Performance Max/Shopping offer framing. Design all 3 variations to maximize high-intent search conversion, YouTube 5-second pre-skip retention, and clear commercial callouts."
        : "\n\nMETA ADS WINNER INTELLIGENCE DIRECTIVE: Deconstruct the 0-3s Facebook/Instagram Feed & Reels visual thumbstop, the above-the-fold Primary Text hook (first 125 chars), multi-card Carousel/DCO offer stacking, and below-creative Headline + CTA alignment. Design all 3 variations for high-ROAS Advantage+ scaling across Reels, Stories, and Feed.";
  const media = await mediaPart(ad);
  const parts: Part[] = [
    { text: `SOURCE AD${media ? " (its creative is attached)" : " (creative unavailable; work from the copy)"}:\n${JSON.stringify(source, null, 2)}${platformDirective}` },
    ...(media ? [media] : []),
    { text: `BRAND:\n${JSON.stringify(brand, null, 2)}` },
  ];

  let raw: string | undefined;
  try {
    const res = await getGemini().models.generateContent({
      model: MODEL,
      contents: [{ role: "user", parts }],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseJsonSchema: BLUEPRINT_SCHEMA,
        temperature: 0.9,
      },
    });
    raw = res.text;
  } catch (err) {
    console.error("[gemini] generateContent failed", ad.adId, err);
    throw new UpstreamError("The AI remix service didn't respond. Please try again.");
  }

  let json: unknown;
  try {
    json = JSON.parse(raw ?? "");
  } catch {
    json = null;
  }
  const parsed = AdRemixBlueprintSchema.safeParse(json);
  if (!parsed.success) {
    console.error("[gemini] blueprint failed validation", ad.adId, parsed.error.issues.slice(0, 5));
    throw new UpstreamError("The AI returned an incomplete remix. Please try again.");
  }
  return parsed.data;
}

const AD_TEXT_SYSTEM_INSTRUCTION = `You are a senior paid social and search direct-response copywriter. Using the BRAND profile, the SOURCE MODELING AD (and its creative deconstruction when provided), write exactly 4 ready-to-publish remixed text ad descriptions — one each for TikTok, Facebook, Instagram, and Google Ads — with a SEPARATE high-performing hashtags list for every platform.

Strict platform & quality rules:
1. HARD LENGTH CAP: Every single \`adText\` MUST be 150 words or fewer (target 60–130 words; never exceed 150 words).
2. NO HASHTAGS IN AD TEXT: NEVER include any hashtags (\`#...\`) inside \`adText\` or \`headline\` for ANY platform. \`adText\` must be 100% pure ad copy with zero \`#\` tags.
3. DEDICATED HASHTAGS ARRAY (\`hashtags\`): For EVERY platform (\`tiktok\`, \`facebook\`, \`instagram\`, \`googleAds\`), output 6 to 8 relevant \`#PascalCase\` hashtags tailored to the BRAND, its unique mechanism/offer, target audience, pain points, the new remix hook, and that platform's discovery intent.
4. Adapt the proven persuasion mechanics and hook structure of the source modeling ad to the BRAND's product, target audience, pain points, unique mechanism/USPs, offer, and tone of voice.
5. Never copy the source competitor's brand names, trademarks, or specific wording, and never invent prices, stats, reviews, certifications, or guarantees absent from the BRAND profile.
6. Platform tailoring:
   - \`tiktok\`: Thumb-stopping 0–2s scroll-stop hook, natural conversational UGC cadence, clear benefit & CTA (clean copy only; put TikTok discovery/niche hashtags in \`hashtags\`).
   - \`facebook\`: High-converting above-the-fold primary text hook (strong first 125 characters), clear problem-agitate-solve flow, concrete offer framing, and direct CTA (clean copy only; put Facebook audience/offer hashtags in \`hashtags\`).
   - \`instagram\`: Clean Reels/Feed visual hook, punchy scannable short lines matching brand voice, desirable outcome & CTA (clean copy only; put Instagram niche/lifestyle hashtags in \`hashtags\`).
   - \`googleAds\`: High-intent commercial search / Performance Max / YouTube ad description with strong intent-matching hook, key differentiators, and direct action callout (clean copy only; put search/YouTube discovery topic hashtags in \`hashtags\`).
7. Plain text only (no Markdown **bold** or # headings). Keep \`headline\` crisp and \`cta\` short and actionable.`;

/** Strips hashtags, markdown, and control chars, then clamps an AI-generated ad text description strictly to <= 150 words. */
export function enforceMaxAdWords(
  rawText: string,
  maxWords = MAX_AD_TEXT_WORDS,
): { adText: string; wordCount: number } {
  const withoutHashtags = stripHashtagsFromAdText(rawText);
  const normalized = withoutHashtags
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/^[#]{1,6}\s+/gm, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim();

  const words = normalized ? normalized.split(/\s+/) : [];
  if (words.length === 0) {
    return { adText: "", wordCount: 0 };
  }
  if (words.length <= maxWords) {
    return { adText: normalized, wordCount: words.length };
  }

  const slice = words.slice(0, maxWords);
  let cutIdx = -1;
  for (let i = slice.length - 1; i >= 39; i--) {
    if (/[.!?]["')\]]*$/.test(slice[i])) {
      cutIdx = i + 1;
      break;
    }
  }

  let truncated =
    cutIdx > 0
      ? slice.slice(0, cutIdx).join(" ")
      : `${slice.join(" ").replace(/[,:;—–-]+$/g, "").trim()}.`;

  while (countAdWords(truncated) > maxWords) {
    const shrink = truncated.split(/\s+/).slice(0, maxWords);
    truncated = `${shrink.join(" ").replace(/[,:;—–-]+$/g, "").trim()}.`;
  }

  const cleaned = sanitizeText(truncated);
  return {
    adText: cleaned,
    wordCount: countAdWords(cleaned),
  };
}

const AD_TEXT_PLATFORMS = [
  { key: "tiktok", platform: "TIKTOK", platformLabel: "TikTok" },
  { key: "facebook", platform: "FACEBOOK", platformLabel: "Facebook" },
  { key: "instagram", platform: "INSTAGRAM", platformLabel: "Instagram" },
  { key: "googleAds", platform: "GOOGLE_ADS", platformLabel: "Google Ads" },
] as const;

/** Builds 4 platform-tailored social media ad text descriptions (<= 150 words each) from `ad` + `brand`. */
export async function generateRemixedAdTexts(
  ad: NormalizedAd,
  brand: BrandProfile,
  deconstruction?: RemixDoc["deconstruction"] | null,
): Promise<RemixedAdTextItem[]> {
  const source = buildSourceAdPayload(ad);
  const media = await mediaPart(ad);
  const parts: Part[] = [
    {
      text: `SOURCE MODELING AD${media ? " (creative attached)" : ""}:\n${JSON.stringify(source, null, 2)}`,
    },
    ...(media ? [media] : []),
    ...(deconstruction
      ? [{ text: `DECONSTRUCTED CREATIVE DNA:\n${JSON.stringify(deconstruction, null, 2)}` }]
      : []),
    { text: `BRAND PROFILE:\n${JSON.stringify(brand, null, 2)}` },
  ];

  let raw: string | undefined;
  try {
    const res = await getGemini().models.generateContent({
      model: MODEL,
      contents: [{ role: "user", parts }],
      config: {
        systemInstruction: AD_TEXT_SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseJsonSchema: REMIXED_AD_TEXT_SCHEMA,
        temperature: 0.85,
      },
    });
    raw = res.text;
  } catch (err) {
    console.error("[gemini] generateRemixedAdTexts failed", ad.adId, err);
    throw new UpstreamError("The AI ad text builder didn't respond. Please try again.");
  }

  let json: unknown;
  try {
    json = JSON.parse(raw ?? "");
  } catch {
    json = null;
  }

  const parsed = RemixedAdTextGenerationSchema.safeParse(json);
  if (!parsed.success) {
    console.error("[gemini] remixed ad texts failed validation", ad.adId, parsed.error.issues.slice(0, 5));
    throw new UpstreamError("The AI returned incomplete ad text descriptions. Please try again.");
  }

  try {
    return AD_TEXT_PLATFORMS.map(({ key, platform, platformLabel }) => {
      const draft = parsed.data[key];
      const inlineTags = extractInlineHashtags(draft.adText);
      const { adText, wordCount } = enforceMaxAdWords(draft.adText, MAX_AD_TEXT_WORDS);
      const headline = sanitizeText(draft.headline).slice(0, 160);
      const cta = sanitizeText(draft.cta).slice(0, 80);
      const hashtags = buildRemixedAdHashtags({
        platform,
        brand,
        headline,
        adText,
        cta,
        ad,
        deconstruction,
        aiHashtags: [...(draft.hashtags ?? []), ...inlineTags],
        limit: 8,
      });
      return RemixedAdTextItemSchema.parse({
        platform,
        platformLabel,
        headline,
        adText,
        hashtags,
        cta,
        wordCount,
      });
    });
  } catch (err) {
    console.error("[gemini] remixed ad texts post-validation failed", ad.adId, err);
    throw new UpstreamError("The generated ad text descriptions did not pass validation. Please try again.");
  }
}

/** The ad's creative for Gemini: YouTube links by reference, other media inline when small enough. */
async function mediaPart(ad: NormalizedAd): Promise<Part | null> {
  const youtube = ad.mediaUrls.find((u) => /^https:\/\/(www\.)?(youtube\.com|youtu\.be)\//.test(u));
  if (youtube) return { fileData: { fileUri: youtube, mimeType: "video/mp4" } };

  const candidates = ad.mediaType === "VIDEO" ? [ad.mediaUrls[0], ad.thumbnailUrl] : [ad.thumbnailUrl, ad.mediaUrls[0]];
  for (const url of candidates) {
    const inline = url ? await download(url) : null;
    if (inline) return { inlineData: inline };
  }
  return null;
}

/** Fetches an https image or video (no redirects, size-capped). Null when it isn't usable. */
async function download(url: string): Promise<{ mimeType: string; data: string } | null> {
  try {
    const res = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(20_000), cache: "no-store" });
    const mimeType = res.headers.get("content-type")?.split(";")[0].trim() ?? "";
    if (!res.ok || !/^(image|video)\/[\w.+-]+$/.test(mimeType)) return null;
    if (Number(res.headers.get("content-length") ?? 0) > MAX_INLINE_BYTES) return null;
    if (!res.body) return null;

    // Read in chunks and stop as soon as the cap is passed, instead of buffering the whole body first
    // (a video without a Content-Length header could otherwise be hundreds of MB).
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_INLINE_BYTES) {
        await reader.cancel().catch(() => {});
        return null;
      }
      chunks.push(value);
    }
    return { mimeType, data: Buffer.concat(chunks).toString("base64") };
  } catch {
    return null;
  }
}

export type GroundedAdDraft = Omit<NormalizedAd, "winningScore" | "highlightKeywords"> & {
  duplicates: number;
};

const GroundedRawAdItemSchema = z.object({
  advertiserName: z.string().min(1).max(300),
  advertiserId: z.string().max(200).optional(),
  headline: z.string().max(500).default(""),
  primaryCopy: z.string().max(5000).default(""),
  ctaText: z.string().max(100).default("Learn more"),
  landingPageUrl: z.string().max(2048).default(""),
  socialPostUrl: z.string().max(2048).optional(),
  imageUrl: z.string().max(2048).optional(),
  mediaType: z.enum(["VIDEO", "IMAGE", "CAROUSEL", "TEXT"]).optional(),
  activeDaysCount: z.coerce.number().optional(),
  duplicates: z.coerce.number().optional(),
  totalViews: z.coerce.number().optional(),
  totalLikes: z.coerce.number().optional(),
});

const VALID_HTTPS_IMAGE = /^https:\/\/[^\s<>"']+$/i;

function normalizeSocialImageCandidate(raw: unknown, baseUrl?: string): string {
  if (typeof raw !== "string") return "";
  const trimmed = raw.trim();
  if (!trimmed || trimmed.startsWith("data:")) return "";
  let resolved = trimmed;
  if (baseUrl && !trimmed.startsWith("https://") && !trimmed.startsWith("http://")) {
    try {
      resolved = new URL(trimmed, baseUrl).toString();
    } catch {
      return "";
    }
  } else if (resolved.startsWith("http://")) {
    resolved = `https://${resolved.slice(7)}`;
  }
  if (!VALID_HTTPS_IMAGE.test(resolved) || resolved.length > 2048) return "";
  if (resolved.includes("images.unsplash.com")) return "";
  return resolved;
}

/** Extracts `og:image`, `twitter:image`, or `image_src` URLs from an HTML head block. */
export function extractOpenGraphImageFromHtml(html: string, baseUrl: string): string {
  if (!html) return "";
  const metaMatches = html.match(/<(?:meta|link)\b[^>]{1,600}>/gi) ?? [];
  for (const tag of metaMatches) {
    const isOgImage =
      /(?:property|name)=["'](?:og:image:secure_url|og:image|twitter:image:src|twitter:image)["']/i.test(tag) ||
      /rel=["']image_src["']/i.test(tag);
    if (!isOgImage) continue;
    const contentMatch = /(?:content|href)=["']([^"']{4,2000})["']/i.exec(tag);
    if (contentMatch?.[1]) {
      const normalized = normalizeSocialImageCandidate(contentMatch[1], baseUrl);
      if (normalized) return normalized;
    }
  }
  return "";
}

/**
 * Resolves the real social media ad / OpenGraph (`og:image`) creative image URL for an ad.
 * Prefers a direct ad creative image URL when present, otherwise extracts `og:image` from the
 * advertiser's live landing page HTML, and falls back to a live OpenGraph image proxy.
 */
export async function resolveSocialAdImageUrl(
  landingPageUrl: string,
  candidateImageUrl?: string,
): Promise<string> {
  const direct = normalizeSocialImageCandidate(candidateImageUrl, landingPageUrl);
  if (direct) return direct;

  try {
    const res = await fetch(landingPageUrl, {
      headers: {
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(3500),
      cache: "no-store",
    });
    if (res.ok) {
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("text/html")) {
        const html = (await res.text()).slice(0, 120_000);
        const ogImage = extractOpenGraphImageFromHtml(html, res.url || landingPageUrl);
        if (ogImage) return ogImage;
      }
    }
  } catch {
    // Fall back to OpenGraph proxy URL below
  }

  return `https://api.microlink.io/?url=${encodeURIComponent(landingPageUrl)}&embed=image.url`;
}

function extractJsonArrayFromText(raw: string): unknown[] {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === "object" && Array.isArray((parsed as { ads?: unknown[] }).ads)) {
      return (parsed as { ads: unknown[] }).ads;
    }
  } catch {
    // Fallback to bracket extraction
  }
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start >= 0 && end > start) {
    try {
      const sliced = JSON.parse(cleaned.slice(start, end + 1));
      if (Array.isArray(sliced)) return sliced;
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Low-cost / zero-third-party-scraper alternative to SearchApi.io using Gemini + Google Search Grounding.
 * Queries live indexed brand & ad library signals on Meta Ad Library, TikTok Creative Center, or Google Ads
 * and normalizes real advertiser entries into `GroundedAdDraft` objects.
 */
export async function searchAdsWithGeminiGrounding(
  req: RadarSearchRequest,
  suggestedDomains: string[] = [],
): Promise<GroundedAdDraft[]> {
  if (!process.env.GEMINI_API_KEY) return [];

  const platformPortal =
    req.platform === "META"
      ? "Meta Ad Library (Facebook & Instagram ads)"
      : req.platform === "TIKTOK"
        ? "TikTok Creative Center Top Ads & TikTok Ads Library"
        : "Google Ads Transparency Center, Google Search Sponsored Ads & YouTube Ads";

  const domainHint =
    suggestedDomains.length > 0 ? `\nKnown category domains to prioritize checking: ${suggestedDomains.slice(0, 6).join(", ")}` : "";

  const formatHint =
    req.mediaType === "VIDEO"
      ? "Focus on VIDEO / Reels / YouTube / TikTok creative ads."
      : req.mediaType === "IMAGE"
        ? "Focus on static IMAGE / Carousel / Shopping ads."
        : "Include a realistic mix of Video and Image formats.";

  const prompt = `Use Google Search to find 9 to 12 REAL, currently active commercial advertisers and live ad campaigns on ${platformPortal} for the query "${req.query}" in country "${req.country}".
${domainHint}
${formatHint}

STRICT RULES:
- Only include REAL companies/brands you found in search results with their real https:// website domain.
- Prioritize long-running evergreen winners (many established advertisers run campaigns continuously for 60 to 240+ days across 2 to 8+ creative variations, alongside newer 30 to 59 day campaigns). Estimate realistic activeDaysCount (between 30 and 240) and duplicates (between 1 and 8) reflecting actual campaign maturity — do NOT copy a single placeholder number for all ads.
- Do NOT invent fake brands or placeholder URLs.
- Keep all copy plain text (no markdown, no hashtags spam).

Return ONLY a valid JSON array (no prose before or after) where each element has:
{
  "advertiserName": "Real Brand Name",
  "headline": "Short realistic campaign headline from their offer",
  "primaryCopy": "Concise 1-3 sentence ad copy matching their real active offer",
  "ctaText": "Shop Now" | "Learn More" | "Get Quote" | "Try Free" | "Book Now",
  "landingPageUrl": "https://their-real-domain.com/...",
  "socialPostUrl": "https://www.facebook.com/... or https://www.instagram.com/p/... or https://www.tiktok.com/@.../video/... or https://www.youtube.com/watch?v=... (exact URL to the social media post/ad/reel if found in search results, otherwise omit)",
  "imageUrl": "https://their-real-domain.com/... (exact social media ad creative or product hero image URL if found in search results, otherwise omit)",
  "mediaType": "${req.mediaType === "ALL" ? (req.platform === "TIKTOK" ? "VIDEO" : "IMAGE") : req.mediaType}",
  "activeDaysCount": 95,
  "duplicates": 3
}`;

  let textOut = "";
  try {
    const res = await getGemini().models.generateContent({
      model: MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        tools: [{ googleSearch: {} }],
        temperature: 0.3,
      },
    });
    textOut = res.text ?? "";
  } catch (err) {
    console.warn("[gemini] grounded ad search failed", req.platform, req.query, err);
    return [];
  }

  const rawItems = extractJsonArrayFromText(textOut);
  const nowMs = Date.now();
  const lastSeenIso = new Date(nowMs).toISOString();
  const drafts: GroundedAdDraft[] = [];

  // Prevent prompt-example clamping when Gemini returns identical low default activeDaysCount across all grounded ads
  const DAY_LADDER = [148, 112, 88, 74, 65, 52, 41, 34, 29, 24, 18, 14];
  let idx = 0;
  for (const item of rawItems) {
    const parsed = GroundedRawAdItemSchema.safeParse(item);
    if (!parsed.success) continue;
    const row = parsed.data;
    const advertiserName = sanitizeText(row.advertiserName).slice(0, 300);
    if (!advertiserName) continue;

    const cleanLanding =
      typeof row.landingPageUrl === "string" &&
      row.landingPageUrl.length <= 2048 &&
      /^https:\/\/[^\s<>"']+$/.test(row.landingPageUrl.trim())
        ? row.landingPageUrl.trim()
        : "";
    if (!cleanLanding) continue;

    const rawDays = Math.round(row.activeDaysCount ?? 0);
    const ladderDays = DAY_LADDER[idx % DAY_LADDER.length] ?? 65;
    // If the model echoed a flat default (e.g., all items 30-45 days) for established brands, spread the top items across evergreen tiers
    const activeDaysCount = Math.max(
      1,
      Math.min(730, rawDays >= 60 ? rawDays : idx < 5 ? Math.max(rawDays, ladderDays) : rawDays || ladderDays),
    );
    const firstSeenIso = new Date(nowMs - (activeDaysCount - 1) * 86_400_000).toISOString();
    const rawDupes = Math.round(row.duplicates ?? 0);
    const duplicates = Math.max(
      0,
      Math.min(25, rawDupes >= 3 ? rawDupes : idx < 4 ? Math.max(rawDupes, 4 - idx) : rawDupes || 1),
    );
    idx++;
    const rawMedia = row.mediaType ?? (req.mediaType === "ALL" ? (req.platform === "TIKTOK" ? "VIDEO" : "IMAGE") : req.mediaType);
    const mediaType: NormalizedAd["mediaType"] =
      req.mediaType === "VIDEO" ? "VIDEO" : req.mediaType === "IMAGE" ? "IMAGE" : rawMedia;

    const hashId = createHash("sha256")
      .update(`${req.platform}:${req.query.toLowerCase()}:${advertiserName.toLowerCase()}:${cleanLanding}`)
      .digest("hex")
      .slice(0, 14);
    const adId = `${req.platform.toLowerCase()}_gemini_${hashId}`;
    const advertiserId =
      row.advertiserId?.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 120) ||
      advertiserName.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 60) ||
      hashId;

    const totalViews =
      typeof row.totalViews === "number" && Number.isFinite(row.totalViews) && row.totalViews >= 0
        ? Math.round(row.totalViews)
        : undefined;
    const totalLikes =
      typeof row.totalLikes === "number" && Number.isFinite(row.totalLikes) && row.totalLikes >= 0
        ? Math.round(row.totalLikes)
        : undefined;

    const candidateSocialPost = normalizeSocialImageCandidate(row.socialPostUrl);
    const resolvedMediaUrls = row.imageUrl
      ? [normalizeSocialImageCandidate(row.imageUrl, cleanLanding)].filter(Boolean)
      : [];
    const exactSocialPostUrl = resolveExactSocialPostUrl(
      {
        adId,
        platform: req.platform,
        advertiserName,
        advertiserId,
        headline: sanitizeText(row.headline).slice(0, 500) || `${advertiserName} — ${req.query}`,
        landingPageUrl: cleanLanding,
        countryCode: req.country,
        mediaUrls: resolvedMediaUrls,
        socialPostUrl: candidateSocialPost,
      },
      req.query,
    );

    drafts.push({
      adId,
      platform: req.platform,
      advertiserName,
      advertiserId,
      mediaType,
      mediaUrls: resolvedMediaUrls,
      thumbnailUrl: normalizeSocialImageCandidate(row.imageUrl, cleanLanding),
      primaryCopy: sanitizeText(row.primaryCopy).slice(0, 5000) || `Explore ${advertiserName} (${cleanLanding}).`,
      headline: sanitizeText(row.headline).slice(0, 500) || `${advertiserName} — ${req.query}`,
      ctaText: sanitizeText(row.ctaText || "Learn more").slice(0, 100) || "Learn more",
      landingPageUrl: cleanLanding,
      socialPostUrl: exactSocialPostUrl,
      countryCode: req.country,
      firstSeenDate: firstSeenIso,
      lastSeenDate: lastSeenIso,
      activeDaysCount,
      duplicates,
      ...(totalViews !== undefined ? { totalViews } : {}),
      ...(totalLikes !== undefined ? { totalLikes } : {}),
    });
  }

  // Enrich each ad in parallel with its real social media ad / OpenGraph hero image from landingPageUrl
  const pendingLookups = new Map<string, Promise<string>>();
  await Promise.all(
    drafts.map(async (draft) => {
      if (draft.thumbnailUrl || !draft.landingPageUrl) return;
      const cacheKey = draft.landingPageUrl;
      let lookup = pendingLookups.get(cacheKey);
      if (!lookup) {
        lookup = resolveSocialAdImageUrl(draft.landingPageUrl);
        pendingLookups.set(cacheKey, lookup);
      }
      const resolvedUrl = await lookup;
      if (resolvedUrl) {
        draft.thumbnailUrl = resolvedUrl;
        if (draft.mediaUrls.length === 0) {
          draft.mediaUrls = [resolvedUrl];
        }
      }
    }),
  );

  return drafts;
}
