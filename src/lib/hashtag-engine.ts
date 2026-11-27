import type {
  BrandProfile,
  NormalizedAd,
  RemixDoc,
  RemixedAdTextPlatform,
} from "./contracts";

const HASHTAG_STOP_WORDS = new Set([
  "about", "after", "again", "against", "almost", "along", "already", "also",
  "always", "among", "another", "around", "because", "before", "being",
  "below", "between", "both", "built", "cannot", "click", "could", "daily",
  "discover", "does", "done", "each", "either", "enough", "every", "faster",
  "feel", "first", "found", "free", "from", "full", "gets", "getting",
  "give", "gives", "good", "great", "have", "here", "high", "home", "into",
  "just", "keep", "know", "last", "learn", "like", "limited", "look",
  "looks", "made", "make", "makes", "many", "more", "most", "much", "must",
  "need", "never", "next", "only", "order", "other", "over", "page",
  "people", "plus", "real", "really", "right", "said", "same", "save",
  "shop", "should", "show", "since", "some", "start", "still", "stop",
  "such", "take", "than", "that", "their", "them", "then", "there", "these",
  "they", "thing", "think", "this", "those", "through", "time", "today",
  "together", "under", "until", "very", "want", "well", "were", "what",
  "when", "where", "which", "while", "will", "with", "without", "work",
  "works", "would", "your", "yours",
]);

const HASHTAG_TOKEN_RE = /(?:^|[\s(])(#[A-Za-z0-9_]{2,48})\b/g;

/** Extracts normalized `#Tag` tokens already embedded in text. */
export function extractInlineHashtags(text: string): string[] {
  if (!text) return [];
  const found: string[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;
  const re = new RegExp(HASHTAG_TOKEN_RE.source, "g");
  while ((match = re.exec(text)) !== null) {
    const formatted = formatHashtagToken(match[1]);
    if (formatted && !seen.has(formatted.toLowerCase())) {
      seen.add(formatted.toLowerCase());
      found.push(formatted);
    }
  }
  return found;
}

/**
 * Removes all `#hashtag` tokens from ad text descriptions so ad copy never mixes hashtags
 * inside `adText` across any platform.
 */
export function stripHashtagsFromAdText(rawText: string): string {
  if (!rawText) return "";
  return rawText
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) =>
      line
        // Strip hashtags while preserving normal prose spacing
        .replace(/(^|\s)#[A-Za-z0-9_]{2,48}\b/g, "$1")
        // Clean dangling prefixes if an entire line was just "Hashtags: #a #b"
        .replace(/^\s*(?:hashtags?|tags?)\s*:\s*$/i, "")
        .replace(/[ \t]{2,}/g, " ")
        .replace(/\s+([,.;!?])/g, "$1")
        .trim(),
    )
    .filter((line, idx, arr) => {
      if (line.length > 0) return true;
      // Collapse consecutive empty lines
      return idx > 0 && idx < arr.length - 1 && arr[idx - 1].length > 0;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Converts an arbitrary word, phrase, or hashtag string into a clean PascalCase `#Hashtag`. */
export function formatHashtagToken(raw: string): string | null {
  const cleaned = raw
    .replace(/^#+/, "")
    .replace(/['’]/g, "")
    .replace(/[^A-Za-z0-9\s_-]+/g, " ")
    .trim();
  if (!cleaned) return null;

  const parts = cleaned
    .split(/[\s_-]+/)
    .map((p) => p.replace(/[^A-Za-z0-9]/g, ""))
    .filter(Boolean);
  if (parts.length === 0) return null;

  const pascal = parts
    .map((part) => {
      if (/^\d+$/.test(part)) return part;
      // Preserve existing mixed-case branding like "iPhone" or "ColdBrew" if already camel/pascal
      if (/[a-z]/.test(part) && /[A-Z]/.test(part)) {
        return part.charAt(0).toUpperCase() + part.slice(1);
      }
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join("")
    .slice(0, 48);

  if (pascal.length < 2 || /^\d+$/.test(pascal)) return null;
  if (HASHTAG_STOP_WORDS.has(pascal.toLowerCase())) return null;
  return `#${pascal}`;
}

function extractWeightedKeywords(text: string): string[] {
  return text
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/[^A-Za-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((w) => w.trim().toLowerCase())
    .filter((w) => w.length >= 3 && w.length <= 24 && !HASHTAG_STOP_WORDS.has(w) && !/^\d+$/.test(w));
}

function extractCompoundBigrams(text: string): string[] {
  const words = extractWeightedKeywords(text);
  const out: string[] = [];
  for (let i = 0; i < words.length - 1; i++) {
    const combined = `${words[i]} ${words[i + 1]}`;
    if (words[i] !== words[i + 1] && words[i].length + words[i + 1].length <= 26) {
      out.push(combined);
    }
  }
  return out;
}

const PLATFORM_DISCOVERY_TAGS: Record<RemixedAdTextPlatform, string[]> = {
  TIKTOK: ["#TikTokMadeMeBuyIt", "#ForYouPage", "#TrendingNow", "#CreatorFinds", "#SmallBusinessTips"],
  INSTAGRAM: ["#InstaFinds", "#DailyUpgrade", "#ReelsMarketing", "#MustHave", "#ModernLiving"],
  FACEBOOK: ["#SpecialOffer", "#CommunityFinds", "#SmartChoice", "#VerifiedQuality", "#ShopLocal"],
  GOOGLE_ADS: ["#CompareNow", "#TopRated", "#OfficialOffer", "#BestValue", "#HighIntent"],
};

const TONE_DISCOVERY_TAGS: Record<string, string[]> = {
  DIRECT_RESPONSE: ["#LimitedOffer", "#ProvenResults", "#ConversionReady"],
  UGC_CASUAL: ["#RealReview", "#HonestFinds", "#TestedAndLoved"],
  FOUNDER_STORY: ["#FounderStory", "#BuiltWithPurpose", "#CraftedBetter"],
  LUXURY_MINIMAL: ["#Craftsmanship", "#ElevatedLiving", "#RefinedDesign"],
  URGENT: ["#ActNow", "#LimitedTime", "#DontMissOut"],
  EDUCATIONAL: ["#HowItWorks", "#SmartGuide", "#ProTips"],
};

const FRAMEWORK_TAGS: Record<string, string[]> = {
  PAS: ["#ProblemSolved", "#BetterWay"],
  AIDA: ["#MustSee", "#SmartSwitch"],
  UGC_STORY: ["#RealResults", "#CreatorApproved"],
  US_VS_THEM: ["#UpgradeToday", "#WhySwitch"],
  SOCIAL_PROOF_STACK: ["#CustomerFavorite", "#FiveStarChoice"],
};

export interface BuildRemixedAdHashtagsParams {
  platform: RemixedAdTextPlatform;
  brand?: Partial<BrandProfile> | null;
  brandName?: string | null;
  headline: string;
  adText: string;
  cta?: string | null;
  ad?: Partial<NormalizedAd> | null;
  deconstruction?: RemixDoc["deconstruction"] | null;
  aiHashtags?: string[] | null;
  limit?: number;
}

/**
 * 4-Pillar Brand & Remix Hashtag Algorithm:
 * 1. Brand Signature & Version Anchor
 * 2. Remixed Hook, Headline & Unique Mechanism Relevance
 * 3. Target Audience, Pain Points & Source Keyword Signal
 * 4. Platform-Native Discovery & Persuasion Framework Signals
 *
 * Scores candidates deterministically so all AI models (Gemini, Claude, GPT) produce crisp,
 * deduplicated, high-relevance hashtags in a dedicated section below Ad Text Description.
 */
export function buildRemixedAdHashtags(params: BuildRemixedAdHashtagsParams): string[] {
  const limit = Math.max(4, Math.min(10, params.limit ?? 8));
  const scores = new Map<string, { tag: string; score: number }>();

  const addCandidate = (raw: string, weight: number) => {
    const tag = formatHashtagToken(raw);
    if (!tag) return;
    const key = tag.toLowerCase();
    const existing = scores.get(key);
    if (existing) {
      existing.score += Math.round(weight * 0.45);
    } else {
      scores.set(key, { tag, score: weight });
    }
  };

  // Pillar 1: Brand Signature & Identity
  const resolvedBrandName = params.brand?.brandName || params.brandName || "";
  if (resolvedBrandName) {
    addCandidate(resolvedBrandName, 100);
    extractWeightedKeywords(resolvedBrandName).forEach((kw) => addCandidate(kw, 52));
  }
  if (params.brand?.version) {
    addCandidate(params.brand.version, 44);
  }

  // Pillar 2: Remixed Copy, Headline & Unique Mechanism
  const cleanHeadline = stripHashtagsFromAdText(params.headline);
  const cleanCopy = stripHashtagsFromAdText(params.adText);
  extractCompoundBigrams(cleanHeadline).slice(0, 3).forEach((bg) => addCandidate(bg, 84));
  extractWeightedKeywords(cleanHeadline).slice(0, 4).forEach((kw) => addCandidate(kw, 68));

  if (params.brand?.uniqueMechanismOrOffer) {
    extractCompoundBigrams(params.brand.uniqueMechanismOrOffer)
      .slice(0, 2)
      .forEach((bg) => addCandidate(bg, 82));
    extractWeightedKeywords(params.brand.uniqueMechanismOrOffer)
      .slice(0, 3)
      .forEach((kw) => addCandidate(kw, 64));
  }

  // AI-provided platform hashtags (scored high when grounded in brand/copy context)
  (params.aiHashtags ?? []).forEach((rawTag, idx) => {
    addCandidate(rawTag, 92 - idx * 3);
  });

  // Pillar 3: Product Category, Target Audience, Pain Points & Source Highlight Keywords
  if (params.brand?.productServiceDescription) {
    extractCompoundBigrams(params.brand.productServiceDescription)
      .slice(0, 2)
      .forEach((bg) => addCandidate(bg, 78));
    extractWeightedKeywords(params.brand.productServiceDescription)
      .slice(0, 4)
      .forEach((kw) => addCandidate(kw, 62));
  }
  if (params.brand?.targetAudienceAvatar) {
    extractWeightedKeywords(params.brand.targetAudienceAvatar)
      .slice(0, 3)
      .forEach((kw) => addCandidate(kw, 58));
  }
  (params.brand?.corePainPoints ?? []).slice(0, 3).forEach((pain) => {
    extractWeightedKeywords(pain)
      .slice(0, 2)
      .forEach((kw) => addCandidate(kw, 56));
  });
  extractCompoundBigrams(cleanCopy).slice(0, 3).forEach((bg) => addCandidate(bg, 72));
  extractWeightedKeywords(cleanCopy).slice(0, 4).forEach((kw) => addCandidate(kw, 54));

  (params.ad?.highlightKeywords ?? []).slice(0, 4).forEach((kw) => addCandidate(kw, 66));

  // Pillar 4: Platform-Native Discovery, Tone & Persuasion Framework
  const fw = params.deconstruction?.persuasionFramework;
  if (fw && FRAMEWORK_TAGS[fw]) {
    FRAMEWORK_TAGS[fw].forEach((tag, i) => addCandidate(tag, 50 - i * 4));
  }
  const tone = params.brand?.toneOfVoice;
  if (tone && TONE_DISCOVERY_TAGS[tone]) {
    TONE_DISCOVERY_TAGS[tone].forEach((tag, i) => addCandidate(tag, 46 - i * 4));
  }
  (PLATFORM_DISCOVERY_TAGS[params.platform] ?? []).forEach((tag, i) => {
    addCandidate(tag, 42 - i * 3);
  });

  return Array.from(scores.values())
    .sort((a, b) => b.score - a.score || a.tag.localeCompare(b.tag))
    .slice(0, limit)
    .map((entry) => entry.tag);
}

export interface BuildRemixedAdImagePromptParams {
  platform: RemixedAdTextPlatform;
  platformLabel?: string;
  brandName: string;
  headline: string;
  adText: string;
  cta?: string | null;
  brand?: Partial<BrandProfile> | null;
  existingPrompt?: string | null;
}

const TONE_VISUAL_STYLE: Record<string, string> = {
  DIRECT_RESPONSE: "bold direct-response commercial photography with high contrast subject focus",
  UGC_CASUAL: "authentic handheld creator lifestyle photography with warm natural lighting",
  FOUNDER_STORY: "editorial behind-the-scenes studio craftsmanship photography with honest warm tones",
  LUXURY_MINIMAL: "minimalist luxury editorial product photography with soft directional studio shadows",
  URGENT: "energetic high-contrast action composition with dynamic foreground depth",
  EDUCATIONAL: "crisp instructional split-scene visual clarity with clean step-by-step staging",
};

/**
 * Normalizes an AI-generated Google Gemini image prompt or synthesizes a deterministic
 * platform-tailored prompt from the brand, headline, ad copy, and CTA so every card
 * always provides a ready-to-paste visual prompt under Ad Text Description.
 */
export function buildRemixedAdImagePrompt(params: BuildRemixedAdImagePromptParams): string {
  const cleanExisting = stripHashtagsFromAdText(params.existingPrompt ?? "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  if (cleanExisting.length >= 15) {
    return cleanExisting.slice(0, 1500);
  }

  const brandName = (params.brand?.brandName || params.brandName || "this brand").trim();
  const cleanHeadline = stripHashtagsFromAdText(params.headline).replace(/\s+/g, " ").trim();
  const cleanCopy = stripHashtagsFromAdText(params.adText).replace(/\s+/g, " ").trim();
  const firstSentenceMatch = cleanCopy.match(/^(.{15,180}?[.!?])(?:\s|$)/);
  const copyHook = (firstSentenceMatch?.[1] ?? cleanCopy.slice(0, 160)).trim();
  const productContext = (
    params.brand?.productServiceDescription ||
    params.brand?.uniqueMechanismOrOffer ||
    "featured product or service"
  )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140);
  const visualStyle =
    (params.brand?.toneOfVoice && TONE_VISUAL_STYLE[params.brand.toneOfVoice]) ||
    "clean photorealistic commercial advertising photography";
  const ctaNote = params.cta ? ` leading viewers cleanly toward a "${params.cta.trim()}" call to action` : "";

  let prompt: string;
  switch (params.platform) {
    case "TIKTOK":
      prompt = `Create a scroll-stopping 9:16 vertical TikTok advertisement image for ${brandName} showcasing ${productContext}. Visually capture the hook "${cleanHeadline}" and story "${copyHook}" using ${visualStyle}, expressive close-up subject framing, and clean upper and lower negative space safe zones for native overlays${ctaNote}. No embedded watermarks or distorted text.`;
      break;
    case "FACEBOOK":
      prompt = `Create a high-converting 4:5 vertical Facebook Feed advertisement image for ${brandName} featuring ${productContext}. Illustrate "${cleanHeadline}" and the core promise "${copyHook}" with ${visualStyle}, strong above-the-fold focal clarity, relatable customer or product outcome framing${ctaNote}, and balanced composition. Photorealistic, clean, no cluttered baked-in text or watermarks.`;
      break;
    case "INSTAGRAM":
      prompt = `Create a polished 4:5 Instagram Feed and Reels cover advertisement image for ${brandName} highlighting ${productContext}. Translate the concept "${cleanHeadline}" and "${copyHook}" through ${visualStyle}, cohesive modern color grading, tactile depth of field, and an aspirational hero composition${ctaNote}. High-resolution commercial finish without logos glitches or watermarks.`;
      break;
    case "GOOGLE_ADS":
    default:
      prompt = `Create a crisp 16:9 widescreen Google Performance Max and Display advertisement image for ${brandName} presenting ${productContext}. Communicate "${cleanHeadline}" and "${copyHook}" using ${visualStyle}, sharp subject isolation on an uncluttered studio or real-world backdrop, and trustworthy high-intent visual hierarchy${ctaNote}. Clean commercial asset without watermarks or unreadable text.`;
      break;
  }

  return prompt.replace(/\s+/g, " ").trim().slice(0, 1500);
}
