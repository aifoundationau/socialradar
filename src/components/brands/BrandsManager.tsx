"use client";

import { useState } from "react";
import { useSession } from "@/components/auth/SessionProvider";
import { apiFetch, errorMessage } from "@/lib/api-client";
import type { BrandProfile } from "@/lib/contracts";
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
          <h1 className="text-2xl font-semibold tracking-tight">Brands</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Remixes are written for your active brand: its offer, audience and tone.
          </p>
        </div>
        {!showCreate && (
          <button type="button" className={btnPrimary} onClick={() => setEditing({ mode: "create" })}>
            New brand
          </button>
        )}
      </div>

      {error && <p className={alertError}>{error}</p>}

      {showCreate && (
        <section className={card} aria-labelledby="new-brand">
          <h2 id="new-brand" className="mb-4 font-semibold">
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
                <h2 className="mb-4 font-semibold">Edit {b.brandName}</h2>
                <BrandForm brand={b} onDone={() => setEditing(null)} onCancel={() => setEditing(null)} />
              </li>
            );
          }
          return (
            <li
              key={b.brandId}
              className={`${card} flex flex-col gap-3 ${active ? "ring-2 ring-emerald-500 dark:ring-emerald-400" : ""}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate font-semibold">{b.brandName}</h2>
                  <p className="text-xs text-zinc-500">{TONE_LABELS[b.toneOfVoice]}</p>
                </div>
                {active && (
                  <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    Active
                  </span>
                )}
              </div>
              <p className="line-clamp-3 text-sm text-zinc-600 dark:text-zinc-400">{b.productServiceDescription}</p>
              <a
                href={b.destinationUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="truncate text-sm text-emerald-700 hover:underline dark:text-emerald-400"
              >
                {b.destinationUrl}
              </a>
              <div className="mt-auto flex flex-wrap gap-2 pt-2">
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
                  Edit
                </button>
                <button type="button" className={btnDanger} onClick={() => remove(b)} disabled={busyId !== null}>
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
