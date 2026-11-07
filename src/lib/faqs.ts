import "server-only";
import { db } from "./firebase-admin";
import type { CreateFaqRequest, FaqItem, UpdateFaqRequest } from "./contracts";

const FAQS_DOC_PATH = "system_config/faqs";
const FAQS_SCHEMA_VERSION = "customer_v1";

export const DEFAULT_FAQS: FaqItem[] = [
  // ---------- CATEGORY: RADAR SEARCH ----------
  {
    faqId: "faq_how_to_search",
    question: "How do I search for winning competitor ads in my niche?",
    answer:
      "Enter a brand name, product keyword, or marketing angle (e.g. 'Toyota', 'collagen peptides', or 'CRM software') into the Radar search bar. Select your target platform (Meta, TikTok, or Google) and choose your target country, then click 'Search Radar'. You can also click any of the 24 trending search pills on the empty search screen for instant 1-click competitor research.",
    category: "Radar Search",
    order: 1,
    enabled: true,
    createdAt: "2026-11-03T00:00:00.000Z",
    updatedAt: "2026-11-03T00:00:00.000Z",
  },
  {
    faqId: "faq_platforms_supported",
    question: "Which ad platforms can I search and monitor?",
    answer:
      "Social Radar monitors the world's three largest ad networks:\n• Meta Ad Library: Facebook & Instagram feed, story, and reel ads.\n• TikTok Commercial Content Library: Viral video and authentic UGC competitor ads.\n• Google Ads Transparency Center: Search text ads, Display network banners, and YouTube video ads.\n\nYou do not need to connect your personal or business ad accounts—Social Radar queries public transparency feeds directly.",
    category: "Radar Search",
    order: 2,
    enabled: true,
    createdAt: "2026-11-03T00:00:00.000Z",
    updatedAt: "2026-11-03T00:00:00.000Z",
  },
  {
    faqId: "faq_real_ads_only",
    question: "Are the ad creatives and images 100% real competitor ads?",
    answer:
      "Yes, absolutely. Social Radar enforces a strict Real-Ads-Only policy. Every ad headline, body copy, image, and video is genuine upstream media pulled directly from official Meta, TikTok, and Google ad transparency servers. We never generate synthetic benchmark ads or insert third-party stock photos.",
    category: "Radar Search",
    order: 3,
    enabled: true,
    createdAt: "2026-11-03T00:00:00.000Z",
    updatedAt: "2026-11-03T00:00:00.000Z",
  },
  {
    faqId: "faq_proven_winners",
    question: "What does 'Proven (28+d)' mean and why should I use it?",
    answer:
      "In performance marketing, unprofitable ads get turned off quickly. The 'Proven (28+d)' filter isolates ads that have run continuously for 28 days or longer across the ad libraries. This strips away short-lived split tests and noise, showing you only the high-converting, profitable creatives that brands continue to fund—ready to study and remix for your own campaigns.",
    category: "Radar Search",
    order: 4,
    enabled: true,
    createdAt: "2026-11-03T00:00:00.000Z",
    updatedAt: "2026-11-03T00:00:00.000Z",
  },
  {
    faqId: "faq_extended_longevity",
    question: "What does 'Extended (60+d)' mean?",
    answer:
      "The 'Extended (60+d)' filter uncovers rare 'evergreen' ads that have run continuously for more than two months. While most ad creatives suffer audience fatigue within a few weeks, 60+ day ads are high-performing flagship winners with proven, fatigue-resistant hooks and massive multi-month ad spend behind them.",
    category: "Radar Search",
    order: 5,
    enabled: true,
    createdAt: "2026-11-03T00:00:00.000Z",
    updatedAt: "2026-11-03T00:00:00.000Z",
  },
  {
    faqId: "faq_top_winners_score",
    question: "What is 'Top Winners (90%+)' and how is the Ad Score calculated?",
    answer:
      "The Radar Score (0–100%) evaluates an ad's continuous running duration, view reach, and multi-adset scaling (when an advertiser runs multiple duplicate collations of the same creative across massive budgets). The 'Top Winners (90%+)' filter isolates the elite top 1% of category-dominating ads with verified market conversion power.",
    category: "Radar Search",
    order: 6,
    enabled: true,
    createdAt: "2026-11-03T00:00:00.000Z",
    updatedAt: "2026-11-03T00:00:00.000Z",
  },
  {
    faqId: "faq_google_ad_formats",
    question: "Why do some Google ads only display text while others have images or videos?",
    answer:
      "Google serves diverse ad formats depending on placement. Google Search ads are primarily high-intent text headlines and descriptions, while Google Display Network and YouTube ads feature image banners and video creatives. Social Radar renders the authentic ad creative format returned by Google's Transparency Center.",
    category: "Radar Search",
    order: 7,
    enabled: true,
    createdAt: "2026-11-03T00:00:00.000Z",
    updatedAt: "2026-11-03T00:00:00.000Z",
  },
  {
    faqId: "faq_media_type_filter",
    question: "How do I filter ads by Image vs. Video format?",
    answer:
      "Use the media type selector next to the search input. Select 'ALL' to see every ad format, 'VIDEO' to isolate dynamic video reels and UGC videos (ideal for TikTok and Instagram Reels), or 'IMAGE' for static display cards and product carousels.",
    category: "Radar Search",
    order: 8,
    enabled: true,
    createdAt: "2026-11-03T00:00:00.000Z",
    updatedAt: "2026-11-03T00:00:00.000Z",
  },

  // ---------- CATEGORY: AI CREATIVE REMIX ----------
  {
    faqId: "faq_how_to_remix",
    question: "How do I remix a winning competitor ad for my own brand?",
    answer:
      "On any ad card in your Radar results, click 'Model this ad ⚡'. The AI Remix Studio opens and deconstructs the competitor ad's core hook, emotional drivers, and pacing. Click 'Generate remix ✨' to automatically rewrite 3 complete script variations tailored specifically to your active brand profile.",
    category: "AI Creative Remix",
    order: 9,
    enabled: true,
    createdAt: "2026-11-03T00:00:00.000Z",
    updatedAt: "2026-11-03T00:00:00.000Z",
  },
  {
    faqId: "faq_what_is_in_remix",
    question: "What do I receive inside an AI Remix Blueprint?",
    answer:
      "Each remix blueprint delivers:\n1. Persuasion DNA Deconstruction: Hook analysis, pacing structure, and explanation of why the competitor ad converts.\n2. Three Complete Script Variations: Custom headlines, primary ad copy, call-to-action buttons, detailed multi-scene video storyboards (timestamps, visual action, spoken voiceover, on-screen text overlays), and Midjourney/Flux image generation prompts.",
    category: "AI Creative Remix",
    order: 10,
    enabled: true,
    createdAt: "2026-11-03T00:00:00.000Z",
    updatedAt: "2026-11-03T00:00:00.000Z",
  },
  {
    faqId: "faq_export_scripts",
    question: "How do I send the remixed video scripts to my content creators or video editors?",
    answer:
      "Inside any variation card in the Remix Studio, click 'Copy Variation' to copy the complete scene-by-scene script to your clipboard, or click 'Export CSV' to download a structured spreadsheet. You can send this directly to your videographers, video editors, or UGC creators for immediate production.",
    category: "AI Creative Remix",
    order: 11,
    enabled: true,
    createdAt: "2026-11-03T00:00:00.000Z",
    updatedAt: "2026-11-03T00:00:00.000Z",
  },
  {
    faqId: "faq_regenerate_variations",
    question: "Can I generate new hook angles if I want more ideas?",
    answer:
      "Yes. In the Remix Studio, click 'Regenerate Variations' (charged at the standard rate of 1 token) to generate 3 fresh marketing angles (such as PAS, AIDA, UGC Story, Us vs. Them, or Social Proof Stack) without losing your original deconstruction.",
    category: "AI Creative Remix",
    order: 12,
    enabled: true,
    createdAt: "2026-11-03T00:00:00.000Z",
    updatedAt: "2026-11-03T00:00:00.000Z",
  },

  // ---------- CATEGORY: CUSTOMIZE SERVICE ----------
  {
    faqId: "faq_what_is_customize",
    question: "What is the 'Customize' service in the top navigation?",
    answer:
      "The Customize service provides dedicated brand strategy assistance from our senior advertising strategists (SuperAdmin & Main Admin). Instead of running automated queries yourself, you submit your brand brief and strategic goals, and our strategists formulate a bespoke creative ad strategy sent directly back to your secure Message Panel.",
    category: "Customize Service",
    order: 13,
    enabled: true,
    createdAt: "2026-11-03T00:00:00.000Z",
    updatedAt: "2026-11-03T00:00:00.000Z",
  },
  {
    faqId: "faq_how_to_submit_customize",
    question: "How do I submit a Customize brief, and what should I include in 'Extra Details'?",
    answer:
      "Click 'Customize' in the top header. You can pre-fill details from an existing Brand Card or type them in fresh: brand name, tone of voice, product description, customer avatar, pain points, offer, and landing page URLs. Use the 'Extra Details & Descriptions to Think About' box to explain specific campaign objectives, competitor angles to defeat, or brand guidelines you want the strategists to incorporate.",
    category: "Customize Service",
    order: 14,
    enabled: true,
    createdAt: "2026-11-03T00:00:00.000Z",
    updatedAt: "2026-11-03T00:00:00.000Z",
  },
  {
    faqId: "faq_customize_pricing",
    question: "How much does the Customize Service cost, and when is it charged?",
    answer:
      "The Customize service is set in the platform pricing (default: 45 tokens). The tokens are debited from your wallet upon submitting the brief. If your request cannot be fulfilled, your tokens are refunded automatically.",
    category: "Customize Service",
    order: 15,
    enabled: true,
    createdAt: "2026-11-03T00:00:00.000Z",
    updatedAt: "2026-11-03T00:00:00.000Z",
  },
  {
    faqId: "faq_customize_reply_location",
    question: "Where and when do I receive the strategist's completed response?",
    answer:
      "You receive an instant confirmation message upon submission. Once the strategy team completes your brief, the customized strategy is delivered directly into your secure in-app Message Panel. You can view, read, and reference it at any time under our 7-year statutory archive.",
    category: "Customize Service",
    order: 16,
    enabled: true,
    createdAt: "2026-11-03T00:00:00.000Z",
    updatedAt: "2026-11-03T00:00:00.000Z",
  },

  // ---------- CATEGORY: BRAND CARDS ----------
  {
    faqId: "faq_what_is_my_brands",
    question: "What is 'My Brands' and why should I set up a Brand Profile?",
    answer:
      "Your Brand Card stores your business identity: your core value proposition, tone of voice (e.g. Direct Response, UGC Casual, Authoritative), target customer pain points, and offer details. When you remix competitor ads, the AI pulls these exact parameters so your generated ads sound authentically like your brand, not a generic copy.",
    category: "Brand Cards",
    order: 17,
    enabled: true,
    createdAt: "2026-11-03T00:00:00.000Z",
    updatedAt: "2026-11-03T00:00:00.000Z",
  },
  {
    faqId: "faq_create_brand",
    question: "How do I create and activate my brand profile?",
    answer:
      "Click 'Brands' in the top navigation, click 'New Brand', and fill in your brand name, website URL, tone of voice, and customer avatar. Once saved, click 'Set Active' on the card. Your active brand is highlighted with a green badge and is automatically used across Radar searches and AI Remixes.",
    category: "Brand Cards",
    order: 18,
    enabled: true,
    createdAt: "2026-11-03T00:00:00.000Z",
    updatedAt: "2026-11-03T00:00:00.000Z",
  },
  {
    faqId: "faq_multiple_brands",
    question: "Can I manage multiple brands or client accounts?",
    answer:
      "Yes! You can create as many Brand Cards as you need for different products, client accounts, or e-commerce stores. Switch between them with one click by clicking 'Set Active' on the brand you're currently working on.",
    category: "Brand Cards",
    order: 19,
    enabled: true,
    createdAt: "2026-11-03T00:00:00.000Z",
    updatedAt: "2026-11-03T00:00:00.000Z",
  },

  // ---------- CATEGORY: TOKENS & WALLET ----------
  {
    faqId: "faq_token_pricing",
    question: "How does the token system work, and what are the fees?",
    answer:
      "Social Radar operates on a strict integer token ledger (no confusing fractions). Standard searches cost 1 token, AI creative remixes cost 1 token, and variation regenerations cost 1 token. Dedicated human Customize briefs cost 45 tokens. Free accounts receive complimentary onboarding tokens to test the platform.",
    category: "Tokens & Wallet",
    order: 20,
    enabled: true,
    createdAt: "2026-11-03T00:00:00.000Z",
    updatedAt: "2026-11-03T00:00:00.000Z",
  },
  {
    faqId: "faq_buy_tokens",
    question: "How do I purchase more tokens, and what payment methods can I use?",
    answer:
      "Click 'Wallet' or the token badge in the top navigation, select the token pack that fits your needs (e.g. Starter, Growth, or Pro Pack), and checkout securely through Stripe. We accept all major credit cards, debit cards, Apple Pay, and Google Pay.",
    category: "Tokens & Wallet",
    order: 21,
    enabled: true,
    createdAt: "2026-11-03T00:00:00.000Z",
    updatedAt: "2026-11-03T00:00:00.000Z",
  },
  {
    faqId: "faq_aud_usd_currency",
    question: "Why are token packs priced in Australian Dollars (AUD), and how does USD conversion work?",
    answer:
      "Social Radar is headquartered in Australia and standardizes billing in Australian Dollars (AUD) for clear, non-volatile accounting. For international customers outside Australia and New Zealand, the platform displays live indicative USD prices alongside AUD amounts (e.g. 1 Token = $1 AUD ≈ $0.65 USD).",
    category: "Tokens & Wallet",
    order: 22,
    enabled: true,
    createdAt: "2026-11-03T00:00:00.000Z",
    updatedAt: "2026-11-03T00:00:00.000Z",
  },
  {
    faqId: "faq_tokens_expire",
    question: "Do my tokens ever expire, and where can I view my purchase history?",
    answer:
      "No, your purchased tokens never expire. You can view your live balance and complete ledger history (including every search deduction, remix, top-up, and refund) at any time by opening the 'Wallet' page.",
    category: "Tokens & Wallet",
    order: 23,
    enabled: true,
    createdAt: "2026-11-03T00:00:00.000Z",
    updatedAt: "2026-11-03T00:00:00.000Z",
  },

  // ---------- CATEGORY: REFUNDS & SUPPORT ----------
  {
    faqId: "faq_failed_searches_refund",
    question: "What happens if a search or remix fails—do I lose my tokens?",
    answer:
      "No, you will never lose tokens on an incomplete action. If an upstream ad library encounters a timeout, connection issue, or monthly quota limitation, our token gate detects the error and automatically refunds your token back to your wallet instantly.",
    category: "Refunds & Support",
    order: 24,
    enabled: true,
    createdAt: "2026-11-03T00:00:00.000Z",
    updatedAt: "2026-11-03T00:00:00.000Z",
  },
  {
    faqId: "faq_how_to_get_refund",
    question: "What is the refund policy on token purchases and subscriptions?",
    answer:
      "All digital token purchases and subscriptions are final and strictly non-refundable once processed through Stripe. Because digital tokens are delivered immediately upon checkout and never expire, change-of-mind refunds or cash redemptions for unused tokens are not provided. If a search or remix encounters an upstream technical failure, spent tokens are automatically credited back to your ledger instantly. For questions regarding statutory non-excludable guarantees under the Australian Consumer Law (ACL), you can send a free message directly to the Super Admin via 'Message Admin'.",
    category: "Refunds & Support",
    order: 25,
    enabled: true,
    createdAt: "2026-11-03T00:00:00.000Z",
    updatedAt: "2026-11-07T00:00:00.000Z",
  },
  {
    faqId: "faq_privacy_data_security",
    question: "Are my brand briefs, search queries, and competitor remixes private?",
    answer:
      "Yes. Your account data, brand profiles, customized briefs, and generated remixes are isolated to your authenticated account and protected by strict database security rules. We comply with Australian Privacy Act standards and never share or resell your private advertising research.",
    category: "Refunds & Support",
    order: 26,
    enabled: true,
    createdAt: "2026-11-03T00:00:00.000Z",
    updatedAt: "2026-11-03T00:00:00.000Z",
  },
  {
    faqId: "faq_geo_time_widget",
    question: "What is the bar at the bottom showing weather, suburb, and time?",
    answer:
      "The bottom bar is your local Geo & Time status widget. It displays your current suburb, local weather temperature, active currency indicator, and live real-time clock. Clicking the bar opens a settings popup where you can customize your suburb, state, date format, or toggle between 12-hour and 24-hour clock formats.",
    category: "Refunds & Support",
    order: 27,
    enabled: true,
    createdAt: "2026-11-03T00:00:00.000Z",
    updatedAt: "2026-11-03T00:00:00.000Z",
  },
  {
    faqId: "faq_ad_agent_status_disclaimer",
    question: "What is the relationship between Ad Agents and Ad Radar HQ?",
    answer:
      "Ad Agents are outsourced independent contractors who are only associated with Ad Radar HQ by the way of independent contractors. Ad Agents are neither employees, partners, nor legal representatives of Ad Radar HQ or AI Foundation, and all advice, strategies, recommendations, and opinions expressed by Ad Agents are strictly their own independent views and do not represent Ad Radar HQ.",
    category: "Refunds & Support",
    order: 28,
    enabled: true,
    createdAt: "2026-11-03T00:00:00.000Z",
    updatedAt: "2026-11-07T00:00:00.000Z",
  },
];

export async function getFaqs(includeDisabled = false): Promise<FaqItem[]> {
  try {
    const snap = await db.doc(FAQS_DOC_PATH).get();
    if (!snap.exists) {
      await db.doc(FAQS_DOC_PATH).set({ version: FAQS_SCHEMA_VERSION, faqs: DEFAULT_FAQS, updatedAt: new Date().toISOString() });
      return DEFAULT_FAQS.filter((f) => includeDisabled || f.enabled);
    }
    const data = snap.data() || {};
    if (data.version !== FAQS_SCHEMA_VERSION) {
      // Seamlessly upgrade to the comprehensive customer-perspective default FAQs
      await db.doc(FAQS_DOC_PATH).set({ version: FAQS_SCHEMA_VERSION, faqs: DEFAULT_FAQS, updatedAt: new Date().toISOString() });
      return DEFAULT_FAQS.filter((f) => includeDisabled || f.enabled);
    }
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
      await db.doc(FAQS_DOC_PATH).set({ version: FAQS_SCHEMA_VERSION, faqs: loadedFaqs, updatedAt: new Date().toISOString() }).catch(() => null);
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
  await db.doc(FAQS_DOC_PATH).set({ version: FAQS_SCHEMA_VERSION, faqs: DEFAULT_FAQS, updatedAt: new Date().toISOString() });
  return DEFAULT_FAQS;
}

