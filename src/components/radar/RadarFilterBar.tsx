"use client";

import { useEffect, useRef, useSyncExternalStore, type FormEvent } from "react";
import { PROVEN_WINNER_DAYS, type RadarSearchRequest } from "@/lib/contracts";
import { ACTION_COSTS, costLabel } from "@/lib/pricing";
import { CostTag } from "@/components/ui/CostTag";
import { Icon, type IconName } from "@/components/ui/Icon";
import { btnPrimary } from "@/components/ui/styles";
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
export function RadarFilterBar({
  filters,
  onChange,
  onSearch,
  searching,
  sort,
  onSort,
  summary,
}: {
  filters: RadarFilters;
  onChange: (patch: Partial<RadarFilters>) => void;
  onSearch: () => void;
  searching: boolean;
  sort: SortKey;
  onSort: (sort: SortKey) => void;
  summary: { total: number; winners: number } | null;
}) {
  const input = useRef<HTMLInputElement>(null);
  const apple = useSyncExternalStore(noSubscribe, isApple, () => false);

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
          {/* Search first on phones, centre stage on desktop */}
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
              aria-label={ACTION_COSTS.RADAR_SEARCH ? `Search (${costLabel("RADAR_SEARCH")})` : "Search"}
            >
              {searching ? (
                <span className="size-4 animate-spin rounded-full border-2 border-on-primary/30 border-t-on-primary" />
              ) : (
                <Icon name="search" />
              )}
              <span className="hidden sm:inline">Search</span>
              <CostTag action="RADAR_SEARCH" />
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

          <button
            type="button"
            role="switch"
            aria-checked={filters.provenWinnersOnly}
            onClick={() => onChange({ provenWinnersOnly: !filters.provenWinnersOnly })}
            className="flex items-center gap-3 self-start text-left lg:order-3 lg:ml-auto lg:self-auto"
          >
            <span
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors sm:h-5 sm:w-10 ${
                filters.provenWinnersOnly ? "bg-winner shadow-[0_0_14px_rgba(16,185,129,0.55)]" : "bg-surface-container-high"
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-white transition-transform sm:size-4 ${
                  filters.provenWinnersOnly ? "translate-x-5" : ""
                }`}
              />
            </span>
            <span className="flex flex-col">
              <span className="text-body font-semibold text-on-surface">Proven winners only</span>
              <span className="font-mono text-[10px] text-winner-soft">Active {PROVEN_WINNER_DAYS}+ days</span>
            </span>
          </button>
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
