"use client";

import { useState } from "react";
import { useSession } from "@/components/auth/SessionProvider";
import { apiFetch, errorMessage } from "@/lib/api-client";
import type { BrandProfile } from "@/lib/contracts";
import { Icon } from "@/components/ui/Icon";
import { alertError, btnDanger, btnPrimary, btnSecondary, card, field } from "@/components/ui/styles";
import { TONE_LABELS } from "./BrandForm";
import { BrandSlideOver } from "./BrandSlideOver";

type SlideOverState =
  | { isOpen: false }
  | { isOpen: true; mode: "create" }
  | { isOpen: true; mode: "edit"; brand: BrandProfile };

export function BrandsManager() {
  const { brands, profile } = useSession();
  const [slideOver, setSlideOver] = useState<SlideOverState>({ isOpen: false });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [selectedUrls, setSelectedUrls] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  async function run(brandId: string, action: () => Promise<unknown>) {
    setBusyId(brandId);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  const makeActive = (b: BrandProfile) =>
    run(b.brandId, () => apiFetch("/api/brands", { method: "PATCH", body: { activeBrandId: b.brandId } }));

  const remove = (b: BrandProfile) =>
    run(b.brandId, async () => {
      await apiFetch("/api/brands", { method: "DELETE", body: { brandId: b.brandId } });
      setConfirmDeleteId(null);
    });

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
            My Brands
          </h1>
          <p className="mt-1 text-body text-on-surface-variant">
            Remixes are written for your active brand: its offer, audience and tone.
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

      {error && <p className={alertError}>{error}</p>}

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
            Create your first brand with its target customer, tone of voice, unique offer, and landing pages to power AI remixes.
          </p>
          <button
            type="button"
            data-testid="create-first-brand-empty-btn"
            data-agent-id="create-first-brand-empty-btn"
            className={`${btnPrimary} mt-6`}
            onClick={() => setSlideOver({ isOpen: true, mode: "create" })}
          >
            <Icon name="plus" />
            Create your first brand
          </button>
        </div>
      ) : (
        /* Brand Grid */
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
                    <h2 className="truncate text-title-sm font-semibold text-on-surface">{b.brandName}</h2>
                    <p className="font-mono text-mono-label text-outline uppercase">
                      {TONE_LABELS[b.toneOfVoice]}
                    </p>
                  </div>
                  {active && (
                    <span className="shrink-0 rounded-full border border-winner/40 bg-winner/15 px-2.5 py-0.5 font-mono text-[11px] font-bold text-winner-soft">
                      Active
                    </span>
                  )}
                </div>

                {/* Description */}
                <p className="line-clamp-3 text-body text-on-surface-variant">
                  {b.productServiceDescription}
                </p>

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
                    <div className="flex flex-wrap gap-2 *:flex-1 sm:*:flex-none">
                      {!active && (
                        <button
                          type="button"
                          className={btnSecondary}
                          onClick={() => makeActive(b)}
                          disabled={busyId !== null}
                        >
                          Make active
                        </button>
                      )}
                      <button
                        type="button"
                        className={btnSecondary}
                        onClick={() => setSlideOver({ isOpen: true, mode: "edit", brand: b })}
                        disabled={busyId !== null}
                      >
                        <Icon name="pencil" className="size-3.5" />
                        Edit
                      </button>
                      <button
                        type="button"
                        className={btnDanger}
                        onClick={() => setConfirmDeleteId(b.brandId)}
                        disabled={busyId !== null}
                      >
                        <Icon name="trash" className="size-3.5" />
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
