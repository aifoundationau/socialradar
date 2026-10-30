"use client";

import { Suspense } from "react";
import { useSession } from "@/components/auth/SessionProvider";
import { Icon } from "@/components/ui/Icon";
import { card, monoLabel } from "@/components/ui/styles";
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
          <h1 className={monoLabel}>Token balance</h1>
          <p className="mt-2 flex items-center gap-2 font-mono text-[2.5rem] leading-none font-semibold text-secondary tabular-nums">
            <Icon name="zap" className="size-7" />
            {profile ? profile.tokenBalance.toLocaleString("en-AU") : "–"}
          </p>
        </div>
        <p className="max-w-xs text-body text-on-surface-variant">
          If a search or remix fails on our side, its tokens are refunded automatically.
        </p>
      </section>

      <TokenPacks />
      {user && <LedgerHistory uid={user.uid} />}
    </div>
  );
}
