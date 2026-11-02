import type { Metadata } from "next";
import { CustomizeView } from "@/components/customize/CustomizeView";

// Rendered after client-side sign-in check, so skip instant shell validation.
export const instant = false;

export const metadata: Metadata = {
  title: "Customize — Professional Brand & Ad Strategy | Social Radar",
};

export default function CustomizePage() {
  return <CustomizeView />;
}

