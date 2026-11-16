import "server-only";
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
  type RemixedAdTextItem,
  type RemixDoc,
} from "./contracts";
import { UpstreamError } from "./token-ledger";

/** Override with GEMINI_MODEL; the default alias tracks Google's current Flash model. */
const MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";
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

const AD_TEXT_SYSTEM_INSTRUCTION = `You are a senior paid social and search direct-response copywriter. Using the BRAND profile, the SOURCE MODELING AD (and its creative deconstruction when provided), write exactly 4 ready-to-publish remixed text ad descriptions — one each for TikTok, Facebook, Instagram, and Google Ads.

Strict platform & quality rules:
1. HARD LENGTH CAP: Every single \`adText\` MUST be 150 words or fewer (target 60–130 words; never exceed 150 words).
2. Adapt the proven persuasion mechanics and hook structure of the source modeling ad to the BRAND's product, target audience, pain points, unique mechanism/USPs, offer, and tone of voice.
3. Never copy the source competitor's brand names, trademarks, or specific wording, and never invent prices, stats, reviews, certifications, or guarantees absent from the BRAND profile.
4. Platform tailoring:
   - \`tiktok\`: Thumb-stopping 0–2s scroll-stop hook, natural conversational UGC cadence, clear benefit & CTA, plus 3–5 niche hashtags at the end.
   - \`facebook\`: High-converting above-the-fold primary text hook (strong first 125 characters), clear problem-agitate-solve flow, concrete offer framing, and direct CTA.
   - \`instagram\`: Clean Reels/Feed visual hook, punchy scannable short lines matching brand voice, desirable outcome & CTA, plus 3–5 targeted hashtags at the end.
   - \`googleAds\`: High-intent commercial search / Performance Max / YouTube ad description with strong intent-matching hook, key differentiators, and direct action callout.
5. Plain text only (no Markdown **bold** or # headings). Keep \`headline\` crisp and \`cta\` short and actionable.`;

/** Strips markdown/control chars and clamps an AI-generated ad text description strictly to <= 150 words. */
export function enforceMaxAdWords(
  rawText: string,
  maxWords = MAX_AD_TEXT_WORDS,
): { adText: string; wordCount: number } {
  const normalized = rawText
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
      const { adText, wordCount } = enforceMaxAdWords(draft.adText, MAX_AD_TEXT_WORDS);
      return RemixedAdTextItemSchema.parse({
        platform,
        platformLabel,
        headline: sanitizeText(draft.headline).slice(0, 160),
        adText,
        cta: sanitizeText(draft.cta).slice(0, 80),
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
