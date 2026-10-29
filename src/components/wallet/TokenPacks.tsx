"use client";

import { useState } from "react";
import { apiFetch, errorMessage } from "@/lib/api-client";
import type { TokenPackId } from "@/lib/contracts";
import { ACTION_COSTS, TOKEN_PACKS, formatPrice } from "@/lib/pricing";
import { alertError, btnPrimary, card } from "@/components/ui/styles";

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
    <section id="packs" className="space-y-4 scroll-mt-24" aria-labelledby="packs-heading">
      <div>
        <h2 id="packs-heading" className="text-lg font-semibold">
          Top up
        </h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          One-off purchase through Stripe. Tokens never expire. A search uses {ACTION_COSTS.RADAR_SEARCH} tokens, a remix
          uses {ACTION_COSTS.AI_REMIX}.
        </p>
      </div>
      {error && <p className={alertError}>{error}</p>}
      <ul className="grid gap-4 sm:grid-cols-3">
        {Object.values(TOKEN_PACKS).map((pack) => (
          <li
            key={pack.id}
            className={`${card} flex flex-col gap-3 ${pack.id === BEST_VALUE ? "ring-2 ring-emerald-500 dark:ring-emerald-400" : ""}`}
          >
            <div className="flex items-baseline justify-between">
              <p className="text-2xl font-semibold tabular-nums">{pack.tokens.toLocaleString("en-AU")}</p>
              {pack.id === BEST_VALUE && (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  Best value
                </span>
              )}
            </div>
            <p className="text-sm text-zinc-500">tokens</p>
            <p className="text-lg font-medium">{formatPrice(pack.priceCents)}</p>
            <p className="text-xs text-zinc-500">
              {formatPrice(pack.priceCents / pack.tokens)} per token · about{" "}
              {Math.floor(pack.tokens / ACTION_COSTS.AI_REMIX).toLocaleString("en-AU")} remixes
            </p>
            <button
              type="button"
              className={`${btnPrimary} mt-auto`}
              onClick={() => buy(pack.id)}
              disabled={pending !== null}
            >
              {pending === pack.id ? "Opening Stripe…" : "Buy"}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
