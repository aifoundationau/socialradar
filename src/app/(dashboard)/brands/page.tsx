import type { Metadata } from "next";
import { page } from "@/components/ui/styles";
import { BrandsManager } from "@/components/brands/BrandsManager";
import { buildRouteSeoMetadata } from "@/lib/seo";

// Rendered after the client-side sign-in check, so there's no instant shell to validate.
export const instant = false;

export const metadata: Metadata = buildRouteSeoMetadata({
  title: "My Brands — Brand Profiles, Audience Avatars & Community Library",
  description:
    "Create and manage your brand profiles, target audience avatars, core pain points, and unique offers to power personalized AI ad scoring and creative remixes.",
  canonicalPath: "/brands",
  keywords: [
    "brand profile manager",
    "target audience avatar",
    "brand positioning vault",
    "community brand library",
    "direct response brand voice",
    "AI ad relevance scoring",
    "competitor ad brand fit",
    "AdRadarHQ Brands",
  ],
});

export default function BrandsPage() {
  return (
    <div className={page}>
      <BrandsManager />
    </div>
  );
}
