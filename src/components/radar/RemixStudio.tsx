"use client";

import { useEffect, useRef, useState, type Ref } from "react";
import Link from "next/link";
import type { BrandProfile, NormalizedAd, RemixDoc, RemixedAdTextDoc, RemixedAdTextItem } from "@/lib/contracts";
import { apiFetch, errorMessage } from "@/lib/api-client";
import {
  getDeconstructFileName,
  triggerDeconstructFileDownload,
} from "@/lib/deconstruct-text-file";
import { formatTokenEstimateHover } from "@/lib/pricing";
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
        <Link
          href="/wallet#packs"
          data-agent-id="remix-error-buy-tokens-link"
          data-testid="remix-error-buy-tokens-link"
          aria-label="Buy tokens"
          className="font-semibold underline"
        >
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

function remixedAdTextBlock(item: RemixedAdTextItem) {
  return `${item.platformLabel} (${item.wordCount}/150 words)\nHeadline: ${item.headline}\nCTA: ${item.cta}\n\n${item.adText}`;
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
  deconstructFee = 0,
  buildRemixedAdTextFee = 1,
  isAuNz = true,
  audRate = 100,
  remixedAdText = null,
  buildingAdText = false,
  adTextError = null,
  onGenerate,
  onBuildRemixedAdText,
}: {
  ref?: Ref<HTMLElement>;
  ad: NormalizedAd;
  state: RemixState;
  /** The last generate attempt failed; any earlier remix stays visible. */
  error: RemixError | null;
  brand: BrandProfile | null;
  /** Brand the shown remix was written for (it may differ from the active brand). */
  remixBrandName: string | null;
  deconstructFee?: number;
  buildRemixedAdTextFee?: number;
  isAuNz?: boolean;
  audRate?: number;
  remixedAdText?: RemixedAdTextDoc | null;
  buildingAdText?: boolean;
  adTextError?: RemixError | null;
  onGenerate: (isRegenerate?: boolean) => void;
  onBuildRemixedAdText?: () => void;
}) {
  const [tab, setTab] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [downloadingDeconstruct, setDownloadingDeconstruct] = useState(false);
  const [deconstructError, setDeconstructError] = useState<string | null>(null);
  const [adTextTipOpen, setAdTextTipOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  useEffect(() => {
    if (!adTextTipOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setAdTextTipOpen(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [adTextTipOpen]);

  function notify(message: string) {
    setToast(message);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 2500);
  }

  const remix = state.status === "ready" ? state.remix : null;
  const active = remix ? Math.min(tab, remix.variations.length - 1) : 0;
  const forBrand = remixBrandName ?? brand?.brandName ?? "your brand";
  const deconstructFileName = getDeconstructFileName(forBrand);
  const deconstructHoverTitle =
    deconstructFee === 0
      ? "Free to download (0 tokens)"
      : formatTokenEstimateHover(deconstructFee, false, audRate);
  const buildAdTextCostHover = formatTokenEstimateHover(buildRemixedAdTextFee, isAuNz, audRate);

  async function handleDownloadDeconstruct() {
    if (!remix) return;
    setDownloadingDeconstruct(true);
    setDeconstructError(null);
    try {
      const res = await apiFetch<{
        remixId: string;
        fileName: string;
        content: string;
        balanceAfter: number;
      }>("/api/radar/download-deconstruct", {
        method: "POST",
        body: {
          remixId: remix.remixId,
          brandName: forBrand,
          remixSnapshot: remix,
          adSnapshot: ad,
        },
      });
      triggerDeconstructFileDownload(res.fileName, res.content);
      notify(
        `Downloaded ${res.fileName}${
          deconstructFee > 0 ? ` (-${deconstructFee} ${deconstructFee === 1 ? "token" : "tokens"})` : ""
        }`
      );
    } catch (err) {
      setDeconstructError(errorMessage(err));
    } finally {
      setDownloadingDeconstruct(false);
    }
  }

  async function copyScript() {
    if (!remix) return;
    try {
      await navigator.clipboard.writeText(scriptText(remix.variations[active], active));
      notify(`Variation ${variationLetter(active)} script copied`);
    } catch {
      notify("Couldn't reach the clipboard");
    }
  }

  async function copyAdTextItem(item: RemixedAdTextItem) {
    try {
      await navigator.clipboard.writeText(remixedAdTextBlock(item));
      notify(`${item.platformLabel} remixed ad text copied`);
    } catch {
      notify("Couldn't reach the clipboard");
    }
  }

  async function copyAllAdTexts() {
    if (!remixedAdText) return;
    const full = remixedAdText.items.map(remixedAdTextBlock).join("\n\n---\n\n");
    try {
      await navigator.clipboard.writeText(full);
      notify("All 4 remixed social media ad texts copied");
    } catch {
      notify("Couldn't reach the clipboard");
    }
  }

  return (
    <section
      ref={ref}
      aria-labelledby="remix-studio-title"
      data-agent-id="remix-studio-section"
      data-testid="remix-studio-section"
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
            <button
              type="button"
              onClick={copyScript}
              data-agent-id="remix-copy-script-button"
              data-testid="remix-copy-script-button"
              aria-label="Copy current variation script to clipboard"
              className={btnSecondary}
            >
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
            <button
              type="button"
              data-agent-id="remix-generate-button"
              data-testid="remix-generate-button"
              aria-label={error ? "Try generating remix again" : "Generate AI remix for selected ad"}
              onClick={() => onGenerate(false)}
              className={`${btnPrimary} w-full max-w-xs sm:w-auto`}
            >
              <Icon name="sparkles" />
              {error ? "Try again" : "Generate remix"}
              <CostTag action="AI_REMIX" />
            </button>
          ) : (
            <Link
              href="/brands"
              data-agent-id="remix-add-brand-first-link"
              data-testid="remix-add-brand-first-link"
              aria-label="Add your brand first"
              className={`${btnPrimary} w-full max-w-xs sm:w-auto`}
            >
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
          {adTextError && <ErrorNote error={adTextError} className="mx-3 mt-3 sm:mx-5" />}
          {deconstructError && (
            <p className={`${alertError} mx-3 mt-3 sm:mx-5`} role="alert">
              {deconstructError}
            </p>
          )}
          <footer className="flex flex-col gap-3 border-t border-white/[0.06] px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Deconstructed Anatomy .txt file on the left next to Regenerate Variations */}
              <div
                data-agent-id="deconstruct-txt-attachment"
                data-testid="deconstruct-txt-attachment"
                className="inline-flex flex-wrap items-center gap-2 rounded-lg border border-primary/25 bg-primary/[0.06] px-3 py-1.5"
              >
                <span className="flex size-6 shrink-0 items-center justify-center rounded border border-primary/30 bg-primary/15 text-primary">
                  <Icon name="fileText" className="size-3.5" />
                </span>
                <span
                  data-agent-id="deconstruct-txt-filename"
                  data-testid="deconstruct-txt-filename"
                  className="font-mono text-xs font-semibold text-on-surface"
                  title={deconstructFileName}
                >
                  {deconstructFileName}
                </span>
                <button
                  type="button"
                  disabled={downloadingDeconstruct}
                  onClick={() => void handleDownloadDeconstruct()}
                  title={deconstructHoverTitle}
                  data-agent-id="download-deconstruct-txt-button"
                  data-testid="download-deconstruct-txt-button"
                  aria-label={`Download Deconstructed Anatomy file ${deconstructFileName}`}
                  className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/20 px-2.5 py-1 font-mono text-[11px] font-semibold text-primary transition hover:bg-primary/30 disabled:opacity-50 cursor-pointer"
                >
                  <Icon name="download" className="size-3" />
                  <span>{downloadingDeconstruct ? "Downloading…" : "Download .txt"}</span>
                  {deconstructFee > 0 ? (
                    <span className="ml-0.5 inline-flex items-center gap-0.5 rounded-full bg-black/30 px-1.5 py-0.5 font-mono text-[10px] font-bold text-primary">
                      <Icon name="zap" className="size-2.5" />
                      {deconstructFee}
                    </span>
                  ) : (
                    <span className="ml-0.5 rounded-full bg-emerald-500/20 px-1.5 py-0.5 font-mono text-[10px] font-bold text-emerald-300">
                      Free (0)
                    </span>
                  )}
                </button>
              </div>
              <p className="text-compact text-outline">
                {brand && remixBrandName !== brand.brandName
                  ? `Written for ${forBrand}. Generate again to write it for ${brand.brandName}.`
                  : "Not quite right? Generate a fresh set of angles."}
              </p>
            </div>
            {brand && (
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <div
                  className="relative inline-flex"
                  onMouseEnter={() => setAdTextTipOpen(true)}
                  onMouseLeave={() => setAdTextTipOpen(false)}
                  onFocus={() => setAdTextTipOpen(true)}
                  onBlur={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                      setAdTextTipOpen(false);
                    }
                  }}
                >
                  <button
                    type="button"
                    disabled={buildingAdText || !onBuildRemixedAdText}
                    data-agent-id="remix-build-ad-text-button"
                    data-testid="remix-build-ad-text-button"
                    aria-label="Build Remixed Ad Text"
                    aria-describedby="build-remixed-ad-text-tooltip"
                    onClick={() => onBuildRemixedAdText?.()}
                    className={`${btnSecondary} shrink-0`}
                  >
                    {buildingAdText ? (
                      <span className="size-3.5 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
                    ) : (
                      <Icon name="fileText" />
                    )}
                    <span>{buildingAdText ? "Building Ad Text…" : "Build Remixed Ad Text"}</span>
                    {buildRemixedAdTextFee > 0 ? (
                      <span className="flex items-center font-mono text-mono-label text-primary opacity-90">
                        <Icon name="zap" className="size-3" />
                        {buildRemixedAdTextFee}
                      </span>
                    ) : (
                      <span className="rounded-full bg-emerald-500/20 px-1.5 py-0.5 font-mono text-[10px] font-bold text-emerald-300">
                        Free (0)
                      </span>
                    )}
                  </button>
                  <div
                    className={`absolute bottom-full left-0 z-30 w-72 max-w-[calc(100vw-2rem)] pb-2 transition-opacity duration-150 sm:left-auto sm:right-0 ${
                      adTextTipOpen ? "opacity-100" : "pointer-events-none opacity-0"
                    }`}
                  >
                    <div
                      id="build-remixed-ad-text-tooltip"
                      role="tooltip"
                      data-agent-id="remix-build-ad-text-tooltip"
                      data-testid="remix-build-ad-text-tooltip"
                      className="rounded-xl border border-primary/30 bg-surface-container-highest p-3 text-left text-compact leading-relaxed text-on-surface shadow-2xl"
                    >
                      <p className="font-semibold text-on-surface">
                        Remixed Social Media Ad Text Descriptions
                      </p>
                      <p className="mt-1 text-[12px] text-on-surface-variant">
                        These are remixed text ad descriptions that can be used directly on social media platforms.
                        Generates 4 AI ad descriptions (TikTok, Facebook, Instagram, and Google Ads — max 150 words
                        each) using your brand and the current modeling ad.
                      </p>
                      <p className="mt-1.5 font-mono text-[11px] text-primary">
                        {buildAdTextCostHover}
                      </p>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  data-agent-id="remix-regenerate-variations-button"
                  data-testid="remix-regenerate-variations-button"
                  aria-label="Regenerate ad variations"
                  onClick={() => onGenerate(true)}
                  className={`${btnPrimary} shrink-0`}
                >
                  <Icon name="refresh" />
                  Regenerate variations
                  <CostTag action="REGENERATE_VARIATIONS" />
                </button>
              </div>
            )}
          </footer>
          {buildingAdText && !remixedAdText && (
            <div
              data-agent-id="remixed-ad-texts-loading"
              data-testid="remixed-ad-texts-loading"
              aria-busy="true"
              className="border-t border-white/[0.06] px-3 py-4 sm:px-5 space-y-3"
            >
              <p className="flex items-center gap-2 font-mono text-mono-code text-on-surface-variant">
                <span className="size-3 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
                Building 4 platform-tailored ad text descriptions (TikTok, Facebook, Instagram &amp; Google Ads — max 150 words each)…
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                {[0, 1, 2, 3].map((idx) => (
                  <div key={idx} className="h-36 animate-pulse rounded-xl bg-surface-container-high" />
                ))}
              </div>
            </div>
          )}
          {remixedAdText && (
            <section
              aria-labelledby="remixed-ad-texts-heading"
              data-agent-id="remixed-ad-texts-panel"
              data-testid="remixed-ad-texts-panel"
              className="border-t border-white/[0.08] bg-surface-container-low/50 px-3 py-4 sm:px-5 space-y-4"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3
                    id="remixed-ad-texts-heading"
                    className="text-title-sm font-semibold text-on-surface flex items-center gap-2"
                  >
                    <Icon name="fileText" className="size-4 text-primary" />
                    <span>Remixed Social Media Ad Text (4 Platforms)</span>
                  </h3>
                  <p className="mt-0.5 font-mono text-[11px] text-on-surface-variant">
                    Built for <span className="text-secondary font-medium">{remixedAdText.brandName}</span> · Modeled on{" "}
                    {remixedAdText.sourceAdvertiser} · Max 150 words each
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void copyAllAdTexts()}
                  data-agent-id="copy-all-remixed-ad-texts-button"
                  data-testid="copy-all-remixed-ad-texts-button"
                  aria-label="Copy all 4 social media remixed ad text descriptions"
                  className={`${btnSecondary} self-start sm:self-auto shrink-0`}
                >
                  <Icon name="copy" />
                  <span>Copy all 4</span>
                </button>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {remixedAdText.items.map((item) => {
                  const keySlug = item.platform.toLowerCase();
                  return (
                    <article
                      key={item.platform}
                      data-agent-id={`remixed-ad-text-card-${keySlug}`}
                      data-testid={`remixed-ad-text-card-${keySlug}`}
                      className="flex flex-col gap-2.5 rounded-xl border border-white/[0.08] bg-surface-container p-4"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-primary/35 bg-primary/15 px-2.5 py-0.5 font-mono text-[11px] font-bold text-primary uppercase">
                            {item.platformLabel}
                          </span>
                          <span
                            data-agent-id={`remixed-ad-text-words-${keySlug}`}
                            data-testid={`remixed-ad-text-words-${keySlug}`}
                            className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 font-mono text-[10px] text-on-surface-variant"
                          >
                            {item.wordCount} / 150 words
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => void copyAdTextItem(item)}
                          data-agent-id={`copy-remixed-ad-text-${keySlug}`}
                          data-testid={`copy-remixed-ad-text-${keySlug}`}
                          aria-label={`Copy ${item.platformLabel} remixed ad text`}
                          className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-surface-container-high px-2.5 py-1 font-mono text-[11px] font-medium text-on-surface-variant transition hover:border-primary/40 hover:text-primary cursor-pointer"
                        >
                          <Icon name="copy" className="size-3" />
                          <span>Copy</span>
                        </button>
                      </div>
                      <div>
                        <p className="font-mono text-[10px] uppercase tracking-wider text-outline">Headline</p>
                        <p className="mt-0.5 text-compact font-semibold text-on-surface">{item.headline}</p>
                      </div>
                      <div className="flex-1">
                        <p className="font-mono text-[10px] uppercase tracking-wider text-outline">Ad Text Description</p>
                        <p className="mt-1 whitespace-pre-line text-compact leading-relaxed text-on-surface-variant">
                          {item.adText}
                        </p>
                      </div>
                      <div className="border-t border-white/[0.06] pt-2 flex items-center justify-between gap-2">
                        <span className="font-mono text-[10px] uppercase tracking-wider text-outline">CTA</span>
                        <span className="font-mono text-mono-code font-semibold text-primary">{item.cta}</span>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          )}
        </>
      )}

      <Toast message={toast} />
    </section>
  );
}
