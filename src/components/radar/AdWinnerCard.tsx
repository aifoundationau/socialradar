"use client";

import { useState } from "react";
import { PROVEN_WINNER_DAYS, type NormalizedAd } from "@/lib/contracts";
import { Icon } from "@/components/ui/Icon";
import { MEDIA_LABELS, PLATFORMS, formatDay } from "./options";

const isYouTube = (url: string) => /^https:\/\/(www\.)?(youtube\.com|youtu\.be)\//.test(url);
const hostname = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

const playButton =
  "flex size-9 items-center justify-center rounded-full bg-white/90 text-surface-container-lowest transition-transform hover:scale-110 sm:size-7";

/** Poster first; the native <video> element (and its download) only exists once the user taps play. */
function AdMedia({ ad, rank }: { ad: NormalizedAd; rank: number }) {
  const [playing, setPlaying] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const video = ad.mediaType === "VIDEO" ? ad.mediaUrls[0] : undefined;
  const hook = ad.headline || ad.primaryCopy;

  return (
    <div className="group relative aspect-[4/5] overflow-hidden rounded-lg border border-white/[0.06] bg-gradient-to-br from-surface-container-high via-surface-container-low to-surface-container-lowest sm:aspect-[9/13] lg:aspect-[9/14]">
      {playing && video ? (
        <video
          src={video}
          poster={ad.thumbnailUrl || undefined}
          controls
          autoPlay
          playsInline
          preload="none"
          className="size-full bg-black object-contain"
        />
      ) : (
        <>
          {ad.thumbnailUrl && !imageFailed ? (
            // eslint-disable-next-line @next/next/no-img-element -- creatives come from many ad-library CDNs
            <img
              src={ad.thumbnailUrl}
              alt=""
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              onError={() => setImageFailed(true)}
              className="size-full object-cover transition-transform duration-500 motion-safe:group-hover:scale-105"
            />
          ) : (
            <div className="flex size-full flex-col items-center justify-center gap-2 text-outline">
              <Icon name={ad.mediaType === "VIDEO" ? "film" : ad.mediaType === "TEXT" ? "search" : "image"} className="size-8" />
              <span className="font-mono text-mono-label uppercase">
                {ad.platform === "GOOGLE" && !ad.headline
                  ? "Creative loads when modelled"
                  : ad.mediaType === "TEXT"
                    ? "Search text ad"
                    : "Preview unavailable"}
              </span>
            </div>
          )}

          {rank <= 3 && (
            <span className="absolute top-2.5 left-2.5 flex items-center gap-1.5 rounded border border-hot/30 bg-surface-container-lowest/80 px-2 py-0.5 font-mono text-[10px] font-bold tracking-wider text-hot uppercase backdrop-blur-md">
              <span className="size-1.5 rounded-full bg-hot motion-safe:animate-ping" />
              #{rank} winner
            </span>
          )}
          <span className="absolute top-2.5 right-2.5 rounded bg-surface-container-lowest/80 px-2 py-0.5 font-mono text-[11px] text-on-surface backdrop-blur-md">
            {MEDIA_LABELS[ad.mediaType]}
          </span>

          {hook && (
            <div className="absolute inset-x-3 bottom-14 rounded-lg border border-white/10 bg-surface-container-lowest/85 p-2.5 backdrop-blur-md">
              <p className="mb-0.5 flex items-center gap-1 font-mono text-[10px] font-bold text-hot-soft uppercase">
                <Icon name="alert" className="size-3" />
                {ad.headline ? "Headline" : "Opening line"}
              </p>
              <p className="line-clamp-3 text-[13px] leading-snug font-semibold text-white">“{hook}”</p>
            </div>
          )}

          <div className="absolute inset-x-0 bottom-0 flex h-12 items-center justify-between gap-2 bg-gradient-to-t from-surface-container-lowest via-surface-container-lowest/80 to-transparent px-3">
            {video ? (
              isYouTube(video) ? (
                <a href={video} target="_blank" rel="noopener noreferrer" aria-label="Watch on YouTube" className={playButton}>
                  <Icon name="play" className="size-4" />
                </a>
              ) : (
                <button type="button" onClick={() => setPlaying(true)} aria-label="Play video" className={playButton}>
                  <Icon name="play" className="size-4" />
                </button>
              )
            ) : (
              <span />
            )}
            <span className="font-mono text-[10px] text-on-surface-variant">
              {formatDay(ad.firstSeenDate)} – {formatDay(ad.lastSeenDate)}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

function Metric({ label, value, sub, tone, divided }: { label: string; value: string | number; sub: string; tone: string; divided?: boolean }) {
  return (
    <div className={`flex flex-col ${divided ? "border-x border-white/[0.06]" : ""}`}>
      <dt className="text-[10px] text-outline uppercase">{label}</dt>
      <dd className={`text-[15px] font-bold ${tone}`}>{value}</dd>
      <dd className="text-[10px] text-outline">{sub}</dd>
    </div>
  );
}

/**
 * One search result: longevity badge, lazy video, expandable copy and the "Model this ad" trigger.
 * `rank` is the position by raw winning score (the server's order); the top 3 get a badge.
 */
export function AdWinnerCard({
  ad,
  rank,
  selected,
  onModel,
}: {
  ad: NormalizedAd;
  rank: number;
  selected: boolean;
  onModel: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const platform = PLATFORMS[ad.platform];
  const proven = ad.activeDaysCount >= PROVEN_WINNER_DAYS;

  return (
    <article
      className={`relative flex h-full flex-col rounded-xl border bg-surface-container-low transition ${
        selected
          ? "border-primary-container shadow-[0_0_24px_rgba(128,131,255,0.18)] ring-1 ring-primary-container"
          : "border-white/[0.08] hover:border-white/20"
      }`}
    >
      {selected && (
        <span className="absolute -top-3 left-4 z-10 flex items-center gap-1 rounded-full bg-primary px-2.5 py-0.5 font-mono text-[10px] font-bold tracking-wider text-on-primary uppercase shadow-md">
          <Icon name="sparkles" className="size-3" />
          Currently modeling
        </span>
      )}
      <div className={`flex flex-1 flex-col gap-3 p-3 ${selected ? "pt-5" : ""}`}>
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={`rounded border px-2 py-0.5 font-mono text-[10px] font-semibold ${platform.chip}`}>{platform.label}</span>
              <span className="rounded bg-surface-container-highest px-1.5 py-0.5 font-mono text-[10px] text-on-surface-variant">
                {ad.countryCode}
              </span>
            </div>
            <h3 className="truncate text-title-sm font-semibold tracking-tight text-on-surface">
              {ad.advertiserName || "Unknown advertiser"}
            </h3>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <span
              className={`flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[11px] font-bold whitespace-nowrap ${
                proven
                  ? "border-winner/40 bg-winner/15 text-winner-soft shadow-[0_0_8px_rgba(16,185,129,0.2)]"
                  : "border-white/10 bg-surface-container-highest text-on-surface-variant"
              }`}
            >
              <Icon name="flame" className="size-3" />
              Active {ad.activeDaysCount}d
            </span>
            <span className="font-mono text-[11px] text-secondary">Score {ad.winningScore}</span>
          </div>
        </header>

        <AdMedia ad={ad} rank={rank} />

        {(ad.primaryCopy || ad.landingPageUrl) && (
          <div className="flex flex-col gap-1 rounded border border-white/[0.04] bg-surface-container/70 p-2.5">
            <div className="flex items-center justify-between gap-2 font-mono text-[11px] text-outline">
              <span>PRIMARY COPY</span>
              {ad.ctaText && <span className="truncate text-secondary">CTA · {ad.ctaText}</span>}
            </div>
            {ad.primaryCopy && (
              <p className={`text-compact whitespace-pre-line text-on-surface ${expanded ? "" : "line-clamp-2"}`}>{ad.primaryCopy}</p>
            )}
            {ad.primaryCopy.length > 110 && (
              <button
                type="button"
                onClick={() => setExpanded((e) => !e)}
                aria-expanded={expanded}
                className="self-start py-1 font-mono text-[11px] text-primary hover:underline"
              >
                {expanded ? "Show less ▴" : "Show full copy ▾"}
              </button>
            )}
            {ad.landingPageUrl && (
              <a
                href={ad.landingPageUrl}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="flex items-center gap-1 self-start font-mono text-[11px] text-on-surface-variant hover:text-primary"
              >
                <span className="truncate">{hostname(ad.landingPageUrl)}</span>
                <Icon name="externalLink" className="size-3" />
              </a>
            )}
          </div>
        )}

        <dl className="grid grid-cols-3 rounded-lg border border-white/[0.06] bg-surface-container-lowest py-2 text-center font-mono">
          <Metric label="Days live" value={ad.activeDaysCount} sub={`since ${formatDay(ad.firstSeenDate)}`} tone="text-winner-soft" />
          <Metric label="Win score" value={ad.winningScore} sub="of 100" tone="text-on-surface" divided />
          <Metric label="Format" value={MEDIA_LABELS[ad.mediaType]} sub={platform.label} tone="text-secondary" />
        </dl>

        <button
          type="button"
          onClick={onModel}
          className={`mt-auto flex h-11 w-full items-center justify-center gap-1.5 rounded-lg text-body transition sm:h-9 ${
            selected
              ? "bg-gradient-to-r from-primary-container via-primary to-secondary font-bold text-surface-container-lowest shadow-[0_0_18px_rgba(128,131,255,0.4)] hover:brightness-110"
              : "border border-white/10 bg-surface-container-highest font-semibold text-on-surface hover:border-secondary hover:text-secondary"
          }`}
        >
          {selected ? "Modeling this ad" : "Model this ad"}
          <Icon name="zap" />
        </button>
      </div>
    </article>
  );
}
