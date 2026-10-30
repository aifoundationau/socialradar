import type { Metadata } from "next";
import { RadarView } from "@/components/radar/RadarView";

// Rendered after the client-side sign-in check, so there's no instant shell to validate.
export const instant = false;

export const metadata: Metadata = { title: "Radar" };

export default function RadarPage() {
  return <RadarView />;
}
