import type { Metadata } from "next";
import { LibraryView } from "@/components/library/LibraryView";
import { buildRouteSeoMetadata } from "@/lib/seo";

// Rendered after the client-side sign-in check, so there's no instant shell to validate.
export const instant = false;

export const metadata: Metadata = buildRouteSeoMetadata({
  title: "Library — Saved Ad Searches, Remix Studio & Remixed Ad Text",
  description:
    "Browse and purchase every saved Previous Search, Remix Studio blueprint, and 4-platform Remixed Ad Text pack inside AdRadarHQ.",
  canonicalPath: "/library",
  keywords: [
    "AdRadarHQ Library",
    "saved ad searches",
    "Remix Studio blueprints",
    "Remixed Ad Text library",
    "Meta TikTok Google ad templates",
    "buy AI ad variations",
  ],
});

export default function LibraryPage() {
  return <LibraryView />;
}
