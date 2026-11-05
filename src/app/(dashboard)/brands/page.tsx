import type { Metadata } from "next";
import { page } from "@/components/ui/styles";
import { BrandsManager } from "@/components/brands/BrandsManager";

// Rendered after the client-side sign-in check, so there's no instant shell to validate.
export const instant = false;

export const metadata: Metadata = {
  title: "My Brands — Brand Profiles, Audience Avatars & Community Library",
  description:
    "Create and manage your brand profiles, target audience avatars, core pain points, and unique offers to power personalized AI ad scoring and creative remixes.",
};

export default function BrandsPage() {
  return (
    <div className={page}>
      <BrandsManager />
    </div>
  );
}
