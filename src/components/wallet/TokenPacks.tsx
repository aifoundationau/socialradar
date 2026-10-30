"use client";

import { useState } from "react";
import { apiFetch, errorMessage } from "@/lib/api-client";
import type { TokenPackId } from "@/lib/contracts";
import { ACTION_COSTS, TOKEN_PACKS, costLabel, formatPrice } from "@/lib/pricing";
import { Icon } from "@/components/ui/Icon";
import { alertError, btnPrimary, btnSecondary, card } from "@/components/ui/styles";

const BEST_VALUE: TokenPackId = "PACK_2000";

export function TokenPacks() {
  const [pending, setPending] = useState<TokenPackId | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function buy(packId: TokenPackId) {
    setPending(packId);
    setError(null);
    try {
      const { url } = await apiFetch<{ url: string }>("/api/wallet/checkout", { body: { packId } });
      window.location.assign(url);
    } catch (err) {
      setError(errorMessage(err));
      setPending(null);
    }
  }

  return (
    <section id="packs" className="scroll-mt-24 space-y-4" aria-labelledby="packs-heading">
      <div>
        <h2 id="packs-heading" className="text-headline-md font-semibold">
          Top up
        </h2>
        <p className="text-body text-on-surface-variant">
          One-off purchase through Stripe. Tokens never expire.{" "}
          {ACTION_COSTS.RADAR_SEARCH || ACTION_COSTS.AI_REMIX
            ? `A search uses ${costLabel("RADAR_SEARCH")}, a remix uses ${costLabel("AI_REMIX")}.`
            : "Searching and remixing are free right now."}
        </p>
      </div>
      {error && <p className={alertError}>{error}</p>}
      <ul className="grid gap-4 sm:grid-cols-3">
        {Object.values(TOKEN_PACKS).map((pack) => {
          const best = pack.id === BEST_VALUE;
          return (
            <li
              key={pack.id}
              className={`${card} relative flex flex-col gap-3 ${
                best ? "border-primary-container shadow-[0_0_24px_rgba(128,131,255,0.18)] ring-1 ring-primary-container" : ""
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <p className="flex items-center gap-1.5 font-mono text-mono-metric text-on-surface tabular-nums">
                  <Icon name="zap" className="size-4 text-secondary" />
                  {pack.tokens.toLocaleString("en-AU")}
                </p>
                {best && (
                  <span className="rounded-full border border-primary-container/40 bg-primary-container/20 px-2 py-0.5 font-mono text-mono-label text-primary uppercase">
                    Best value
                  </span>
                )}
              </div>
              <p className="text-compact text-outline">tokens</p>
              <p className="text-title-sm font-semibold">{formatPrice(pack.priceCents)}</p>
              <p className="font-mono text-[11px] text-outline">
                {formatPrice(pack.priceCents / pack.tokens)} per token
                {ACTION_COSTS.AI_REMIX > 0 &&
                  ` · about ${Math.floor(pack.tokens / ACTION_COSTS.AI_REMIX).toLocaleString("en-AU")} remixes`}
              </p>
              <button
                type="button"
                className={`${best ? btnPrimary : btnSecondary} mt-auto w-full`}
                onClick={() => buy(pack.id)}
                disabled={pending !== null}
              >
                {pending === pack.id ? "Opening Stripe…" : "Buy"}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
