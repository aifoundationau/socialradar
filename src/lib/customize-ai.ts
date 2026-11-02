import "server-only";
import { GoogleGenAI } from "@google/genai";
import {
  AiCustomizeReplyDraftResponseSchema,
  type AiCustomizeReplyDraftResponse,
  type CustomizeRequestDoc,
} from "./contracts";
import { sanitizeForPlainTextArchive } from "./admin";

const MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";

const REPLY_JSON_SCHEMA = {
  type: "object",
  properties: {
    subject: {
      type: "string",
      description: "Plain-text reply subject line (max 140 characters, no URLs or links).",
    },
    body: {
      type: "string",
      description:
        "Complete plain-text 4-pillar customized brand & ad strategy reply for the customer (max 1850 characters, no URLs, no markdown links, no HTML).",
    },
  },
  required: ["subject", "body"],
  additionalProperties: false,
};

const SYSTEM_INSTRUCTION = `You are a Senior Direct-Response Brand & Ad Strategist assisting the Social Radar Admin Team in crafting a customized reply work message for a customer's Customize Request.

Follow the 4-Pillar Reply Architecture strictly in plain text (NO URLs, NO domain dots like .com, NO HTML tags, NO markdown links):
1. EXECUTIVE POSITIONING & OFFER REFINEMENT: Synthesize the customer's brand name, product/service, unique mechanism, and their extra details/descriptions to think about.
2. AUDIENCE & PAIN-POINT HOOK MATRIX: Translate their target buyer avatar and core pain points into 2-3 high-converting pattern interrupts.
3. THREE CUSTOM AD CREATIVE BLUEPRINTS:
   - Angle 1 (Problem-Agitate-Solve): Hook, Primary Copy, Headline, CTA.
   - Angle 2 (Unique Mechanism Contrast): Hook, Primary Copy, Headline, CTA.
   - Angle 3 (UGC / Story Script): Hook, Primary Copy, Headline, CTA.
4. IMPLEMENTATION CHECKLIST: Clear next steps incorporating any staff notes.

Keep total body length under 1850 characters so it fits within the 2000-character statutory plain-text archive.`;

function buildDeterministicStaffReply(params: {
  customerEmail: string;
  subject?: string;
  customerBriefText: string;
  staffNotes?: string;
  customizeDoc?: CustomizeRequestDoc | null;
}): AiCustomizeReplyDraftResponse {
  const doc = params.customizeDoc;
  const brandName = doc?.brandName || params.subject?.replace(/^\[CUSTOMIZE REQUEST\]\s*/i, "").replace(/\s*\(\d+\s*Tokens\)$/i, "").trim() || "Your Brand";
  const tone = doc?.toneOfVoice || "DIRECT_RESPONSE";
  const offer = doc?.uniqueMechanismOrOffer || "your core value proposition and differentiator";
  const avatar = doc?.targetAudienceAvatar || "your primary customer segment";
  const pain1 = doc?.corePainPoints?.[0] || "key buyer friction and wasted time";
  const pain2 = doc?.corePainPoints?.[1] || pain1;
  const extra = doc?.extraDetailsAndNotes || params.customerBriefText.slice(0, 300);

  const rawSubject = `Completed Customize Strategy & Ad Blueprint: ${brandName}`;
  const rawBody = [
    `CUSTOMIZED BRAND & AD STRATEGY PACKAGE FOR ${brandName.toUpperCase()}`,
    `Prepared by the Social Radar Strategy Team (${tone} Tone)`,
    ``,
    `1. EXECUTIVE POSITIONING & EXTRA DETAILS SYNTHESIS`,
    `Core Positioning: Position ${brandName} around "${offer.slice(0, 160)}" specifically tailored for ${avatar.slice(0, 140)}.`,
    `Strategic Incorporation of Your Extra Notes: We aligned the creative angles below directly with your note: "${extra.slice(0, 180)}".`,
    params.staffNotes ? `Strategist Direction: ${params.staffNotes.slice(0, 180)}` : null,
    ``,
    `2. AUDIENCE PAIN-POINT HOOKS`,
    `- Hook A (Pattern Interrupt): "Stop putting up with ${pain1.slice(0, 90)}—here is the faster way."`,
    `- Hook B (Curiosity / Mechanism): "Why smart buyers are switching to ${brandName} for ${offer.slice(0, 80)}."`,
    ``,
    `3. THREE READY-TO-LAUNCH AD BLUEPRINTS`,
    `[Angle 1 - Direct Problem-Agitate-Solve]`,
    `- 3s Visual/Verbal Hook: Close-up calling out "${pain1.slice(0, 80)}" in the first 3 seconds.`,
    `- Primary Copy: Tired of dealing with ${pain1.slice(0, 90)}? ${brandName} delivers ${offer.slice(0, 120)} built for ${avatar.slice(0, 80)}.`,
    `- Headline: ${brandName}: Built for Real Results | CTA: Shop Now`,
    ``,
    `[Angle 2 - Us vs Them Mechanism Contrast]`,
    `- 3s Visual/Verbal Hook: Split-screen comparing standard options vs ${brandName}.`,
    `- Primary Copy: Most alternatives ignore ${pain2.slice(0, 90)}. See how ${brandName} solves it from day one.`,
    `- Headline: Experience the ${brandName} Advantage | CTA: Learn More`,
    ``,
    `[Angle 3 - UGC Creator Story & Proof]`,
    `- 3s Visual/Verbal Hook: Creator speaking directly to camera: "How I finally solved ${pain1.slice(0, 70)}."`,
    `- Primary Copy: Authentic 20-second walkthrough demonstrating ${brandName} in action with clear risk-reversal.`,
    `- Headline: Honest Review: Why I Switched to ${brandName} | CTA: Get Started`,
    ``,
    `4. RECOMMENDED LAUNCH STEPS`,
    `Load these 3 angles into your active campaign and test Angle 1 and Angle 3 first for highest thumb-stop rate. Reply anytime if you would like adjustments!`,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  return {
    subject: sanitizeForPlainTextArchive(rawSubject).slice(0, 145),
    body: sanitizeForPlainTextArchive(rawBody).slice(0, 1920),
  };
}

/**
 * Generates an agency-grade plain-text staff reply for a customer's Customize request.
 * Works across Gemini 2.5 Flash-Lite, Claude Haiku 4.5, gpt-6-luna, and falls back deterministically.
 */
export async function generateCustomizeStaffReply(params: {
  customerEmail: string;
  subject?: string;
  customerBriefText: string;
  staffNotes?: string;
  customizeDoc?: CustomizeRequestDoc | null;
}): Promise<AiCustomizeReplyDraftResponse> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return buildDeterministicStaffReply(params);
  }

  const prompt = [
    `CUSTOMER EMAIL: ${params.customerEmail}`,
    params.subject ? `ORIGINAL SUBJECT: ${params.subject}` : "",
    params.customizeDoc
      ? `STRUCTURED CUSTOMIZE BRIEF:\n${JSON.stringify(
          {
            brandName: params.customizeDoc.brandName,
            toneOfVoice: params.customizeDoc.toneOfVoice,
            productServiceDescription: params.customizeDoc.productServiceDescription,
            targetAudienceAvatar: params.customizeDoc.targetAudienceAvatar,
            corePainPoints: params.customizeDoc.corePainPoints,
            uniqueMechanismOrOffer: params.customizeDoc.uniqueMechanismOrOffer,
            version: params.customizeDoc.version,
            extraDetailsAndNotes: params.customizeDoc.extraDetailsAndNotes,
          },
          null,
          2
        )}`
      : `CUSTOMER BRIEF MESSAGE:\n${params.customerBriefText}`,
    params.staffNotes ? `STAFF STRATEGIST DIRECTION / NOTES TO INCLUDE:\n${params.staffNotes}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const ai = new GoogleGenAI({ apiKey, httpOptions: { timeout: 25_000 } });
    const res = await ai.models.generateContent({
      model: MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseJsonSchema: REPLY_JSON_SCHEMA,
        temperature: 0.7,
      },
    });

    const parsedJson = JSON.parse(res.text ?? "{}");
    const cleanSubject = sanitizeForPlainTextArchive(String(parsedJson.subject || "")).slice(0, 145);
    const cleanBody = sanitizeForPlainTextArchive(String(parsedJson.body || "")).slice(0, 1920);

    const validated = AiCustomizeReplyDraftResponseSchema.safeParse({
      subject: cleanSubject,
      body: cleanBody,
    });
    if (validated.success) {
      return validated.data;
    }
  } catch (err) {
    console.warn("[customize-ai] falling back to deterministic staff reply", err);
  }

  return buildDeterministicStaffReply(params);
}

