"use client";

import { useState } from "react";
import { useSession } from "@/components/auth/SessionProvider";
import { apiFetch, errorMessage } from "@/lib/api-client";
import type { BrandProfile } from "@/lib/contracts";
import { Icon } from "@/components/ui/Icon";
import { alertError, btnDanger, btnPrimary, btnSecondary, card } from "@/components/ui/styles";
import { BrandForm, TONE_LABELS } from "./BrandForm";

type Editing = { mode: "create" } | { mode: "edit"; brand: BrandProfile } | null;

export function BrandsManager() {
  const { brands, profile } = useSession();
  const [editing, setEditing] = useState<Editing>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
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

  const remove = (b: BrandProfile) => {
    if (!window.confirm(`Delete "${b.brandName}"? Remixes you already made for it are kept.`)) return;
    return run(b.brandId, () => apiFetch("/api/brands", { method: "DELETE", body: { brandId: b.brandId } }));
  };

  if (brands === null) {
    return <div className={`${card} h-40 animate-pulse`} aria-busy="true" />;
  }

  // First visit: go straight to the form.
  const showCreate = editing?.mode === "create" || (brands.length === 0 && editing === null);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[22px] leading-7 font-semibold tracking-tight sm:text-headline-lg">Brands</h1>
          <p className="mt-1 text-body text-on-surface-variant">
            Remixes are written for your active brand: its offer, audience and tone.
          </p>
        </div>
        {!showCreate && (
          <button type="button" className={btnPrimary} onClick={() => setEditing({ mode: "create" })}>
            <Icon name="plus" />
            New brand
          </button>
        )}
      </div>

      {error && <p className={alertError}>{error}</p>}

      {showCreate && (
        <section className={card} aria-labelledby="new-brand">
          <h2 id="new-brand" className="mb-4 text-title-sm font-semibold">
            {brands.length === 0 ? "Create your first brand" : "New brand"}
          </h2>
          <BrandForm onDone={() => setEditing(null)} onCancel={() => setEditing(null)} />
        </section>
      )}

      <ul className="grid gap-4 md:grid-cols-2">
        {brands.map((b) => {
          const active = b.brandId === profile?.activeBrandId;
          if (editing?.mode === "edit" && editing.brand.brandId === b.brandId) {
            return (
              <li key={b.brandId} className={`${card} md:col-span-2`}>
                <h2 className="mb-4 text-title-sm font-semibold">Edit {b.brandName}</h2>
                <BrandForm brand={b} onDone={() => setEditing(null)} onCancel={() => setEditing(null)} />
              </li>
            );
          }
          return (
            <li
              key={b.brandId}
              className={`${card} flex flex-col gap-3 ${
                active ? "border-primary-container shadow-[0_0_24px_rgba(128,131,255,0.18)] ring-1 ring-primary-container" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-title-sm font-semibold">{b.brandName}</h2>
                  <p className="font-mono text-mono-label text-outline uppercase">{TONE_LABELS[b.toneOfVoice]}</p>
                </div>
                {active && (
                  <span className="shrink-0 rounded-full border border-winner/40 bg-winner/15 px-2 py-0.5 font-mono text-[11px] font-bold text-winner-soft">
                    Active
                  </span>
                )}
              </div>
              <p className="line-clamp-3 text-body text-on-surface-variant">{b.productServiceDescription}</p>
              <a
                href={b.destinationUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="truncate font-mono text-mono-code text-primary hover:underline"
              >
                {b.destinationUrl}
              </a>
              <div className="mt-auto flex flex-wrap gap-2 pt-2 *:flex-1 sm:*:flex-none">
                {!active && (
                  <button type="button" className={btnSecondary} onClick={() => makeActive(b)} disabled={busyId !== null}>
                    Make active
                  </button>
                )}
                <button
                  type="button"
                  className={btnSecondary}
                  onClick={() => setEditing({ mode: "edit", brand: b })}
                  disabled={busyId !== null}
                >
                  <Icon name="pencil" className="size-3.5" />
                  Edit
                </button>
                <button type="button" className={btnDanger} onClick={() => remove(b)} disabled={busyId !== null}>
                  <Icon name="trash" className="size-3.5" />
                  {busyId === b.brandId ? "Working…" : "Delete"}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
