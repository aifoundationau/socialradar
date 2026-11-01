"use client";

import { useEffect, useRef, useSyncExternalStore, type FormEvent } from "react";
import {
  PROVEN_WINNER_DAYS,
  EXTENDED_WINNER_DAYS,
  ELITE_SCORE_THRESHOLD,
  type BrandProfile,
  type RadarSearchRequest,
} from "@/lib/contracts";
import {
  SERVICE_SURCHARGES,
  calculateSearchCost,
  formatTokenEstimateHover,
} from "@/lib/pricing";
import { CostTag } from "@/components/ui/CostTag";
import { Icon, type IconName } from "@/components/ui/Icon";
import { btnPrimary } from "@/components/ui/styles";
import { useSession } from "@/components/auth/SessionProvider";
import { COUNTRIES, MEDIA_FILTERS, PLATFORMS, PLATFORM_ORDER, SORTS, type SortKey } from "./options";

export type RadarFilters = RadarSearchRequest;

const noSubscribe = () => () => {};
const isApple = () => /Mac|iPhone|iPad/.test(navigator.userAgent);

function SelectPill<T extends string>({
  label,
  icon,
  value,
  options,
  onChange,
}: {
  label: string;
  icon: IconName;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <label className="relative flex shrink-0 items-center">
      <span className="sr-only">{label}</span>
      <Icon name={icon} className="pointer-events-none absolute left-2.5 size-3.5 text-secondary" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="h-10 appearance-none rounded border border-white/[0.08] bg-surface-container-low pr-7 pl-8 font-mono text-base text-on-surface transition hover:border-outline-variant focus:border-primary-container focus:outline-none sm:h-8 sm:text-mono-code"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <Icon name="chevronDown" className="pointer-events-none absolute right-2 size-3.5 text-on-surface-variant" />
    </label>
  );
}

/**
 * Sticky command strip (md and up; it scrolls away on phones to save height): platform tabs, keyword
 * search, "Proven winners" switch, country, format and sort. Searching costs tokens, so filters
 * apply when the user presses Search; sorting is instant and free.
 */
function BrandSelectPill({
  brands,
  selectedBrandId,
  onChange,
}: {
  brands?: BrandProfile[] | null;
  selectedBrandId: string;
  onChange: (brandId: string) => void;
}) {
  return (
    <div className="flex shrink-0 items-center">
      <label htmlFor="radar-brand-select" className="sr-only">Target Brand</label>
      <div className="relative flex items-center">
        <Icon name="tag" className="pointer-events-none absolute left-2.5 size-3.5 text-primary" />
        <select
          id="radar-brand-select"
          data-testid="radar-brand-select"
          data-agent-id="radar-brand-select"
          value={selectedBrandId}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 appearance-none rounded-lg border border-white/[0.12] bg-surface-container pr-7 pl-8 font-mono text-base font-medium text-on-surface transition hover:border-primary-container focus:border-primary-container focus:outline-none sm:h-9 sm:text-mono-code"
        >
          {brands && brands.length > 0 ? (
            brands.map((b) => (
              <option key={b.brandId} value={b.brandId}>
                Brand: {b.brandName}
              </option>
            ))
          ) : (
            <option value="">No brand selected</option>
          )}
        </select>
        <Icon name="chevronDown" className="pointer-events-none absolute right-2 size-3.5 text-on-surface-variant" />
      </div>
    </div>
  );
}
export function RadarFilterBar({
  filters,
  onChange,
  onSearch,
  searching,
  sort,
  onSort,
  summary,
  brands,
}: {
  filters: RadarFilters;
  onChange: (patch: Partial<RadarFilters>) => void;
  onSearch: () => void;
  searching: boolean;
  sort: SortKey;
  onSort: (sort: SortKey) => void;
  summary: { total: number; winners: number } | null;
  brands?: BrandProfile[] | null;
}) {
  const { isAdmin } = useSession();
  const input = useRef<HTMLInputElement>(null);
  const apple = useSyncExternalStore(noSubscribe, isApple, () => false);
  const totalCost = calculateSearchCost(filters);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        input.current?.focus();
        input.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function submit(e: FormEvent) {
    e.preventDefault();
    input.current?.blur(); // closes the phone keyboard so results are visible
    onSearch();
  }

  return (
    <section
      aria-label="Radar filters"
      className="relative z-30 border-b border-white/[0.06] bg-surface-container-lowest/95 shadow-lg backdrop-blur-xl md:sticky md:top-[calc(3.5rem+env(safe-area-inset-top))]"
    >
      <form role="search" onSubmit={submit} className="mx-auto flex w-full max-w-[1600px] flex-col gap-3 px-3 py-3 sm:px-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          {/* Brand selector */}
          <div className="flex shrink-0 items-center lg:order-1">
            <BrandSelectPill
              brands={brands}
              selectedBrandId={filters.brandId || ""}
              onChange={(brandId) => onChange({ brandId })}
            />
          </div>
                    <div className="flex gap-2 lg:order-2 lg:max-w-2xl lg:flex-1">
            <div className="relative min-w-0 flex-1">
              <Icon name="search" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-on-surface-variant" />
              <input
                ref={input}
                type="search"
                enterKeyHint="search"
                aria-label="Search keywords, hooks or competitor brands"
                placeholder={filters.platform === "GOOGLE" ? "Brand name or website, e.g. nike.com" : "Keywords, hooks or competitor brands…"}
                value={filters.query}
                onChange={(e) => onChange({ query: e.target.value })}
                maxLength={100}
                className="h-11 w-full rounded-lg border border-white/10 bg-surface-container-low pr-3 pl-9 text-base text-on-surface transition placeholder:text-outline focus:border-primary-container focus:ring-1 focus:ring-primary-container focus:outline-none sm:h-9 sm:pr-16 sm:text-body"
              />
              <kbd className="pointer-events-none absolute top-1/2 right-2.5 hidden -translate-y-1/2 rounded bg-surface-container-highest/60 px-1.5 py-0.5 font-mono text-[10px] text-outline sm:block">
                {apple ? "⌘K" : "Ctrl K"}
              </kbd>
            </div>
            <button
              type="submit"
              className={`${btnPrimary} shrink-0`}
              disabled={searching}
              aria-label={isAdmin ? "Search (0 tokens • Superadmin Free)" : totalCost > 0 ? `Search (${totalCost} tokens)` : "Search (Free)"}
            >
              {searching ? (
                <span className="size-4 animate-spin rounded-full border-2 border-on-primary/30 border-t-on-primary" />
              ) : (
                <Icon name="search" />
              )}
              <span className="hidden sm:inline">Search</span>
              {isAdmin ? (
                <span
                  title="Superadmin Token Exemption: 0 tokens"
                  className="rounded-full bg-surface-container-lowest/25 px-2 py-0.5 font-mono text-[11px] font-bold text-on-primary"
                >
                  0 tokens (Admin)
                </span>
              ) : totalCost > 0 ? (
                <span
                  title={formatTokenEstimateHover(totalCost)}
                  className="rounded-full bg-surface-container-lowest/25 px-2 py-0.5 font-mono text-[11px] font-bold text-on-primary"
                >
                  {totalCost} {totalCost === 1 ? "token" : "tokens"}
                </span>
              ) : (
                <CostTag action="RADAR_SEARCH" />
              )}
            </button>
          </div>

          <div className="-mx-3 overflow-x-auto px-3 no-scrollbar sm:mx-0 sm:px-0 lg:order-1">
            <div role="radiogroup" aria-label="Ad library" className="inline-flex gap-1 rounded-lg border border-white/[0.08] bg-surface-container-low p-1">
              {PLATFORM_ORDER.map((p) => {
                const active = filters.platform === p;
                return (
                  <button
                    key={p}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => onChange({ platform: p })}
                    className={`flex h-9 items-center gap-2 rounded px-3 font-mono text-mono-code font-medium whitespace-nowrap transition sm:h-7 ${
                      active
                        ? "bg-surface-container-high text-on-surface shadow-sm ring-1 ring-white/[0.08]"
                        : "text-on-surface-variant hover:text-on-surface"
                    }`}
                  >
                    <span className={`size-2 rounded-full ${PLATFORMS[p].dot}`} />
                    {PLATFORMS[p].label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 self-start lg:order-3 lg:ml-auto lg:self-auto">
            {/* 1. Proven winners 28+ days toggle */}
            <button
              type="button"
              role="switch"
              aria-checked={filters.provenWinnersOnly}
              data-testid="radar-proven-winners-toggle"
              data-agent-id="radar-proven-winners-toggle"
              onClick={() => onChange({ provenWinnersOnly: !filters.provenWinnersOnly })}
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 transition ${
                filters.provenWinnersOnly
                  ? "border-winner/50 bg-winner/15 text-on-surface shadow-[0_0_12px_rgba(16,185,129,0.2)]"
                  : "border-white/[0.08] bg-surface-container-low text-on-surface-variant hover:border-white/20"
              }`}
            >
              <Icon name="zap" className="size-3.5 text-winner" />
              <div className="flex flex-col text-left">
                <span className="text-compact font-medium text-on-surface">Proven ({PROVEN_WINNER_DAYS}+d)</span>
              </div>
              <span
                title={formatTokenEstimateHover(SERVICE_SURCHARGES.PROVEN_WINNERS)}
                className="ml-1 rounded bg-winner/20 px-1.5 py-0.5 font-mono text-[10px] font-bold text-winner"
              >
                +{SERVICE_SURCHARGES.PROVEN_WINNERS}
              </span>
            </button>

            {/* 2. Extended 60+ days toggle */}
            <button
              type="button"
              role="switch"
              aria-checked={filters.extendedLongevity}
              data-testid="radar-extended-days-toggle"
              data-agent-id="radar-extended-days-toggle"
              onClick={() => onChange({ extendedLongevity: !filters.extendedLongevity })}
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 transition ${
                filters.extendedLongevity
                  ? "border-secondary/50 bg-secondary/15 text-on-surface shadow-[0_0_12px_rgba(245,158,11,0.2)]"
                  : "border-white/[0.08] bg-surface-container-low text-on-surface-variant hover:border-white/20"
              }`}
            >
              <Icon name="layers" className="size-3.5 text-secondary" />
              <div className="flex flex-col text-left">
                <span className="text-compact font-medium text-on-surface">Extended ({EXTENDED_WINNER_DAYS}+d)</span>
              </div>
              <span
                title={formatTokenEstimateHover(SERVICE_SURCHARGES.EXTENDED_DAYS)}
                className="ml-1 rounded bg-secondary/20 px-1.5 py-0.5 font-mono text-[10px] font-bold text-secondary"
              >
                +{SERVICE_SURCHARGES.EXTENDED_DAYS}
              </span>
            </button>

            {/* 3. Top Winners (90%+ Score) toggle */}
            <button
              type="button"
              role="switch"
              aria-checked={filters.eliteWinnersOnly}
              data-testid="radar-elite-score-toggle"
              data-agent-id="radar-elite-score-toggle"
              onClick={() => onChange({ eliteWinnersOnly: !filters.eliteWinnersOnly })}
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 transition ${
                filters.eliteWinnersOnly
                  ? "border-hot/50 bg-hot/15 text-on-surface shadow-[0_0_12px_rgba(239,68,68,0.2)]"
                  : "border-white/[0.08] bg-surface-container-low text-on-surface-variant hover:border-white/20"
              }`}
            >
              <Icon name="flame" className="size-3.5 text-hot" />
              <div className="flex flex-col text-left">
                <span className="text-compact font-medium text-on-surface">Top Winners ({ELITE_SCORE_THRESHOLD}%+)</span>
              </div>
              <span
                title={formatTokenEstimateHover(SERVICE_SURCHARGES.ELITE_SCORE)}
                className="ml-1 rounded bg-hot/20 px-1.5 py-0.5 font-mono text-[10px] font-bold text-hot"
              >
                +{SERVICE_SURCHARGES.ELITE_SCORE}
              </span>
            </button>
          </div>
        </div>

        <div className="-mx-3 flex items-center gap-2 overflow-x-auto border-t border-white/[0.04] px-3 pt-3 no-scrollbar sm:mx-0 sm:flex-wrap sm:px-0">
          <SelectPill label="Country" icon="globe" value={filters.country} options={COUNTRIES} onChange={(country) => onChange({ country })} />
          <SelectPill
            label="Format"
            icon="film"
            value={filters.mediaType}
            options={MEDIA_FILTERS}
            onChange={(mediaType) => onChange({ mediaType })}
          />
          <span aria-hidden="true" className="mx-1 h-4 w-px shrink-0 bg-white/10" />
          <div role="radiogroup" aria-label="Sort results" className="flex shrink-0 items-center gap-1">
            <span className="mr-1 font-mono text-mono-label uppercase text-outline">Sort</span>
            {SORTS.map((s) => (
              <button
                key={s.value}
                type="button"
                role="radio"
                aria-checked={sort === s.value}
                onClick={() => onSort(s.value)}
                className={`flex h-9 items-center gap-1 rounded px-2.5 text-compact whitespace-nowrap transition-colors sm:h-7 ${
                  sort === s.value
                    ? "bg-surface-container-high font-medium text-on-surface"
                    : "text-on-surface-variant hover:bg-surface-container-low"
                }`}
              >
                {s.label}
                {sort === s.value && <Icon name="arrowDown" className="size-3.5" />}
              </button>
            ))}
          </div>
          {summary && (
            <p className="ml-auto hidden shrink-0 items-center gap-2 rounded-full border border-white/[0.08] bg-surface-container-low px-3 py-1 font-mono text-mono-label text-on-surface-variant sm:flex">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full rounded-full bg-primary opacity-75 motion-safe:animate-ping" />
                <span className="relative inline-flex size-2 rounded-full bg-primary" />
              </span>
              <span>
                <span className="font-semibold text-on-surface">{summary.total}</span> ads ·{" "}
                <span className="font-semibold text-winner-soft">{summary.winners} proven winners</span>
              </span>
            </p>
          )}
        </div>
      </form>
    </section>
  );
}
