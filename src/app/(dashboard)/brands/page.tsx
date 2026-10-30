import type { Metadata } from "next";
import { page } from "@/components/ui/styles";
import { BrandsManager } from "@/components/brands/BrandsManager";

// Rendered after the client-side sign-in check, so there's no instant shell to validate.
export const instant = false;

export const metadata: Metadata = { title: "Brands" };

export default function BrandsPage() {
  return (
    <div className={page}>
      <BrandsManager />
    </div>
  );
}
