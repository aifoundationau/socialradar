import type { Metadata } from "next";
import { page } from "@/components/ui/styles";
import { WalletView } from "@/components/wallet/WalletView";

// Rendered after the client-side sign-in check, so there's no instant shell to validate.
export const instant = false;

export const metadata: Metadata = {
  title: "Token Wallet — Pay-As-You-Go Ad Intelligence & Transaction Ledger",
  description:
    "Manage your AdRadarHQ token balance, top up with instant pay-as-you-go token packs in AUD, and view your full search and AI remix transaction ledger.",
};

export default function WalletPage() {
  return (
    <div className={page}>
      <WalletView />
    </div>
  );
}
