import "server-only";
import { GoogleGenAI, type Part } from "@google/genai";
import { z } from "zod";
import { AdRemixBlueprintSchema, type AdRemixBlueprint, type BrandProfile, type NormalizedAd } from "./contracts";
import { UpstreamError } from "./token-ledger";

/** Override with GEMINI_MODEL; the default alias tracks Google's current Flash model. */
const MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";
/** Inline media limit, kept well under Gemini's 20 MB request cap once base64-encoded. */
const MAX_INLINE_BYTES = 12 * 1024 * 1024;

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

/** Deconstructs `ad` and writes three variations for `brand`. Throws UpstreamError on any failure. */
export async function generateRemix(ad: NormalizedAd, brand: BrandProfile): Promise<AdRemixBlueprint> {
  const source = {
    platform: ad.platform,
    advertiser: ad.advertiserName,
    format: ad.mediaType,
    daysActive: ad.activeDaysCount,
    headline: ad.headline,
    primaryCopy: ad.primaryCopy,
    callToAction: ad.ctaText,
    landingPage: ad.landingPageUrl,
  };
  const media = await mediaPart(ad);
  const parts: Part[] = [
    { text: `SOURCE AD${media ? " (its creative is attached)" : " (creative unavailable; work from the copy)"}:\n${JSON.stringify(source, null, 2)}` },
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
    throw new UpstreamError("The AI remix failed. Please try again.");
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
    const bytes = Buffer.from(await res.arrayBuffer());
    return bytes.byteLength <= MAX_INLINE_BYTES ? { mimeType, data: bytes.toString("base64") } : null;
  } catch {
    return null;
  }
}
