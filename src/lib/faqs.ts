import "server-only";
import { db } from "./firebase-admin";
import type { CreateFaqRequest, FaqItem, UpdateFaqRequest } from "./contracts";

const FAQS_DOC_PATH = "system_config/faqs";

export const DEFAULT_FAQS: FaqItem[] = [
  {
    faqId: "faq_base_radar_search",
    question: "What is Base Radar Search?",
    answer:
      "It is the core platform search that queries the ad libraries (Meta, TikTok, and Google) for any keyword, hook, or competitor brand to find winning ad creatives and performance data.",
    category: "Radar",
    order: 1,
    enabled: true,
    createdAt: "2026-11-03T00:00:00.000Z",
    updatedAt: "2026-11-03T00:00:00.000Z",
  },
  {
    faqId: "faq_proven_winners",
    question: "What is Proven (28+d)?",
    answer:
      "In performance marketing, unprofitable ads get turned off quickly. The Proven (28+d) filter isolates ads that have run continuously for 28 days or longer across the ad libraries. This strips away short-lived split tests and noise, showing you only the high-converting, profitable creatives that brands continue to fund—ready to deconstruct and remix for your own brand.",
    category: "Radar",
    order: 2,
    enabled: true,
    createdAt: "2026-11-03T00:00:00.000Z",
    updatedAt: "2026-11-03T00:00:00.000Z",
  },
  {
    faqId: "faq_radar_overview",
    question: "What is Radar Feed?",
    answer:
      "Radar Feed is an ad intelligence engine that searches and indexes live high-performing advertisements running across the Meta Ad Library (Facebook and Instagram). It analyzes creatives, formats, active running duration, and performance scores so you can discover proven winning ad strategies in your niche and instantly remix them for your own brand.",
    category: "Radar",
    order: 3,
    enabled: true,
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
  },
  {
    faqId: "faq_brands_overview",
    question: "What is My Brands?",
    answer:
      "My Brands is where you register and configure your business identity, core value propositions, tone of voice, target audience hooks, and landing page URLs. When you generate an AI Remix from any winning competitor ad in the Radar Feed, Ad Radar uses your active brand profile to rewrite the hooks, headlines, and video scripts specifically tailored to your brand.",
    category: "Brands",
    order: 4,
    enabled: true,
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
  },
  {
    faqId: "faq_tokens_overview",
    question: "How do Token Deductions Work?",
    answer:
      "Ad Radar operates on a strict integer token ledger. Standard Paid Rates for all services are 1 token each. If any external provider encounters an error, your tokens are automatically refunded atomically. Refund rules: all refund requests are to be made in writing by sending a message to the Super Admin.",
    category: "General",
    order: 5,
    enabled: true,
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
  },
];

export async function getFaqs(includeDisabled = false): Promise<FaqItem[]> {
  try {
    const snap = await db.doc(FAQS_DOC_PATH).get();
    if (!snap.exists) {
      await db.doc(FAQS_DOC_PATH).set({ faqs: DEFAULT_FAQS, updatedAt: new Date().toISOString() });
      return DEFAULT_FAQS.filter((f) => includeDisabled || f.enabled);
    }
    const data = snap.data() || {};
    const loadedFaqs = Array.isArray(data.faqs) ? (data.faqs as FaqItem[]) : [];

    // Ensure all seed default FAQs are present
    const existingIds = new Set(loadedFaqs.map((f) => f.faqId));
    let hasNewDefaults = false;
    for (const def of DEFAULT_FAQS) {
      if (!existingIds.has(def.faqId)) {
        loadedFaqs.push(def);
        hasNewDefaults = true;
      }
    }
    if (hasNewDefaults) {
      loadedFaqs.sort((a, b) => a.order - b.order);
      await db.doc(FAQS_DOC_PATH).set({ faqs: loadedFaqs, updatedAt: new Date().toISOString() }).catch(() => null);
    }

    return loadedFaqs
      .filter((f) => includeDisabled || f.enabled)
      .sort((a, b) => a.order - b.order);
  } catch (err) {
    console.warn("[faqs] error loading faqs from firestore, using defaults", err);
    return DEFAULT_FAQS.filter((f) => includeDisabled || f.enabled);
  }
}

export async function createFaq(input: CreateFaqRequest): Promise<FaqItem> {
  const current = await getFaqs(true);
  const now = new Date().toISOString();
  const faqId = `faq_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const item: FaqItem = {
    faqId,
    question: input.question.trim(),
    answer: input.answer.trim(),
    category: input.category.trim() || "General",
    order: input.order ?? current.length + 1,
    enabled: input.enabled ?? true,
    createdAt: now,
    updatedAt: now,
  };

  const next = [...current, item];
  await db.doc(FAQS_DOC_PATH).set({ faqs: next, updatedAt: now });
  return item;
}

export async function updateFaq(input: UpdateFaqRequest): Promise<FaqItem> {
  const current = await getFaqs(true);
  const idx = current.findIndex((f) => f.faqId === input.faqId);
  if (idx === -1) throw new Error(`FAQ ${input.faqId} not found`);

  const now = new Date().toISOString();
  const existing = current[idx];
  const updated: FaqItem = {
    ...existing,
    ...input.patch,
    updatedAt: now,
  };

  current[idx] = updated;
  await db.doc(FAQS_DOC_PATH).set({ faqs: current, updatedAt: now });
  return updated;
}

export async function deleteFaq(faqId: string): Promise<void> {
  const current = await getFaqs(true);
  const next = current.filter((f) => f.faqId !== faqId);
  await db.doc(FAQS_DOC_PATH).set({ faqs: next, updatedAt: new Date().toISOString() });
}

export async function resetDefaultFaqs(): Promise<FaqItem[]> {
  await db.doc(FAQS_DOC_PATH).set({ faqs: DEFAULT_FAQS, updatedAt: new Date().toISOString() });
  return DEFAULT_FAQS;
}

