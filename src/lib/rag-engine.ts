import "server-only";
import { randomBytes } from "node:crypto";
import { GoogleGenAI } from "@google/genai";
import { db } from "./firebase-admin";
import { ApiError } from "./api";
import { getFaqs, createFaq } from "./faqs";
import { SUPPORTED_RAG_LANGUAGES, getRagLanguageMeta } from "./rag-languages";
import type {
  CreateRagEntryRequest,
  FaqItem,
  RagSentenceItem,
  RagSourceType,
  RbacRole,
  UpdateRagEntryRequest,
} from "./contracts";

/** Legacy store: all custom entries in one array. Still read for existing data; no longer written to. */
const RAG_CORPUS_DOC_PATH = "system_config/rag_corpus";
/** One document per human-edited / admin-authored entry (avoids the 1 MiB single-document limit). */
const RAG_ENTRIES_COL = "rag_custom_entries";

/** ragIds can carry user-supplied language codes, so map them to safe Firestore document ids. */
const ragDocId = (ragId: string) => ragId.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 150) || "rag_entry";

/**
 * Who the corpus is for:
 * - "public": signed-out / unauthenticated FAQ reader (approved WEBSITE_UI & enabled FAQ only, emails redacted)
 * - "registered": registered non-approver user in Admin Panel (approved corpus + their own pending submissions)
 * - "approver": Ad Agent with approve permission (approved corpus + all pending submissions for review)
 * - "admin": Main Admin / Super Admin (full corpus + live harvested AI works + all pending submissions)
 */
export type RagAudience = "public" | "registered" | "approver" | "admin";

/** Normalizes unicode, outer whitespace, and collapsed internal spaces when comparing translations. */
export function normalizeRagComparisonText(s: string): string {
  return s.normalize("NFKC").trim().replace(/\s+/g, " ");
}

/**
 * Enforces mandatory human editing before any translation can enter the pending queue or RAG corpus.
 * Rejects empty translations, untranslated copies matching the source text, and raw Google Translate outputs.
 */
async function assertHumanEditedTranslation(params: {
  originalText: string;
  translatedText: string;
  languageCode: string;
  autoTranslatedText?: string;
}): Promise<void> {
  const normTranslated = normalizeRagComparisonText(params.translatedText);
  if (!normTranslated) {
    throw new ApiError("INVALID_INPUT", "Translated text is required.", 400);
  }
  if (params.languageCode.toLowerCase() !== "en") {
    const normOrig = params.originalText.trim()
      ? normalizeRagComparisonText(params.originalText)
      : "";
    if (normOrig && normTranslated === normOrig) {
      throw new ApiError(
        "INVALID_INPUT",
        "Translation must be translated and human-edited rather than matching the original source text.",
        400,
      );
    }
    const normAuto = params.autoTranslatedText?.trim()
      ? normalizeRagComparisonText(params.autoTranslatedText)
      : "";
    if (normAuto && normTranslated === normAuto) {
      throw new ApiError(
        "INVALID_INPUT",
        "Registered users must edit a translation, not simply use auto translation, for the translation to store in the RAG.",
        400,
      );
    }
    if (params.originalText.trim()) {
      const autoCheck = await translateWithGoogleTranslator({
        text: params.originalText,
        sourceLang: "en",
        targetLang: params.languageCode,
      }).catch(() => null);
      if (
        autoCheck?.translatedText &&
        normalizeRagComparisonText(autoCheck.translatedText) === normTranslated
      ) {
        throw new ApiError(
          "INVALID_INPUT",
          "Registered users must edit a translation, not simply use auto translation, for the translation to store in the RAG.",
          400,
        );
      }
    }
  }
}

const STOP_WORDS = new Set([
  "the", "and", "for", "that", "this", "with", "from", "your", "are", "you",
  "can", "will", "into", "our", "all", "any", "not", "have", "has", "was",
  "were", "they", "their", "what", "when", "where", "which", "who", "how",
  "why", "use", "used", "using", "each", "more", "than", "also", "only",
]);

export function extractRagKeywords(text: string, extra?: string): string[] {
  const combined = `${extra ?? ""} ${text}`.toLowerCase();
  const tokens = combined
    .replace(/[^\p{L}\p{N}\s+-]/gu, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !STOP_WORDS.has(t));
  return Array.from(new Set(tokens)).slice(0, 35);
}

export function splitIntoSentences(text: string): string[] {
  if (!text) return [];
  const cleaned = text
    .replace(/\r\n/g, "\n")
    .split(/\n+/)
    .flatMap((line) =>
      line
        .replace(/^[•\-*]\s*/, "")
        .split(/(?<=[.!?])\s+(?=[A-Z0-9"“'(\[])/)
    )
    .map((s) => s.trim())
    .filter((s) => s.length >= 12);
  return Array.from(new Set(cleaned));
}

/**
 * Complete baseline catalog of all UI & functional sentences used across the AdRadarHQ website.
 */
export const WEBSITE_UI_SENTENCES: Array<{
  id: string;
  section: string;
  sentence: string;
}> = [
  // Header & Navigation
  {
    id: "web_nav_01",
    section: "Website UI: Header & Navigation",
    sentence: "AdRadarHQ — Real-time Competitor Ad Intelligence across Meta, TikTok, and Google.",
  },
  {
    id: "web_nav_02",
    section: "Website UI: Header & Navigation",
    sentence: "Navigate seamlessly between Radar Feed, My Brands, Customize Brand Strategy, Wallet, and Frequently Asked Questions.",
  },
  {
    id: "web_nav_03",
    section: "Website UI: Header & Navigation",
    sentence: "Super Admin can simulate and preview the platform as Main Admin or Supporter with a one-click Return to Super Admin banner.",
  },
  // Radar Search Bar & Filter Tooltips
  {
    id: "web_radar_01",
    section: "Website UI: Radar Search & Filter Bar",
    sentence: "Search winning ads by brand, keyword, or product niche across Meta Ad Library, TikTok Commercial Content Library, and Google Ads Transparency Center.",
  },
  {
    id: "web_radar_02",
    section: "Website UI: Radar Search & Filter Bar",
    sentence: "Base Radar Search queries live ad libraries for active competitor creatives matching your exact keyword and target country.",
  },
  {
    id: "web_radar_03",
    section: "Website UI: Radar Search & Filter Bar",
    sentence: "Proven (28+d) isolates profitable ads running continuously for 28 days or longer, filtering out short-lived split tests.",
  },
  {
    id: "web_radar_04",
    section: "Website UI: Radar Search & Filter Bar",
    sentence: "Extended (60+d) uncovers evergreen flagship winners running continuously for over two months without creative fatigue.",
  },
  {
    id: "web_radar_05",
    section: "Website UI: Radar Search & Filter Bar",
    sentence: "Top Winners (90%+) filters for the elite top 1% of category-dominating ads ranked by longevity, view velocity, and active collation scaling.",
  },
  {
    id: "web_radar_06",
    section: "Website UI: Radar Search & Filter Bar",
    sentence: "Strict Platform Isolation guarantees that selecting Meta returns only Meta ads, TikTok returns only TikTok ads, and Google returns only Google and YouTube ads.",
  },
  {
    id: "web_radar_07",
    section: "Website UI: Radar Search & Filter Bar",
    sentence: "Click any of the 24 most-searched trending consumer categories on the Radar home view to launch instant one-click competitor research.",
  },
  // AI Creative Remix Studio & Variation Editor
  {
    id: "web_remix_01",
    section: "Website UI: AI Creative Remix Studio",
    sentence: "Click 'Model this ad' on any winning competitor creative to deconstruct its Persuasion DNA and generate three tailored script variations.",
  },
  {
    id: "web_remix_02",
    section: "Website UI: AI Creative Remix Studio",
    sentence: "Variation tabs A: The Symptomatic Ad Fatigue Callout, B: The Creative Burnout Trap, and C: The Competitor Blindspot sit on one clean line above the brand metadata badges.",
  },
  {
    id: "web_remix_03",
    section: "Website UI: AI Creative Remix Studio",
    sentence: "Each variation delivers a custom headline, call-to-action button, primary ad copy, shot-by-shot video storyboard with spoken voiceover and on-screen text, and an AI image generation prompt.",
  },
  {
    id: "web_remix_04",
    section: "Website UI: AI Creative Remix Studio",
    sentence: "Copy the complete variation script to your clipboard or export a structured CSV spreadsheet for your video editors and UGC creators.",
  },
  // My Brands & Brand Profile Modal
  {
    id: "web_brands_01",
    section: "Website UI: My Brands & Brand Modal",
    sentence: "Create your first brand profile in the centered, zero-scroll responsive modal to personalize all AI Creative Remixes and Customize briefs.",
  },
  {
    id: "web_brands_02",
    section: "Website UI: My Brands & Brand Modal",
    sentence: "Store your brand name, tone of voice, product or service description, target audience avatar, core customer pain points, unique mechanism or offer, and destination landing page URLs.",
  },
  {
    id: "web_brands_03",
    section: "Website UI: My Brands & Brand Modal",
    sentence: "Enable Community Discovery to share your brand card in the global catalog or keep it private to your authenticated workspace.",
  },
  // Customize Brand Strategy Service
  {
    id: "web_customize_01",
    section: "Website UI: Customize Brand Strategy",
    sentence: "Customize your Brand Strategy with Professional Experts.",
  },
  {
    id: "web_customize_02",
    section: "Website UI: Customize Brand Strategy",
    sentence: "Submit your brand details along with your extra thoughts, angles, and descriptions below. Your complete form is routed directly to our strategy team, who craft your customized positioning & ad script package and deliver it back to your Message Panel.",
  },
  {
    id: "web_customize_03",
    section: "Website UI: Customize Brand Strategy",
    sentence: "Use the 'Copy Text' button on any Customize strategy reply or submitted brief to copy the entire multi-angle campaign blueprint in one click.",
  },
  // Wallet, Token Economy & Monthly Subscription
  {
    id: "web_wallet_01",
    section: "Website UI: Wallet, Tokens & Stripe Tax",
    sentence: "AdRadarHQ operates on an integer-only token ledger where 1 Token equals $1 AUD, with instant automatic token refunds if an upstream ad library search fails.",
  },
  {
    id: "web_wallet_02",
    section: "Website UI: Wallet, Tokens & Stripe Tax",
    sentence: "Stripe Checkout enforces native Australian GST (10% exclusive tax) for Australian buyers only, while New Zealand and international customers pay zero GST.",
  },
  {
    id: "web_wallet_03",
    section: "Website UI: Wallet, Tokens & Stripe Tax",
    sentence: "The Monthly Search Subscription provides high-volume agencies and enterprise teams with 1,000 tokens per month at AUD $500/month.",
  },
  {
    id: "web_wallet_04",
    section: "Website UI: Wallet, Tokens & Stripe Tax",
    sentence: "In the Owner Redistribution Breakdown, Super Admin can reset any individual Owner or Email entitlement back to 0 tokens at any time with a two-step Confirm 0 button.",
  },
  // Footer, Geo & Time Widget, Currency Converter & Legal
  {
    id: "web_footer_01",
    section: "Website UI: Footer, Geo/Time & Compliance",
    sentence: "The thin footer status bar displays your local suburb, live weather temperature, real-time clock, Frankfurter API AUD-to-USD currency converter, and the 2026 AI Foundation link.",
  },
  {
    id: "web_footer_02",
    section: "Website UI: Footer, Geo/Time & Compliance",
    sentence: "All formal refund requests are to be made in writing by sending a message to the Super Admin via the secure in-app messaging interface, retained for 7 years under Australian Consumer Law compliance.",
  },
];

/**
 * Pre-indexed baseline sentences from AI works (Radar Feed Searches, AI Creative Remixes, Customize AI Strategy works)
 * supplemented dynamically by live Firestore documents.
 */
export const BASELINE_AI_WORK_SENTENCES: Array<{
  id: string;
  sourceType: Exclude<RagSourceType, "FAQ" | "WEBSITE_UI">;
  section: string;
  sentence: string;
}> = [
  // Radar Feed Searches
  {
    id: "ai_radar_01",
    sourceType: "RADAR_SEARCH",
    section: "AI Work: Radar Feed Search (Meta Ad Library)",
    sentence: "Meta Dual-Engine Winner Intelligence combines exact-phrase and broad Meta Ad Library passes with active creative collation scaling and multi-card carousel extraction.",
  },
  {
    id: "ai_radar_02",
    sourceType: "RADAR_SEARCH",
    section: "AI Work: Radar Feed Search (TikTok Viral Ads)",
    sentence: "TikTok Dual-Engine Top Ads combines 4-page exact-phrase Commercial Content Library sweeps sorted by unique users seen with TikTok Creative Center daily view velocity scoring.",
  },
  {
    id: "ai_radar_03",
    sourceType: "RADAR_SEARCH",
    section: "AI Work: Radar Feed Search (Google & YouTube)",
    sentence: "Google 3-Engine Winner System combines Live Google SERP Sponsored Search RSAs, Multi-Advertiser Transparency Center sweeps, and YouTube video creative detail enrichment.",
  },
  {
    id: "ai_radar_04",
    sourceType: "RADAR_SEARCH",
    section: "AI Work: Radar Feed Search (Semantic Relevance)",
    sentence: "Semantic Ad Search & Relevance resolves short queries to authoritative brand domains and filters out prefix collisions while guaranteeing 100% real upstream ad creatives.",
  },
  // AI Creative Remixes
  {
    id: "ai_remix_01",
    sourceType: "AI_REMIX",
    section: "AI Work: AI Creative Remix Blueprint",
    sentence: "Angle A — The Symptomatic Ad Fatigue Callout: Stop burning budget on recycled templates when your audience already recognizes the hook in the first two seconds.",
  },
  {
    id: "ai_remix_02",
    sourceType: "AI_REMIX",
    section: "AI Work: AI Creative Remix Blueprint",
    sentence: "Angle B — The Creative Burnout Trap: Replace guesswork with proven 28-day and 60-day competitor persuasion DNA tailored to your brand's unique mechanism.",
  },
  {
    id: "ai_remix_03",
    sourceType: "AI_REMIX",
    section: "AI Work: AI Creative Remix Blueprint",
    sentence: "Angle C — The Competitor Blindspot: Uncover the exact hooks, visual pacing, and calls-to-action your top competitors are scaling across Meta, TikTok, and YouTube right now.",
  },
  // Customize AI Brand Strategy Works
  {
    id: "ai_cust_01",
    sourceType: "CUSTOMIZE_AI",
    section: "AI Work: Customize Strategy (Instafans Package)",
    sentence: "Angle 1 — The 90% Take-Home Revenue Split Switch: Wait—you are still giving your current fan platform 20% of your hard-earned subscription and PPV revenue?",
  },
  {
    id: "ai_cust_02",
    sourceType: "CUSTOMIZE_AI",
    section: "AI Work: Customize Strategy (Instafans Package)",
    sentence: "Angle 2 — Native Discovery + Instant Crypto/Visa Payouts: Three reasons independent creators and models are moving their VIP pages to Instafans this month.",
  },
  {
    id: "ai_cust_03",
    sourceType: "CUSTOMIZE_AI",
    section: "AI Work: Customize Strategy (Instafans Package)",
    sentence: "Angle 3 — Zero Shadowban VIP Migration & Chargeback Shield: Instagram reach down again? Here is how top creators protect their income with 100% chargeback protection.",
  },
];

/**
 * Builds deterministic FAQ RAG entries (both full FAQ Q&A entries and atomic sentence entries for each FAQ).
 */
export function buildFaqRagEntries(faqs: FaqItem[]): RagSentenceItem[] {
  const entries: RagSentenceItem[] = [];
  for (const faq of faqs) {
    const baseTime = faq.updatedAt || faq.createdAt || new Date().toISOString();
    // 1. Primary Q&A RAG entry for the FAQ
    const fullText = `${faq.question} — ${faq.answer}`;
    entries.push({
      ragId: `rag_faq_full_${faq.faqId}_en`,
      sourceType: "FAQ",
      sourceId: faq.faqId,
      section: `FAQ: ${faq.category}`,
      originalText: faq.answer,
      question: faq.question,
      answer: faq.answer,
      languageCode: "en",
      languageName: "English",
      translatedQuestion: faq.question,
      translatedText: faq.answer,
      keywords: extractRagKeywords(fullText, faq.category),
      isHumanVerified: true,
      approvalStatus: "approved",
      contributorEmail: "system@adradarhq.com",
      createdAt: baseTime,
      updatedAt: baseTime,
    });

    // 2. Atomic sentence entries for each sentence in the FAQ answer
    const sentences = splitIntoSentences(faq.answer);
    sentences.forEach((sentence, idx) => {
      entries.push({
        ragId: `rag_faq_sent_${faq.faqId}_${idx + 1}_en`,
        sourceType: "FAQ",
        sourceId: faq.faqId,
        section: `FAQ Sentence (${faq.category})`,
        originalText: sentence,
        question: faq.question,
        answer: sentence,
        languageCode: "en",
        languageName: "English",
        translatedQuestion: faq.question,
        translatedText: sentence,
        keywords: extractRagKeywords(sentence, `${faq.category} ${faq.question}`),
        isHumanVerified: true,
        approvalStatus: "approved",
        contributorEmail: "system@adradarhq.com",
        createdAt: baseTime,
        updatedAt: baseTime,
      });
    });
  }
  return entries;
}

/**
 * Builds deterministic Website UI + Baseline AI Work sentence RAG entries.
 */
export function buildWebsiteAndBaselineAiEntries(): RagSentenceItem[] {
  const now = "2026-11-06T00:00:00.000Z";
  const webEntries: RagSentenceItem[] = WEBSITE_UI_SENTENCES.map((item) => ({
    ragId: `rag_${item.id}_en`,
    sourceType: "WEBSITE_UI",
    sourceId: item.id,
    section: item.section,
    originalText: item.sentence,
    languageCode: "en",
    languageName: "English",
    translatedText: item.sentence,
    keywords: extractRagKeywords(item.sentence, item.section),
    isHumanVerified: true,
    approvalStatus: "approved",
    contributorEmail: "system@adradarhq.com",
    createdAt: now,
    updatedAt: now,
  }));

  const aiEntries: RagSentenceItem[] = BASELINE_AI_WORK_SENTENCES.map((item) => ({
    ragId: `rag_${item.id}_en`,
    sourceType: item.sourceType,
    sourceId: item.id,
    section: item.section,
    originalText: item.sentence,
    languageCode: "en",
    languageName: "English",
    translatedText: item.sentence,
    keywords: extractRagKeywords(item.sentence, item.section),
    isHumanVerified: true,
    approvalStatus: "approved",
    contributorEmail: "system@adradarhq.com",
    createdAt: now,
    updatedAt: now,
  }));

  return [...webEntries, ...aiEntries];
}

/**
 * Dynamically harvests sentences from live Firestore AI works:
 * - Radar Feed Searches (`token_transactions` with type RADAR_SEARCH & `normalized_ads`)
 * - AI Creative Remixes (`remixes`)
 * - Customize AI Strategy deliverables (`customize_requests` & `admin_messages`)
 */
export async function harvestLiveAiWorksSentences(): Promise<RagSentenceItem[]> {
  const harvested: RagSentenceItem[] = [];
  const now = new Date().toISOString();

  try {
    // 1. Recent Radar Feed Searches from token_transactions
    const searchTxSnap = await db
      .collection("token_transactions")
      .where("type", "==", "RADAR_SEARCH")
      .limit(20)
      .get()
      .catch(() => null);

    if (searchTxSnap && !searchTxSnap.empty) {
      for (const doc of searchTxSnap.docs) {
        const d = doc.data();
        const refText = typeof d.referenceId === "string" ? d.referenceId.trim() : "";
        if (refText.length >= 6) {
          const sentence = `Live Radar Feed Search executed: ${refText}.`;
          harvested.push({
            ragId: `rag_live_search_${doc.id}`,
            sourceType: "RADAR_SEARCH",
            sourceId: doc.id,
            section: "AI Work: Live Radar Feed Search",
            originalText: sentence,
            languageCode: "en",
            languageName: "English",
            translatedText: sentence,
            keywords: extractRagKeywords(sentence, "Radar Feed Search"),
            isHumanVerified: true,
            approvalStatus: "approved",
            contributorEmail: "system@adradarhq.com",
            createdAt: typeof d.createdAt === "string" ? d.createdAt : now,
            updatedAt: typeof d.createdAt === "string" ? d.createdAt : now,
          });
        }
      }
    }

    // 2. Live normalized_ads headlines & primary body sentences from Radar Feed Searches
    const adsSnap = await db.collection("normalized_ads").limit(25).get().catch(() => null);
    if (adsSnap && !adsSnap.empty) {
      for (const doc of adsSnap.docs) {
        const ad = doc.data();
        const brand = typeof ad.advertiserName === "string" && ad.advertiserName.trim() ? ad.advertiserName.trim() : "Advertiser";
        const platform = typeof ad.platform === "string" ? ad.platform : "RADAR";
        const headline = typeof ad.headline === "string" ? ad.headline.trim() : "";
        const bodyText = typeof ad.primaryCopy === "string" ? ad.primaryCopy.trim() : "";
        const combined = [headline, bodyText].filter(Boolean).join(" — ");
        const firstSentence = splitIntoSentences(combined)[0] || combined.slice(0, 280);
        if (firstSentence && firstSentence.length >= 15) {
          const sentence = `[${platform} — ${brand}] ${firstSentence}`;
          harvested.push({
            ragId: `rag_live_ad_${doc.id}`,
            sourceType: "RADAR_SEARCH",
            sourceId: doc.id,
            section: `AI Work: Radar Feed Search (${platform})`,
            originalText: sentence,
            languageCode: "en",
            languageName: "English",
            translatedText: sentence,
            keywords: extractRagKeywords(sentence, `${platform} ${brand}`),
            isHumanVerified: true,
            approvalStatus: "approved",
            contributorEmail: "system@adradarhq.com",
            createdAt: typeof ad.lastSeenDate === "string" ? ad.lastSeenDate : now,
            updatedAt: typeof ad.lastSeenDate === "string" ? ad.lastSeenDate : now,
          });
        }
      }
    }

    // 3. Live AI Creative Remixes (`remixes`)
    const remixesSnap = await db.collection("remixes").limit(15).get().catch(() => null);
    if (remixesSnap && !remixesSnap.empty) {
      for (const doc of remixesSnap.docs) {
        const r = doc.data();
        const variations = Array.isArray(r.variations) ? r.variations : [];
        variations.slice(0, 3).forEach((v: Record<string, unknown>, idx: number) => {
          const angle = typeof v.angleName === "string" ? v.angleName : `Variation ${idx + 1}`;
          const headline = typeof v.headline === "string" ? v.headline : "";
          const copy = typeof v.primaryCopy === "string" ? v.primaryCopy : "";
          const firstCopySentence = splitIntoSentences(copy)[0] || copy.slice(0, 240);
          const sentence = `${angle}: "${headline}" — ${firstCopySentence}`.trim();
          if (sentence.length >= 15) {
            harvested.push({
              ragId: `rag_live_remix_${doc.id}_${idx}`,
              sourceType: "AI_REMIX",
              sourceId: doc.id,
              section: "AI Work: Live AI Creative Remix",
              originalText: sentence,
              languageCode: "en",
              languageName: "English",
              translatedText: sentence,
              keywords: extractRagKeywords(sentence, "AI Creative Remix"),
              isHumanVerified: true,
              approvalStatus: "approved",
              contributorEmail: "system@adradarhq.com",
              createdAt: typeof r.createdAt === "string" ? r.createdAt : now,
              updatedAt: typeof r.createdAt === "string" ? r.createdAt : now,
            });
          }
        });
      }
    }

    // 4. Live Customize AI Brand Strategy Works (`customize_requests`)
    const custSnap = await db.collection("customize_requests").limit(10).get().catch(() => null);
    if (custSnap && !custSnap.empty) {
      for (const doc of custSnap.docs) {
        const c = doc.data();
        const brandName = typeof c.brandName === "string" ? c.brandName : "Brand";
        const offer = typeof c.uniqueMechanismOrOffer === "string" ? c.uniqueMechanismOrOffer : "";
        const extra = typeof c.extraDetailsAndNotes === "string" ? c.extraDetailsAndNotes : "";
        const combined = `${brandName}: ${offer}. ${extra}`;
        const sentences = splitIntoSentences(combined).slice(0, 3);
        sentences.forEach((s, idx) => {
          harvested.push({
            ragId: `rag_live_cust_${doc.id}_${idx}`,
            sourceType: "CUSTOMIZE_AI",
            sourceId: doc.id,
            section: `AI Work: Customize Strategy (${brandName})`,
            originalText: s,
            languageCode: "en",
            languageName: "English",
            translatedText: s,
            keywords: extractRagKeywords(s, `Customize Strategy ${brandName}`),
            isHumanVerified: true,
            approvalStatus: "approved",
            // Never copy the customer's email into the corpus.
            contributorEmail: "system@adradarhq.com",
            createdAt: typeof c.createdAt === "string" ? c.createdAt : now,
            updatedAt: typeof c.updatedAt === "string" ? c.updatedAt : now,
          });
        });
      }
    }
  } catch (err) {
    console.warn("[rag-engine] error harvesting live AI works sentences", err);
  }

  return harvested;
}

/**
 * Loads human-edited / admin-authored RAG entries: one document each in `rag_custom_entries`,
 * merged over any entries still held in the legacy `system_config/rag_corpus` array. Newest first.
 */
export async function getCustomRagEntries(): Promise<RagSentenceItem[]> {
  try {
    const [legacySnap, entriesSnap] = await Promise.all([
      db.doc(RAG_CORPUS_DOC_PATH).get(),
      db.collection(RAG_ENTRIES_COL).get(),
    ]);
    const byId = new Map<string, RagSentenceItem>();
    const legacy = legacySnap.exists ? legacySnap.get("customEntries") : null;
    if (Array.isArray(legacy)) {
      for (const e of legacy as RagSentenceItem[]) {
        if (e?.ragId) {
          byId.set(e.ragId, {
            ...e,
            approvalStatus: e.approvalStatus === "pending" ? "pending" : "approved",
          });
        }
      }
    }
    for (const doc of entriesSnap.docs) {
      const e = doc.data() as RagSentenceItem;
      if (e?.ragId) {
        byId.set(e.ragId, {
          ...e,
          approvalStatus: e.approvalStatus === "pending" ? "pending" : "approved",
        });
      }
    }
    return Array.from(byId.values()).sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
  } catch (err) {
    console.warn("[rag-engine] failed to read custom RAG entries from firestore", err);
    return [];
  }
}

/**
 * Retrieves the unified RAG corpus combining:
 * 1. Human-edited & multilingual custom RAG entries (respecting approvalStatus gating)
 * 2. FAQ entries and atomic FAQ sentences
 * 3. Website UI sentences
 * 4. Baseline AI Works sentences (and live harvested AI works for Main Admin / Super Admin)
 */
export async function getFullRagCorpus(options?: {
  query?: string;
  sourceType?: string;
  faqId?: string;
  languageCode?: string;
  audience?: RagAudience;
  viewerEmail?: string;
  approvedOnly?: boolean;
}): Promise<{
  entries: RagSentenceItem[];
  stats: {
    total: number;
    faqCount: number;
    websiteUiCount: number;
    radarSearchCount: number;
    aiRemixCount: number;
    customizeAiCount: number;
    multilingualCount: number;
    pendingCount: number;
  };
}> {
  const audience: RagAudience = options?.audience ?? "public";
  const isAdminView = audience === "admin";
  const viewerEmailNorm = (options?.viewerEmail || "").trim().toLowerCase();
  const [faqs, customEntries, liveAiEntries] = await Promise.all([
    getFaqs(isAdminView),
    getCustomRagEntries(),
    isAdminView ? harvestLiveAiWorksSentences() : Promise.resolve<RagSentenceItem[]>([]),
  ]);

  const faqEntries = buildFaqRagEntries(faqs);
  const baseEntries = buildWebsiteAndBaselineAiEntries();

  // Deduplicate by ragId (customEntries take precedence if overriding a base entry)
  const map = new Map<string, RagSentenceItem>();
  for (const e of [...faqEntries, ...baseEntries, ...liveAiEntries]) {
    map.set(e.ragId, e);
  }
  for (const custom of customEntries) {
    map.set(custom.ragId, custom);
  }

  let allEntries = Array.from(map.values());
  if (options?.approvedOnly || audience === "public") {
    // Public / FAQ reader: only approved WEBSITE_UI and enabled FAQ entries; no pending or emails.
    const enabledFaqIds = new Set(faqs.map((f) => f.faqId));
    allEntries = allEntries
      .filter(
        (e) =>
          e.approvalStatus !== "pending" &&
          (e.sourceType === "WEBSITE_UI" ||
            (e.sourceType === "FAQ" && (!e.sourceId || enabledFaqIds.has(e.sourceId)))),
      )
      .map((e) => ({
        ...e,
        contributorEmail: "",
        contributorUid: undefined,
        approvedByEmail: undefined,
      }));
  } else if (audience === "registered") {
    // Registered non-approver in Admin Panel: approved corpus (including baseline AI works) + own pending entries.
    allEntries = allEntries
      .filter((e) => {
        if (e.approvalStatus !== "pending") return true;
        return Boolean(viewerEmailNorm) && e.contributorEmail?.toLowerCase() === viewerEmailNorm;
      })
      .map((e) => {
        const isOwn =
          Boolean(viewerEmailNorm) && e.contributorEmail?.toLowerCase() === viewerEmailNorm;
        const isSystem = e.contributorEmail === "system@adradarhq.com";
        return {
          ...e,
          contributorEmail: isOwn || isSystem ? e.contributorEmail : "",
          contributorUid: isOwn ? e.contributorUid : undefined,
          approvedByEmail: undefined,
        };
      });
  }

  const stats = {
    total: allEntries.length,
    faqCount: allEntries.filter((e) => e.sourceType === "FAQ").length,
    websiteUiCount: allEntries.filter((e) => e.sourceType === "WEBSITE_UI").length,
    radarSearchCount: allEntries.filter((e) => e.sourceType === "RADAR_SEARCH").length,
    aiRemixCount: allEntries.filter((e) => e.sourceType === "AI_REMIX").length,
    customizeAiCount: allEntries.filter((e) => e.sourceType === "CUSTOMIZE_AI").length,
    multilingualCount: allEntries.filter((e) => e.languageCode !== "en" && e.approvalStatus !== "pending").length,
    pendingCount: allEntries.filter((e) => e.approvalStatus === "pending").length,
  };

  let filtered = allEntries;

  if (options?.faqId) {
    filtered = filtered.filter((e) => e.sourceId === options.faqId);
  }
  if (options?.sourceType && options.sourceType !== "ALL") {
    if (options.sourceType === "MULTILINGUAL") {
      filtered = filtered.filter((e) => e.languageCode !== "en" && e.approvalStatus !== "pending");
    } else if (options.sourceType === "PENDING") {
      filtered = filtered.filter((e) => e.approvalStatus === "pending");
    } else {
      filtered = filtered.filter((e) => e.sourceType === options.sourceType);
    }
  }
  if (options?.languageCode && options.languageCode !== "ALL") {
    filtered = filtered.filter(
      (e) => e.languageCode.toLowerCase() === options.languageCode!.toLowerCase()
    );
  }
  if (options?.query && options.query.trim()) {
    const q = options.query.trim().toLowerCase();
    const qTokens = q.split(/\s+/).filter(Boolean);
    filtered = filtered
      .map((entry) => {
        const hay = `${entry.section} ${entry.question ?? ""} ${entry.translatedQuestion ?? ""} ${entry.originalText} ${entry.translatedText} ${entry.languageName} ${entry.keywords.join(" ")}`.toLowerCase();
        let score = 0;
        if (hay.includes(q)) score += 10;
        for (const tok of qTokens) {
          if (hay.includes(tok)) score += 3;
          if (entry.keywords.some((k) => k.includes(tok))) score += 2;
        }
        return { entry, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((item) => item.entry);
  }

  return {
    entries: filtered,
    stats,
  };
}

const TRANSLATE_GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";

/**
 * Official Google translation service:
 * 1. Official Google Cloud Translation v2 REST API (when `GOOGLE_TRANSLATE_API_KEY` is configured).
 * 2. Official `@google/genai` SDK with pinned `TRANSLATE_GEMINI_MODEL` (`gemini-2.5-flash`).
 * 3. Best-effort public GTX fallback only when neither API key is set or official endpoints fail.
 * Translates text (and optional FAQ question) into targetLang, ready for Human Edit prior to RAG ingestion.
 */
export async function translateWithGoogleTranslator(params: {
  text: string;
  question?: string;
  sourceLang?: string;
  targetLang: string;
}): Promise<{
  translatedText: string;
  translatedQuestion?: string;
  languageCode: string;
  languageName: string;
  provider: string;
}> {
  const sl = params.sourceLang || "auto";
  const tl = params.targetLang;
  const langMeta = getRagLanguageMeta(tl);

  if (tl.toLowerCase() === "en" && sl.toLowerCase() === "en") {
    return {
      translatedText: params.text,
      translatedQuestion: params.question,
      languageCode: langMeta.code,
      languageName: `${langMeta.name} (${langMeta.nativeName})`,
      provider: "Google Translate",
    };
  }

  // 1. Official Google Cloud Translation v2 API
  const cloudTranslateKey = process.env.GOOGLE_TRANSLATE_API_KEY?.trim();
  if (cloudTranslateKey) {
    try {
      const inputs = params.question ? [params.text, params.question] : [params.text];
      const res = await fetch(
        `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(cloudTranslateKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            q: inputs,
            target: tl,
            ...(sl && sl !== "auto" ? { source: sl } : {}),
            format: "text",
          }),
          cache: "no-store",
          signal: AbortSignal.timeout(10_000),
        }
      );
      if (res.ok) {
        const json = (await res.json()) as {
          data?: { translations?: Array<{ translatedText?: string }> };
        };
        const list = json?.data?.translations ?? [];
        const translatedText = list[0]?.translatedText?.trim();
        const translatedQuestion = params.question ? list[1]?.translatedText?.trim() : undefined;
        if (translatedText) {
          return {
            translatedText,
            translatedQuestion,
            languageCode: langMeta.code,
            languageName: `${langMeta.name} (${langMeta.nativeName})`,
            provider: "Google Cloud Translation API",
          };
        }
      }
    } catch (err) {
      console.warn("[rag-engine] Cloud Translation API failed, trying Gemini translation:", err);
    }
  }

  // 2. Official Google Gemini SDK (@google/genai) with pinned model
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  if (geminiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey: geminiKey, httpOptions: { timeout: 15_000 } });
      const res = await ai.models.generateContent({
        model: TRANSLATE_GEMINI_MODEL,
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `Translate the following ${sl === "auto" ? "source" : sl} FAQ copy accurately into ${langMeta.name} (${langMeta.nativeName}, BCP-47 code: ${langMeta.code}). Preserve brand names (AdRadarHQ, Social Radar, Stripe, Meta, TikTok, Google), numbers, and currency codes (AUD, USD). Return plain text only.\n\nTEXT:\n${params.text}${params.question ? `\n\nQUESTION:\n${params.question}` : ""}`,
              },
            ],
          },
        ],
        config: {
          responseMimeType: "application/json",
          responseJsonSchema: {
            type: "object",
            properties: {
              translatedText: { type: "string" },
              ...(params.question ? { translatedQuestion: { type: "string" } } : {}),
            },
            required: params.question ? ["translatedText", "translatedQuestion"] : ["translatedText"],
            additionalProperties: false,
          },
          temperature: 0.1,
        },
      });
      const parsed = JSON.parse(res.text ?? "{}") as {
        translatedText?: string;
        translatedQuestion?: string;
      };
      const translatedText = typeof parsed.translatedText === "string" ? parsed.translatedText.trim() : "";
      const translatedQuestion =
        params.question && typeof parsed.translatedQuestion === "string"
          ? parsed.translatedQuestion.trim()
          : undefined;
      if (translatedText && (!params.question || translatedQuestion)) {
        return {
          translatedText,
          translatedQuestion,
          languageCode: langMeta.code,
          languageName: `${langMeta.name} (${langMeta.nativeName})`,
          provider: `Google Gemini (${TRANSLATE_GEMINI_MODEL})`,
        };
      }
    } catch (err) {
      console.warn("[rag-engine] Gemini translation failed, falling back:", err);
    }
  }

  // 3. Best-effort fallback when official translation keys aren't configured or fail
  async function callGoogleGtx(input: string): Promise<string> {
    if (!input.trim()) return "";
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(
      sl
    )}&tl=${encodeURIComponent(tl)}&dt=t&q=${encodeURIComponent(input)}`;

    const res = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; AdRadarHQ-Translator/1.0)",
        Accept: "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      throw new Error(`Google Translate HTTP ${res.status}`);
    }

    const data = (await res.json()) as unknown;
    // Google GTX format: [ [ ["translated segment", "original segment", ...], ... ], ... ]
    if (Array.isArray(data) && Array.isArray(data[0])) {
      const segments = (data[0] as unknown[])
        .map((seg) => (Array.isArray(seg) && typeof seg[0] === "string" ? seg[0] : ""))
        .join("");
      if (segments.trim()) {
        return segments.trim();
      }
    }
    throw new Error("Unexpected Google Translate payload structure");
  }

  try {
    const [translatedText, translatedQuestion] = await Promise.all([
      callGoogleGtx(params.text),
      params.question ? callGoogleGtx(params.question) : Promise.resolve(undefined),
    ]);

    return {
      translatedText,
      translatedQuestion,
      languageCode: langMeta.code,
      languageName: `${langMeta.name} (${langMeta.nativeName})`,
      provider: "Google Translate",
    };
  } catch (err) {
    // Fail loudly: returning the untranslated text with a "[Language]" prefix looked like a translation.
    console.warn("[rag-engine] Google Translate failed:", err);
    throw new ApiError("UPSTREAM_FAILURE", "Google Translate didn't respond. Please try again.", 502);
  }
}

/** True for a language code in SUPPORTED_RAG_LANGUAGES. */
export function isSupportedRagLanguage(code: string): boolean {
  const clean = code.trim().toLowerCase();
  return SUPPORTED_RAG_LANGUAGES.some((l) => l.code.toLowerCase() === clean);
}

/** Per-instance cache of FAQ translations, keyed by language, FAQ id and FAQ version (updatedAt). */
const FAQ_TRANSLATION_TTL_MS = 24 * 60 * 60 * 1000;
const FAQ_TRANSLATION_CACHE_MAX = 2000;
const faqTranslationCache = new Map<string, { at: number; value: { question: string; answer: string } }>();

function cacheFaqTranslation(key: string, value: { question: string; answer: string }) {
  if (faqTranslationCache.size >= FAQ_TRANSLATION_CACHE_MAX) {
    const oldest = faqTranslationCache.keys().next().value;
    if (oldest !== undefined) faqTranslationCache.delete(oldest);
  }
  faqTranslationCache.set(key, { at: Date.now(), value });
}

/**
 * Batch translates the site's own FAQs (looked up by id on the server) via Google Translate for the
 * Navbar FAQ modal, as the secondary option for FAQs not yet in the human-verified RAG corpus.
 * Client-supplied text is never translated, so this can't be used as a free translation proxy.
 * FAQs that fail to translate are left out (the modal shows them in English).
 */
export async function batchTranslateFaqsWithGoogle(params: {
  faqIds: string[];
  targetLang: string;
}): Promise<{
  translations: Record<string, { question: string; answer: string }>;
  languageCode: string;
  languageName: string;
  provider: string;
}> {
  const langMeta = getRagLanguageMeta(params.targetLang);
  const translations: Record<string, { question: string; answer: string }> = {};
  const wanted = new Set(params.faqIds);
  const faqs = (await getFaqs(false)).filter((f) => wanted.has(f.faqId));

  if (params.targetLang.toLowerCase() === "en") {
    for (const faq of faqs) {
      translations[faq.faqId] = { question: faq.question, answer: faq.answer };
    }
    return {
      translations,
      languageCode: "en",
      languageName: "English",
      provider: "Google Translate",
    };
  }

  const pending: FaqItem[] = [];
  for (const faq of faqs) {
    const hit = faqTranslationCache.get(`${langMeta.code}:${faq.faqId}:${faq.updatedAt}`);
    if (hit && Date.now() - hit.at < FAQ_TRANSLATION_TTL_MS) {
      translations[faq.faqId] = hit.value;
    } else {
      pending.push(faq);
    }
  }

  // Translate in parallel chunks of 6 to stay fast while avoiding upstream rate limits
  const chunkSize = 6;
  for (let i = 0; i < pending.length; i += chunkSize) {
    const chunk = pending.slice(i, i + chunkSize);
    await Promise.all(
      chunk.map(async (faq) => {
        try {
          const res = await translateWithGoogleTranslator({
            question: faq.question,
            text: faq.answer,
            sourceLang: "en",
            targetLang: params.targetLang,
          });
          const value = {
            question: res.translatedQuestion || faq.question,
            answer: res.translatedText || faq.answer,
          };
          translations[faq.faqId] = value;
          cacheFaqTranslation(`${langMeta.code}:${faq.faqId}:${faq.updatedAt}`, value);
        } catch {
          // Leave this FAQ out; the modal falls back to English.
        }
      })
    );
  }

  return {
    translations,
    languageCode: langMeta.code,
    languageName: `${langMeta.name} (${langMeta.nativeName})`,
    provider: "Google Translate",
  };
}

/**
 * Persists a human-edited translation or user-authored multilingual FAQ into the RAG corpus
 * (approved immediately for Main Admin / Super Admin / Ad Agent approvers; pending approval otherwise).
 */
export async function addHumanEditedRagEntry(
  input: CreateRagEntryRequest,
  actor: {
    uid: string;
    email: string;
    role: RbacRole;
    canApprove: boolean;
    canPublishFaq: boolean;
  },
): Promise<RagSentenceItem> {
  const now = new Date().toISOString();
  const langMeta = getRagLanguageMeta(input.languageCode || "en");

  const originalSourceText = (input.originalText || input.answer || "").trim();
  const translatedText = (input.translatedText || "").trim();

  await assertHumanEditedTranslation({
    originalText: originalSourceText,
    translatedText,
    languageCode: langMeta.code,
    autoTranslatedText: input.autoTranslatedText,
  });

  const originalText = originalSourceText || translatedText;

  const sourceType: RagSourceType = input.sourceType || "FAQ";
  let sourceId = input.sourceId;

  // Publish as standalone FAQ only when caller holds publish + approve authority
  if (
    input.publishAsFaq &&
    actor.canPublishFaq &&
    actor.canApprove &&
    (input.translatedQuestion || input.question) &&
    translatedText
  ) {
    const createdFaq = await createFaq({
      question: (input.translatedQuestion || input.question || "").slice(0, 200),
      answer: translatedText.slice(0, 2000),
      category: input.category || "Multilingual FAQ",
      order: 99,
      enabled: true,
    });
    sourceId = createdFaq.faqId;
  }

  const question = input.question?.trim();
  const translatedQuestion = (input.translatedQuestion || input.question)?.trim();
  const section =
    input.section?.trim() ||
    (sourceType === "FAQ"
      ? `FAQ (${langMeta.name})`
      : `RAG Corpus (${sourceType})`);

  const uniqueSuffix = `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
  const langPart = langMeta.code.slice(0, 16);
  const ragId =
    sourceId && sourceType === "FAQ"
      ? `rag_faq_human_${sourceId.slice(0, 64)}_${langPart}_${uniqueSuffix}`
      : `rag_human_${sourceType.toLowerCase()}_${langPart}_${uniqueSuffix}`;

  const approvalStatus = actor.canApprove ? "approved" : "pending";
  const newItem: RagSentenceItem = {
    ragId,
    sourceType,
    ...(sourceId ? { sourceId } : {}),
    section,
    originalText: originalText || translatedText,
    ...(question ? { question } : {}),
    ...(input.answer ? { answer: input.answer.trim() } : {}),
    languageCode: langMeta.code,
    languageName: input.languageName || `${langMeta.name} (${langMeta.nativeName})`,
    ...(translatedQuestion ? { translatedQuestion } : {}),
    translatedText,
    keywords: extractRagKeywords(
      `${translatedQuestion ?? ""} ${translatedText} ${originalText}`,
      `${section} ${langMeta.name}`,
    ),
    isHumanVerified: true,
    approvalStatus,
    contributorUid: actor.uid,
    contributorEmail: actor.email || "user@adradarhq.com",
    contributorRole: actor.role,
    ...(actor.canApprove
      ? {
          approvedByEmail: actor.email,
          approvedByRole: actor.role,
          approvedAt: now,
        }
      : {}),
    createdAt: now,
    updatedAt: now,
  };

  await db.collection(RAG_ENTRIES_COL).doc(ragDocId(ragId)).set(newItem);
  return newItem;
}

/**
 * Approves a pending human-edited RAG entry (Main Admin, Super Admin, or Ad Agent with approve permission).
 */
export async function approveRagEntry(
  input: UpdateRagEntryRequest,
  approver: { email: string; role: RbacRole },
): Promise<RagSentenceItem> {
  const now = new Date().toISOString();
  const target = (await getCustomRagEntries()).find((e) => e.ragId === input.ragId);
  if (!target) {
    throw new ApiError("NOT_FOUND", `RAG entry ${input.ragId} not found`, 404);
  }

  const finalText = (input.translatedText ?? target.translatedText).trim();
  const finalQuestion =
    input.translatedQuestion !== undefined
      ? input.translatedQuestion.trim()
      : target.translatedQuestion;

  await assertHumanEditedTranslation({
    originalText: target.originalText,
    translatedText: finalText,
    languageCode: target.languageCode,
    autoTranslatedText: input.autoTranslatedText,
  });

  const approved: RagSentenceItem = {
    ...target,
    translatedText: finalText,
    ...(finalQuestion !== undefined ? { translatedQuestion: finalQuestion } : {}),
    ...(input.section ? { section: input.section.trim() } : {}),
    keywords: extractRagKeywords(
      `${finalQuestion ?? ""} ${finalText}`,
      input.section ?? target.section,
    ),
    isHumanVerified: true,
    approvalStatus: "approved",
    approvedByEmail: approver.email,
    approvedByRole: approver.role,
    approvedAt: now,
    updatedAt: now,
  };

  await db.collection(RAG_ENTRIES_COL).doc(ragDocId(approved.ragId)).set(approved);
  return approved;
}

/**
 * Updates a RAG entry after human review. Non-approvers may only edit their own pending submissions.
 */
export async function updateHumanEditedRagEntry(
  input: UpdateRagEntryRequest,
  actor: { email: string; role: RbacRole; canApprove: boolean },
): Promise<RagSentenceItem> {
  const now = new Date().toISOString();
  const nextText = (input.translatedText ?? "").trim();
  if (!nextText) {
    throw new ApiError("INVALID_INPUT", "translatedText is required.", 400);
  }

  const customTarget = (await getCustomRagEntries()).find((e) => e.ragId === input.ragId);
  if (!actor.canApprove) {
    if (
      !customTarget ||
      customTarget.approvalStatus !== "pending" ||
      customTarget.contributorEmail.toLowerCase() !== actor.email.toLowerCase()
    ) {
      throw new ApiError(
        "FORBIDDEN",
        "Registered users can only edit their own pending translations.",
        403,
      );
    }
  }

  const corpusAudience: RagAudience =
    actor.role === "superadmin" || actor.role === "admin" ? "admin" : "approver";
  const target =
    customTarget ??
    (await getFullRagCorpus({ audience: corpusAudience, viewerEmail: actor.email })).entries.find(
      (e) => e.ragId === input.ragId,
    );
  if (!target) {
    throw new ApiError("NOT_FOUND", `RAG entry ${input.ragId} not found`, 404);
  }

  await assertHumanEditedTranslation({
    originalText: target.originalText,
    translatedText: nextText,
    languageCode: target.languageCode,
    autoTranslatedText: input.autoTranslatedText,
  });

  const isPendingUpdate = !actor.canApprove;
  const updated: RagSentenceItem = {
    ...target,
    translatedText: nextText,
    ...(input.translatedQuestion !== undefined
      ? { translatedQuestion: input.translatedQuestion.trim() }
      : {}),
    ...(input.section ? { section: input.section.trim() } : {}),
    keywords: extractRagKeywords(
      `${input.translatedQuestion ?? target.translatedQuestion ?? ""} ${nextText}`,
      input.section ?? target.section,
    ),
    isHumanVerified: true,
    approvalStatus: isPendingUpdate ? "pending" : "approved",
    contributorEmail:
      customTarget?.contributorEmail || actor.email || target.contributorEmail || "admin@adradarhq.com",
    ...(actor.canApprove
      ? {
          approvedByEmail: actor.email,
          approvedByRole: actor.role,
          approvedAt: now,
        }
      : {}),
    updatedAt: now,
  };
  await db.collection(RAG_ENTRIES_COL).doc(ragDocId(updated.ragId)).set(updated);
  return updated;
}

/**
 * Deletes a custom RAG entry from `rag_custom_entries` and from the legacy array, if it is there.
 */
export async function deleteRagEntry(ragId: string): Promise<void> {
  const legacyRef = db.doc(RAG_CORPUS_DOC_PATH);
  await db.runTransaction(async (t) => {
    const legacySnap = await t.get(legacyRef);
    const legacy = legacySnap.exists ? legacySnap.get("customEntries") : null;
    t.delete(db.collection(RAG_ENTRIES_COL).doc(ragDocId(ragId)));
    if (Array.isArray(legacy) && legacy.some((e: RagSentenceItem) => e?.ragId === ragId)) {
      t.update(legacyRef, {
        customEntries: legacy.filter((e: RagSentenceItem) => e?.ragId !== ragId),
        updatedAt: new Date().toISOString(),
      });
    }
  });
}

