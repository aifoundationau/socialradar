import type { Metadata } from "next";
import { CustomizeView } from "@/components/customize/CustomizeView";

export const metadata: Metadata = {
  title: "Customize — Professional Brand & Ad Strategy | Social Radar",
};

export default function CustomizePage() {
  return <CustomizeView />;
}
