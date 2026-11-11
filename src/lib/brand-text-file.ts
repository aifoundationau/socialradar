import type { BrandProfile } from "./contracts";

const TONE_NAMES: Record<BrandProfile["toneOfVoice"], string> = {
  DIRECT_RESPONSE: "Direct response",
  AUTHORITATIVE: "Authoritative",
  UGC_CASUAL: "UGC / casual",
  URGENT: "Urgent",
};

/**
 * Extracts a clean YYYY-MM-DD date string from the brand's saved timestamp
 * (`updatedAt` or `createdAt`).
 */
export function formatBrandSavedDate(isoDate?: string): string {
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
 * Formats the saved timestamp into a readable date and time for display inside the text file.
 */
export function formatBrandSavedTimestamp(isoDate?: string): string {
  if (!isoDate) return formatBrandSavedDate();
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  return `${formatBrandSavedDate(isoDate)} (${parsed.toISOString()})`;
}

/**
 * Sanitizes a brand name for safe operating-system file names while preserving spaces and casing.
 */
function sanitizeFileNameSegment(raw: string): string {
  const cleaned = (raw || "Brand")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || "Brand";
}

/**
 * Builds the official attached brand text file name:
 * `<Brand Name> - <Date Saved (YYYY-MM-DD)>.txt`
 */
export function getBrandTextFileName(
  brand: Pick<BrandProfile, "brandName" | "createdAt" | "updatedAt">
): string {
  const safeName = sanitizeFileNameSegment(brand.brandName);
  const savedDate = formatBrandSavedDate(brand.updatedAt || brand.createdAt);
  return `${safeName} - ${savedDate}.txt`;
}

/**
 * Generates the complete plain-text file content containing all brand information.
 */
export function buildBrandTextFileContent(brand: BrandProfile): string {
  const savedTimestamp = brand.updatedAt || brand.createdAt;
  const savedDate = formatBrandSavedDate(savedTimestamp);
  const fileName = getBrandTextFileName(brand);
  const urls =
    brand.landingPageUrls && brand.landingPageUrls.length > 0
      ? brand.landingPageUrls
      : [brand.destinationUrl].filter(Boolean);
  const painPoints = Array.isArray(brand.corePainPoints) ? brand.corePainPoints : [];
  const toneLabel = TONE_NAMES[brand.toneOfVoice] ?? brand.toneOfVoice;

  const lines: string[] = [
    "================================================================================",
    "AD RADAR (SOCIAL RADAR) — BRAND PROFILE & STRATEGY FILE",
    "================================================================================",
    `File Name:           ${fileName}`,
    `Brand Name:          ${brand.brandName}`,
    ...(brand.version ? [`Version / Tag:       ${brand.version}`] : []),
    `Brand ID:            ${brand.brandId}`,
    `Date Saved:          ${savedDate}`,
    `Saved Timestamp:     ${formatBrandSavedTimestamp(savedTimestamp)}`,
    ...(brand.createdAt
      ? [`Created Timestamp:   ${formatBrandSavedTimestamp(brand.createdAt)}`]
      : []),
    `Visibility:          ${brand.isGlobal ? "Global (Shared in Community Library)" : "Private (Personal Account)"}`,
    ...(brand.authorEmail ? [`Author Account:      ${brand.authorEmail}`] : []),
    ...(brand.clonedFromBrandId ? [`Cloned From ID:      ${brand.clonedFromBrandId}`] : []),
    `Tone of Voice:       ${toneLabel} (${brand.toneOfVoice})`,
    "================================================================================",
    "",
    "1. PRODUCT OR SERVICE DESCRIPTION",
    "--------------------------------------------------------------------------------",
    brand.productServiceDescription || "(None provided)",
    "",
    "2. TARGET CUSTOMER AVATAR (IDEAL BUYER)",
    "--------------------------------------------------------------------------------",
    brand.targetAudienceAvatar || "(None provided)",
    "",
    "3. CORE CUSTOMER PAIN POINTS",
    "--------------------------------------------------------------------------------",
    ...(painPoints.length > 0
      ? painPoints.map((pt, idx) => `${idx + 1}. ${pt}`)
      : ["(None provided)"]),
    "",
    "4. UNIQUE MECHANISM OR OFFER",
    "--------------------------------------------------------------------------------",
    brand.uniqueMechanismOrOffer || "(None provided)",
    "",
    "5. DESTINATION & LANDING PAGE URLS",
    "--------------------------------------------------------------------------------",
    `Primary Destination: ${brand.destinationUrl || urls[0] || "(None provided)"}`,
    ...(urls.length > 0
      ? [
          "",
          "All Configured Landing Pages:",
          ...urls.map(
            (u, idx) =>
              `  ${idx + 1}. ${u}${u === brand.destinationUrl ? " [Primary]" : ""}`
          ),
        ]
      : []),
    "",
    "================================================================================",
    "Copyright (c) 2026 AI Foundation Australia. All rights reserved.",
    "================================================================================",
  ];

  return lines.join("\n");
}

/**
 * Returns the complete attachment object (`fileName`, `savedDate`, and `content`) for a brand.
 */
export function getBrandTextAttachment(brand: BrandProfile): {
  fileName: string;
  savedDate: string;
  content: string;
} {
  const savedDate = formatBrandSavedDate(brand.updatedAt || brand.createdAt);
  const fileName = brand.brandTextFileName || getBrandTextFileName(brand);
  const content = brand.brandTextFileContent || buildBrandTextFileContent(brand);
  return { fileName, savedDate, content };
}

/**
 * Triggers a browser download of the brand's attached `.txt` file.
 */
export function downloadBrandTextFile(
  brand: BrandProfile,
  override?: { fileName?: string; content?: string }
): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const fallback = getBrandTextAttachment(brand);
  const fileName = override?.fileName || fallback.fileName;
  const content = override?.content || fallback.content;
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

