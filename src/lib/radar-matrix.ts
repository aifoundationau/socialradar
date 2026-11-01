import type { BrandProfile, MatrixScoreBreakdown } from "./contracts";

interface AdCandidate {
  primaryCopy: string;
  headline: string;
  ctaText: string;
  activeDaysCount: number;
  winningScore?: number;
  totalViews?: number;
  duplicates?: number;
}

const HOOK_PATTERNS = [
  /\b(?:stop|don't|never|quit)\b/i,
  /\b(?:tired of|struggling with|sick of|frustrated)\b/i,
  /\b(?:why|how to|the secret|the truth|revealed)\b/i,
  /\b(?:we tested|proven|scientific|research|study)\b/i,
  /\b(?:warning|alert|attention|psa)\b/i,
  /\b(?:before you|if you|are you)\b/i,
  /\b(?:90%|95%|99%|1 in \d+|thousands of)\b/i,
  /\b(?:guaranteed|risk-free|money back|free)\b/i,
];

/** Extract meaningful lowercase word tokens (min length 4, ignoring common stop words). */
export function extractTokens(text: string): string[] {
  const STOP_WORDS = new Set([
    "this", "that", "with", "from", "have", "were", "they", "their", "will", "would",
    "there", "about", "which", "when", "make", "time", "just", "know", "take", "people",
    "into", "year", "your", "good", "some", "could", "them", "other", "than", "then",
    "look", "only", "come", "over", "think", "also", "back", "after", "used", "work",
    "more", "even", "most", "also", "made", "want", "like", "well", "much", "very",
  ]);

  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOP_WORDS.has(w));
}

/**
 * Computes multi-dimensional Matrix Scores evaluating an ad against the active Brand Profile.
 * Incorporates Total Views ($V_{total}$) and extracts Highlight Keywords.
 * Adheres strictly to the brand-matrix-radar-engine specification:
 * - Deterministic Math.round integers 0–100
 * - Universal model compatibility (Gemini 2.5 Flash-Lite, Claude Haiku 4.5, gpt-6-luna)
 */
export function calculateMatrixScore(
  ad: AdCandidate,
  brand?: BrandProfile | null,
): MatrixScoreBreakdown {
  const duplicates = ad.duplicates ?? 0;

  // 1. Total Views Calculation ($V_{total}$)
  const baseViews =
    ad.totalViews ??
    Math.round(ad.activeDaysCount * 1250 + (ad.winningScore ?? 50) * 350);
  const totalViews = Math.max(0, baseViews);

  // Views scale score: log10 scale from 100 to 1M+ views mapped to 10-100
  const viewsScore = Math.min(
    100,
    Math.max(10, Math.round(Math.log10(Math.max(100, totalViews)) * 16.6))
  );

  // Longevity raw (active days + duplicate creatives)
  const longevityRaw = ad.activeDaysCount * 2.0 + duplicates * 6.0;
  const longevityBase = Math.min(100, Math.max(10, Math.round(longevityRaw)));

  // Combined scale pillar: 60% longevity + 40% total views volume
  const longevityScore = Math.min(
    100,
    Math.max(10, Math.round(0.6 * longevityBase + 0.4 * viewsScore))
  );

  const adText = `${ad.headline} ${ad.primaryCopy}`.slice(0, 1000);

  // Baseline if no brand profile is provided
  if (!brand) {
    const defaultHook = Math.min(
      100,
      Math.max(
        30,
        Math.round(
          45 + (ad.headline ? 20 : 0) + (ad.primaryCopy.length > 50 ? 25 : 10)
        )
      )
    );
    const defaultBrand = Math.min(
      100,
      Math.max(30, Math.round(50 + (ad.activeDaysCount >= 30 ? 25 : 10)))
    );
    const compositeScore = Math.min(
      100,
      Math.max(
        0,
        Math.round(0.4 * defaultBrand + 0.3 * defaultHook + 0.3 * longevityScore)
      )
    );
    const genericKeywords = extractTokens(adText).slice(0, 5);

    return {
      brandFitScore: defaultBrand,
      hookStrengthScore: defaultHook,
      longevityScore,
      compositeScore,
      resonanceReason: `Proven winner with ${totalViews.toLocaleString("en-AU")} estimated views running across ${ad.activeDaysCount} days.`,
      totalViews,
      highlightKeywords: genericKeywords,
    };
  }

  // 2. Hook Viability Pillar (30%)
  let matchedHooks = 0;
  for (const pattern of HOOK_PATTERNS) {
    if (pattern.test(adText)) matchedHooks++;
  }

  const hookPatternBonus = Math.min(40, matchedHooks * 12);
  const headlineBonus = ad.headline.trim().length > 10 ? 20 : 5;
  const ctaBonus = ad.ctaText.trim().length > 0 ? 15 : 5;
  const copyDepthBonus = ad.primaryCopy.length > 120 ? 15 : 5;
  const hookStrengthScore = Math.min(
    100,
    Math.max(
      25,
      Math.round(
        15 + hookPatternBonus + headlineBonus + ctaBonus + copyDepthBonus
      )
    )
  );

  // 3. Brand Resonance Pillar (40%) & Highlight Keywords
  const brandKeywords = new Set([
    ...extractTokens(brand.productServiceDescription),
    ...extractTokens(brand.targetAudienceAvatar),
    ...extractTokens(brand.uniqueMechanismOrOffer),
    ...brand.corePainPoints.flatMap(extractTokens),
  ]);

  const adTokens = extractTokens(adText);
  const matchedKeywordSet = new Set<string>();

  for (const token of adTokens) {
    if (brandKeywords.has(token)) {
      matchedKeywordSet.add(token);
    }
  }

  // Also check for multi-word phrases from pain points and unique mechanism
  const fullAdLower = adText.toLowerCase();
  for (const phrase of [
    ...brand.corePainPoints,
    brand.uniqueMechanismOrOffer,
    brand.brandName,
  ]) {
    const cleanPhrase = phrase.toLowerCase().trim();
    if (
      cleanPhrase.length >= 4 &&
      cleanPhrase.length <= 40 &&
      fullAdLower.includes(cleanPhrase)
    ) {
      matchedKeywordSet.add(cleanPhrase);
    }
  }

  const highlightKeywords = Array.from(matchedKeywordSet).slice(0, 10);
  const matchedKeywordsCount = highlightKeywords.length;

  // Tone of voice resonance
  let toneBonus = 10;
  if (brand.toneOfVoice === "DIRECT_RESPONSE" && matchedHooks >= 2) toneBonus += 15;
  if (
    brand.toneOfVoice === "URGENT" &&
    /\b(?:today|now|limited|fast|quick|hurry)\b/i.test(adText)
  )
    toneBonus += 15;
  if (
    brand.toneOfVoice === "UGC_CASUAL" &&
    /\b(?:i tried|my honest|tiktok made|obsessed|review)\b/i.test(adText)
  )
    toneBonus += 15;

  const keywordMatchBonus = Math.min(45, matchedKeywordsCount * 8);
  const baseBrandScore = 30; // base relevance for being in the same market search
  const brandFitScore = Math.min(
    100,
    Math.max(20, Math.round(baseBrandScore + keywordMatchBonus + toneBonus))
  );

  // Composite Matrix Score: 40% Brand, 30% Hook, 30% Scale (Longevity + Views)
  const compositeScore = Math.min(
    100,
    Math.max(
      0,
      Math.round(
        0.4 * brandFitScore + 0.3 * hookStrengthScore + 0.3 * longevityScore
      )
    )
  );

  // Generate authentic, explainable reason
  let resonanceReason = "";
  const bestPainPoint = brand.corePainPoints[0];
  if (matchedKeywordsCount >= 2 && bestPainPoint) {
    resonanceReason = `Strong resonance with "${bestPainPoint.slice(0, 50)}": aligns with audience intent, ${totalViews.toLocaleString("en-AU")} views.`;
  } else if (matchedHooks >= 2) {
    resonanceReason = `High persuasion velocity: proven direct-response hooks with ${totalViews.toLocaleString("en-AU")} views across ${ad.activeDaysCount} days.`;
  } else {
    resonanceReason = `Scalable winner in ${brand.brandName}'s vertical with ${totalViews.toLocaleString("en-AU")} views across ${ad.activeDaysCount} days.`;
  }

  return {
    brandFitScore,
    hookStrengthScore,
    longevityScore,
    compositeScore,
    resonanceReason: resonanceReason.slice(0, 300),
    totalViews,
    highlightKeywords,
  };
}
