import type { Metadata } from "next";
import { CustomizeView } from "@/components/customize/CustomizeView";

// Rendered after client-side sign-in check, so skip instant shell validation.
export const instant = false;

export const metadata: Metadata = {
  title: "Customize — Professional Brand & Ad Strategy by Senior Experts",
  description:
    "Submit your brand brief for custom positioning, high-converting hooks, and tailored ad scripts crafted by senior direct-response strategists at AdRadarHQ.",
};

export default function CustomizePage() {
  return <CustomizeView />;
}

