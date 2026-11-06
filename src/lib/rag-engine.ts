import "server-only";
import { db } from "./firebase-admin";
import { getFaqs, createFaq } from "./faqs";
import { getRagLanguageMeta } from "./rag-languages";
import type {
  CreateRagEntryRequest,
  FaqItem,
  RagSentenceItem,
  RagSourceType,
  UpdateRagEntryRequest,
} from "./contracts";

const RAG_CORPUS_DOC_PATH = "system_config/rag_corpus";

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
    sentence: "The 1,000 Monthly Searches Subscription provides high-volume agencies and enterprise teams with 1,000 searches per month at AUD $500/month.",
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
            contributorEmail: "system@adradarhq.com",
            createdAt: typeof d.timestamp === "string" ? d.timestamp : now,
            updatedAt: typeof d.timestamp === "string" ? d.timestamp : now,
          });
        }
      }
    }

    // 2. Live normalized_ads headlines & primary body sentences from Radar Feed Searches
    const adsSnap = await db.collection("normalized_ads").limit(25).get().catch(() => null);
    if (adsSnap && !adsSnap.empty) {
      for (const doc of adsSnap.docs) {
        const ad = doc.data();
        const brand = typeof ad.brandName === "string" ? ad.brandName : "Advertiser";
        const platform = typeof ad.platform === "string" ? ad.platform : "RADAR";
        const headline = typeof ad.headline === "string" ? ad.headline.trim() : "";
        const bodyText = typeof ad.bodyText === "string" ? ad.bodyText.trim() : "";
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
            contributorEmail: "system@adradarhq.com",
            createdAt: typeof ad.lastSeenAt === "string" ? ad.lastSeenAt : now,
            updatedAt: typeof ad.lastSeenAt === "string" ? ad.lastSeenAt : now,
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
            contributorEmail: typeof c.userEmail === "string" ? c.userEmail : "system@adradarhq.com",
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
 * Loads user/admin-contributed & human-edited multilingual RAG entries from `system_config/rag_corpus`.
 */
export async function getCustomRagEntries(): Promise<RagSentenceItem[]> {
  try {
    const snap = await db.doc(RAG_CORPUS_DOC_PATH).get();
    if (!snap.exists) return [];
    const data = snap.data() || {};
    return Array.isArray(data.customEntries) ? (data.customEntries as RagSentenceItem[]) : [];
  } catch (err) {
    console.warn("[rag-engine] failed to read customEntries from firestore", err);
    return [];
  }
}

/**
 * Retrieves the complete unified RAG corpus combining:
 * 1. Human-edited & multilingual custom RAG entries
 * 2. All FAQ entries and atomic FAQ sentences
 * 3. All Website UI sentences
 * 4. All AI Works sentences (Radar Feed Searches, AI Creative Remixes, Customize AI Strategy works)
 */
export async function getFullRagCorpus(options?: {
  query?: string;
  sourceType?: string;
  faqId?: string;
  languageCode?: string;
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
  };
}> {
  const [faqs, customEntries, liveAiEntries] = await Promise.all([
    getFaqs(true),
    getCustomRagEntries(),
    harvestLiveAiWorksSentences(),
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

  const allEntries = Array.from(map.values());

  const stats = {
    total: allEntries.length,
    faqCount: allEntries.filter((e) => e.sourceType === "FAQ").length,
    websiteUiCount: allEntries.filter((e) => e.sourceType === "WEBSITE_UI").length,
    radarSearchCount: allEntries.filter((e) => e.sourceType === "RADAR_SEARCH").length,
    aiRemixCount: allEntries.filter((e) => e.sourceType === "AI_REMIX").length,
    customizeAiCount: allEntries.filter((e) => e.sourceType === "CUSTOMIZE_AI").length,
    multilingualCount: allEntries.filter((e) => e.languageCode !== "en").length,
  };

  let filtered = allEntries;

  if (options?.faqId) {
    filtered = filtered.filter((e) => e.sourceId === options.faqId);
  }
  if (options?.sourceType && options.sourceType !== "ALL") {
    if (options.sourceType === "MULTILINGUAL") {
      filtered = filtered.filter((e) => e.languageCode !== "en");
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

/**
 * Instant Google Translator service using Google Translate's GTX endpoint.
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

  async function callGoogleGtx(input: string): Promise<string> {
    if (!input.trim()) return "";
    if (tl.toLowerCase() === "en" && sl.toLowerCase() === "en") {
      return input;
    }
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
    console.warn("[rag-engine] Google GTX fallback triggered:", err);
    return {
      translatedText: `[${langMeta.nativeName}] ${params.text}`,
      translatedQuestion: params.question ? `[${langMeta.nativeName}] ${params.question}` : undefined,
      languageCode: langMeta.code,
      languageName: `${langMeta.name} (${langMeta.nativeName})`,
      provider: "Google Translate (Fallback Draft)",
    };
  }
}

/**
 * Batch translates an array of FAQ Q&A items via Google Translate for the Navbar FAQ modal
 * (used as the secondary option for any FAQs not yet in the human-verified RAG corpus for targetLang).
 */
export async function batchTranslateFaqsWithGoogle(params: {
  items: Array<{ faqId: string; question: string; answer: string }>;
  sourceLang?: string;
  targetLang: string;
}): Promise<{
  translations: Record<string, { question: string; answer: string }>;
  languageCode: string;
  languageName: string;
  provider: string;
}> {
  const langMeta = getRagLanguageMeta(params.targetLang);
  const translations: Record<string, { question: string; answer: string }> = {};

  if (params.targetLang.toLowerCase() === "en") {
    for (const item of params.items) {
      translations[item.faqId] = { question: item.question, answer: item.answer };
    }
    return {
      translations,
      languageCode: "en",
      languageName: "English",
      provider: "Google Translate",
    };
  }

  // Translate in parallel chunks of 6 to stay fast while avoiding upstream rate limits
  const chunkSize = 6;
  for (let i = 0; i < params.items.length; i += chunkSize) {
    const chunk = params.items.slice(i, i + chunkSize);
    await Promise.all(
      chunk.map(async (item) => {
        const res = await translateWithGoogleTranslator({
          question: item.question,
          text: item.answer,
          sourceLang: params.sourceLang || "en",
          targetLang: params.targetLang,
        });
        translations[item.faqId] = {
          question: res.translatedQuestion || item.question,
          answer: res.translatedText || item.answer,
        };
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
 * Persists a human-edited translation or user-authored multilingual FAQ into the RAG corpus.
 */
export async function addHumanEditedRagEntry(
  input: CreateRagEntryRequest,
  contributorEmail: string
): Promise<RagSentenceItem> {
  const customEntries = await getCustomRagEntries();
  const now = new Date().toISOString();
  const langMeta = getRagLanguageMeta(input.languageCode || "en");

  const sourceType: RagSourceType = input.sourceType || "FAQ";
  let sourceId = input.sourceId;

  // If the user/admin also chose to publish a brand new FAQ into the main FAQ collection:
  if (input.publishAsFaq && (input.translatedQuestion || input.question) && (input.translatedText || input.answer)) {
    const createdFaq = await createFaq({
      question: (input.translatedQuestion || input.question || "").slice(0, 200),
      answer: (input.translatedText || input.answer || "").slice(0, 2000),
      category: input.category || "Multilingual FAQ",
      order: 99,
      enabled: true,
    });
    sourceId = createdFaq.faqId;
  }

  const originalText = (input.originalText || input.answer || input.translatedText || "").trim();
  const translatedText = (input.translatedText || input.answer || originalText).trim();
  const question = input.question?.trim();
  const translatedQuestion = (input.translatedQuestion || input.question)?.trim();
  const section =
    input.section?.trim() ||
    (sourceType === "FAQ"
      ? `FAQ (${langMeta.name})`
      : `RAG Corpus (${sourceType})`);

  const ragId =
    sourceId && sourceType === "FAQ"
      ? `rag_faq_human_${sourceId}_${langMeta.code}_${Date.now().toString(36)}`
      : `rag_human_${sourceType.toLowerCase()}_${langMeta.code}_${Date.now().toString(36)}`;

  const newItem: RagSentenceItem = {
    ragId,
    sourceType,
    ...(sourceId ? { sourceId } : {}),
    section,
    originalText,
    ...(question ? { question } : {}),
    ...(input.answer ? { answer: input.answer.trim() } : {}),
    languageCode: langMeta.code,
    languageName: input.languageName || `${langMeta.name} (${langMeta.nativeName})`,
    ...(translatedQuestion ? { translatedQuestion } : {}),
    translatedText,
    keywords: extractRagKeywords(
      `${translatedQuestion ?? ""} ${translatedText} ${originalText}`,
      `${section} ${langMeta.name}`
    ),
    isHumanVerified: true,
    contributorEmail: contributorEmail || "user@adradarhq.com",
    createdAt: now,
    updatedAt: now,
  };

  const next = [newItem, ...customEntries];
  await db.doc(RAG_CORPUS_DOC_PATH).set(
    {
      customEntries: next,
      updatedAt: now,
    },
    { merge: true }
  );

  return newItem;
}

/**
 * Updates an existing human-edited RAG entry after human review.
 */
export async function updateHumanEditedRagEntry(
  input: UpdateRagEntryRequest,
  contributorEmail: string
): Promise<RagSentenceItem> {
  const customEntries = await getCustomRagEntries();
  const now = new Date().toISOString();
  const idx = customEntries.findIndex((e) => e.ragId === input.ragId);

  if (idx !== -1) {
    const existing = customEntries[idx];
    const updated: RagSentenceItem = {
      ...existing,
      translatedText: input.translatedText.trim(),
      ...(input.translatedQuestion !== undefined
        ? { translatedQuestion: input.translatedQuestion.trim() }
        : {}),
      ...(input.section ? { section: input.section.trim() } : {}),
      keywords: extractRagKeywords(
        `${input.translatedQuestion ?? existing.translatedQuestion ?? ""} ${input.translatedText}`,
        input.section ?? existing.section
      ),
      isHumanVerified: true,
      contributorEmail: contributorEmail || existing.contributorEmail,
      updatedAt: now,
    };
    customEntries[idx] = updated;
    await db.doc(RAG_CORPUS_DOC_PATH).set(
      { customEntries, updatedAt: now },
      { merge: true }
    );
    return updated;
  }

  // If overriding a system-seeded RAG entry, clone it into customEntries with the human edit
  const full = await getFullRagCorpus();
  const target = full.entries.find((e) => e.ragId === input.ragId);
  if (!target) {
    throw new Error(`RAG entry ${input.ragId} not found`);
  }
  const overridden: RagSentenceItem = {
    ...target,
    translatedText: input.translatedText.trim(),
    ...(input.translatedQuestion !== undefined
      ? { translatedQuestion: input.translatedQuestion.trim() }
      : {}),
    ...(input.section ? { section: input.section.trim() } : {}),
    keywords: extractRagKeywords(
      `${input.translatedQuestion ?? target.translatedQuestion ?? ""} ${input.translatedText}`,
      input.section ?? target.section
    ),
    isHumanVerified: true,
    contributorEmail: contributorEmail || "admin@adradarhq.com",
    updatedAt: now,
  };
  const next = [overridden, ...customEntries];
  await db.doc(RAG_CORPUS_DOC_PATH).set(
    { customEntries: next, updatedAt: now },
    { merge: true }
  );
  return overridden;
}

/**
 * Deletes a custom RAG entry from `system_config/rag_corpus`.
 */
export async function deleteRagEntry(ragId: string): Promise<void> {
  const customEntries = await getCustomRagEntries();
  const next = customEntries.filter((e) => e.ragId !== ragId);
  await db.doc(RAG_CORPUS_DOC_PATH).set(
    { customEntries: next, updatedAt: new Date().toISOString() },
    { merge: true }
  );
}

