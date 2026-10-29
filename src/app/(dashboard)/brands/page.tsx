import type { Metadata } from "next";
import { BrandsManager } from "@/components/brands/BrandsManager";

export const metadata: Metadata = { title: "Brands" };

export default function BrandsPage() {
  return <BrandsManager />;
}
