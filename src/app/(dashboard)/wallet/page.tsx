import type { Metadata } from "next";
import { page } from "@/components/ui/styles";
import { WalletView } from "@/components/wallet/WalletView";
import { buildRouteSeoMetadata } from "@/lib/seo";

// Rendered after the client-side sign-in check, so there's no instant shell to validate.
export const instant = false;

export const metadata: Metadata = buildRouteSeoMetadata({
  title: "Token Wallet — Pay-As-You-Go Ad Intelligence & Transaction Ledger",
  description:
    "Manage your AdRadarHQ token balance, top up with instant pay-as-you-go token packs in AUD, and view your full search and AI remix transaction ledger.",
  canonicalPath: "/wallet",
  keywords: [
    "pay as you go ad spy",
    "AdRadarHQ tokens",
    "no retainer ad intelligence",
    "AUD ad spy pricing",
    "non-expiring ad tokens",
    "ad research wallet",
    "AdRadarHQ Wallet",
  ],
});

export default function WalletPage() {
  return (
    <div className={page}>
      <WalletView />
    </div>
  );
}
