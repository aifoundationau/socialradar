import type { NormalizedAd, RemixDoc } from "./contracts";

/**
 * Extracts a clean YYYY-MM-DD date string from a timestamp (or defaults to today in UTC).
 */
export function formatSearchMixDate(isoDate?: string): string {
  if (isoDate) {
    const parsed = new Date(isoDate);
    if (!Number.isNaN(parsed.getTime())) {
      const y = parsed.getUTCFullYear();
      const m = String(parsed.getUTCMonth() + 1).padStart(2, "0");
      const d = String(parsed.getUTCDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
    const match = isoDate.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  }
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Sanitizes a title for safe operating-system file names while preserving readable words.
 */
function sanitizeTitleForFileName(raw: string): string {
  const cleaned = (raw || "SearchMix Postcard")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 90)
    .replace(/[\s.-]+$/, "");
  return cleaned || "SearchMix Postcard";
}

/**
 * Resolves the display title of a search result postcard from its advertiser name, headline, or query.
 */
export function getSearchMixTitle(
  ad: Pick<NormalizedAd, "advertiserName" | "headline" | "adId">,
  searchQuery?: string
): string {
  const advertiser = (ad.advertiserName || "").trim();
  const headline = (ad.headline || "").trim();

  if (advertiser && headline && advertiser.toLowerCase() !== headline.toLowerCase()) {
    if (headline.toLowerCase().startsWith(advertiser.toLowerCase())) {
      return headline;
    }
    return `${advertiser} - ${headline}`;
  }
  if (headline) return headline;
  if (advertiser) return advertiser;
  if (searchQuery && searchQuery.trim()) return searchQuery.trim();
  return ad.adId || "SearchMix Postcard";
}

/**
 * Builds the official SearchMix `.txt` file name based on the postcard's title and date:
 * `<Title> - <Date (YYYY-MM-DD)>.txt`
 */
export function getSearchMixFileName(
  ad: Pick<NormalizedAd, "advertiserName" | "headline" | "adId" | "lastSeenDate" | "firstSeenDate">,
  options?: { searchQuery?: string; dateIso?: string }
): string {
  const title = sanitizeTitleForFileName(getSearchMixTitle(ad, options?.searchQuery));
  const dateStr = formatSearchMixDate(options?.dateIso || new Date().toISOString());
  return `${title} - ${dateStr}.txt`;
}

/**
 * Generates the complete plain-text file content for a SearchMix postcard.
 */
export function buildSearchMixTextFileContent(
  ad: NormalizedAd,
  options?: {
    searchQuery?: string;
    dateIso?: string;
    rank?: number;
    remix?: RemixDoc | null;
  }
): string {
  const savedDate = formatSearchMixDate(options?.dateIso || new Date().toISOString());
  const title = getSearchMixTitle(ad, options?.searchQuery);
  const fileName = getSearchMixFileName(ad, options);
  const views = ad.totalViews ?? ad.matrixScore?.totalViews ?? 0;
  const likes = ad.totalLikes ?? ad.matrixScore?.totalLikes ?? Math.round(views * 0.042);
  const keywords = ad.matrixScore?.highlightKeywords ?? ad.highlightKeywords ?? [];

  const lines: string[] = [
    "================================================================================",
    "AD RADAR (SOCIAL RADAR) — SEARCHMIX POSTCARD INTELLIGENCE FILE",
    "================================================================================",
    `File Name:           ${fileName}`,
    `Postcard Title:      ${title}`,
    `Advertiser Name:     ${ad.advertiserName || "Unknown advertiser"}`,
    `Headline:            ${ad.headline || "(None)"}`,
    ...(options?.searchQuery ? [`Search Keyword/Hook: ${options.searchQuery}`] : []),
    `Platform:            ${ad.platform}`,
    `Country Code:        ${ad.countryCode}`,
    `Media Format:        ${ad.mediaType}`,
    `Ad ID:               ${ad.adId}`,
    ...(options?.rank && Number.isFinite(options.rank) ? [`Search Rank:         #${options.rank}`] : []),
    `Date Saved:          ${savedDate}`,
    `First Seen Date:     ${formatSearchMixDate(ad.firstSeenDate)} (${ad.firstSeenDate})`,
    `Last Seen Date:      ${formatSearchMixDate(ad.lastSeenDate)} (${ad.lastSeenDate})`,
    "================================================================================",
    "",
    "1. LONGEVITY & PERFORMANCE METRICS",
    "--------------------------------------------------------------------------------",
    `Days Live:           ${ad.activeDaysCount} days`,
    `Winning Score:       ${ad.winningScore} / 100`,
    `Estimated Views:     ${views.toLocaleString("en-AU")}`,
    `Estimated Likes:     ${likes.toLocaleString("en-AU")}`,
    ...(ad.matrixScore
      ? [
          `Matrix Match Score:  ${ad.matrixScore.compositeScore} / 100`,
          `  - Brand Fit:       ${ad.matrixScore.brandFitScore}%`,
          `  - Hook Power:      ${ad.matrixScore.hookStrengthScore}%`,
          `  - Scale & Reach:   ${ad.matrixScore.longevityScore}%`,
          ...(ad.matrixScore.resonanceReason
            ? [`Resonance Summary:   ${ad.matrixScore.resonanceReason}`]
            : []),
        ]
      : []),
    ...(keywords.length > 0 ? [`Resonant Keywords:   ${keywords.join(", ")}`] : []),
    "",
    "2. AD COPY, HOOK & CALL TO ACTION",
    "--------------------------------------------------------------------------------",
    `Headline:            ${ad.headline || "(None)"}`,
    `Call to Action:      ${ad.ctaText || "(None)"}`,
    "",
    "Primary Ad Copy:",
    ad.primaryCopy || "(No primary copy provided)",
    "",
    "3. DESTINATION & CREATIVE LINKS",
    "--------------------------------------------------------------------------------",
    `Landing Page URL:    ${ad.landingPageUrl || "(None provided)"}`,
    `Thumbnail URL:       ${ad.thumbnailUrl || "(None provided)"}`,
    ...(ad.mediaUrls && ad.mediaUrls.length > 0
      ? [
          "Media URLs:",
          ...ad.mediaUrls.map((u, idx) => `  ${idx + 1}. ${u}`),
        ]
      : []),
  ];

  if (options?.remix) {
    const r = options.remix;
    lines.push(
      "",
      "4. AI CREATIVE REMIX DECONSTRUCTION & VARIATIONS",
      "--------------------------------------------------------------------------------",
      `Persuasion Framework: ${r.deconstruction.persuasionFramework}`,
      `Hook Analysis:        ${r.deconstruction.hookAnalysis}`,
      `Why It Works:         ${r.deconstruction.whyItWorks}`,
      "Pacing Structure:",
      ...r.deconstruction.pacingStructure.map((p, idx) => `  ${idx + 1}. ${p}`),
      ""
    );
    r.variations.forEach((v, idx) => {
      const letter = String.fromCharCode(65 + idx);
      lines.push(
        `Variation ${letter} — ${v.angleName}`,
        `  Headline: ${v.headline}`,
        `  CTA:      ${v.ctaButton}`,
        `  Copy:     ${v.primaryCopy}`,
        "  Storyboard:",
        ...v.videoStoryboard.map(
          (b) =>
            `    [${b.timestamp}] Visual: ${b.visualAction} | Audio: ${b.spokenAudio} | Text: ${b.onScreenText}`
        ),
        ""
      );
    });
  }

  lines.push(
    "",
    "================================================================================",
    "Copyright (c) 2026 AI Foundation Australia. All rights reserved.",
    "================================================================================"
  );

  return lines.join("\n");
}

/**
 * Triggers a browser download of the SearchMix `.txt` file.
 */
export function triggerSearchMixFileDownload(fileName: string, content: string): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

