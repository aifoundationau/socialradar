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

interface ConfiguredPackItem {
  id: TokenPackId;
  name: string;
  tokens: number;
  priceCents: number;
  enabled: boolean;
}

const DEFAULT_CONFIGURED_PACKS: ConfiguredPackItem[] = [
  { id: "PACK_10", name: "Quick Pack (10)", tokens: TOKEN_PACKS.PACK_10.tokens, priceCents: TOKEN_PACKS.PACK_10.priceCents, enabled: true },
  { id: "PACK_50", name: "Creator Pack (50)", tokens: TOKEN_PACKS.PACK_50.tokens, priceCents: TOKEN_PACKS.PACK_50.priceCents, enabled: true },
  { id: "PACK_100", name: "Pro Pack (100)", tokens: TOKEN_PACKS.PACK_100.tokens, priceCents: TOKEN_PACKS.PACK_100.priceCents, enabled: true },
];

export function TokenPacks() {
  const [pending, setPending] = useState<TokenPackId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [geo, setGeo] = useState<GeoConfig>(DEFAULT_AU_GEO);
  const [customTokens, setCustomTokens] = useState<number>(25);
  const [confirmCustomReset, setConfirmCustomReset] = useState(false);
  const [audCentsPerToken, setAudCentsPerToken] = useState<number>(DEFAULT_AUD_CENTS_PER_TOKEN);
  const [ecbRate, setEcbRate] = useState<number | undefined>(undefined);
  const [configuredPacks, setConfiguredPacks] = useState<ConfiguredPackItem[]>(DEFAULT_CONFIGURED_PACKS);
  const [serviceCosts, setServiceCosts] = useState<ServiceCosts>({
    searchStandard: ACTION_COSTS.RADAR_SEARCH,
    searchProvenWinners: SERVICE_SURCHARGES.PROVEN_WINNERS,
    searchExtendedDays: SERVICE_SURCHARGES.EXTENDED_DAYS,
    searchEliteScore: SERVICE_SURCHARGES.ELITE_SCORE,
    aiRemix: ACTION_COSTS.AI_REMIX,
    regenerateVariations: ACTION_COSTS.REGENERATE_VARIATIONS,
    brandClone: ACTION_COSTS.BRAND_CLONE,
    brandTxtDownload: ACTION_COSTS.BRAND_TXT_DOWNLOAD,
    searchMixDownload: ACTION_COSTS.SEARCHMIX_DOWNLOAD,
    deconstructDownload: ACTION_COSTS.DECONSTRUCT_DOWNLOAD,
    customizeService: ACTION_COSTS.CUSTOMIZE_SERVICE,
  });

  useEffect(() => {
    setGeo(loadGeoConfig());

    function handleGeoUpdated() {
      setGeo(loadGeoConfig());
    }

    function fetchPricingAndPacks() {
      fetch("/api/wallet/checkout", {
        headers: { accept: "application/json" },
        cache: "no-store",
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!data) return;
          if (typeof data.audCentsPerToken === "number" && data.audCentsPerToken >= 1) {
            setAudCentsPerToken(data.audCentsPerToken);
          }
          if (data.serviceCosts) {
            setServiceCosts(data.serviceCosts);
          }
          if (Array.isArray(data.tokenPacks) && data.tokenPacks.length > 0) {
            setConfiguredPacks(
              data.tokenPacks.map((p: Partial<ConfiguredPackItem>) => ({
                id: String(p.id || "PACK_100"),
                name: String(p.name || p.id || "Token Pack"),
                tokens: Math.max(1, Math.round(Number(p.tokens) || 10)),
                priceCents: Math.max(100, Math.round(Number(p.priceCents) || 1000)),
                enabled: p.enabled !== false,
              }))
            );
          }
        })
        .catch(() => {
          // retain defaults
        });
    }

    window.addEventListener("adradar:geo-updated", handleGeoUpdated);
    window.addEventListener("storage", handleGeoUpdated);
    window.addEventListener("adradar:config-updated", fetchPricingAndPacks);

    // Fetch live SuperAdmin-configured AUD base rate, service token amounts, and token packs
    fetchPricingAndPacks();

    // Fetch live ECB exchange rate via Frankfurter API
    fetch("/api/currency")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && typeof data.rate === "number" && data.rate > 0) {
          setEcbRate(data.rate);
        }
      })
      .catch(() => {});

    return () => {
      window.removeEventListener("adradar:geo-updated", handleGeoUpdated);
      window.removeEventListener("storage", handleGeoUpdated);
      window.removeEventListener("adradar:config-updated", fetchPricingAndPacks);
    };
  }, []);

  async function buy(packId: TokenPackId, amount?: number) {
    setPending(packId);
    setError(null);
    try {
      const currentGeo = loadGeoConfig();
      setGeo(currentGeo);
      const body =
        packId === "PACK_CUSTOM"
          ? {
              packId,
              customTokens: Math.max(1, Math.ceil(amount || customTokens || 10)),
              buyerCountry: currentGeo.country,
            }
          : { packId, buyerCountry: currentGeo.country };
      const { url } = await apiFetch<{ url: string }>("/api/wallet/checkout", { body });
      window.location.assign(url);
    } catch (err) {
      setError(errorMessage(err));
      setPending(null);
    }
  }

  const usdPerTokenCents = audToUsdCents(audCentsPerToken, ecbRate);
  const isAu = geo.country === "AU";
  const baseRateText = geo.isAuNz
    ? `1 Token = ${formatAud(audCentsPerToken)} AUD`
    : `1 Token = ${formatAud(audCentsPerToken)} AUD (≈ ${formatUsd(usdPerTokenCents)} USD)`;

  // Dynamic packs built from SuperAdmin Token Pack Catalog + live AUD base rate + live ECB Frankfurter rate
  const activePacks = configuredPacks
    .filter((p) => p.enabled !== false)
    .map((p) => {
      const hasCustomPackPrice =
        typeof p.priceCents === "number" &&
        p.priceCents >= 100 &&
        p.priceCents !== p.tokens * DEFAULT_AUD_CENTS_PER_TOKEN;
      const effectivePriceCents = hasCustomPackPrice
        ? p.priceCents
        : audCentsPerToken !== DEFAULT_AUD_CENTS_PER_TOKEN
          ? Math.round(p.tokens * audCentsPerToken)
          : p.priceCents;
      return buildTokenPack(p.id, p.tokens, audCentsPerToken, ecbRate, effectivePriceCents, p.name);
    });

  // Live calculation for Custom Pack
  const customPack = buildTokenPack("PACK_CUSTOM", customTokens, audCentsPerToken, ecbRate);

  const totalCards = activePacks.length + 1;
  const gridColsClass =
    totalCards === 5
      ? "grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
      : "grid gap-4 sm:grid-cols-2 lg:grid-cols-4";

  return (
    <section id="packs" className="scroll-mt-24 space-y-4" aria-labelledby="packs-heading">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h2 id="packs-heading" className="text-headline-md font-semibold">
              Top up
            </h2>
            <span
              data-agent-id="tokens-never-expire-top-badge"
              data-testid="tokens-never-expire-top-badge"
              className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/35 px-2.5 py-0.5 font-mono text-[11px] font-bold text-emerald-300"
            >
              <Icon name="checkCircle" className="size-3.5 text-emerald-300" />
              <span>Tokens Never Expire Rule</span>
            </span>
          </div>
          <p className="text-body text-on-surface-variant mt-0.5">
            One-off purchase through Stripe. <strong>Tokens never expire</strong> — your purchased tokens remain permanently credited to your account ledger. Default currency is AUD ({baseRateText}), and all invoices are issued in Australian Dollars (AUD).
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
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <span>
            Base Search:{" "}
            <strong className="text-primary">
              {serviceCosts.searchStandard === 0 ? "Free (0)" : `+${serviceCosts.searchStandard} tok`}
            </strong>
          </span>
          <span>
            Proven 28+d:{" "}
            <strong className="text-primary">
              {(serviceCosts.searchProvenWinners ?? 1) === 0 ? "Free (0)" : `+${serviceCosts.searchProvenWinners ?? 1} tok`}
            </strong>
          </span>
          <span>
            Extended 60+d:{" "}
            <strong className="text-primary">
              {serviceCosts.searchExtendedDays === 0 ? "Free (0)" : `+${serviceCosts.searchExtendedDays} tok`}
            </strong>
          </span>
          <span>
            Top 90%+ Winners:{" "}
            <strong className="text-primary">
              {serviceCosts.searchEliteScore === 0 ? "Free (0)" : `+${serviceCosts.searchEliteScore} tok`}
            </strong>
          </span>
          <span>
            AI Creative Remix:{" "}
            <strong className="text-primary">
              {serviceCosts.aiRemix === 0 ? "Free (0)" : `+${serviceCosts.aiRemix} tok`}
            </strong>
          </span>
          <span>
            Regenerate Variations:{" "}
            <strong className="text-primary">
              {(serviceCosts.regenerateVariations ?? 1) === 0 ? "Free (0)" : `+${serviceCosts.regenerateVariations ?? 1} tok`}
            </strong>
          </span>
          <span>
            Global Brand Copy:{" "}
            <strong className="text-primary">
              {(serviceCosts.brandClone ?? 1) === 0 ? "Free (0)" : `+${serviceCosts.brandClone ?? 1} tok`}
            </strong>
          </span>
          <span>
            Brand .txt Download:{" "}
            <strong className="text-primary">
              {(serviceCosts.brandTxtDownload ?? 1) === 0 ? "Free (0)" : `+${serviceCosts.brandTxtDownload ?? 1} tok`}
            </strong>
          </span>
          <span>
            SearchMix Download:{" "}
            <strong className="text-primary">
              {(serviceCosts.searchMixDownload ?? 1) === 0 ? "Free (0)" : `+${serviceCosts.searchMixDownload ?? 1} tok`}
            </strong>
          </span>
          <span>
            Deconstructed Anatomy (.txt):{" "}
            <strong className="text-primary">
              {(serviceCosts.deconstructDownload ?? 0) === 0 ? "Free (0)" : `+${serviceCosts.deconstructDownload ?? 0} tok`}
            </strong>
          </span>
          <span>
            Customize Service:{" "}
            <strong className="text-primary">
              {(serviceCosts.customizeService ?? 55) === 0 ? "Free (0)" : `+${serviceCosts.customizeService ?? 55} tok`}
            </strong>
          </span>
        </div>
      </div>

      {error && <p className={alertError}>{error}</p>}

      <ul className={gridColsClass}>
        {/* Configured Token Packs (e.g. PACK_10, PACK_50, PACK_100, PACK_1000, etc.) */}
        {activePacks.map((pack) => {
          const isDiscounted = pack.priceCents < pack.tokens * audCentsPerToken;
          const discountPct = isDiscounted
            ? Math.max(1, Math.round((1 - pack.priceCents / (pack.tokens * audCentsPerToken)) * 100))
            : 0;
          const best = pack.id === BEST_VALUE || isDiscounted;
          const audPriceStr = `${formatAud(pack.priceCents)} AUD`;
          const usdPriceStr = `${formatUsd(pack.priceUsdCents)} USD`;
          const rawPerTokenCents = pack.priceCents / pack.tokens;
          const perTokenAud =
            rawPerTokenCents % 100 === 0
              ? formatAud(rawPerTokenCents)
              : `$${(rawPerTokenCents / 100).toFixed(2)}`;
          const perTokenUsd = formatUsd(Math.round(pack.priceUsdCents / pack.tokens));

          return (
            <li
              key={pack.id}
              data-testid={`pack-${pack.id.toLowerCase()}`}
              data-agent-id={`pack-${pack.id.toLowerCase()}`}
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
                {isDiscounted ? (
                  <span className="rounded-full border border-winner/40 bg-winner/15 px-2 py-0.5 font-mono text-mono-label text-winner-soft uppercase">
                    Save {discountPct}%
                  </span>
                ) : best ? (
                  <span className="rounded-full border border-primary-container/40 bg-primary-container/20 px-2 py-0.5 font-mono text-mono-label text-primary uppercase">
                    Best value
                  </span>
                ) : null}
              </div>
              <div className="flex items-center justify-between gap-2">
                <p className="text-compact font-semibold text-on-surface-variant truncate">
                  {pack.name || `${pack.tokens.toLocaleString("en-AU")} tokens`}
                </p>
                <span className="font-mono text-[10px] text-outline shrink-0">tokens</span>
              </div>
              <p
                className="text-title-sm font-semibold text-on-surface"
                title={`${audPriceStr} (≈ ${usdPriceStr})`}
              >
                {audPriceStr}{" "}
                <span className="text-xs font-normal text-on-surface-variant">
                  {isAu ? "+ GST" : "(No Tax)"}
                </span>
              </p>
              <p
                data-testid={`usd-conversion-${pack.id.toLowerCase()}`}
                className="rounded-lg border border-secondary/30 bg-secondary/10 px-2.5 py-1 font-mono text-[11px] font-medium text-secondary"
              >
                ≈ {usdPriceStr} ({perTokenAud} AUD ≈ {perTokenUsd} USD)
              </p>
              <p className="font-mono text-[11px] text-outline">
                {isAu
                  ? `${perTokenAud} AUD/tok · +10% GST (${formatAud(Math.round(pack.priceCents * 1.1))} AUD total)`
                  : `${perTokenAud} AUD/tok · No Tax (${geo.country})`}
              </p>
              <div className="flex items-center gap-1 font-mono text-[10px] font-semibold text-emerald-400">
                <Icon name="checkCircle" className="size-3 text-emerald-400 shrink-0" />
                <span>Tokens never expire</span>
              </div>
              <button
                type="button"
                data-testid={`buy-${pack.id.toLowerCase()}`}
                data-agent-id={`buy-${pack.id.toLowerCase()}`}
                aria-label={`Buy ${pack.name || `${pack.tokens} tokens`} for ${audPriceStr}`}
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
          data-agent-id="pack-custom"
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
                data-agent-id="custom-token-input"
                data-testid="custom-token-input"
                aria-label="Custom quantity of tokens"
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
                  data-agent-id={`custom-token-add-${n}`}
                  data-testid={`custom-token-add-${n}`}
                  aria-label={`Add ${n} tokens to custom quantity`}
                  onClick={() => setCustomTokens((prev) => Math.min(100000, (prev || 0) + n))}
                  className="rounded bg-white/5 border border-white/10 px-1.5 py-0.5 text-[10px] font-mono text-on-surface-variant hover:border-primary/40 hover:text-primary transition"
                >
                  +{n}
                </button>
              ))}
              {confirmCustomReset ? (
                <div className="inline-flex items-center gap-1">
                  <button
                    type="button"
                    data-agent-id="confirm-custom-token-reset"
                    data-testid="confirm-custom-token-reset"
                    aria-label="Confirm reset custom token quantity to 10"
                    onClick={() => {
                      setCustomTokens(10);
                      setConfirmCustomReset(false);
                    }}
                    className="rounded bg-amber-400 px-1.5 py-0.5 text-[10px] font-mono font-bold text-black hover:bg-amber-300 transition"
                  >
                    Confirm Reset
                  </button>
                  <button
                    type="button"
                    data-agent-id="cancel-custom-token-reset"
                    data-testid="cancel-custom-token-reset"
                    onClick={() => setConfirmCustomReset(false)}
                    className="rounded bg-white/5 border border-white/10 px-1.5 py-0.5 text-[10px] font-mono text-outline hover:text-on-surface transition"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  data-agent-id="custom-token-reset"
                  data-testid="custom-token-reset"
                  aria-label="Reset custom token quantity to 10"
                  onClick={() => setConfirmCustomReset(true)}
                  className="rounded bg-white/5 border border-white/10 px-1.5 py-0.5 text-[10px] font-mono text-outline hover:text-on-surface transition"
                >
                  Reset
                </button>
              )}
            </div>
          </div>

          <p className="text-title-sm font-semibold mt-1 text-on-surface">
            {formatAud(customPack.priceCents)} AUD{" "}
            <span className="text-xs font-normal text-on-surface-variant">
              {isAu ? "+ GST" : "(No Tax)"}
            </span>
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
            {isAu
              ? `+10% GST added at checkout (${formatAud(Math.round(customPack.priceCents * 1.1))} AUD total)`
              : `No Tax (${geo.country}) · Price locked to Admin Panel`}
          </p>

          <div className="flex items-center gap-1 font-mono text-[10px] font-semibold text-emerald-400">
            <Icon name="checkCircle" className="size-3 text-emerald-400 shrink-0" />
            <span>Tokens never expire</span>
          </div>

          <button
            type="button"
            data-testid="buy-pack-custom"
            data-agent-id="buy-pack-custom"
            aria-label={`Buy ${customTokens || 0} custom tokens`}
            className={`${btnSecondary} mt-auto w-full`}
            onClick={() => buy("PACK_CUSTOM", customTokens)}
            disabled={pending !== null || !customTokens || customTokens < 1}
          >
            {pending === "PACK_CUSTOM" ? "Opening Stripe…" : `Buy ${customTokens || 0} tokens`}
          </button>
        </li>
      </ul>

      {/* Tokens Never Expire Rule Guarantee Banner */}
      <div
        data-agent-id="tokens-never-expire-rule-banner"
        data-testid="tokens-never-expire-rule-banner"
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.08] p-4 text-on-surface"
      >
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400">
            <Icon name="checkCircle" className="size-5" />
          </span>
          <div className="space-y-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-mono text-xs sm:text-sm font-bold text-emerald-300 uppercase tracking-wide">
                Tokens Never Expire Rule
              </h3>
              <span className="rounded bg-emerald-500/20 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-300 uppercase">
                100% Lifetime Guarantee
              </span>
            </div>
            <p className="text-xs text-on-surface-variant leading-relaxed">
              Every token purchased or allocated to your wallet remains permanently in your account ledger. There are zero expiration dates, zero time limits, zero maintenance fees, and zero depreciation. Per our Terms of Service, all digital token purchases are final and strictly non-refundable once delivered, with automatic failure token refunds if an upstream system error occurs.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
