import type { Metadata } from "next";
import { page } from "@/components/ui/styles";
import { WalletView } from "@/components/wallet/WalletView";

// Rendered after the client-side sign-in check, so there's no instant shell to validate.
export const instant = false;

export const metadata: Metadata = { title: "Wallet" };

export default function WalletPage() {
  return (
    <div className={page}>
      <WalletView />
    </div>
  );
}
