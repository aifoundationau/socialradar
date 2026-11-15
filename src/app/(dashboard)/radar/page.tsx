import type { Metadata } from "next";
import { RadarView } from "@/components/radar/RadarView";
import { buildRouteSeoMetadata } from "@/lib/seo";

// Rendered after the client-side sign-in check, so there's no instant shell to validate.
export const instant = false;

export const metadata: Metadata = buildRouteSeoMetadata({
  title: "Ad Radar — Search Meta, TikTok, Google & YouTube Winning Ads",
  description:
    "Search live Meta, TikTok, Google Search, Shopping, Display, and YouTube ad libraries. Filter by 28+ day and 60+ day proven winners and remix top creatives with AI.",
  canonicalPath: "/radar",
  keywords: [
    "Meta Ad Library spy",
    "TikTok ad spy tool",
    "Google Ads Transparency search",
    "YouTube video ad spy",
    "28 day winning ads",
    "60 day evergreen ads",
    "competitor ad search",
    "AI ad hook analyzer",
    "AdRadarHQ Radar",
  ],
});

export default function RadarPage() {
  return <RadarView />;
}
