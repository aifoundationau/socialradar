"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { useSession } from "@/components/auth/SessionProvider";
import { AmbientGlow } from "@/components/ui/AmbientGlow";
import { Icon } from "@/components/ui/Icon";
import { alertError, alertInfo, btnPrimary, btnSecondary, card, field } from "@/components/ui/styles";
import { AnatomyBreakdown } from "@/components/radar/AnatomyBreakdown";
import { variationLetter } from "@/components/radar/VariationEditor";
import { ApiClientError, apiFetch, errorMessage } from "@/lib/api-client";
import type {
  LibraryItemKind,
  LibraryItemSummary,
  LibraryListResponse,
  LibraryPurchaseResponse,
  LibraryUnlockedDetail,
} from "@/lib/contracts";
import { triggerDeconstructFileDownload } from "@/lib/deconstruct-text-file";
import { loadDetectedGeoCountry } from "@/lib/geo";
import { formatTokenEstimateHover } from "@/lib/pricing";

type KindFilter = "ALL" | LibraryItemKind;
type PlatformFilter = "ALL" | "META" | "TIKTOK" | "GOOGLE";

const KIND_BADGE_CLASS: Record<LibraryItemKind, string> = {
  PREVIOUS_SEARCH: "border-sky-400/35 bg-sky-500/15 text-sky-300",
  REMIX_STUDIO: "border-primary/40 bg-primary/15 text-primary",
  REMIXED_AD_TEXT: "border-emerald-400/35 bg-emerald-500/15 text-emerald-300",
};

const formatDateShort = (iso: string) =>
  new Date(iso).toLocaleDateString("en-AU", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

export function LibraryView() {
  const router = useRouter();
  const { user, profile } = useSession();

  const [data, setData] = useState<LibraryListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [purchaseError, setPurchaseError] = useState<{ message: string; code: string } | null>(null);

  const [kindFilter, setKindFilter] = useState<KindFilter>("ALL");
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>("ALL");
  const [searchText, setSearchText] = useState("");
  const [userCountry, setUserCountry] = useState("AU");

  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [activeUnlocked, setActiveUnlocked] = useState<{
    item: LibraryItemSummary;
    detail: LibraryUnlockedDetail;
    fileName: string;
    txtContent: string;
  } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(id);
  }, [toast]);

  const fetchCatalog = useCallback(async () => {
    const res = await apiFetch<LibraryListResponse>("/api/library");
    setData(res);
    setError(null);
  }, []);

  useEffect(() => {
    if (!user) return;
    let active = true;

    async function loadInitial() {
      try {
        const detected = loadDetectedGeoCountry();
        if (detected && active) setUserCountry(detected.trim().toUpperCase());
      } catch {
        // Fallback to AU
      }
      try {
        const res = await apiFetch<LibraryListResponse>("/api/library");
        if (!active) return;
        setData(res);
        setError(null);
      } catch (err) {
        if (!active) return;
        setError(errorMessage(err));
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadInitial();

    function handleSync() {
      void loadInitial();
    }
    window.addEventListener("adradar:config-updated", handleSync);
    window.addEventListener("adradar:geo-updated", handleSync);
    return () => {
      active = false;
      window.removeEventListener("adradar:config-updated", handleSync);
      window.removeEventListener("adradar:geo-updated", handleSync);
    };
  }, [user]);

  useEffect(() => {
    if (!activeUnlocked) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setActiveUnlocked(null);
    }
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [activeUnlocked]);

  async function handleRefresh() {
    setLoading(true);
    setPurchaseError(null);
    try {
      await fetchCatalog();
      showToast("Library synced");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function handlePurchaseOrOpen(item: LibraryItemSummary) {
    setPendingKey(item.itemKey);
    setPurchaseError(null);
    try {
      // Bought earlier, or the caller's own remix: open it without charging.
      if (item.purchased || item.isOwn) {
        const res = await apiFetch<{
          item: LibraryItemSummary;
          detail: LibraryUnlockedDetail;
          fileName: string;
          txtContent: string;
        }>(`/api/library?itemKey=${encodeURIComponent(item.itemKey)}`);
        setActiveUnlocked(res);
        return;
      }

      const res = await apiFetch<LibraryPurchaseResponse>("/api/library/purchase", {
        body: { itemKey: item.itemKey },
      });
      setData((prev) =>
        prev
          ? {
              ...prev,
              items: prev.items.map((x) =>
                x.itemKey === item.itemKey ? { ...x, purchased: true } : x,
              ),
            }
          : prev,
      );
      setActiveUnlocked({
        item: res.item,
        detail: res.detail,
        fileName: res.fileName,
        txtContent: res.txtContent,
      });
      showToast(
        res.alreadyPurchased
          ? "Opened previously purchased item"
          : libraryItemFee > 0
            ? `Unlocked item (-${libraryItemFee} ${libraryItemFee === 1 ? "token" : "tokens"})`
            : "Unlocked item (Free)",
      );
    } catch (err) {
      setPurchaseError({
        message: errorMessage(err),
        code: err instanceof ApiClientError ? err.code : "INTERNAL",
      });
    } finally {
      setPendingKey(null);
    }
  }

  /** The creator makes their remix / ad text public (other users can buy a copy) or private again. */
  async function handleToggleVisibility(item: LibraryItemSummary) {
    const nextPublic = !item.isPublic;
    setPendingKey(item.itemKey);
    setPurchaseError(null);
    try {
      await apiFetch<{ itemKey: string; isPublic: boolean }>("/api/library", {
        method: "PATCH",
        body: { itemKey: item.itemKey, isPublic: nextPublic },
      });
      setData((prev) =>
        prev
          ? {
              ...prev,
              items: prev.items.map((x) => (x.itemKey === item.itemKey ? { ...x, isPublic: nextPublic } : x)),
            }
          : prev,
      );
      showToast(
        nextPublic
          ? "Made public: other users can now buy a copy"
          : "Made private: no longer offered to other users",
      );
    } catch (err) {
      setPurchaseError({
        message: errorMessage(err),
        code: err instanceof ApiClientError ? err.code : "INTERNAL",
      });
    } finally {
      setPendingKey(null);
    }
  }

  async function copyText(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      showToast(`${label} copied`);
    } catch {
      showToast("Could not access clipboard");
    }
  }

  function openSearchInRadar() {
    if (!user || !activeUnlocked || activeUnlocked.detail.kind !== "PREVIOUS_SEARCH") return;
    const search = activeUnlocked.detail;
    const savedFilters = {
      platform: search.platform,
      query: search.query,
      country: search.country,
      mediaType: search.mediaType,
      provenWinnersOnly: false,
      extendedLongevity: false,
      eliteWinnersOnly: false,
      brandId: "",
    };
    const payload = {
      filters: savedFilters,
      searched: savedFilters,
      result: {
        ads: search.ads,
        unfilteredCount: search.ads.length,
        cached: true,
        queryHash: activeUnlocked.item.sourceId,
        fetchedAt: activeUnlocked.item.createdAt,
        notice: `Loaded from purchased Library search ("${search.query}"). Select any ad to model & remix.`,
        balanceAfter: profile?.tokenBalance ?? 0,
      },
      selectedAdId: search.ads[0]?.adId ?? null,
      remixes: {},
      remixedAdTexts: {},
    };
    try {
      sessionStorage.setItem(`adradar:radar:${user.uid}`, JSON.stringify(payload));
    } catch {
      // Ignore storage quota issues and navigate directly
    }
    setActiveUnlocked(null);
    router.push("/radar");
  }

  const libraryItemFee = data?.libraryItemFee ?? 1;
  const audRate = data?.audCentsPerToken ?? 100;
  const isAuNz = userCountry === "AU" || userCountry === "NZ";
  const priceHover =
    libraryItemFee === 0
      ? "Free unlock (0 tokens)"
      : formatTokenEstimateHover(libraryItemFee, isAuNz, audRate);

  const scopedItems = useMemo(() => {
    const all = data?.items ?? [];
    const q = searchText.trim().toLowerCase();
    return all.filter((item) => {
      if (platformFilter !== "ALL" && item.platform !== platformFilter) return false;
      if (!q) return true;
      const haystack = `${item.title} ${item.subtitle} ${item.teaser} ${item.tags.join(" ")}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [data?.items, platformFilter, searchText]);

  const counts = useMemo(
    () => ({
      ALL: scopedItems.length,
      PREVIOUS_SEARCH: scopedItems.filter((i) => i.kind === "PREVIOUS_SEARCH").length,
      REMIX_STUDIO: scopedItems.filter((i) => i.kind === "REMIX_STUDIO").length,
      REMIXED_AD_TEXT: scopedItems.filter((i) => i.kind === "REMIXED_AD_TEXT").length,
    }),
    [scopedItems],
  );

  const visibleItems = useMemo(
    () =>
      kindFilter === "ALL"
        ? scopedItems
        : scopedItems.filter((i) => i.kind === kindFilter),
    [scopedItems, kindFilter],
  );

  return (
    <div className="relative space-y-6">
      <AmbientGlow />

      {/* Header */}
      <header className="flex flex-col gap-4 rounded-2xl border border-white/[0.08] bg-surface-container-low/80 p-4 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg border border-primary/40 bg-primary/15 text-primary">
              <Icon name="layers" className="size-4" />
            </span>
            <h1 className="text-headline-md sm:text-headline-lg font-semibold tracking-tight text-on-surface">
              Library
            </h1>
            <span
              title={priceHover}
              data-agent-id="library-price-badge"
              data-testid="library-price-badge"
              className="cursor-help inline-flex items-center gap-1 rounded-full border border-primary/35 bg-primary/10 px-2.5 py-0.5 font-mono text-[11px] font-bold text-primary"
            >
              <Icon name="zap" className="size-3" />
              <span>
                Library Items:{" "}
                {libraryItemFee === 0
                  ? "Free (0)"
                  : `${libraryItemFee} ${libraryItemFee === 1 ? "token" : "tokens"}`}
              </span>
            </span>
          </div>
          <p className="text-body text-on-surface-variant max-w-2xl">
            Unlock saved <strong>Previous Searches</strong>, plus the <strong>Remix Studio</strong> blueprints and{" "}
            <strong>Remixed Ad Text</strong> builds their creators have made public, for instant viewing and{" "}
            <code>.txt</code> download. Your own remixes are listed here too: they stay private until you make
            them public.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={loading}
            onClick={() => void handleRefresh()}
            data-agent-id="library-refresh-button"
            data-testid="library-refresh-button"
            aria-label="Refresh Library items"
            className={btnSecondary}
          >
            <Icon name="refresh" className={loading ? "animate-spin" : ""} />
            <span>{loading ? "Refreshing…" : "Refresh"}</span>
          </button>
        </div>
      </header>

      {/* Filters & Category Pills */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Library item categories">
          {(
            [
              { id: "ALL", label: "All Items", count: counts.ALL },
              { id: "PREVIOUS_SEARCH", label: "Previous Searches", count: counts.PREVIOUS_SEARCH },
              { id: "REMIX_STUDIO", label: "Remix Studio", count: counts.REMIX_STUDIO },
              { id: "REMIXED_AD_TEXT", label: "Remixed Ad Text", count: counts.REMIXED_AD_TEXT },
            ] as const
          ).map((tabItem) => {
            const active = kindFilter === tabItem.id;
            const slug = tabItem.id.toLowerCase();
            return (
              <button
                key={tabItem.id}
                type="button"
                role="tab"
                aria-selected={active}
                data-agent-id={`library-filter-${slug}`}
                data-testid={`library-filter-${slug}`}
                onClick={() => setKindFilter(tabItem.id)}
                className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 font-mono text-xs font-semibold transition cursor-pointer ${
                  active
                    ? "border-primary bg-primary text-on-primary shadow-sm"
                    : "border-white/10 bg-surface-container-low text-on-surface-variant hover:border-primary/40 hover:text-on-surface"
                }`}
              >
                <span>{tabItem.label}</span>
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${
                    active ? "bg-black/20 text-on-primary" : "bg-white/[0.06] text-outline"
                  }`}
                >
                  {tabItem.count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-12">
          <div className="relative sm:col-span-8">
            <Icon
              name="search"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-outline"
            />
            <input
              type="search"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Search saved queries, brand names, advertisers, or angles…"
              aria-label="Search Library items"
              data-agent-id="library-search-input"
              data-testid="library-search-input"
              className={`${field} pl-9 text-sm`}
            />
          </div>
          <div className="sm:col-span-4">
            <select
              value={platformFilter}
              onChange={(e) => setPlatformFilter(e.target.value as PlatformFilter)}
              aria-label="Filter Library items by platform"
              data-agent-id="library-platform-filter"
              data-testid="library-platform-filter"
              className={`${field} font-mono text-xs`}
            >
              <option value="ALL">All Ad Platforms</option>
              <option value="META">Meta (Facebook & Instagram)</option>
              <option value="TIKTOK">TikTok</option>
              <option value="GOOGLE">Google & YouTube</option>
            </select>
          </div>
        </div>
      </div>

      {error && <p className={alertError}>{error}</p>}
      {purchaseError && (
        <p className={alertError} role="alert">
          {purchaseError.message}{" "}
          {purchaseError.code === "INSUFFICIENT_TOKENS" && (
            <Link
              href="/wallet#packs"
              data-agent-id="library-error-buy-tokens-link"
              data-testid="library-error-buy-tokens-link"
              className="font-semibold underline"
            >
              Buy tokens
            </Link>
          )}
        </p>
      )}

      {/* Grid of Library Items */}
      {loading && !data ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" aria-busy="true">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className={`${card} h-52 animate-pulse bg-surface-container-low`} />
          ))}
        </div>
      ) : visibleItems.length === 0 ? (
        <div className={`${card} py-12 text-center space-y-3`}>
          <p className="text-title-sm font-semibold text-on-surface">No matching Library items found</p>
          <p className="text-compact text-on-surface-variant max-w-md mx-auto">
            Run a search in Radar Feed, generate an AI remix in Remix Studio, or click{" "}
            <strong>Build Remixed Ad Text</strong> to populate the Library automatically.
          </p>
          <Link href="/radar" className={`${btnPrimary} inline-flex`}>
            <Icon name="radar" />
            <span>Open Radar Feed</span>
          </Link>
        </div>
      ) : (
        <ul
          data-agent-id="library-items-grid"
          data-testid="library-items-grid"
          className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
        >
          {visibleItems.map((item) => {
            const busy = pendingKey === item.itemKey;
            return (
              <li
                key={item.itemKey}
                data-agent-id={`library-card-${item.itemKey}`}
                data-testid={`library-card-${item.itemKey}`}
                className={`${card} flex flex-col gap-3 justify-between transition hover:border-primary/35`}
              >
                <div className="space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={`rounded-full border px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase ${KIND_BADGE_CLASS[item.kind]}`}
                      >
                        {item.kindLabel}
                      </span>
                      {item.platform && (
                        <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 font-mono text-[10px] text-on-surface-variant">
                          {item.platform}
                        </span>
                      )}
                    </div>
                    {item.isOwn ? (
                      <span
                        data-agent-id={`library-own-badge-${item.itemKey}`}
                        data-testid={`library-own-badge-${item.itemKey}`}
                        title={
                          item.isPublic
                            ? "Your remix is public: other users can buy a copy."
                            : "Your remix is private: only you can see it."
                        }
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10px] font-bold ${
                          item.isPublic
                            ? "border-primary/40 bg-primary/15 text-primary"
                            : "border-white/15 bg-white/[0.06] text-on-surface-variant"
                        }`}
                      >
                        <Icon name={item.isPublic ? "globe" : "shield"} className="size-3" />
                        {item.isPublic ? "Yours · Public" : "Yours · Private"}
                      </span>
                    ) : (
                      item.purchased && (
                        <span
                          data-agent-id={`library-unlocked-badge-${item.itemKey}`}
                          className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-300"
                        >
                          <Icon name="checkCircle" className="size-3" />
                          Unlocked
                        </span>
                      )
                    )}
                  </div>

                  <div>
                    <h2 className="text-title-sm font-semibold text-on-surface leading-snug">
                      {item.title}
                    </h2>
                    <p className="mt-0.5 font-mono text-[11px] text-secondary">{item.subtitle}</p>
                  </div>

                  <p className="text-compact leading-relaxed text-on-surface-variant line-clamp-3">
                    {item.teaser}
                  </p>

                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {item.tags.slice(0, 4).map((tag) => (
                      <span
                        key={tag}
                        className="rounded border border-white/[0.08] bg-surface-container-low px-2 py-0.5 font-mono text-[10px] text-outline"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="border-t border-white/[0.08] pt-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-[11px] font-semibold text-on-surface truncate">
                      {item.metricsLabel}
                    </p>
                    <p className="font-mono text-[10px] text-outline">
                      Saved {formatDateShort(item.createdAt)}
                    </p>
                  </div>

                  {item.isOwn ? (
                    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleToggleVisibility(item)}
                        data-agent-id={`library-visibility-${item.itemKey}`}
                        data-testid={`library-visibility-${item.itemKey}`}
                        aria-label={`${item.isPublic ? "Make private" : "Make public"}: ${item.title}`}
                        title={
                          item.isPublic
                            ? "Stop offering this to other users. Copies already bought stay with their buyers."
                            : "Let other users buy a copy of this in the Library. AdRadarHQ keeps the fee."
                        }
                        className={`${btnSecondary} shrink-0`}
                      >
                        <Icon name={item.isPublic ? "shield" : "globe"} />
                        <span>{busy ? "Saving…" : item.isPublic ? "Make private" : "Make public"}</span>
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handlePurchaseOrOpen(item)}
                        data-agent-id={`library-view-${item.itemKey}`}
                        data-testid={`library-view-${item.itemKey}`}
                        aria-label={`View your Library item ${item.title}`}
                        className={`${btnSecondary} shrink-0`}
                      >
                        <Icon name="fileText" />
                        <span>View</span>
                      </button>
                    </div>
                  ) : item.purchased ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handlePurchaseOrOpen(item)}
                      data-agent-id={`library-view-${item.itemKey}`}
                      data-testid={`library-view-${item.itemKey}`}
                      aria-label={`View purchased Library item ${item.title}`}
                      className={`${btnSecondary} shrink-0`}
                    >
                      <Icon name="fileText" />
                      <span>{busy ? "Loading…" : "View & Download"}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handlePurchaseOrOpen(item)}
                      title={priceHover}
                      data-agent-id={`library-buy-${item.itemKey}`}
                      data-testid={`library-buy-${item.itemKey}`}
                      aria-label={`Purchase Library item ${item.title}`}
                      className={`${btnPrimary} shrink-0`}
                    >
                      <Icon name="zap" />
                      <span>{busy ? "Unlocking…" : "Purchase Item"}</span>
                      <span className="rounded-full bg-black/25 px-1.5 py-0.5 font-mono text-[10px] font-bold">
                        {libraryItemFee === 0 ? "Free" : `${libraryItemFee} tok`}
                      </span>
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Unlocked Library Item Modal */}
      {activeUnlocked &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="library-modal-title"
            data-agent-id="library-detail-modal"
            data-testid="library-detail-modal"
            className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
          >
            <div
              className="fixed inset-0 bg-black/80 backdrop-blur-sm"
              onClick={() => setActiveUnlocked(null)}
              aria-hidden="true"
            />
            <div className="relative z-10 flex w-full max-w-5xl max-h-[calc(100dvh-2rem)] flex-col overflow-hidden rounded-2xl border border-white/[0.14] bg-surface-container-low shadow-2xl">
              {/* Modal Header */}
              <div className="flex flex-col gap-3 border-b border-white/[0.08] bg-surface-container-high px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full border px-2 py-0.5 font-mono text-[10px] font-bold uppercase ${KIND_BADGE_CLASS[activeUnlocked.item.kind]}`}
                    >
                      {activeUnlocked.item.kindLabel}
                    </span>
                    <span className="font-mono text-[11px] text-emerald-300">Unlocked &amp; Saved</span>
                  </div>
                  <h2 id="library-modal-title" className="mt-1 text-title-sm sm:text-headline-md font-bold text-on-surface truncate">
                    {activeUnlocked.item.title}
                  </h2>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {activeUnlocked.detail.kind === "PREVIOUS_SEARCH" && (
                    <button
                      type="button"
                      onClick={openSearchInRadar}
                      data-agent-id="library-open-in-radar-btn"
                      data-testid="library-open-in-radar-btn"
                      className={btnPrimary}
                    >
                      <Icon name="radar" />
                      <span>Open in Radar &amp; Remix Studio</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => triggerDeconstructFileDownload(activeUnlocked.fileName, activeUnlocked.txtContent)}
                    data-agent-id="library-modal-download-txt-btn"
                    data-testid="library-modal-download-txt-btn"
                    className={btnSecondary}
                  >
                    <Icon name="download" />
                    <span>Download .txt</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void copyText(activeUnlocked.txtContent, activeUnlocked.item.kindLabel)}
                    data-agent-id="library-modal-copy-btn"
                    data-testid="library-modal-copy-btn"
                    className={btnSecondary}
                  >
                    <Icon name="copy" />
                    <span>Copy All</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveUnlocked(null)}
                    aria-label="Close Library item dialog"
                    data-agent-id="library-modal-close-btn"
                    data-testid="library-modal-close-btn"
                    className="flex size-9 items-center justify-center rounded-lg border border-white/10 text-on-surface-variant hover:bg-white/[0.08] hover:text-on-surface"
                  >
                    <Icon name="x" />
                  </button>
                </div>
              </div>

              {/* Modal Body */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
                {activeUnlocked.detail.kind === "PREVIOUS_SEARCH" && (
                  <div className="space-y-3">
                    <p className={alertInfo}>
                      Showing all <strong>{activeUnlocked.detail.ads.length}</strong> saved ads for{" "}
                      <strong>&ldquo;{activeUnlocked.detail.query}&rdquo;</strong> ({activeUnlocked.detail.platform} ·{" "}
                      {activeUnlocked.detail.country}). Click <strong>Open in Radar &amp; Remix Studio</strong> above to
                      remix any of these ads right away.
                    </p>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      {activeUnlocked.detail.ads.map((ad) => (
                        <article
                          key={ad.adId}
                          className="rounded-xl border border-white/[0.08] bg-surface-container p-4 space-y-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-on-surface text-compact truncate">
                              {ad.advertiserName || "Verified Advertiser"}
                            </span>
                            <span className="rounded-full border border-winner/30 bg-winner/15 px-2 py-0.5 font-mono text-[10px] font-bold text-winner-soft shrink-0">
                              {ad.activeDaysCount}d live · {ad.winningScore}%
                            </span>
                          </div>
                          {ad.headline && <p className="text-compact font-medium text-primary">{ad.headline}</p>}
                          {ad.primaryCopy && (
                            <p className="text-compact leading-relaxed text-on-surface-variant whitespace-pre-line line-clamp-5">
                              {ad.primaryCopy}
                            </p>
                          )}
                          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 font-mono text-[11px] text-outline">
                            <span>CTA: {ad.ctaText || "Learn more"}</span>
                            {ad.landingPageUrl && (
                              <a
                                href={ad.landingPageUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-secondary hover:underline"
                              >
                                <span>Landing Page</span>
                                <Icon name="externalLink" className="size-3" />
                              </a>
                            )}
                          </div>
                        </article>
                      ))}
                    </div>
                  </div>
                )}

                {activeUnlocked.detail.kind === "REMIX_STUDIO" && (
                  <div className="space-y-4">
                    <AnatomyBreakdown deconstruction={activeUnlocked.detail.remix.deconstruction} />
                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                      {activeUnlocked.detail.remix.variations.map((v, idx) => (
                        <article
                          key={idx}
                          className="rounded-xl border border-white/[0.08] bg-surface-container p-4 space-y-2.5"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-xs font-bold text-primary uppercase">
                              Variation {variationLetter(idx)} · {v.angleName}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                void copyText(
                                  `${v.angleName}\nHeadline: ${v.headline}\nCTA: ${v.ctaButton}\n\n${v.primaryCopy}`,
                                  `Variation ${variationLetter(idx)}`,
                                )
                              }
                              className="inline-flex items-center gap-1 rounded border border-white/10 px-2 py-0.5 font-mono text-[10px] text-on-surface-variant hover:text-primary"
                            >
                              <Icon name="copy" className="size-3" />
                              Copy
                            </button>
                          </div>
                          <p className="text-compact font-semibold text-on-surface">{v.headline}</p>
                          <p className="text-compact leading-relaxed text-on-surface-variant whitespace-pre-line">
                            {v.primaryCopy}
                          </p>
                          <p className="font-mono text-[11px] text-secondary">CTA: {v.ctaButton}</p>
                          <div className="border-t border-white/[0.06] pt-2 space-y-1">
                            <p className="font-mono text-[10px] uppercase text-outline">Storyboard Beats</p>
                            {v.videoStoryboard.map((b, bIdx) => (
                              <p key={bIdx} className="text-[11px] text-on-surface-variant">
                                <span className="font-mono text-primary">[{b.timestamp}]</span> {b.visualAction} —{" "}
                                <em>&ldquo;{b.spokenAudio}&rdquo;</em>
                              </p>
                            ))}
                          </div>
                        </article>
                      ))}
                    </div>
                  </div>
                )}

                {activeUnlocked.detail.kind === "REMIXED_AD_TEXT" && (
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {activeUnlocked.detail.remixedAdText.items.map((adItem) => (
                      <article
                        key={adItem.platform}
                        className="flex flex-col gap-2.5 rounded-xl border border-white/[0.08] bg-surface-container p-4"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="rounded-full border border-primary/35 bg-primary/15 px-2.5 py-0.5 font-mono text-[11px] font-bold text-primary uppercase">
                              {adItem.platformLabel}
                            </span>
                            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 font-mono text-[10px] text-on-surface-variant">
                              {adItem.wordCount} / 150 words
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              void copyText(
                                `${adItem.platformLabel}\nHeadline: ${adItem.headline}\nCTA: ${adItem.cta}\n\n${adItem.adText}`,
                                adItem.platformLabel,
                              )
                            }
                            className="inline-flex items-center gap-1 rounded border border-white/10 px-2 py-0.5 font-mono text-[11px] text-on-surface-variant hover:text-primary"
                          >
                            <Icon name="copy" className="size-3" />
                            Copy
                          </button>
                        </div>
                        <p className="text-compact font-semibold text-on-surface">{adItem.headline}</p>
                        <p className="flex-1 whitespace-pre-line text-compact leading-relaxed text-on-surface-variant">
                          {adItem.adText}
                        </p>
                        <p className="font-mono text-mono-code text-primary">CTA: {adItem.cta}</p>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* Toast Notification */}
      <div
        role="status"
        aria-live="polite"
        className={`fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-50 flex items-center gap-2 rounded-xl border border-secondary bg-surface-container-highest px-4 py-2.5 font-mono text-mono-code text-on-surface shadow-2xl transition-all md:inset-x-auto md:right-6 md:bottom-6 ${
          toast ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0"
        }`}
      >
        <Icon name="checkCircle" className="size-4 text-secondary" />
        {toast}
      </div>
    </div>
  );
}
