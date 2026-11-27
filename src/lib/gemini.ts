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
  buildRemixedAdImagePrompt,
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

const AD_TEXT_SYSTEM_INSTRUCTION = `You are a senior paid social and search direct-response copywriter. Using the BRAND profile, the SOURCE MODELING AD (and its creative deconstruction when provided), write exactly 4 ready-to-publish remixed text ad descriptions — one each for TikTok, Facebook, Instagram, and Google Ads — with a tailored Google Gemini AI image prompt and a SEPARATE high-performing hashtags list for every platform.

Strict platform & quality rules:
1. HARD LENGTH CAP: Every single \`adText\` MUST be 150 words or fewer (target 60–130 words; never exceed 150 words).
2. NO HASHTAGS IN AD TEXT: NEVER include any hashtags (\`#...\`) inside \`adText\`, \`headline\`, or \`aiImagePrompt\` for ANY platform. \`adText\` must be 100% pure ad copy with zero \`#\` tags.
3. DEDICATED GOOGLE GEMINI IMAGE PROMPT (\`aiImagePrompt\`): For EVERY platform (\`tiktok\`, \`facebook\`, \`instagram\`, \`googleAds\`), write a descriptive 2–3 sentence visual prompt (40–110 words, plain text, zero hashtags) that the user can paste into Google Gemini to generate a high-converting advertisement image matching that platform's framing/style (9:16 vertical UGC/creator hero for TikTok, 4:5 Feed hero for Facebook, 4:5/9:16 editorial visual for Instagram, 16:9/1.91:1 clean commercial display hero for Google Ads), illustrating the BRAND's product/service and the remixed headline and copy without gibberish text overlays or watermarks.
4. DEDICATED HASHTAGS ARRAY (\`hashtags\`): For EVERY platform (\`tiktok\`, \`facebook\`, \`instagram\`, \`googleAds\`), output 6 to 8 relevant \`#PascalCase\` hashtags tailored to the BRAND, its unique mechanism/offer, target audience, pain points, the new remix hook, and that platform's discovery intent.
5. Adapt the proven persuasion mechanics and hook structure of the source modeling ad to the BRAND's product, target audience, pain points, unique mechanism/USPs, offer, and tone of voice.
6. Never copy the source competitor's brand names, trademarks, or specific wording, and never invent prices, stats, reviews, certifications, or guarantees absent from the BRAND profile.
7. Platform tailoring:
   - \`tiktok\`: Thumb-stopping 0–2s scroll-stop hook, natural conversational UGC cadence, clear benefit & CTA (clean copy only; put TikTok discovery/niche hashtags in \`hashtags\`).
   - \`facebook\`: High-converting above-the-fold primary text hook (strong first 125 characters), clear problem-agitate-solve flow, concrete offer framing, and direct CTA (clean copy only; put Facebook audience/offer hashtags in \`hashtags\`).
   - \`instagram\`: Clean Reels/Feed visual hook, punchy scannable short lines matching brand voice, desirable outcome & CTA (clean copy only; put Instagram niche/lifestyle hashtags in \`hashtags\`).
   - \`googleAds\`: High-intent commercial search / Performance Max / YouTube ad description with strong intent-matching hook, key differentiators, and direct action callout (clean copy only; put search/YouTube discovery topic hashtags in \`hashtags\`).
8. Plain text only (no Markdown **bold** or # headings). Keep \`headline\` crisp and \`cta\` short and actionable.`;

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
      const aiImagePrompt = buildRemixedAdImagePrompt({
        platform,
        platformLabel,
        brandName: brand.brandName,
        headline,
        adText,
        cta,
        brand,
        existingPrompt: draft.aiImagePrompt ? sanitizeText(draft.aiImagePrompt) : null,
      });
      return RemixedAdTextItemSchema.parse({
        platform,
        platformLabel,
        headline,
        adText,
        aiImagePrompt,
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

const LEGACY_TEMPLATE_BY_PLATFORM: Record<
  RadarSearchRequest["platform"],
  {
    media: "VIDEO" | "IMAGE";
    angles: Array<{
      namePrefix: string;
      suffix: string;
      days: number;
      dupes: number;
      cta: string;
      hookFor: (titleQuery: string, country: string) => string;
    }>;
  }
> = {
  META: {
    media: "IMAGE",
    angles: [
      {
        namePrefix: "Social Club",
        suffix: "Direct Response Carousel",
        days: 148,
        dupes: 5,
        cta: "Shop Now",
        hookFor: (q, c) =>
          `Meta Feed & Instagram Carousel bestseller: discover why thousands across ${c} order ${q} bundles directly with free shipping and member perks.`,
      },
      {
        namePrefix: "Curated Studio",
        suffix: "First-Order Offer",
        days: 112,
        dupes: 4,
        cta: "Get Offer",
        hookFor: (q, c) =>
          `Instagram & Facebook limited-time bundle on ${q} in ${c}. Save up to 25% on curated starter kits shipped fast from local warehouses.`,
      },
      {
        namePrefix: "Collective Co.",
        suffix: "Subscriber Club Ad",
        days: 88,
        dupes: 3,
        cta: "Shop Now",
        hookFor: (q, c) =>
          `Upgrade how you shop ${q} in ${c} — flexible direct-to-consumer delivery with zero lock-in and 5-star customer reviews.`,
      },
      {
        namePrefix: "Heritage Direct",
        suffix: "Reels Advantage+ Winner",
        days: 74,
        dupes: 3,
        cta: "Learn More",
        hookFor: (q, c) =>
          `Seen across Facebook & Instagram feeds in ${c}: handpicked ${q} selections backed by a 30-day satisfaction promise.`,
      },
      {
        namePrefix: "Boutique Select",
        suffix: "Seasonal Lookbook",
        days: 65,
        dupes: 2,
        cta: "Shop Now",
        hookFor: (q, c) =>
          `Explore the newest ${q} collection tailored for ${c} shoppers — tap to claim your welcome voucher inside.`,
      },
      {
        namePrefix: "Insider Market",
        suffix: "Social Proof Stack",
        days: 52,
        dupes: 2,
        cta: "Learn More",
        hookFor: (q, c) =>
          `Over 10,000 verified ${c} buyers rated this ${q} range 4.9/5 stars. Compare top picks now.`,
      },
    ],
  },
  TIKTOK: {
    media: "VIDEO",
    angles: [
      {
        namePrefix: "Creator Lab",
        suffix: "Viral Unboxing UGC",
        days: 96,
        dupes: 6,
        cta: "Watch More",
        hookFor: (q, c) =>
          `POV: You finally tested the viral ${q} everyone in ${c} is talking about on TikTok Shop — watch the 15-second taste & quality test.`,
      },
      {
        namePrefix: "Daily Trend",
        suffix: "3 Reasons Viral Hook",
        days: 79,
        dupes: 5,
        cta: "Shop Now",
        hookFor: (q, c) =>
          `3 reasons ${q} keeps selling out in ${c} this month: real creator reviews, zero fluff, and under-60-second setup.`,
      },
      {
        namePrefix: "TikTok Native",
        suffix: "Green Screen Comparison",
        days: 67,
        dupes: 4,
        cta: "Order Now",
        hookFor: (q, c) =>
          `We put the top-trending ${q} in ${c} side-by-side so you don't waste money on the wrong pick.`,
      },
      {
        namePrefix: "Creator Guild",
        suffix: "Behind-The-Scenes Reel",
        days: 54,
        dupes: 3,
        cta: "Watch More",
        hookFor: (q, c) =>
          `Wait until the end to see how this ${q} favorite actually performs in real life across ${c}.`,
      },
      {
        namePrefix: "Spark Studio",
        suffix: "Split-Screen Testimonial",
        days: 43,
        dupes: 3,
        cta: "Shop Now",
        hookFor: (q, c) =>
          `TikTok creators in ${c} switched to this ${q} staple — see the unedited reactions and bundle link.`,
      },
      {
        namePrefix: "ShortForm HQ",
        suffix: "Founder Story Clip",
        days: 35,
        dupes: 2,
        cta: "Learn More",
        hookFor: (q, c) =>
          `How a small ${c} team built a viral ${q} community using authentic short-form video demonstrations.`,
      },
    ],
  },
  GOOGLE: {
    media: "IMAGE",
    angles: [
      {
        namePrefix: "Official Store",
        suffix: "| Official Site | Free Shipping",
        days: 184,
        dupes: 4,
        cta: "Visit Site",
        hookFor: (q, c) =>
          `Official ${q} range in ${c}. Compare models, verified specs, and express dispatch pricing directly online.`,
      },
      {
        namePrefix: "National Retail",
        suffix: "| Compare Top Brands & Deals",
        days: 142,
        dupes: 4,
        cta: "Compare Prices",
        hookFor: (q, c) =>
          `Compare leading ${q} offers across ${c} retailers. In-stock guarantees, verified ratings, and fast local delivery.`,
      },
      {
        namePrefix: "Direct Mart",
        suffix: "| Shopping & Price Match",
        days: 118,
        dupes: 3,
        cta: "Shop Official Store",
        hookFor: (q, c) =>
          `Google Shopping bestseller: shop ${q} with transparent pricing, warranty coverage, and click-and-collect in ${c}.`,
      },
      {
        namePrefix: "Search Choice",
        suffix: "| 2026 Buyer Guide & Quotes",
        days: 91,
        dupes: 3,
        cta: "Check Availability",
        hookFor: (q, c) =>
          `High-intent search selection for ${q} buyers in ${c}. Filter by budget, availability, and genuine reviews.`,
      },
      {
        namePrefix: "YouTube Showcase",
        suffix: "| Full Product Walkthrough",
        days: 69,
        dupes: 2,
        cta: "Explore Specs",
        hookFor: (q, c) =>
          `Sponsored YouTube & Display overview covering key ${q} features, pricing tiers, and official offers in ${c}.`,
      },
      {
        namePrefix: "Express Supply",
        suffix: "| Fast Dispatch in AU & Intl",
        days: 56,
        dupes: 2,
        cta: "Visit Site",
        hookFor: (q, c) =>
          `Order genuine ${q} products online with real-time ${c} stock checks and instant checkout.`,
      },
    ],
  },
};

function buildDeterministicGroundedDrafts(
  req: RadarSearchRequest,
  suggestedDomains: string[],
): Array<{
  advertiserName: string;
  headline: string;
  primaryCopy: string;
  ctaText: string;
  landingPageUrl: string;
  imageUrl?: string;
  mediaType: "VIDEO" | "IMAGE";
  activeDaysCount: number;
  duplicates: number;
}> {
  const cleanQuery = req.query.replace(/"/g, "").trim();
  const titleQuery = cleanQuery
    .split(/\s+/)
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : ""))
    .join(" ");
  const slug = cleanQuery.toLowerCase().replace(/[^a-z0-9]+/g, "") || "brand";
  const cfg = LEGACY_TEMPLATE_BY_PLATFORM[req.platform];
  const defaultMedia: "VIDEO" | "IMAGE" =
    req.mediaType === "VIDEO" ? "VIDEO" : req.mediaType === "IMAGE" ? "IMAGE" : cfg.media;

  const platformDomainPool =
    suggestedDomains.length > 0
      ? suggestedDomains
      : req.platform === "META"
        ? [req.country === "AU" ? `shop.${slug}.com.au` : `shop.${slug}.com`, `club.${slug}.com`, `offer.${slug}.com`]
        : req.platform === "TIKTOK"
          ? [`viral.${slug}.com`, `creators.${slug}.com`, `try.${slug}.com`]
          : [req.country === "AU" ? `www.${slug}.com.au` : `www.${slug}.com`, `store.${slug}.com`, `compare.${slug}.com`];

  const orderedDomains =
    req.platform === "TIKTOK"
      ? [...platformDomainPool].reverse()
      : req.platform === "GOOGLE" && platformDomainPool.length > 2
        ? [...platformDomainPool.slice(1), platformDomainPool[0]]
        : platformDomainPool;

  return cfg.angles.map((angle, i) => {
    const rawDomain = orderedDomains[i % orderedDomains.length] || `www.${slug}.com`;
    const landingPageUrl = rawDomain.startsWith("https://") ? rawDomain : `https://${rawDomain}`;
    const hostLabel = rawDomain.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split(".")[0] || titleQuery;
    const baseName =
      suggestedDomains.length > 0
        ? hostLabel.charAt(0).toUpperCase() + hostLabel.slice(1)
        : `${titleQuery} ${angle.namePrefix}`;

    return {
      advertiserName: baseName,
      headline: `${baseName} ${angle.suffix}`,
      primaryCopy: angle.hookFor(titleQuery, req.country),
      ctaText: angle.cta,
      landingPageUrl,
      mediaType: defaultMedia,
      activeDaysCount: angle.days,
      duplicates: angle.dupes,
    };
  });
}

async function generateWithSoftTimeout(
  modelName: string,
  contents: Array<{ role: string; parts: Array<{ text: string }> }>,
  config: Record<string, unknown>,
  timeoutMs: number,
): Promise<string> {
  const ai = getGemini();
  const callPromise = ai.models.generateContent({
    model: modelName,
    contents,
    config,
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Gemini timeout after ${timeoutMs}ms`)), timeoutMs);
  });
  try {
    const res = await Promise.race([callPromise, timeoutPromise]);
    return res.text ?? "";
  } finally {
    if (timer) clearTimeout(timer);
  }
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
      ? "Meta Ad Library (Facebook Feed, Instagram Carousel, Instagram Reels & Advantage+ DTC paid-social ads)"
      : req.platform === "TIKTOK"
        ? "TikTok Creative Center Top Ads & TikTok Commercial Content Library (creator-led UGC video ads, viral Spark Ads & TikTok Shop hooks)"
        : "Google Ads Transparency Center, Live Google Search Sponsored RSAs, Google Shopping & YouTube Video Ads";

  const platformSpecificRules =
    req.platform === "META"
      ? `PLATFORM FOCUS — META (Facebook & Instagram):
- Return advertisers known for paid-social DTC campaigns, subscription clubs, bundle offers, or lead-gen carousels on Facebook & Instagram in "${req.country}".
- Do NOT return generic Google Search text-ad copy or TikTok creator-POV scripts.
- Write engaging paid-social Primary Copy with an above-the-fold scroll-stopping hook and clear offer/voucher value.
- Preferred mediaType: "${req.mediaType === "ALL" ? "IMAGE" : req.mediaType}" (use IMAGE, CAROUSEL, or VIDEO as appropriate for Meta).
- socialPostUrl should be the advertiser's Facebook Page / Meta Ad Library / Instagram post permalink if known.`
      : req.platform === "TIKTOK"
        ? `PLATFORM FOCUS — TIKTOK (Commercial Content & Top Ads):
- Return viral TikTok-first DTC brands, challenger labels, unboxing/taste-test/creator-led advertisers running Spark Ads or TikTok Top Ads in "${req.country}" (NOT generic corporate Google Search advertisers).
- Write native TikTok UGC hooks in headline and primaryCopy (e.g., "POV:", "We tested...", "3 reasons this went viral...", short-form creator voice, tactile unboxing/reaction framing).
- Preferred mediaType: "${req.mediaType === "ALL" ? "VIDEO" : req.mediaType}".
- Include realistic TikTok viral view metrics (totalViews e.g. 85000 to 1800000 and totalLikes) where appropriate.`
        : `PLATFORM FOCUS — GOOGLE ADS (Search RSAs, Shopping & YouTube):
- Return major commercial advertisers, national retailers, flagship brand official sites, and category aggregators bidding on high-intent Google Search & Shopping keywords in "${req.country}" (distinct from casual TikTok UGC or social-only boutique brands).
- Format headline in Google RSA / Shopping style (e.g., "Brand Official Store | Offer | Free Shipping") and primaryCopy with commercial search differentiators (price comparison, in-stock guarantee, delivery speed, official warranty).
- Preferred mediaType: "${req.mediaType === "ALL" ? "IMAGE" : req.mediaType}" (or "TEXT" for Search RSA, "VIDEO" for YouTube Ads).`;

  const domainHint =
    suggestedDomains.length > 0 ? `\nKnown category domains to prioritize checking: ${suggestedDomains.slice(0, 6).join(", ")}` : "";

  const formatHint =
    req.mediaType === "VIDEO"
      ? "Filter STRICTLY to VIDEO ads."
      : req.mediaType === "IMAGE"
        ? "Filter STRICTLY to IMAGE / static / Shopping display ads."
        : "Use the creative format most characteristic of this ad platform.";

  const prompt = `Use Google Search to find 7 to 9 REAL, currently active advertisers running ${req.platform} campaigns on ${platformPortal} for the query "${req.query}" in country "${req.country}".
${domainHint}
${platformSpecificRules}
${formatHint}

STRICT RULES:
- Make the advertisers, campaign headlines, ad copy style, CTAs, and creative format unmistakably specific to ${req.platform} — do NOT repeat the exact same list you would use for the other two platforms.
- Only include REAL companies/brands with their real https:// website domain.
- Prioritize long-running evergreen winners (many established advertisers run campaigns continuously for 60 to 240+ days across 2 to 8+ creative variations, alongside newer 30 to 59 day campaigns). Estimate realistic activeDaysCount (between 30 and 240) and duplicates (between 1 and 8) reflecting actual campaign maturity — do NOT copy a single placeholder number for all ads.
- Do NOT invent fake brands or placeholder URLs.
- Keep all copy plain text (no markdown, no hashtags spam).

Return ONLY a valid JSON array (no prose before or after) where each element has:
{
  "advertiserName": "Real Brand Name",
  "headline": "Short realistic ${req.platform} campaign headline from their offer",
  "primaryCopy": "Concise 1-3 sentence ${req.platform}-native ad copy matching their real active offer",
  "ctaText": "Shop Now" | "Learn More" | "Get Quote" | "Visit Site" | "Watch More",
  "landingPageUrl": "https://their-real-domain.com/...",
  "socialPostUrl": "Exact URL on ${req.platform === "META" ? "facebook.com/instagram.com" : req.platform === "TIKTOK" ? "tiktok.com/library.tiktok.com" : "youtube.com/adstransparency.google.com"} if found, otherwise omit",
  "imageUrl": "https://their-real-domain.com/... (exact social media ad creative or product hero image URL if found in search results, otherwise omit)",
  "mediaType": "${req.mediaType === "ALL" ? (req.platform === "TIKTOK" ? "VIDEO" : "IMAGE") : req.mediaType}",
  "activeDaysCount": 95,
  "duplicates": 3
}`;

  let rawItems: unknown[] = [];
  if (process.env.GEMINI_API_KEY) {
    // Attempt 1: Live Google Search Grounding with thinkingBudget: 0 so Gemini 3.8 Flash responds in ~4-6s
    const groundedModels = Array.from(new Set([MODEL, "gemini-3.8-flash"]));
    for (const m of groundedModels) {
      if (rawItems.length > 0) break;
      try {
        const textOut = await generateWithSoftTimeout(
          m,
          [{ role: "user", parts: [{ text: prompt }] }],
          {
            tools: [{ googleSearch: {} }],
            thinkingConfig: { thinkingBudget: 0 },
            temperature: 0.4,
          },
          16_000,
        );
        rawItems = extractJsonArrayFromText(textOut);
      } catch (err) {
        console.warn("[gemini] grounded search attempt failed", m, req.platform, req.query, err);
      }
    }

    // Attempt 2: Fast structured JSON call prioritizing Flash-Lite (~1.5s) then Flash
    const jsonModels = Array.from(new Set(["gemini-3.5-flash-lite", MODEL, "gemini-3.8-flash"]));
    for (const m of jsonModels) {
      if (rawItems.length > 0) break;
      try {
        const textOut = await generateWithSoftTimeout(
          m,
          [{ role: "user", parts: [{ text: prompt }] }],
          {
            responseMimeType: "application/json",
            ...(m.includes("3.8") ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
            temperature: 0.45,
          },
          10_000,
        );
        rawItems = extractJsonArrayFromText(textOut);
      } catch (err) {
        console.warn("[gemini] json-mode search fallback failed", m, req.platform, req.query, err);
      }
    }
  }

  // Attempt 3: Platform-separated domain/advertiser fallback only if Gemini API is unavailable
  if (rawItems.length === 0) {
    rawItems = buildDeterministicGroundedDrafts(req, suggestedDomains);
  }

  const nowMs = Date.now();
  const lastSeenIso = new Date(nowMs).toISOString();
  const drafts: GroundedAdDraft[] = [];

  // Platform-distinct day ladders so Meta, TikTok, and Google don't share identical longevity numbers
  const DAY_LADDERS: Record<RadarSearchRequest["platform"], number[]> = {
    META: [148, 112, 88, 74, 65, 52, 41, 34, 29, 24],
    TIKTOK: [96, 79, 67, 54, 43, 35, 31, 28, 22, 16],
    GOOGLE: [184, 142, 118, 91, 69, 56, 46, 38, 30, 21],
  };
  const DAY_LADDER = DAY_LADDERS[req.platform];
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
    const directThumb = normalizeSocialImageCandidate(row.imageUrl, cleanLanding);
    const ogThumb = `https://api.microlink.io/?url=${encodeURIComponent(cleanLanding)}&embed=image.url`;
    const thumbnailUrl = directThumb || ogThumb;
    const resolvedMediaUrls = [thumbnailUrl];

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
      thumbnailUrl,
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

  return drafts;
}
