import "server-only";
import { db } from "./firebase-admin";
import type { CreateFaqRequest, FaqItem, UpdateFaqRequest } from "./contracts";

const FAQS_DOC_PATH = "system_config/faqs";

export const DEFAULT_FAQS: FaqItem[] = [
  {
    faqId: "faq_brands_overview",
    question: "What is My Brands?",
    answer:
      "My Brands is where you register and configure your business identity, core value propositions, tone of voice, target audience hooks, and landing page URLs. When you generate an AI Remix from any winning competitor ad in the Radar Feed, Ad Radar uses your active brand profile to rewrite the hooks, headlines, and video scripts specifically tailored to your brand.",
    category: "Brands",
    order: 1,
    enabled: true,
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
  },
  {
    faqId: "faq_radar_overview",
    question: "What is Radar Feed?",
    answer:
      "Radar Feed is an ad intelligence engine that searches and indexes live high-performing advertisements running across the Meta Ad Library (Facebook and Instagram). It analyzes creatives, formats, active running duration, and performance scores so you can discover proven winning ad strategies in your niche and instantly remix them for your own brand.",
    category: "Radar",
    order: 2,
    enabled: true,
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
  },
  {
    faqId: "faq_tokens_overview",
    question: "How do Token Deductions Work?",
    answer:
      "Ad Radar operates on a strict integer token ledger. Standard searches cost 0 tokens. Extended day filtering costs 1 token, elite performance score searches cost 2 tokens, and AI Remix generation costs 0 tokens. If any external provider encounters an error, your tokens are automatically refunded atomically.",
    category: "General",
    order: 3,
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
    const faqs = Array.isArray(data.faqs) ? (data.faqs as FaqItem[]) : DEFAULT_FAQS;
    return faqs
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

