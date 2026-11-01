"use client";

import { useEffect, useState } from "react";
import { apiFetch, errorMessage } from "@/lib/api-client";
import type { TokenPackId } from "@/lib/contracts";
import {
  ACTION_COSTS,
  TOKEN_PACKS,
  buildTokenPack,
  costLabel,
  formatAud,
  formatUsd,
} from "@/lib/pricing";
import { loadGeoConfig, type GeoConfig } from "@/lib/geo";
import { Icon } from "@/components/ui/Icon";
import { alertError, btnPrimary, btnSecondary, card, field } from "@/components/ui/styles";

const BEST_VALUE: TokenPackId = "PACK_100";

export function TokenPacks() {
  const [pending, setPending] = useState<TokenPackId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [geo, setGeo] = useState<GeoConfig>(loadGeoConfig());
  const [customTokens, setCustomTokens] = useState<number>(25);

  useEffect(() => {
    setGeo(loadGeoConfig());
  }, []);

  async function buy(packId: TokenPackId, amount?: number) {
    setPending(packId);
    setError(null);
    try {
      const body =
        packId === "PACK_CUSTOM"
          ? { packId, customTokens: Math.max(1, Math.round(amount || customTokens || 10)) }
          : { packId };
      const { url } = await apiFetch<{ url: string }>("/api/wallet/checkout", { body });
      window.location.assign(url);
    } catch (err) {
      setError(errorMessage(err));
      setPending(null);
    }
  }

  // Live calculation for Custom Pack
  const customPack = buildTokenPack("PACK_CUSTOM", customTokens);
  const customDisplayPrice = geo.isAuNz
    ? formatAud(customPack.priceCents)
    : formatUsd(customPack.priceUsdCents);

  return (
    <section id="packs" className="scroll-mt-24 space-y-4" aria-labelledby="packs-heading">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 id="packs-heading" className="text-headline-md font-semibold">
            Top up
          </h2>
          <p className="text-body text-on-surface-variant">
            One-off purchase through Stripe. Tokens never expire. Base rate is USD $1.00 per token.{" "}
            {ACTION_COSTS.RADAR_SEARCH || ACTION_COSTS.AI_REMIX
              ? `A search uses ${costLabel("RADAR_SEARCH")}, a remix uses ${costLabel("AI_REMIX")}.`
              : "Searching and remixing are free right now."}
          </p>
        </div>

        {/* Geolocation Currency Tag */}
        <div className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-surface-container-low px-3 py-1.5 font-mono text-[11px]">
          <Icon name="globe" className="size-3.5 text-primary" />
          <span>
            {geo.isAuNz
              ? "AUD Display (AU/NZ Geolocation Verified)"
              : "USD Display (Converted to AUD at Checkout)"}
          </span>
        </div>
      </div>

      {error && <p className={alertError}>{error}</p>}

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Standard Packs: 10, 50, 100 */}
        {Object.values(TOKEN_PACKS).map((pack) => {
          const best = pack.id === BEST_VALUE;
          const displayPrice = geo.isAuNz ? formatAud(pack.priceCents) : formatUsd(pack.priceUsdCents);
          const perToken = geo.isAuNz
            ? `${formatAud(Math.round(pack.priceCents / pack.tokens))} AUD`
            : `${formatUsd(Math.round(pack.priceUsdCents / pack.tokens))} USD`;

          return (
            <li
              key={pack.id}
              data-testid={`pack-${pack.id.toLowerCase()}`}
              className={`${card} relative flex flex-col gap-3 ${
                best
                  ? "border-primary-container shadow-[0_0_24px_rgba(128,131,255,0.18)] ring-1 ring-primary-container"
                  : ""
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
              <p className="text-title-sm font-semibold">{displayPrice}</p>
              <p className="font-mono text-[11px] text-outline">
                {perToken} per token
                {ACTION_COSTS.AI_REMIX > 0 &&
                  ` · about ${Math.floor(pack.tokens / ACTION_COSTS.AI_REMIX).toLocaleString("en-AU")} remixes`}
              </p>
              {!geo.isAuNz && (
                <p className="font-mono text-[10px] text-on-surface-variant">
                  Converts to {formatAud(pack.priceCents)} AUD at checkout (AU Business)
                </p>
              )}
              <button
                type="button"
                data-testid={`buy-${pack.id.toLowerCase()}`}
                data-agent-id={`buy-${pack.id.toLowerCase()}`}
                className={`${best ? btnPrimary : btnSecondary} mt-auto w-full`}
                onClick={() => buy(pack.id)}
                disabled={pending !== null}
              >
                {pending === pack.id ? "Opening Stripe…" : "Buy"}
              </button>
            </li>
          );
        })}

        {/* 4th Card: Custom Pack */}
        <li
          data-testid="pack-custom"
          className={`${card} relative flex flex-col gap-3 border-white/20`}
        >
          <div className="flex items-baseline justify-between gap-2">
            <p className="flex items-center gap-1.5 font-mono text-mono-metric text-on-surface tabular-nums">
              <Icon name="zap" className="size-4 text-secondary" />
              <span>Custom</span>
            </p>
            <span className="rounded-full border border-secondary/40 bg-secondary/15 px-2 py-0.5 font-mono text-[10px] text-secondary font-bold uppercase">
              Flexible
            </span>
          </div>

          <div>
            <label htmlFor="custom-token-input" className="block text-[11px] font-mono text-outline mb-1">
              Quantity of tokens
            </label>
            <div className="flex items-center gap-1.5">
              <input
                id="custom-token-input"
                type="number"
                min={1}
                max={100000}
                value={customTokens || ""}
                onChange={(e) => setCustomTokens(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className={`${field} py-1.5 px-2.5 font-mono text-sm`}
                placeholder="25"
              />
            </div>
            {/* Quick preset increments */}
            <div className="mt-1.5 flex flex-wrap gap-1">
              {[10, 25, 50, 100].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setCustomTokens((prev) => Math.min(100000, (prev || 0) + n))}
                  className="rounded bg-white/5 border border-white/10 px-1.5 py-0.5 text-[10px] font-mono text-on-surface-variant hover:border-primary/40 hover:text-primary transition"
                >
                  +{n}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setCustomTokens(10)}
                className="rounded bg-white/5 border border-white/10 px-1.5 py-0.5 text-[10px] font-mono text-outline hover:text-on-surface transition"
              >
                Reset
              </button>
            </div>
          </div>

          <p className="text-title-sm font-semibold mt-1">{customDisplayPrice}</p>
          <p className="font-mono text-[11px] text-outline">
            {geo.isAuNz ? "AUD settled at checkout" : "USD base converted to AUD at checkout"}
          </p>

          {!geo.isAuNz && (
            <p className="font-mono text-[10px] text-on-surface-variant">
              Converts to {formatAud(customPack.priceCents)} AUD at checkout
            </p>
          )}

          <button
            type="button"
            data-testid="buy-pack-custom"
            data-agent-id="buy-pack-custom"
            className={`${btnSecondary} mt-auto w-full`}
            onClick={() => buy("PACK_CUSTOM", customTokens)}
            disabled={pending !== null || !customTokens || customTokens < 1}
          >
            {pending === "PACK_CUSTOM" ? "Opening Stripe…" : `Buy ${customTokens || 0} tokens`}
          </button>
        </li>
      </ul>
    </section>
  );
}
