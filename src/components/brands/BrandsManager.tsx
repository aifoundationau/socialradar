"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/components/auth/SessionProvider";
import { apiFetch, errorMessage } from "@/lib/api-client";
import type { BrandProfile } from "@/lib/contracts";
import { Icon } from "@/components/ui/Icon";
import {
  alertError,
  alertSuccess,
  btnDanger,
  btnPrimary,
  btnSecondary,
  card,
  field,
} from "@/components/ui/styles";
import { TONE_LABELS } from "./BrandForm";
import { BrandSlideOver } from "./BrandSlideOver";
import { formatTokenEstimateHover } from "@/lib/pricing";

type SlideOverState =
  | { isOpen: false }
  | { isOpen: true; mode: "create" }
  | { isOpen: true; mode: "edit"; brand: BrandProfile };

type BrandsTab = "personal" | "global";

export function BrandsManager() {
  const { brands, profile, isAdmin } = useSession();
  const [activeTab, setActiveTab] = useState<BrandsTab>("personal");
  const [slideOver, setSlideOver] = useState<SlideOverState>({ isOpen: false });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [duplicateTarget, setDuplicateTarget] = useState<BrandProfile | null>(null);
  const [duplicateVersionName, setDuplicateVersionName] = useState("");
  const [selectedUrls, setSelectedUrls] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Global Brands Library State
  const [globalBrands, setGlobalBrands] = useState<BrandProfile[] | null>(null);
  const [globalLoading, setGlobalLoading] = useState(false);
  const [cloneFee, setCloneFee] = useState<number>(1);
  const [audRate, setAudRate] = useState<number>(100);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTone, setSelectedTone] = useState<string>("ALL");
  const [cloningId, setCloningId] = useState<string | null>(null);

  async function run(brandId: string, action: () => Promise<unknown>) {
    setBusyId(brandId);
    setError(null);
    setSuccessMsg(null);
    try {
      await action();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  const makeActive = (b: BrandProfile) =>
    run(b.brandId, async () => {
      await apiFetch("/api/brands", { method: "PATCH", body: { activeBrandId: b.brandId } });
      setSuccessMsg(`"${b.brandName}" is now your active research brand.`);
    });

  const remove = (b: BrandProfile) =>
    run(b.brandId, async () => {
      await apiFetch("/api/brands", { method: "DELETE", body: { brandId: b.brandId } });
      setConfirmDeleteId(null);
      setSuccessMsg(`Brand "${b.brandName}" was deleted.`);
    });

  async function handleToggleGlobal(b: BrandProfile) {
    const nextGlobal = !b.isGlobal;
    await run(b.brandId, async () => {
      await apiFetch("/api/brands", {
        method: "PUT",
        body: { ...b, isGlobal: nextGlobal },
      });
      setSuccessMsg(
        nextGlobal
          ? `"${b.brandName}" is now Global! Anyone in the community can search and copy it.`
          : `"${b.brandName}" is now Private to your account.`
      );
    });
  }

  async function handleDuplicateBrand(e: React.FormEvent) {
    e.preventDefault();
    if (!duplicateTarget) return;
    setBusyId(duplicateTarget.brandId);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await apiFetch<{ brand: BrandProfile }>("/api/brands/duplicate", {
        method: "POST",
        body: {
          brandId: duplicateTarget.brandId,
          versionName: duplicateVersionName.trim() || `${duplicateTarget.brandName} (Copy)`,
        },
      });
      setSuccessMsg(`Created new version: "${res.brand.brandName}"`);
      setDuplicateTarget(null);
      setDuplicateVersionName("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function fetchGlobalBrands(q: string = searchQuery, tone: string = selectedTone) {
    setGlobalLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (tone && tone !== "ALL") params.set("tone", tone);
      const res = await apiFetch<{
        brands: BrandProfile[];
        brandCloneFee?: number;
        audCentsPerToken?: number;
      }>(`/api/brands/global?${params.toString()}`);
      setGlobalBrands(res.brands);
      if (typeof res.brandCloneFee === "number") setCloneFee(res.brandCloneFee);
      if (typeof res.audCentsPerToken === "number") setAudRate(res.audCentsPerToken);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setGlobalLoading(false);
    }
  }

  async function handleCloneGlobalBrand(globalBrand: BrandProfile) {
    const isSuperAdmin = Boolean(isAdmin);
    const balance = profile?.tokenBalance ?? 0;
    if (!isSuperAdmin && cloneFee > 0 && balance < cloneFee) {
      setError(
        `Insufficient tokens: copying a global brand card requires ${cloneFee} tokens (your balance: ${balance} tokens). Please top up in your Wallet.`
      );
      return;
    }

    setCloningId(globalBrand.brandId);
    setError(null);
    setSuccessMsg(null);
    try {
      await apiFetch<{ brand: BrandProfile }>("/api/brands/clone", {
        method: "POST",
        body: { globalBrandId: globalBrand.brandId },
      });
      setSuccessMsg(
        `Successfully copied "${globalBrand.brandName}" into your personal brands${
          cloneFee > 0 && !isSuperAdmin ? ` (-${cloneFee} tokens)` : ""
        }!`
      );
      setActiveTab("personal");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setCloningId(null);
    }
  }

  useEffect(() => {
    if (activeTab === "global" && globalBrands === null) {
      fetchGlobalBrands("", "ALL");
    }
  }, [activeTab, globalBrands]);

  if (brands === null) {
    return <div className={`${card} h-40 animate-pulse`} aria-busy="true" />;
  }

  const activeSlideOverBrand = slideOver.isOpen && slideOver.mode === "edit" ? slideOver.brand : undefined;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1
            data-testid="my-brands-heading"
            data-agent-id="my-brands-heading"
            className="text-[22px] leading-7 font-semibold tracking-tight sm:text-headline-lg text-on-surface"
          >
            Brand Cards & Profiles
          </h1>
          <p className="mt-1 text-body text-on-surface-variant">
            Create personal brand cards, duplicate iterations, or discover and copy community brands.
          </p>
        </div>
        <button
          type="button"
          data-testid="new-brand-button"
          data-agent-id="new-brand-button"
          className={btnPrimary}
          onClick={() => setSlideOver({ isOpen: true, mode: "create" })}
        >
          <Icon name="plus" />
          {brands.length === 0 ? "Create your first brand" : "New brand"}
        </button>
      </div>

      {/* Tabs Switcher: My Brands (Personal) vs Global Brands Library */}
      <div className="flex items-center gap-2 border-b border-white/[0.08] pb-2">
        <button
          type="button"
          onClick={() => setActiveTab("personal")}
          data-testid="tab-personal-brands"
          className={`flex items-center gap-2 rounded-xl px-4 py-2 font-mono text-sm font-semibold transition ${
            activeTab === "personal"
              ? "border border-primary/50 bg-primary/15 text-primary shadow-sm"
              : "text-on-surface-variant hover:bg-white/[0.04] hover:text-on-surface"
          }`}
        >
          <Icon name="tag" className="size-4" />
          <span>My Brands (Personal)</span>
          <span className="rounded-full bg-white/[0.08] px-2 py-0.5 text-xs text-on-surface">
            {brands.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("global")}
          data-testid="tab-global-brands"
          className={`flex items-center gap-2 rounded-xl px-4 py-2 font-mono text-sm font-semibold transition ${
            activeTab === "global"
              ? "border border-primary/50 bg-primary/15 text-primary shadow-sm"
              : "text-on-surface-variant hover:bg-white/[0.04] hover:text-on-surface"
          }`}
        >
          <Icon name="globe" className="size-4" />
          <span>Global Brand Library</span>
          {globalBrands && (
            <span className="rounded-full bg-secondary/15 px-2 py-0.5 text-xs text-secondary font-bold">
              {globalBrands.length}
            </span>
          )}
        </button>
      </div>

      {error && <p className={alertError}>{error}</p>}
      {successMsg && <p className={alertSuccess}>{successMsg}</p>}

      {/* TAB 1: MY BRANDS (PERSONAL) */}
      {activeTab === "personal" && (
        <div className="space-y-6">
          {/* Collapsible Explanation */}
          <details
            className="group rounded-2xl border border-primary/25 bg-surface-container-high p-4 transition-all shadow-sm"
            data-testid="brands-explanation-dropdown"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between font-medium text-on-surface">
              <div className="flex items-center gap-2">
                <span className="flex size-6 items-center justify-center rounded-lg bg-primary/20 text-primary">
                  <Icon name="sparkles" className="size-3.5" />
                </span>
                <span className="text-compact font-semibold text-primary">
                  How Brand Cards Work (Personal, Global & Version Duplication)
                </span>
              </div>
              <span className="text-xs text-on-surface-variant transition-transform duration-200 group-open:rotate-180">
                ▼
              </span>
            </summary>
            <div className="mt-3.5 space-y-3 border-t border-white/[0.08] pt-3 text-compact text-on-surface-variant">
              <p className="leading-relaxed">
                Brand cards are personal to your account by default. You can create different campaign versions by clicking <strong>&ldquo;Duplicate&rdquo;</strong>, or share your brand publicly with the community by clicking <strong>&ldquo;Make Global&rdquo;</strong>.
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 pt-1">
                <div className="rounded-xl border border-white/[0.06] bg-surface-container p-3 space-y-1">
                  <strong className="text-body font-semibold text-on-surface flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-primary" />
                    1. Personal & Private
                  </strong>
                  <p className="text-[12px] leading-relaxed">
                    All your brands, offers, and audience personas are kept strictly confidential by default.
                  </p>
                </div>
                <div className="rounded-xl border border-white/[0.06] bg-surface-container p-3 space-y-1">
                  <strong className="text-body font-semibold text-on-surface flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-secondary" />
                    2. Version Duplication
                  </strong>
                  <p className="text-[12px] leading-relaxed">
                    Easily branch or clone brand cards to test different hooks, offers, or seasonal campaigns.
                  </p>
                </div>
                <div className="rounded-xl border border-white/[0.06] bg-surface-container p-3 space-y-1">
                  <strong className="text-body font-semibold text-on-surface flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-tertiary" />
                    3. Global Discovery
                  </strong>
                  <p className="text-[12px] leading-relaxed">
                    Toggle &ldquo;Make Global&rdquo; to publish your framework to the Global Brand Library so others can copy it.
                  </p>
                </div>
              </div>
            </div>
          </details>

          {/* Duplicate Brand Modal / Dialog */}
          {duplicateTarget && (
            <div
              role="dialog"
              aria-modal="true"
              className="rounded-2xl border border-secondary/40 bg-surface-container-high p-5 space-y-3 shadow-xl animate-fadeIn"
              data-testid="duplicate-brand-dialog"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon name="copy" className="size-5 text-secondary" />
                  <h3 className="text-title-sm font-semibold text-on-surface">
                    Duplicate &ldquo;{duplicateTarget.brandName}&rdquo;
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setDuplicateTarget(null)}
                  className="text-on-surface-variant hover:text-on-surface"
                >
                  <Icon name="x" className="size-4" />
                </button>
              </div>
              <p className="text-compact text-on-surface-variant">
                Create a distinct version of this brand card. All target customer pain points, tone, and landing pages will be duplicated into a new personal card.
              </p>
              <form onSubmit={handleDuplicateBrand} className="flex flex-col sm:flex-row gap-2 pt-1">
                <input
                  type="text"
                  required
                  maxLength={100}
                  className={`${field} flex-1`}
                  placeholder="New Version Name (e.g. Acme - Winter Campaign)"
                  value={duplicateVersionName}
                  onChange={(e) => setDuplicateVersionName(e.target.value)}
                  data-testid="duplicate-version-name-input"
                />
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="submit"
                    className={btnPrimary}
                    disabled={busyId !== null}
                    data-testid="confirm-duplicate-btn"
                  >
                    <Icon name="copy" className="size-4" />
                    {busyId ? "Duplicating…" : "Create Duplicate"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDuplicateTarget(null)}
                    className={btnSecondary}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Empty State */}
          {brands.length === 0 ? (
            <div
              data-testid="empty-brands-container"
              className={`${card} flex flex-col items-center justify-center p-12 text-center`}
            >
              <div className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary mb-4">
                <Icon name="tag" className="size-7" />
              </div>
              <h2 className="text-title-md font-semibold text-on-surface">No brands created yet</h2>
              <p className="mt-1 max-w-md text-body text-on-surface-variant">
                Create your first personal brand card or browse the Global Brand Library to copy community frameworks.
              </p>
              <div className="flex items-center gap-3 mt-6">
                <button
                  type="button"
                  data-testid="create-first-brand-empty-btn"
                  data-agent-id="create-first-brand-empty-btn"
                  className={btnPrimary}
                  onClick={() => setSlideOver({ isOpen: true, mode: "create" })}
                >
                  <Icon name="plus" />
                  Create your first brand
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("global")}
                  className={btnSecondary}
                >
                  <Icon name="globe" className="size-4" />
                  Browse Global Library
                </button>
              </div>
            </div>
          ) : (
            /* Personal Brand Cards Grid */
            <ul className="grid gap-4 md:grid-cols-2" data-testid="brands-grid">
              {brands.map((b) => {
                const active = b.brandId === profile?.activeBrandId;
                const urls =
                  b.landingPageUrls && b.landingPageUrls.length > 0
                    ? b.landingPageUrls
                    : [b.destinationUrl].filter(Boolean);
                const activeUrl = selectedUrls[b.brandId] || urls[0] || b.destinationUrl;
                const isDeleting = confirmDeleteId === b.brandId;

                return (
                  <li
                    key={b.brandId}
                    data-testid={`brand-card-${b.brandId}`}
                    data-agent-id={`brand-card-${b.brandId}`}
                    className={`${card} flex flex-col gap-3.5 transition-shadow ${
                      active
                        ? "border-primary-container shadow-[0_0_24px_rgba(128,131,255,0.18)] ring-1 ring-primary-container"
                        : ""
                    }`}
                  >
                    {/* Brand Header */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h2 className="truncate text-title-sm font-semibold text-on-surface">{b.brandName}</h2>
                          {b.version && (
                            <span className="shrink-0 rounded bg-white/[0.08] px-1.5 py-0.5 font-mono text-[10px] text-on-surface-variant">
                              {b.version}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="font-mono text-mono-label text-outline uppercase">
                            {TONE_LABELS[b.toneOfVoice]}
                          </span>
                          <span className="text-white/20">·</span>
                          {b.isGlobal ? (
                            <span className="flex items-center gap-1 font-mono text-[10px] font-semibold text-secondary">
                              <Icon name="globe" className="size-3" />
                              Global
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 font-mono text-[10px] text-on-surface-variant">
                              🔒 Private
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {active && (
                          <span className="shrink-0 rounded-full border border-winner/40 bg-winner/15 px-2.5 py-0.5 font-mono text-[11px] font-bold text-winner-soft">
                            Active
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Description */}
                    <p className="line-clamp-3 text-body text-on-surface-variant">
                      {b.productServiceDescription}
                    </p>

                    {/* Cloned source indicator */}
                    {b.clonedFromBrandId && (
                      <div className="flex items-center gap-1 text-[11px] text-on-surface-variant font-mono">
                        <Icon name="copy" className="size-3 text-primary" />
                        <span>Duplicated iteration</span>
                      </div>
                    )}

                    {/* Landing Page URLs Dropdown & Link */}
                    <div className="space-y-1.5 rounded-lg border border-white/[0.06] bg-surface-container-low p-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider font-mono">
                          Landing Pages ({urls.length})
                        </span>
                        {urls.length > 1 && (
                          <span className="text-[11px] text-outline">Select to inspect</span>
                        )}
                      </div>
                      {urls.length > 1 ? (
                        <select
                          aria-label={`Landing page URLs for ${b.brandName}`}
                          data-testid={`brand-url-select-${b.brandId}`}
                          className={`${field} py-1 text-compact`}
                          value={activeUrl}
                          onChange={(e) =>
                            setSelectedUrls((prev) => ({ ...prev, [b.brandId]: e.target.value }))
                          }
                        >
                          {urls.map((u, i) => (
                            <option key={i} value={u}>
                              {u}
                            </option>
                          ))}
                        </select>
                      ) : null}
                      <a
                        href={activeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 truncate font-mono text-mono-code text-primary hover:underline pt-0.5"
                        title={activeUrl}
                      >
                        <Icon name="externalLink" className="size-3 shrink-0" />
                        <span className="truncate">{activeUrl}</span>
                      </a>
                    </div>

                    {/* Action Buttons & Confirm Delete */}
                    <div className="mt-auto pt-2">
                      {isDeleting ? (
                        <div
                          data-testid={`confirm-delete-box-${b.brandId}`}
                          className="rounded-lg border border-error/40 bg-error/10 p-3 space-y-2.5"
                        >
                          <p className="text-compact font-medium text-error">
                            Delete &ldquo;{b.brandName}&rdquo;? Previous remixes will remain saved.
                          </p>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              className={btnDanger}
                              data-testid="confirm-delete-button"
                              data-agent-id="confirm-delete-button"
                              onClick={() => remove(b)}
                              disabled={busyId !== null}
                            >
                              <Icon name="trash" className="size-3.5" />
                              {busyId === b.brandId ? "Deleting…" : "Confirm Delete"}
                            </button>
                            <button
                              type="button"
                              className={btnSecondary}
                              onClick={() => setConfirmDeleteId(null)}
                              disabled={busyId !== null}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center gap-1.5">
                          {!active && (
                            <button
                              type="button"
                              className={`${btnSecondary} py-1 px-2.5 text-xs`}
                              onClick={() => makeActive(b)}
                              disabled={busyId !== null}
                              title="Make this your active brand for searches and remixes"
                            >
                              Make active
                            </button>
                          )}
                          <button
                            type="button"
                            className={`${btnSecondary} py-1 px-2.5 text-xs`}
                            onClick={() => setSlideOver({ isOpen: true, mode: "edit", brand: b })}
                            disabled={busyId !== null}
                            title="Edit this brand"
                          >
                            <Icon name="pencil" className="size-3" />
                            Edit
                          </button>
                          <button
                            type="button"
                            className={`${btnSecondary} py-1 px-2.5 text-xs`}
                            onClick={() => {
                              setDuplicateTarget(b);
                              setDuplicateVersionName(`${b.brandName} (v2)`);
                            }}
                            disabled={busyId !== null}
                            title="Duplicate this brand to create a new campaign or iteration"
                            data-testid={`duplicate-brand-btn-${b.brandId}`}
                          >
                            <Icon name="copy" className="size-3" />
                            Duplicate
                          </button>
                          <button
                            type="button"
                            className={`${btnSecondary} py-1 px-2.5 text-xs ${
                              b.isGlobal ? "border-secondary/40 text-secondary" : ""
                            }`}
                            onClick={() => handleToggleGlobal(b)}
                            disabled={busyId !== null}
                            title={b.isGlobal ? "Make this brand private" : "Share this brand globally"}
                            data-testid={`toggle-global-btn-${b.brandId}`}
                          >
                            <Icon name="globe" className="size-3" />
                            {b.isGlobal ? "Make Private" : "Make Global"}
                          </button>
                          <button
                            type="button"
                            className={`${btnDanger} py-1 px-2.5 text-xs ml-auto`}
                            onClick={() => setConfirmDeleteId(b.brandId)}
                            disabled={busyId !== null}
                            title="Delete brand"
                          >
                            <Icon name="trash" className="size-3" />
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {/* TAB 2: GLOBAL BRAND LIBRARY (COMMUNITY DISCOVERY) */}
      {activeTab === "global" && (
        <div className="space-y-6">
          {/* Search & Filter Toolbar */}
          <div className={`${card} p-4 space-y-3`}>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Icon
                  name="search"
                  className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-on-surface-variant pointer-events-none"
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") fetchGlobalBrands(searchQuery, selectedTone);
                  }}
                  placeholder="Search global brands by name, product, audience, or pain points..."
                  className={`${field} pl-9`}
                  data-testid="global-search-input"
                />
              </div>

              <select
                value={selectedTone}
                onChange={(e) => {
                  setSelectedTone(e.target.value);
                  fetchGlobalBrands(searchQuery, e.target.value);
                }}
                className={`${field} sm:w-48`}
                data-testid="global-tone-filter"
              >
                <option value="ALL">All Tones</option>
                <option value="DIRECT_RESPONSE">Direct response</option>
                <option value="AUTHORITATIVE">Authoritative</option>
                <option value="UGC_CASUAL">UGC / casual</option>
                <option value="URGENT">Urgent</option>
              </select>

              <button
                type="button"
                onClick={() => fetchGlobalBrands(searchQuery, selectedTone)}
                disabled={globalLoading}
                className={btnPrimary}
                data-testid="global-search-btn"
              >
                <Icon name="search" className="size-4" />
                {globalLoading ? "Searching…" : "Search"}
              </button>
            </div>
          </div>

          {/* Results Grid */}
          {globalLoading ? (
            <div className="flex h-48 items-center justify-center">
              <span className="flex items-center gap-2 text-on-surface-variant font-mono text-sm">
                <Icon name="refresh" className="size-4 animate-spin" />
                Searching Global Brand Library…
              </span>
            </div>
          ) : !globalBrands || globalBrands.length === 0 ? (
            <div className={`${card} p-12 text-center text-on-surface-variant`}>
              <Icon name="globe" className="mx-auto size-12 text-on-surface-variant/40 mb-3" />
              <p className="text-title-sm font-semibold text-on-surface">No global brands found</p>
              <p className="text-compact mt-1 text-on-surface-variant">
                Try a different search term, or toggle your own brand to &ldquo;Make Global&rdquo; to contribute to the community library.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2" data-testid="global-brands-grid">
              {globalBrands.map((gb) => {
                const urls =
                  gb.landingPageUrls && gb.landingPageUrls.length > 0
                    ? gb.landingPageUrls
                    : [gb.destinationUrl].filter(Boolean);
                const primaryUrl = urls[0] || gb.destinationUrl;
                const isCloning = cloningId === gb.brandId;

                return (
                  <div
                    key={gb.brandId}
                    data-testid={`global-card-${gb.brandId}`}
                    className={`${card} flex flex-col gap-3.5 border-white/[0.08] bg-surface-container-low hover:border-primary/40 transition`}
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="truncate text-title-sm font-semibold text-on-surface">
                            {gb.brandName}
                          </h3>
                          {gb.version && (
                            <span className="shrink-0 rounded bg-white/[0.08] px-1.5 py-0.5 font-mono text-[10px] text-on-surface-variant">
                              {gb.version}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 font-mono text-mono-label text-outline">
                          <span className="uppercase text-secondary font-semibold">
                            {TONE_LABELS[gb.toneOfVoice]}
                          </span>
                          {gb.authorEmail && (
                            <>
                              <span className="text-white/20">·</span>
                              <span className="truncate max-w-[160px] text-[11px] text-on-surface-variant">
                                By {gb.authorEmail}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <span className="shrink-0 rounded-full border border-secondary/30 bg-secondary/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-secondary flex items-center gap-1">
                        <Icon name="globe" className="size-3" />
                        Community
                      </span>
                    </div>

                    {/* Description */}
                    <p className="line-clamp-3 text-body text-on-surface-variant">
                      {gb.productServiceDescription}
                    </p>

                    {/* Audience & Pain Points preview */}
                    <div className="space-y-1.5 text-[12px] bg-surface-container p-2.5 rounded-lg border border-white/[0.04]">
                      <div>
                        <span className="font-semibold text-on-surface">Audience: </span>
                        <span className="text-on-surface-variant line-clamp-1">
                          {gb.targetAudienceAvatar}
                        </span>
                      </div>
                      <div>
                        <span className="font-semibold text-on-surface">Pain Points: </span>
                        <span className="text-on-surface-variant line-clamp-1">
                          {gb.corePainPoints.slice(0, 3).join(", ")}
                        </span>
                      </div>
                    </div>

                    {/* Primary Landing Page */}
                    {primaryUrl && (
                      <a
                        href={primaryUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 truncate font-mono text-mono-code text-primary hover:underline text-[12px]"
                        title={primaryUrl}
                      >
                        <Icon name="externalLink" className="size-3 shrink-0" />
                        <span className="truncate">{primaryUrl}</span>
                      </a>
                    )}

                    {/* Copy to My Brands Button */}
                    <div className="mt-auto pt-2 border-t border-white/[0.06] flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 font-mono text-[11px] text-on-surface-variant">
                        <span>Fee:</span>
                        {cloneFee > 0 ? (
                          <span
                            title={formatTokenEstimateHover(cloneFee, false, audRate)}
                            className="cursor-help font-bold text-primary flex items-center gap-0.5"
                          >
                            <Icon name="zap" className="size-3" />
                            {cloneFee} {cloneFee === 1 ? "tok" : "tokens"}
                          </span>
                        ) : (
                          <span className="font-bold text-winner-soft">Free</span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCloneGlobalBrand(gb)}
                        disabled={isCloning}
                        title={cloneFee === 0 ? "Free to copy" : formatTokenEstimateHover(cloneFee, false, audRate)}
                        className={`${btnPrimary} py-1.5 px-3 text-xs flex items-center gap-1.5 cursor-pointer`}
                        data-testid={`clone-global-brand-${gb.brandId}`}
                      >
                        <Icon name="copy" className="size-3.5" />
                        {isCloning ? (
                          "Copying…"
                        ) : (
                          <>
                            <span>Make a copy for myself</span>
                            {cloneFee > 0 && (
                              <span className="ml-1 rounded-full bg-black/30 px-1.5 py-0.5 font-mono text-[10px] font-bold text-primary flex items-center gap-0.5">
                                <Icon name="zap" className="size-2.5" />
                                {cloneFee}
                              </span>
                            )}
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Slide-over panel */}
      <BrandSlideOver
        isOpen={slideOver.isOpen}
        onClose={() => setSlideOver({ isOpen: false })}
        brand={activeSlideOverBrand}
        isFirst={brands.length === 0}
      />
    </div>
  );
}
