"use client";

import { Suspense } from "react";
import { useSession } from "@/components/auth/SessionProvider";
import { card } from "@/components/ui/styles";
import { CheckoutBanner } from "./CheckoutBanner";
import { LedgerHistory } from "./LedgerHistory";
import { TokenPacks } from "./TokenPacks";

export function WalletView() {
  const { user, profile } = useSession();

  return (
    <div className="space-y-8">
      <Suspense fallback={null}>
        <CheckoutBanner />
      </Suspense>

      <section className={`${card} flex flex-wrap items-end justify-between gap-4`}>
        <div>
          <h1 className="text-sm font-medium text-zinc-500">Token balance</h1>
          <p className="mt-1 text-4xl font-semibold tabular-nums">
            {profile ? profile.tokenBalance.toLocaleString("en-AU") : "–"}
          </p>
        </div>
        <p className="max-w-xs text-sm text-zinc-600 dark:text-zinc-400">
          If a search or remix fails on our side, its tokens are refunded automatically.
        </p>
      </section>

      <TokenPacks />
      {user && <LedgerHistory uid={user.uid} />}
    </div>
  );
}
