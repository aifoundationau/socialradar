"use client";

import { useEffect, useRef, useState, type Ref } from "react";
import Link from "next/link";
import type { BrandProfile, NormalizedAd, RemixDoc } from "@/lib/contracts";
import { TONE_LABELS } from "@/components/brands/BrandForm";
import { CostTag } from "@/components/ui/CostTag";
import { Icon } from "@/components/ui/Icon";
import { alertError, btnPrimary, btnSecondary } from "@/components/ui/styles";
import { AnatomyBreakdown } from "./AnatomyBreakdown";
import { CsvExportButton } from "./CsvExportButton";
import { MEDIA_LABELS } from "./options";
import { VariationEditor, variationLetter, type Variation } from "./VariationEditor";

export type RemixState = { status: "idle" } | { status: "loading" } | { status: "ready"; remix: RemixDoc };
export type RemixError = { message: string; code: string };

function ErrorNote({ error, className = "" }: { error: RemixError; className?: string }) {
  return (
    <p className={`${alertError} ${className}`}>
      {error.message}{" "}
      {error.code === "INSUFFICIENT_TOKENS" && (
        <Link href="/wallet#packs" className="font-semibold underline">
          Buy tokens
        </Link>
      )}
    </p>
  );
}

function scriptText(v: Variation, i: number) {
  const beats = v.videoStoryboard
    .map((b) => `${b.timestamp}\n  Visual: ${b.visualAction}\n  Voiceover: ${b.spokenAudio}\n  On screen: ${b.onScreenText}`)
    .join("\n\n");
  return `Variation ${variationLetter(i)}: ${v.angleName}\nHeadline: ${v.headline}\nCTA: ${v.ctaButton}\n\n${v.primaryCopy}\n\n${beats}\n`;
}

function Toast({ message }: { message: string | null }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-50 flex items-center gap-2 rounded-xl border border-secondary bg-surface-container-highest px-4 py-2.5 font-mono text-mono-code text-on-surface shadow-2xl transition-all md:inset-x-auto md:right-6 md:bottom-6 ${
        message ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0"
      }`}
    >
      <Icon name="checkCircle" className="size-4 text-secondary" />
      {message}
    </div>
  );
}

function StudioSkeleton() {
  return (
    <div className="grid gap-4 p-3 sm:p-4 xl:grid-cols-12" aria-busy="true">
      <div className="space-y-3 xl:col-span-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-xl bg-surface-container-high" />
        ))}
      </div>
      <div className="space-y-3 xl:col-span-8">
        <div className="h-10 w-2/3 animate-pulse rounded-lg bg-surface-container-high" />
        <div className="h-24 animate-pulse rounded-xl bg-surface-container-high" />
        <div className="h-56 animate-pulse rounded-xl bg-surface-container-high" />
      </div>
    </div>
  );
}

/**
 * Split-screen workbench for the selected ad. Remixing costs tokens, so it only runs when the user
 * presses Generate; results stay on screen (and in the session) until they generate again.
 */
export function RemixStudio({
  ref,
  ad,
  state,
  error,
  brand,
  remixBrandName,
  onGenerate,
}: {
  ref?: Ref<HTMLElement>;
  ad: NormalizedAd;
  state: RemixState;
  /** The last generate attempt failed; any earlier remix stays visible. */
  error: RemixError | null;
  brand: BrandProfile | null;
  /** Brand the shown remix was written for (it may differ from the active brand). */
  remixBrandName: string | null;
  onGenerate: () => void;
}) {
  const [tab, setTab] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  function notify(message: string) {
    setToast(message);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 2500);
  }

  const remix = state.status === "ready" ? state.remix : null;
  const active = remix ? Math.min(tab, remix.variations.length - 1) : 0;
  const forBrand = remixBrandName ?? brand?.brandName ?? "your brand";

  async function copyScript() {
    if (!remix) return;
    try {
      await navigator.clipboard.writeText(scriptText(remix.variations[active], active));
      notify(`Variation ${variationLetter(active)} script copied`);
    } catch {
      notify("Couldn't reach the clipboard");
    }
  }

  return (
    <section
      ref={ref}
      aria-labelledby="remix-studio-title"
      className="scroll-mt-20 overflow-hidden rounded-2xl border border-white/[0.08] bg-surface-container-lowest shadow-2xl md:scroll-mt-44"
    >
      <header className="flex flex-col gap-3 border-b border-white/[0.08] bg-surface-container-low px-3 py-3 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-primary-container/50 bg-primary-container/20 text-primary shadow-[0_0_12px_rgba(128,131,255,0.4)]">
            <Icon name="sparkles" className="size-5" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h2 id="remix-studio-title" className="text-title-sm font-semibold tracking-tight text-on-surface sm:text-headline-md">
                Remix Studio · {ad.advertiserName || "Selected ad"}
              </h2>
              <span className="rounded-full border border-winner/30 bg-winner/15 px-2 py-0.5 font-mono text-[11px] font-bold whitespace-nowrap text-winner-soft">
                {ad.activeDaysCount} days live
              </span>
            </div>
            <p className="mt-0.5 font-mono text-mono-code text-on-surface-variant">
              {remix ? "Deconstructed creative DNA → 3 variations for " : "Deconstruct and remix for "}
              <span className="font-medium text-secondary">{forBrand}</span>
            </p>
          </div>
        </div>
        {remix && (
          <div className="flex flex-wrap gap-2">
            <CsvExportButton remix={remix} ad={ad} brand={brand} onExported={notify} />
            <button type="button" onClick={copyScript} className={btnSecondary}>
              <Icon name="copy" />
              Copy script
            </button>
          </div>
        )}
      </header>

      {state.status === "loading" && (
        <>
          <p className="flex items-center gap-2 px-3 pt-4 font-mono text-mono-code text-on-surface-variant sm:px-5">
            <span className="size-3 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
            Deconstructing the hook, pacing and framework. This usually takes 15–40 seconds.
          </p>
          <StudioSkeleton />
        </>
      )}

      {state.status === "idle" && (
        <div className="flex flex-col items-center gap-4 px-4 py-10 text-center sm:py-14">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-surface-container-high text-primary shadow-inner">
            <Icon name="sparkles" className="size-7" />
          </span>
          <div className="max-w-md space-y-1">
            <h3 className="text-headline-md font-semibold text-on-surface">Model this ad for {forBrand}</h3>
            <p className="text-body text-on-surface-variant">
              Break down its hook, pacing and persuasion framework, then get 3 new variations with copy and a shot-by-shot
              storyboard.
            </p>
          </div>
          {error && <ErrorNote error={error} className="max-w-md text-left" />}
          {brand ? (
            <button type="button" onClick={onGenerate} className={`${btnPrimary} w-full max-w-xs sm:w-auto`}>
              <Icon name="sparkles" />
              {error ? "Try again" : "Generate remix"}
              <CostTag action="AI_REMIX" />
            </button>
          ) : (
            <Link href="/brands" className={`${btnPrimary} w-full max-w-xs sm:w-auto`}>
              <Icon name="plus" />
              Add your brand first
            </Link>
          )}
        </div>
      )}

      {remix && (
        <>
          <div className="grid divide-y divide-white/[0.06] xl:grid-cols-12 xl:divide-x xl:divide-y-0">
            <AnatomyBreakdown deconstruction={remix.deconstruction} />
            <VariationEditor
              variations={remix.variations}
              active={active}
              onSelect={setTab}
              badges={[
                `For: ${forBrand}`,
                ...(brand && remixBrandName === brand.brandName ? [`Tone: ${TONE_LABELS[brand.toneOfVoice]}`] : []),
                `Format: ${MEDIA_LABELS[ad.mediaType]}`,
              ]}
            />
          </div>
          {error && <ErrorNote error={error} className="mx-3 mt-3 sm:mx-5" />}
          <footer className="flex flex-col gap-2 border-t border-white/[0.06] px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <p className="text-compact text-outline">
              {brand && remixBrandName !== brand.brandName
                ? `Written for ${forBrand}. Generate again to write it for ${brand.brandName}.`
                : "Not quite right? Generate a fresh set of angles."}
            </p>
            {brand && (
              <button type="button" onClick={onGenerate} className={btnPrimary}>
                <Icon name="refresh" />
                Regenerate variations
                <CostTag action="AI_REMIX" />
              </button>
            )}
          </footer>
        </>
      )}

      <Toast message={toast} />
    </section>
  );
}
