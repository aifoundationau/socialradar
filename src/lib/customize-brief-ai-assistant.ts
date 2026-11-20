import "server-only";
import { GoogleGenAI } from "@google/genai";
import {
  CustomizeAiAssistResponseSchema,
  ToneOfVoiceSchema,
  sanitizeText,
  type BrandProfile,
  type CustomizeAiAssistInput,
  type CustomizeAiAssistResponse,
} from "./contracts";

const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";

const CUSTOMIZE_AI_ASSIST_JSON_SCHEMA = {
  type: "object",
  properties: {
    brandName: {
      type: "string",
      description: "Clean official brand name (1-100 chars).",
    },
    toneOfVoice: {
      type: "string",
      enum: ["DIRECT_RESPONSE", "AUTHORITATIVE", "UGC_CASUAL", "URGENT"],
      description: "Recommended tone of voice aligned with the product, audience, and offer.",
    },
    productServiceDescription: {
      type: "string",
      description:
        "Clear, persuasive 2-4 sentence description of what the product or service is, how it works, and the primary outcome (max 2000 chars).",
    },
    targetAudienceAvatar: {
      type: "string",
      description:
        "Detailed buyer persona describing who the ideal customer is, what they want, and what they have already tried (max 2000 chars).",
    },
    corePainPoints: {
      type: "array",
      minItems: 3,
      maxItems: 6,
      items: {
        type: "string",
        description: "Specific customer frustration or objection (3-280 chars).",
      },
      description: "3 to 6 high-impact customer pain points ordered by urgency.",
    },
    uniqueMechanismOrOffer: {
      type: "string",
      description:
        "Compelling articulation of the unique mechanism, differentiator, bundle, or risk-reversal offer (max 1000 chars).",
    },
    extraDetailsAndNotes: {
      type: "string",
      description:
        "Structured strategist instructions combining campaign goals, priority ad angles, creative hooks, competitor contrasts, and execution notes (max 1800 chars).",
    },
  },
  required: [
    "brandName",
    "toneOfVoice",
    "productServiceDescription",
    "targetAudienceAvatar",
    "corePainPoints",
    "uniqueMechanismOrOffer",
    "extraDetailsAndNotes",
  ],
  additionalProperties: false,
};

const SYSTEM_INSTRUCTION = `You are an Elite Direct-Response Brand Strategist helping an AdRadarHQ customer complete their "1. Complete Your Customize Brief" form for a human Ad Agent strategist.

Using the customer's 5 guided discovery answers:
1. Preserve exact factual claims (never invent fake statistics, clinical trials, or discounts not implied by the user).
2. Expand concise notes into crisp, actionable, agency-grade marketing positioning suitable for Meta, TikTok, and Google ad strategists.
3. Choose the best toneOfVoice from: DIRECT_RESPONSE, AUTHORITATIVE, UGC_CASUAL, URGENT (honoring preferredTone when not "AUTO").
4. Output 3 to 6 sharp, distinct pain points (max 280 chars each).
5. Write an actionable Extra Details & Descriptions to Think About brief incorporating their campaign goals, location context, and recommended testing priorities.

Respond strictly with valid JSON matching the provided schema.`;

function resolveTone(input: CustomizeAiAssistInput): BrandProfile["toneOfVoice"] {
  if (input.preferredTone !== "AUTO") {
    return input.preferredTone;
  }
  const combined = `${input.whatYouSell} ${input.strategistGoalsAndNotes}`.toLowerCase();
  if (/\b(ugc|tiktok|creator|organic|casual|influencer)\b/.test(combined)) {
    return "UGC_CASUAL";
  }
  if (/\b(b2b|clinic|doctor|legal|finance|consulting|enterprise|authority)\b/.test(combined)) {
    return "AUTHORITATIVE";
  }
  if (/\b(flash|urgent|limited|deadline|today|closing|last chance)\b/.test(combined)) {
    return "URGENT";
  }
  return "DIRECT_RESPONSE";
}

function extractPainPoints(rawPains: string, brandName: string, productHint: string): string[] {
  const parts = rawPains
    .split(/[\n;|]+/)
    .map((s) => sanitizeText(s).replace(/^[-*•\d.)\s]+/, "").trim())
    .filter((s) => s.length >= 3)
    .map((s) => s.slice(0, 280));

  const unique: string[] = [];
  for (const item of parts) {
    if (!unique.some((u) => u.toLowerCase() === item.toLowerCase())) {
      unique.push(item);
    }
    if (unique.length >= 6) break;
  }

  const defaults = [
    `Existing alternatives fail to solve the core problem behind ${productHint.slice(0, 90)}`,
    `Wasted budget and time on generic offers before finding ${brandName}`,
    `Uncertainty about results without a clear guarantee or proof of value`,
  ];
  for (const fallback of defaults) {
    if (unique.length >= 3) break;
    unique.push(fallback.slice(0, 280));
  }

  return unique.slice(0, 10);
}

/**
 * Deterministic multi-model fallback that converts the user's guided interview answers
 * into a complete 10-field Customize brief if live AI is unavailable or offline.
 */
export function buildDeterministicCustomizeBrief(
  input: CustomizeAiAssistInput,
): CustomizeAiAssistResponse {
  const brandName = sanitizeText(input.brandNameHint).slice(0, 100) || "Your Brand";
  const toneOfVoice = resolveTone(input);
  const locationLabel =
    sanitizeText(input.location.label || "") ||
    `${input.location.suburb}, ${input.location.state}, ${input.location.country}`;

  const productServiceDescription = sanitizeText(
    `${brandName}: ${input.whatYouSell.trim()}. Positioned to convert high-intent buyers directly via ${input.landingPageUrls[0]}.`,
  ).slice(0, 2000);

  const targetAudienceAvatar = sanitizeText(
    `Ideal customers seeking ${brandName}: ${input.idealCustomerAndPains.trim()}. They want a reliable, straightforward solution they can trust without complicated onboarding or wasted spend.`,
  ).slice(0, 2000);

  const corePainPoints = extractPainPoints(
    input.idealCustomerAndPains,
    brandName,
    input.whatYouSell,
  );

  const uniqueMechanismOrOffer = sanitizeText(input.uniqueOfferOrMechanism).slice(0, 1000);

  const extraDetailsAndNotes = sanitizeText(
    [
      `STRATEGIST CAMPAIGN BRIEF (${brandName} · ${toneOfVoice}):`,
      `- Primary Goal & Creative Direction: ${input.strategistGoalsAndNotes.trim()}`,
      `- Target Market & Closest Ad Agent Context: Customer operating from ${locationLabel}.`,
      `- Priority Testing Angles: Lead with the sharpest pain point ("${corePainPoints[0]?.slice(0, 120)}") in the first 3 seconds, then contrast against competitors using ${uniqueMechanismOrOffer.slice(0, 160)}.`,
      input.versionHint ? `- Campaign / Version Focus: ${input.versionHint.trim()}` : null,
      `- Destination Priority: Direct traffic primarily to ${input.landingPageUrls[0]}.`,
    ]
      .filter((line): line is string => Boolean(line))
      .join("\n"),
  ).slice(0, 2000);

  return {
    brandName,
    toneOfVoice,
    productServiceDescription,
    targetAudienceAvatar,
    corePainPoints,
    uniqueMechanismOrOffer,
    destinationUrl: input.landingPageUrls[0],
    landingPageUrls: input.landingPageUrls,
    ...(input.versionHint?.trim() ? { version: input.versionHint.trim().slice(0, 50) } : {}),
    customerLocation: {
      ...input.location,
      label: locationLabel.slice(0, 200),
    },
    extraDetailsAndNotes,
    isFallback: true,
  };
}

/**
 * Generates a structured 10-field Customize brief from the user's guided 5-question interview.
 * Compatible across Gemini 3.5 Flash-Lite, Claude Haiku 4.5, gpt-6-luna, and pinned Gemini 3.8 Flash.
 */
export async function generateCustomizeBriefWithAi(
  input: CustomizeAiAssistInput,
): Promise<CustomizeAiAssistResponse> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return buildDeterministicCustomizeBrief(input);
  }

  const locationLabel =
    sanitizeText(input.location.label || "") ||
    `${input.location.suburb}, ${input.location.state}, ${input.location.country}`;

  const prompt = [
    `BRAND NAME HINT: ${input.brandNameHint}`,
    `PREFERRED TONE: ${input.preferredTone}`,
    `WHAT THEY SELL (PRODUCT OR SERVICE): ${input.whatYouSell}`,
    `IDEAL CUSTOMER & PAIN POINTS: ${input.idealCustomerAndPains}`,
    `UNIQUE MECHANISM OR OFFER: ${input.uniqueOfferOrMechanism}`,
    `LANDING PAGE URLS: ${input.landingPageUrls.join(", ")}`,
    input.versionHint ? `VERSION / CAMPAIGN TAG: ${input.versionHint}` : "",
    `CUSTOMER LOCATION: ${locationLabel}`,
    `CAMPAIGN GOALS & EXTRA DETAILS FOR AD AGENT STRATEGIST: ${input.strategistGoalsAndNotes}`,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const ai = new GoogleGenAI({ apiKey, httpOptions: { timeout: 25_000 } });
    const res = await ai.models.generateContent({
      model: MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseJsonSchema: CUSTOMIZE_AI_ASSIST_JSON_SCHEMA,
        temperature: 0.6,
      },
    });

    const parsed = JSON.parse(res.text ?? "{}") as Record<string, unknown>;
    const toneCandidate = ToneOfVoiceSchema.safeParse(parsed.toneOfVoice);
    const resolvedTone = toneCandidate.success ? toneCandidate.data : resolveTone(input);
    const rawPains = Array.isArray(parsed.corePainPoints)
      ? parsed.corePainPoints
          .map((p) => sanitizeText(String(p || "")).slice(0, 300))
          .filter(Boolean)
          .slice(0, 10)
      : [];

    const candidate: CustomizeAiAssistResponse = {
      brandName:
        sanitizeText(String(parsed.brandName || input.brandNameHint)).slice(0, 100) ||
        input.brandNameHint,
      toneOfVoice: resolvedTone,
      productServiceDescription: sanitizeText(
        String(parsed.productServiceDescription || input.whatYouSell),
      ).slice(0, 2000),
      targetAudienceAvatar: sanitizeText(
        String(parsed.targetAudienceAvatar || input.idealCustomerAndPains),
      ).slice(0, 2000),
      corePainPoints:
        rawPains.length >= 1
          ? rawPains
          : extractPainPoints(input.idealCustomerAndPains, input.brandNameHint, input.whatYouSell),
      uniqueMechanismOrOffer: sanitizeText(
        String(parsed.uniqueMechanismOrOffer || input.uniqueOfferOrMechanism),
      ).slice(0, 1000),
      destinationUrl: input.landingPageUrls[0],
      landingPageUrls: input.landingPageUrls,
      ...(input.versionHint?.trim() ? { version: input.versionHint.trim().slice(0, 50) } : {}),
      customerLocation: {
        ...input.location,
        label: locationLabel.slice(0, 200),
      },
      extraDetailsAndNotes: sanitizeText(
        String(parsed.extraDetailsAndNotes || input.strategistGoalsAndNotes),
      ).slice(0, 2000),
      isFallback: false,
    };

    const validated = CustomizeAiAssistResponseSchema.safeParse(candidate);
    if (validated.success) {
      return validated.data;
    }
  } catch (err) {
    console.warn("[customize-brief-ai-assistant] falling back to deterministic brief", err);
  }

  return buildDeterministicCustomizeBrief(input);
}
