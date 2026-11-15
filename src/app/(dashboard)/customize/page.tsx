import type { Metadata } from "next";
import { CustomizeView } from "@/components/customize/CustomizeView";
import { buildRouteSeoMetadata } from "@/lib/seo";

// Rendered after client-side sign-in check, so skip instant shell validation.
export const instant = false;

export const metadata: Metadata = buildRouteSeoMetadata({
  title: "Customize — Professional Brand & Ad Strategy by Senior Experts",
  description:
    "Submit your brand brief for custom positioning, high-converting hooks, and tailored ad scripts crafted by senior direct-response strategists at AdRadarHQ.",
  canonicalPath: "/customize",
  keywords: [
    "custom brand strategy",
    "direct response ad strategist",
    "local ad agent Australia",
    "custom ad hooks and scripts",
    "paid social creative strategy",
    "social media agency alternative",
    "AdRadarHQ Customize",
  ],
});

export default function CustomizePage() {
  return <CustomizeView />;
}

