import type { Metadata } from "next";
import { RadarView } from "@/components/radar/RadarView";

// Rendered after the client-side sign-in check, so there's no instant shell to validate.
export const instant = false;

export const metadata: Metadata = {
  title: "Ad Radar — Search Meta, TikTok, Google & YouTube Winning Ads",
  description:
    "Search live Meta, TikTok, Google Search, Shopping, Display, and YouTube ad libraries. Filter by 28+ day and 60+ day proven winners and remix top creatives with AI.",
};

export default function RadarPage() {
  return <RadarView />;
}
