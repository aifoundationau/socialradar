"use client";

import { useEffect, useState } from "react";
import { apiFetch, errorMessage } from "@/lib/api-client";
import type { ServiceCosts, TokenPackId } from "@/lib/contracts";
import {
  ACTION_COSTS,
  DEFAULT_AUD_CENTS_PER_TOKEN,
  SERVICE_SURCHARGES,
  TOKEN_PACKS,
  audToUsdCents,
  buildTokenPack,
  formatAud,
  formatUsd,
} from "@/lib/pricing";
import { DEFAULT_AU_GEO, loadGeoConfig, type GeoConfig } from "@/lib/geo";
import { Icon } from "@/components/ui/Icon";
import { alertError, btnPrimary, btnSecondary, card, field } from "@/components/ui/styles";

const BEST_VALUE: TokenPackId = "PACK_100";

export function TokenPacks() {
  const [pending, setPending] = useState<TokenPackId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [geo, setGeo] = useState<GeoConfig>(DEFAULT_AU_GEO);
  const [customTokens, setCustomTokens] = useState<number>(25);
  const [audCentsPerToken, setAudCentsPerToken] = useState<number>(DEFAULT_AUD_CENTS_PER_TOKEN);
  const [serviceCosts, setServiceCosts] = useState<ServiceCosts>({
    searchStandard: ACTION_COSTS.RADAR_SEARCH,
    searchExtendedDays: SERVICE_SURCHARGES.EXTENDED_DAYS,
    searchEliteScore: SERVICE_SURCHARGES.ELITE_SCORE,
    aiRemix: ACTION_COSTS.AI_REMIX,
    brandClone: ACTION_COSTS.BRAND_CLONE,
  });

  useEffect(() => {
    setGeo(loadGeoConfig());

    // Fetch live SuperAdmin-configured AUD base rate and service token amounts
    fetch("/api/wallet/checkout", { headers: { accept: "application/json" } })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        if (typeof data.audCentsPerToken === "number" && data.audCentsPerToken >= 1) {
          setAudCentsPerToken(data.audCentsPerToken);
        }
        if (data.serviceCosts) {
          setServiceCosts(data.serviceCosts);
        }
      })
      .catch(() => {
        // retain defaults
      });
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

  const usdPerTokenCents = audToUsdCents(audCentsPerToken);
  const baseRateText = geo.isAuNz
    ? `1 Token = ${formatAud(audCentsPerToken)} AUD`
    : `1 Token = ${formatAud(audCentsPerToken)} AUD (≈ ${formatUsd(usdPerTokenCents)} USD)`;

  // Dynamic packs built with live SuperAdmin AUD rate
  const activePacks = (["PACK_10", "PACK_50", "PACK_100"] as const).map((id) =>
    buildTokenPack(id, TOKEN_PACKS[id].tokens, audCentsPerToken)
  );

  // Live calculation for Custom Pack
  const customPack = buildTokenPack("PACK_CUSTOM", customTokens, audCentsPerToken);

  return (
    <section id="packs" className="scroll-mt-24 space-y-4" aria-labelledby="packs-heading">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 id="packs-heading" className="text-headline-md font-semibold">
            Top up
          </h2>
          <p className="text-body text-on-surface-variant">
            One-off purchase through Stripe. Tokens never expire. Default currency is AUD ({baseRateText}), and all invoices are issued in Australian Dollars (AUD).
          </p>
        </div>

        {/* Geolocation & Currency Conversion Tag */}
        <div
          data-testid="wallet-currency-badge"
          className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-surface-container-low px-3 py-1.5 font-mono text-[11px]"
        >
          <Icon name="globe" className="size-3.5 text-primary" />
          <span suppressHydrationWarning>
            {geo.isAuNz
              ? `AUD Local Currency (${geo.country}) · All Invoices in AUD`
              : `${formatAud(audCentsPerToken)} AUD ≈ ${formatUsd(usdPerTokenCents)} USD (${geo.country}) · Invoiced in AUD`}
          </span>
        </div>
      </div>

      {/* Customizable Product & Service Token Amounts Summary */}
      <div
        data-testid="service-token-rates-bar"
        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/[0.08] bg-surface-container-low/60 px-4 py-2.5 font-mono text-xs text-on-surface-variant"
      >
        <span className="font-semibold text-on-surface flex items-center gap-1.5">
          <Icon name="sliders" className="size-3.5 text-primary" />
          <span>Active Product & Service Token Rates:</span>
        </span>
        <div className="flex flex-wrap items-center gap-3">
          <span>
            Base Search:{" "}
            <strong className="text-primary">
              {serviceCosts.searchStandard === 0 ? "Free (0)" : `${serviceCosts.searchStandard} tok`}
            </strong>
          </span>
          <span className="text-white/20">•</span>
          <span>
            Extended 60+d:{" "}
            <strong className="text-primary">+{serviceCosts.searchExtendedDays} tok</strong>
          </span>
          <span className="text-white/20">•</span>
          <span>
            Top 90%+ Winners:{" "}
            <strong className="text-primary">+{serviceCosts.searchEliteScore} tok</strong>
          </span>
          <span className="text-white/20">•</span>
          <span>
            AI Creative Remix:{" "}
            <strong className="text-primary">
              {serviceCosts.aiRemix === 0 ? "Free (0)" : `${serviceCosts.aiRemix} tok`}
            </strong>
          </span>
          <span className="text-white/20">•</span>
          <span>
            Global Brand Copy:{" "}
            <strong className="text-primary">
              {(serviceCosts.brandClone ?? 5) === 0 ? "Free (0)" : `${serviceCosts.brandClone ?? 5} tok`}
            </strong>
          </span>
        </div>
      </div>

      {error && <p className={alertError}>{error}</p>}

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Standard Packs: 10, 50, 100 */}
        {activePacks.map((pack) => {
          const best = pack.id === BEST_VALUE;
          const audPriceStr = `${formatAud(pack.priceCents)} AUD`;
          const usdPriceStr = `${formatUsd(pack.priceUsdCents)} USD`;
          const perTokenAud = formatAud(Math.round(pack.priceCents / pack.tokens));
          const perTokenUsd = formatUsd(Math.round(pack.priceUsdCents / pack.tokens));

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
              <p className="text-title-sm font-semibold text-on-surface">{audPriceStr}</p>
              {!geo.isAuNz && (
                <p
                  data-testid={`usd-conversion-${pack.id.toLowerCase()}`}
                  className="rounded-lg border border-secondary/30 bg-secondary/10 px-2.5 py-1 font-mono text-[11px] font-medium text-secondary"
                >
                  ≈ {usdPriceStr} ({perTokenAud} AUD ≈ {perTokenUsd} USD)
                </p>
              )}
              <p className="font-mono text-[11px] text-outline">
                {perTokenAud} AUD per token · Billed in AUD
              </p>
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

          <p className="text-title-sm font-semibold mt-1 text-on-surface">
            {formatAud(customPack.priceCents)} AUD
          </p>
          {!geo.isAuNz && (
            <p
              data-testid="usd-conversion-pack_custom"
              className="rounded-lg border border-secondary/30 bg-secondary/10 px-2.5 py-1 font-mono text-[11px] font-medium text-secondary"
            >
              ≈ {formatUsd(customPack.priceUsdCents)} USD
            </p>
          )}
          <p className="font-mono text-[11px] text-outline">
            All invoices billed in Australian Dollars (AUD)
          </p>

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
