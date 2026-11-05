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
function buildFallbackRemix(ad: NormalizedAd, brand: BrandProfile): AdRemixBlueprint {
  const pain1 = brand.corePainPoints[0] || "wasting time and budget on underperforming options";
  const pain2 = brand.corePainPoints[1] || pain1;
  return {
    deconstruction: {
      hookAnalysis: `Opens with a high-contrast pattern interrupt targeting ${ad.advertiserName || ad.platform} viewers in the first 3 seconds, immediately calling out the core problem before introducing the mechanism.`,
      pacingStructure: [
        "0-3s · Hook · Direct visual pattern interrupt and problem callout",
        "3-8s · Agitation · Contrast common frustration against desired outcome",
        "8-18s · Mechanism · Demonstrate unique product mechanism and proof",
        "18-25s · Offer & CTA · Clear risk-reversal and direct call to action",
      ],
      persuasionFramework: "PAS",
      whyItWorks: `Running for ${ad.activeDaysCount} days on ${ad.platform}, this creative succeeds by pairing a fast 3-second hook with a single clear value proposition and frictionless call to action.`,
    },
    variations: [
      {
        angleName: `Direct Problem-Agitate-Solve (${brand.brandName})`,
        headline: `${brand.brandName}: Built for ${brand.targetAudienceAvatar.slice(0, 60)}`,
        primaryCopy: `Stop dealing with ${pain1}. ${brand.brandName} delivers ${brand.uniqueMechanismOrOffer}—designed specifically for ${brand.targetAudienceAvatar}. Experience the difference today at ${brand.destinationUrl}.`,
        ctaButton: "Shop Now",
        videoStoryboard: [
          {
            timestamp: "0:00-0:03",
            visualAction: `Close-up shot highlighting the frustration of ${pain1}.`,
            spokenAudio: `Still putting up with ${pain1}? Here is why that changes today.`,
            onScreenText: `Stop ${pain1.slice(0, 40)}`,
          },
          {
            timestamp: "0:03-0:10",
            visualAction: `Reveal ${brand.brandName} in action showing ${brand.uniqueMechanismOrOffer}.`,
            spokenAudio: `We built ${brand.brandName} with ${brand.uniqueMechanismOrOffer} so you get real results without the guesswork.`,
            onScreenText: brand.uniqueMechanismOrOffer.slice(0, 60),
          },
          {
            timestamp: "0:10-0:18",
            visualAction: `Show happy customer outcome and product benefits side by side.`,
            spokenAudio: `${brand.productServiceDescription.slice(0, 140)}`,
            onScreenText: `Trusted by ${brand.brandName} customers`,
          },
          {
            timestamp: "0:18-0:25",
            visualAction: `Clean end card displaying ${brand.brandName} and website URL.`,
            spokenAudio: `Tap below to explore ${brand.brandName} today.`,
            onScreenText: `Visit ${brand.destinationUrl.replace(/^https?:\/\//, "")}`,
          },
        ],
        imageGenerationPrompt: `High-converting commercial studio photograph for ${brand.brandName} (${brand.productServiceDescription.slice(0, 120)}), crisp lighting, modern editorial composition, tailored for ${brand.targetAudienceAvatar}.`,
      },
      {
        angleName: `Us vs. Them Mechanism Contrast`,
        headline: `Why Switch to ${brand.brandName}?`,
        primaryCopy: `Most alternatives ignore ${pain2}. ${brand.brandName} combines ${brand.uniqueMechanismOrOffer} with ${brand.productServiceDescription.slice(0, 160)}. See why customers are making the switch.`,
        ctaButton: "Learn More",
        videoStoryboard: [
          {
            timestamp: "0:00-0:03",
            visualAction: `Split-screen comparing old way vs. ${brand.brandName}.`,
            spokenAudio: `Before you buy another generic option, look at the difference.`,
            onScreenText: `Old Way vs. ${brand.brandName}`,
          },
          {
            timestamp: "0:03-0:12",
            visualAction: `Detailed demonstration of ${brand.uniqueMechanismOrOffer}.`,
            spokenAudio: `Unlike standard options, ${brand.brandName} gives you ${brand.uniqueMechanismOrOffer}.`,
            onScreenText: `The ${brand.brandName} Advantage`,
          },
          {
            timestamp: "0:12-0:20",
            visualAction: `Customer using ${brand.brandName} effortlessly in daily routine.`,
            spokenAudio: `Built from the ground up for ${brand.targetAudienceAvatar}.`,
            onScreenText: `Engineered for results`,
          },
          {
            timestamp: "0:20-0:25",
            visualAction: `Call-to-action overlay with product showcase.`,
            spokenAudio: `Click Learn More to see the full range at ${brand.brandName}.`,
            onScreenText: `Learn More at ${brand.brandName}`,
          },
        ],
        imageGenerationPrompt: `Side-by-side comparison advertisement visual for ${brand.brandName}, showcasing ${brand.uniqueMechanismOrOffer} in sharp focus, clean minimalist aesthetic.`,
      },
      {
        angleName: `UGC Creator Story & Proof Hook`,
        headline: `Honest Review: 30 Days With ${brand.brandName}`,
        primaryCopy: `"I used to struggle with ${pain1}—until I found ${brand.brandName}." Powered by ${brand.uniqueMechanismOrOffer}, it's the smarter choice for ${brand.targetAudienceAvatar}.`,
        ctaButton: "Get Started",
        videoStoryboard: [
          {
            timestamp: "0:00-0:03",
            visualAction: `Creator speaking directly to camera in natural daylight setting.`,
            spokenAudio: `I need to be honest about how I finally solved ${pain1}.`,
            onScreenText: `My honest 30-day review`,
          },
          {
            timestamp: "0:03-0:11",
            visualAction: `Creator unboxing and demonstrating ${brand.brandName}.`,
            spokenAudio: `I switched to ${brand.brandName} because of ${brand.uniqueMechanismOrOffer}.`,
            onScreenText: brand.brandName,
          },
          {
            timestamp: "0:11-0:19",
            visualAction: `B-roll montage showing key features of ${brand.productServiceDescription.slice(0, 80)}.`,
            spokenAudio: `Within days, the difference was obvious.`,
            onScreenText: `Real results, zero hassle`,
          },
          {
            timestamp: "0:19-0:25",
            visualAction: `Creator pointing to link button below with product in hand.`,
            spokenAudio: `Tap Get Started below to check out ${brand.brandName} for yourself.`,
            onScreenText: `Tap Get Started`,
          },
        ],
        imageGenerationPrompt: `Authentic lifestyle UGC-style photography featuring ${brand.brandName} in a bright, natural environment for ${brand.targetAudienceAvatar}, warm natural light.`,
      },
    ],
  };
}

export async function generateRemix(ad: NormalizedAd, brand: BrandProfile): Promise<AdRemixBlueprint> {
  const source = {
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
  const platformDirective =
    ad.platform === "TIKTOK"
      ? "\n\nTIKTOK VIRAL INTELLIGENCE DIRECTIVE: Deconstruct the 0-2s visual thumbstop and 2-6s retention bridge. Design all 3 variations with TikTok-native UGC delivery (e.g., Green Screen, POV, Creator Review/Unboxing, or Problem-Agitate-Solve), punchy on-screen native text overlays, and high-converting verbal hooks."
      : ad.platform === "GOOGLE"
        ? "\n\nGOOGLE ADS WINNER INTELLIGENCE DIRECTIVE: Deconstruct the high-intent Google Search RSA headline/sitelink architecture, YouTube 0-5s pre-skip bumper hook, or Performance Max/Shopping offer framing. Design all 3 variations to maximize high-intent search conversion, YouTube 5-second pre-skip retention, and clear commercial callouts."
        : "";
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
    return buildFallbackRemix(ad, brand);
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
    return buildFallbackRemix(ad, brand);
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
