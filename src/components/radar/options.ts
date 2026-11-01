import type { MediaFilter, NormalizedAd, Platform } from "@/lib/contracts";

/** Channel names and accent classes (pills use 15% fills with 30% borders). */
export const PLATFORMS: Record<Platform, { label: string; library: string; chip: string; dot: string }> = {
  META: {
    label: "Meta",
    library: "Meta Ad Library",
    chip: "border-meta/30 bg-meta/15 text-meta-soft",
    dot: "bg-meta shadow-[0_0_8px_rgba(168,85,247,0.7)]",
  },
  TIKTOK: {
    label: "TikTok",
    library: "TikTok Ads Library",
    chip: "border-tiktok/30 bg-tiktok/15 text-tiktok-soft",
    dot: "bg-tiktok shadow-[0_0_8px_rgba(6,182,212,0.7)]",
  },
  GOOGLE: {
    label: "Google",
    library: "Google Ads Transparency Center",
    chip: "border-google/30 bg-google/15 text-google-soft",
    dot: "bg-google shadow-[0_0_8px_rgba(59,130,246,0.7)]",
  },
};

export const PLATFORM_ORDER: Platform[] = ["META", "TIKTOK", "GOOGLE"];

export const MEDIA_FILTERS: { value: MediaFilter; label: string }[] = [
  { value: "ALL", label: "All formats" },
  { value: "VIDEO", label: "Video" },
  { value: "IMAGE", label: "Image" },
];

export const MEDIA_LABELS: Record<NormalizedAd["mediaType"], string> = {
  VIDEO: "Video",
  IMAGE: "Image",
  CAROUSEL: "Carousel",
  TEXT: "Text",
};

export const COUNTRIES: { value: string; label: string }[] = [
  { value: "AU", label: "Australia" },
  { value: "NZ", label: "New Zealand" },
  { value: "US", label: "United States" },
  { value: "GB", label: "United Kingdom" },
  { value: "CA", label: "Canada" },
  { value: "IE", label: "Ireland" },
  { value: "DE", label: "Germany" },
  { value: "FR", label: "France" },
  { value: "NL", label: "Netherlands" },
  { value: "ES", label: "Spain" },
  { value: "IT", label: "Italy" },
  { value: "SE", label: "Sweden" },
  { value: "SG", label: "Singapore" },
];

export type SortKey = "SCORE" | "LIKES" | "VIEWS" | "LONGEST";

export const SORTS: { value: SortKey; label: string }[] = [
  { value: "SCORE", label: "Winning score" },
  { value: "LIKES", label: "Most likes" },
  { value: "VIEWS", label: "Most views" },
  { value: "LONGEST", label: "Longest ad online" },
];

export const formatDay = (iso: string) =>
  new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
