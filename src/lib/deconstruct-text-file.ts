import type { AdRemixBlueprint, NormalizedAd, RemixDoc } from "./contracts";

const FRAMEWORK_LABELS: Record<
  AdRemixBlueprint["deconstruction"]["persuasionFramework"],
  string
> = {
  PAS: "PAS (Problem · Agitate · Solve)",
  AIDA: "AIDA (Attention · Interest · Desire · Action)",
  UGC_STORY: "UGC Story (Relatable moment · Discovery · Transformation · Recommendation)",
  US_VS_THEM: "Us vs Them (Old way · Why it fails · New way · Proof)",
  SOCIAL_PROOF_STACK: "Social Proof Stack (Claim · Proof · More proof · Ask)",
};

/**
 * Builds the official Deconstructed Anatomy file name:
 * `<brandname>deconstruct.txt`
 */
export function getDeconstructFileName(brandName?: string | null): string {
  const normalized = (brandName || "brand")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 60);
  return `${normalized || "brand"}deconstruct.txt`;
}

/**
 * Generates the complete plain-text content for `<brandname>deconstruct.txt`,
 * including the Deconstructed Anatomy and all 3 Remixed Variations.
 */
export function buildDeconstructTextFileContent(options: {
  remix: RemixDoc | AdRemixBlueprint;
  brandName?: string | null;
  ad?: Partial<NormalizedAd> | null;
  dateIso?: string;
}): string {
  const { remix, brandName, ad } = options;
  const resolvedBrandName = (brandName || "Your Brand").trim();
  const fileName = getDeconstructFileName(resolvedBrandName);
  const savedIso = options.dateIso || new Date().toISOString();
  const savedDate = savedIso.slice(0, 10);
  const d = remix.deconstruction;
  const frameworkLabel = FRAMEWORK_LABELS[d.persuasionFramework] ?? d.persuasionFramework;

  const lines: string[] = [
    "================================================================================",
    "AD RADAR (SOCIAL RADAR) — DECONSTRUCTED ANATOMY & REMIX BLUEPRINT",
    "================================================================================",
    `File Name:            ${fileName}`,
    `Brand Name:           ${resolvedBrandName}`,
    ...("remixId" in remix && remix.remixId ? [`Remix ID:             ${remix.remixId}`] : []),
    ...("sourceAdId" in remix && remix.sourceAdId
      ? [`Source Ad ID:         ${remix.sourceAdId}`]
      : ad?.adId
        ? [`Source Ad ID:         ${ad.adId}`]
        : []),
    ...(ad?.advertiserName ? [`Source Advertiser:    ${ad.advertiserName}`] : []),
    ...(ad?.platform ? [`Platform:             ${ad.platform}`] : []),
    ...(typeof ad?.activeDaysCount === "number"
      ? [`Source Days Live:     ${ad.activeDaysCount} days`]
      : []),
    `Date Generated:       ${savedDate} (${savedIso})`,
    "================================================================================",
    "",
    "PART 1 — DECONSTRUCTED ANATOMY",
    "--------------------------------------------------------------------------------",
    "1. HOOK PATTERN (0-3s)",
    d.hookAnalysis || "(None)",
    "",
    "2. PACING & RETENTION TIMELINE",
    ...(d.pacingStructure.length > 0
      ? d.pacingStructure.map((beat, idx) => `  ${idx + 1}. ${beat}`)
      : ["  (None)"]),
    "",
    "3. PERSUASION FRAMEWORK",
    `  ${frameworkLabel}`,
    "",
    "4. WHY IT WORKS",
    d.whyItWorks || "(None)",
    "",
    "================================================================================",
    `PART 2 — 3 REMIXED VARIATIONS FOR ${resolvedBrandName.toUpperCase()}`,
    "--------------------------------------------------------------------------------",
  ];

  remix.variations.forEach((v, idx) => {
    const letter = String.fromCharCode(65 + idx);
    lines.push(
      "",
      `VARIATION ${letter}: ${v.angleName}`,
      "--------------------------------------------------------------------------------",
      `Headline:             ${v.headline}`,
      `Call to Action (CTA): ${v.ctaButton}`,
      "",
      "Primary Copy:",
      v.primaryCopy,
      "",
      "Shot-by-Shot Storyboard:",
      ...v.videoStoryboard.map(
        (b, bIdx) =>
          `  ${bIdx + 1}. [${b.timestamp}]\n     Visual:    ${b.visualAction}\n     Voiceover: ${b.spokenAudio}\n     On-Screen: ${b.onScreenText}`
      ),
      "",
      "Image Generation Prompt:",
      v.imageGenerationPrompt
    );
  });

  lines.push(
    "",
    "================================================================================",
    "Copyright (c) 2026 AI Foundation Australia. All rights reserved.",
    "================================================================================"
  );

  return lines.join("\n");
}

/**
 * Triggers a browser download of `<brandname>deconstruct.txt`.
 */
export function triggerDeconstructFileDownload(fileName: string, content: string): void {
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

