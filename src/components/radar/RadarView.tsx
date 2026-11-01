"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "@/components/auth/SessionProvider";
import { ApiClientError, apiFetch, errorMessage } from "@/lib/api-client";
import {
  PROVEN_WINNER_DAYS,
  type NormalizedAd,
  type RadarSearchResponse,
  type RemixDoc,
  type RemixResponse,
} from "@/lib/contracts";
import { ACTION_COSTS } from "@/lib/pricing";
import { CostTag } from "@/components/ui/CostTag";
import { AmbientGlow } from "@/components/ui/AmbientGlow";
import { Icon } from "@/components/ui/Icon";
import { alertError, alertInfo, btnSecondary } from "@/components/ui/styles";
import { AdWinnerCard } from "./AdWinnerCard";
import { RadarFilterBar, type RadarFilters } from "./RadarFilterBar";
import { RemixStudio, type RemixError, type RemixState } from "./RemixStudio";
import { PLATFORMS, type SortKey } from "./options";

const DEFAULT_FILTERS: RadarFilters = {
  platform: "META",
  query: "",
  country: "AU",
  mediaType: "ALL",
  provenWinnersOnly: true,
  extendedLongevity: false,
  eliteWinnersOnly: false,
  brandId: "",
};
const EXAMPLES = [
  "skincare",
  "protein powder",
  "pet food",
  "meal kit",
  "running shoes",
  "activewear",
  "wireless earbuds",
  "smart watch",
  "air purifier",
  "reusable water bottle",
  "sunscreen",
  "hair oil",
  "teeth whitening",
  "mushroom coffee",
  "collagen peptides",
  "magnesium spray",
  "massage gun",
  "weighted blanket",
  "phone case",
  "dog harness",
  "yoga mat",
  "travel backpack",
  "blue light glasses",
  "heatless curler",
];
/** Results per page: a 3 × 3 grid on desktop. */
const PAGE_SIZE = 9;

// Paid results survive navigating to Brands or Wallet and back (per tab, per user).
type Saved = {
  filters: RadarFilters;
  searched: RadarFilters | null;
  result: RadarSearchResponse | null;
  selectedAdId: string | null;
  remixes: Record<string, RemixDoc>;
};
const storageKey = (uid: string) => `adradar:radar:${uid}`;

function loadSaved(uid: string): Saved | null {
  try {
    const raw = sessionStorage.getItem(storageKey(uid));
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch {
    return null;
  }
}

const SORTERS: Record<SortKey, (a: NormalizedAd, b: NormalizedAd) => number> = {
  SCORE: (a, b) => (b.matrixScore?.compositeScore ?? b.winningScore) - (a.matrixScore?.compositeScore ?? a.winningScore),
  LIKES: (a, b) => (b.totalLikes ?? b.matrixScore?.totalLikes ?? Math.round((b.totalViews ?? 0) * 0.042)) - (a.totalLikes ?? a.matrixScore?.totalLikes ?? Math.round((a.totalViews ?? 0) * 0.042)),
  VIEWS: (a, b) => (b.totalViews ?? b.matrixScore?.totalViews ?? 0) - (a.totalViews ?? a.matrixScore?.totalViews ?? 0),
  LONGEST: (a, b) => b.activeDaysCount - a.activeDaysCount,
};

const toError = (err: unknown): RemixError => ({
  message: errorMessage(err),
  code: err instanceof ApiClientError ? err.code : "INTERNAL",
});

const scrollBehavior = (): ScrollBehavior =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";

function Pager({ page, pageCount, onPage }: { page: number; pageCount: number; onPage: (page: number) => void }) {
  if (pageCount <= 1) return null;
  const step = "flex size-11 items-center justify-center rounded border border-white/[0.08] bg-white/[0.03] text-on-surface transition-colors hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40 sm:size-9";
  return (
    <nav aria-label="Result pages" className="flex items-center justify-center gap-1.5">
      <button type="button" className={step} disabled={page === 0} onClick={() => onPage(page - 1)} aria-label="Previous page">
        <Icon name="chevronLeft" />
      </button>
      {Array.from({ length: pageCount }, (_, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onPage(i)}
          aria-label={`Page ${i + 1}`}
          aria-current={i === page ? "page" : undefined}
          className={`flex size-11 items-center justify-center rounded font-mono text-mono-code transition-colors sm:size-9 ${
            i === page
              ? "bg-primary font-semibold text-on-primary shadow-[0_0_12px_rgba(192,193,255,0.35)]"
              : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
          }`}
        >
          {i + 1}
        </button>
      ))}
      <button
        type="button"
        className={step}
        disabled={page === pageCount - 1}
        onClick={() => onPage(page + 1)}
        aria-label="Next page"
      >
        <Icon name="chevronRight" />
      </button>
    </nav>
  );
}

function SkeletonGrid() {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="Searching">
      {[0, 1, 2].map((i) => (
        <li key={i} className="space-y-3 rounded-xl border border-white/[0.08] bg-surface-container-low p-3">
          <div className="h-10 w-2/3 animate-pulse rounded bg-surface-container-high" />
          <div className="aspect-[4/5] animate-pulse rounded-lg bg-surface-container-high sm:aspect-[9/13]" />
          <div className="h-16 animate-pulse rounded bg-surface-container-high" />
        </li>
      ))}
    </ul>
  );
}

/** Radar Feed: search one ad library, browse the winners, then model one in the Remix Studio. */
export function RadarView() {
  const { user, activeBrand, brands } = useSession();
  const uid = user?.uid ?? "";
  const [saved] = useState(() => (uid ? loadSaved(uid) : null));
  const [filters, setFilters] = useState<RadarFilters>(saved?.filters ?? DEFAULT_FILTERS);
  const [searched, setSearched] = useState<RadarFilters | null>(saved?.searched ?? null);
  const [result, setResult] = useState<RadarSearchResponse | null>(saved?.result ?? null);
  const [selectedAdId, setSelectedAdId] = useState<string | null>(saved?.selectedAdId ?? null);
  const [remixes, setRemixes] = useState<Record<string, RemixDoc>>(saved?.remixes ?? {});
  const [sort, setSort] = useState<SortKey>("SCORE");
  const [page, setPage] = useState(0);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<RemixError | null>(null);
  const [remixJob, setRemixJob] = useState<{ adId: string; loading: boolean; error: RemixError | null } | null>(null);
  const studio = useRef<HTMLElement>(null);
  const resultsTop = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!uid) return;
    try {
      const data: Saved = { filters, searched, result, selectedAdId, remixes };
      sessionStorage.setItem(storageKey(uid), JSON.stringify(data));
    } catch {
      // Storage full or disabled: results just won't survive a page change.
    }
  }, [uid, filters, searched, result, selectedAdId, remixes]);

  const selectedBrandId = filters.brandId || activeBrand?.brandId || brands?.[0]?.brandId || "";

  const ads = useMemo(() => (result ? [...result.ads].sort(SORTERS[sort]) : []), [result, sort]);
  // The server returns ads ranked by raw winning score, which the capped 0-100 score can't show.
  const ranks = useMemo(() => new Map(result?.ads.map((ad, i) => [ad.adId, i + 1])), [result]);
  const pageCount = Math.max(1, Math.ceil(ads.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageStart = currentPage * PAGE_SIZE;
  const pageAds = ads.slice(pageStart, pageStart + PAGE_SIZE);
  const selected = ads.find((ad) => ad.adId === selectedAdId) ?? null;
  const winners = result ? result.ads.filter((ad) => ad.activeDaysCount >= PROVEN_WINNER_DAYS).length : 0;
  // Ads the "proven winners" filter hid (results saved before this field existed count as none).
  const hiddenNewer = result && searched?.provenWinnersOnly ? Math.max(0, (result.unfilteredCount ?? 0) - result.ads.length) : 0;

  async function search(next: RadarFilters = filters) {
    if (next.query.trim().length < 2) {
      setSearchError({ message: "Type at least 2 characters to search.", code: "INVALID_INPUT" });
      return;
    }
    setSearching(true);
    setSearchError(null);
    try {
      const effectiveBrandId = next.brandId || selectedBrandId;
      const searchPayload = { ...next, brandId: effectiveBrandId };
      const res = await apiFetch<RadarSearchResponse>("/api/radar/search", { body: searchPayload });
      setResult(res);
      setSearched(searchPayload);
      setSelectedAdId(res.ads[0]?.adId ?? null);
      setPage(0);
    } catch (err) {
      setSearchError(toError(err));
    } finally {
      setSearching(false);
    }
  }

  function goToPage(next: number) {
    setPage(next);
    requestAnimationFrame(() => resultsTop.current?.scrollIntoView({ behavior: scrollBehavior(), block: "start" }));
  }

  function model(adId: string) {
    setSelectedAdId(adId);
    requestAnimationFrame(() => studio.current?.scrollIntoView({ behavior: scrollBehavior(), block: "start" }));
  }

  async function generate(ad: NormalizedAd) {
    if (!activeBrand) return;
    setRemixJob({ adId: ad.adId, loading: true, error: null });
    try {
      const res = await apiFetch<RemixResponse>("/api/radar/remix", {
        body: { adId: ad.adId, brandId: activeBrand.brandId },
      });
      setRemixes((r) => ({ ...r, [ad.adId]: res.remix }));
      const updated = res.ad;
      if (updated) setResult((r) => r && { ...r, ads: r.ads.map((a) => (a.adId === updated.adId ? updated : a)) });
      setRemixJob(null);
    } catch (err) {
      setRemixJob({ adId: ad.adId, loading: false, error: toError(err) });
    }
  }

  const job = selected && remixJob?.adId === selected.adId ? remixJob : null;
  const remix = selected ? remixes[selected.adId] : undefined;
  const studioState: RemixState = job?.loading
    ? { status: "loading" }
    : remix
      ? { status: "ready", remix }
      : { status: "idle" };
  const remixBrandName = remix ? (brands?.find((b) => b.brandId === remix.brandId)?.brandName ?? "a previous brand") : null;

  return (
    <div className="relative">
      <AmbientGlow />
      <RadarFilterBar
        filters={{ ...filters, brandId: selectedBrandId }}
        onChange={(patch) => setFilters((f) => ({ ...f, ...patch }))}
        onSearch={() => search()}
        searching={searching}
        sort={sort}
        onSort={(next) => {
          setSort(next);
          setPage(0);
        }}
        summary={result ? { total: result.ads.length, winners } : null}
        brands={brands}
      />

      <div className="relative mx-auto w-full max-w-[1600px] space-y-5 px-3 py-5 sm:space-y-6 sm:px-6 sm:py-6">
        {searchError && (
          <p className={alertError} role="alert">
            {searchError.message}{" "}
            {searchError.code === "INSUFFICIENT_TOKENS" && (
              <Link href="/wallet#packs" className="font-semibold underline">
                Buy tokens
              </Link>
            )}
          </p>
        )}

        {searching ? (
          <SkeletonGrid />
        ) : result && searched ? (
          <>
            <div
              ref={resultsTop}
              className="flex scroll-mt-20 flex-col gap-1 sm:flex-row sm:items-end sm:justify-between md:scroll-mt-48"
            >
              <h1 className="text-[22px] leading-7 font-semibold tracking-tight text-on-surface sm:text-headline-lg">
                {ads.length} {ads.length === 1 ? "ad" : "ads"} for “{searched.query}”
              </h1>
              <p className="font-mono text-mono-code text-on-surface-variant">
                {PLATFORMS[searched.platform].library} · {searched.country}
                {searched.extendedLongevity ? " · 60+ days" : searched.provenWinnersOnly ? ` · ${PROVEN_WINNER_DAYS}+ days` : ""}
                {searched.eliteWinnersOnly ? " · 90%+ match" : ""} · {result.cached ? "cached" : "fetched"}{" "}
                {new Date(result.fetchedAt).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" })}
                {pageCount > 1 && ` · showing ${pageStart + 1}–${pageStart + pageAds.length}`}
              </p>
            </div>
            {result.notice && <p className={alertInfo}>{result.notice}</p>}

            {ads.length > 0 ? (
              <>
                <ul className="grid gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
                  {pageAds.map((ad) => (
                    <li key={ad.adId}>
                      <AdWinnerCard
                        ad={ad}
                        rank={ranks.get(ad.adId) ?? Infinity}
                        selected={ad.adId === selected?.adId}
                        onModel={() => model(ad.adId)}
                      />
                    </li>
                  ))}
                </ul>
                <Pager page={currentPage} pageCount={pageCount} onPage={goToPage} />
              </>
            ) : (
              <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-white/10 bg-surface-container-lowest px-6 py-14 text-center">
                <span className="flex size-14 items-center justify-center rounded-2xl bg-surface-container-high text-primary shadow-inner">
                  <Icon name="radar" className="size-8" />
                </span>
                <div className="max-w-md space-y-1">
                  <h2 className="text-headline-md font-semibold text-on-surface">
                    {hiddenNewer ? `No ads running ${PROVEN_WINNER_DAYS}+ days yet` : "No ads found"}
                  </h2>
                  <p className="text-body text-on-surface-variant">
                    {hiddenNewer
                      ? `${hiddenNewer} newer ${hiddenNewer === 1 ? "ad matches" : "ads match"} `
                      : `Nothing in the ${PLATFORMS[searched.platform].library} matched `}
                    <span className="font-mono text-secondary">“{searched.query}”</span>
                    {hiddenNewer
                      ? " but none has run long enough to count as a proven winner."
                      : ". Try other keywords or another platform."}
                  </p>
                </div>
                {hiddenNewer > 0 && (
                  <button
                    type="button"
                    className={btnSecondary}
                    onClick={() => {
                      const next = { ...searched, provenWinnersOnly: false };
                      setFilters(next);
                      search(next);
                    }}
                  >
                    Show {hiddenNewer} newer {hiddenNewer === 1 ? "ad" : "ads"}
                    <CostTag action="RADAR_SEARCH" />
                  </button>
                )}
              </div>
            )}

            {selected && (
              <RemixStudio
                key={selected.adId}
                ref={studio}
                ad={selected}
                state={studioState}
                error={job?.error ?? null}
                brand={activeBrand}
                remixBrandName={remixBrandName}
                onGenerate={() => generate(selected)}
              />
            )}
          </>
        ) : (
          <div className="flex flex-col items-center gap-5 px-2 py-12 text-center sm:py-20">
            <span className="flex size-16 items-center justify-center rounded-2xl border border-primary-container/40 bg-primary-container/15 text-primary shadow-[0_0_24px_rgba(128,131,255,0.25)]">
              <Icon name="radar" className="size-8" />
            </span>
            <div className="max-w-lg space-y-2">
              <h1 className="text-[22px] leading-7 font-semibold tracking-tight text-on-surface sm:text-headline-lg">
                Find ads that are already winning
              </h1>
              <p className="text-body text-on-surface-variant">
                Search the Meta, TikTok and Google ad libraries. Ads that have run for weeks rise to the top, ready to remix
                for {activeBrand?.brandName ?? "your brand"}.
              </p>
            </div>
            <div className="flex max-w-3xl flex-wrap justify-center gap-2">
              {EXAMPLES.map((q) => (
                <button
                  key={q}
                  type="button"
                  data-agent-id={`radar-example-${q.replace(/\s+/g, "-")}`}
                  data-testid={`radar-example-${q.replace(/\s+/g, "-")}`}
                  aria-label={`Search ads for ${q}`}
                  onClick={() => setFilters((f) => ({ ...f, query: q }))}
                  className="h-10 rounded-full border border-white/10 bg-surface-container-low px-3.5 font-mono text-mono-code text-on-surface-variant transition-colors hover:border-primary-container hover:text-on-surface sm:h-8"
                >
                  {q}
                </button>
              ))}
            </div>
            <p className="font-mono text-mono-label text-outline">
              {ACTION_COSTS.RADAR_SEARCH || ACTION_COSTS.AI_REMIX
                ? `Searches cost ${ACTION_COSTS.RADAR_SEARCH} ${ACTION_COSTS.RADAR_SEARCH === 1 ? "token" : "tokens"} · remixes cost ${ACTION_COSTS.AI_REMIX} ${ACTION_COSTS.AI_REMIX === 1 ? "token" : "tokens"}`
                : "Searching and remixing are free right now"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
