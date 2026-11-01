"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { PROVEN_WINNER_DAYS, type NormalizedAd } from "@/lib/contracts";
import { Icon } from "@/components/ui/Icon";
import { MEDIA_LABELS, PLATFORMS } from "./options";

function formatDay(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "–";
  return d.toLocaleDateString("en-AU", { month: "short", day: "numeric" });
}

function hostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function formatViews(views: number): string {
  if (views >= 1_000_000) return `${(views / 1_000_000).toFixed(1)}M`;
  if (views >= 1_000) return `${Math.round(views / 1_000)}K`;
  return views.toLocaleString("en-AU");
}

function HighlightedText({ text, keywords }: { text: string; keywords: string[] }) {
  if (!keywords || keywords.length === 0 || !text) {
    return <span>{text}</span>;
  }

  const escaped = keywords
    .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .filter(Boolean)
    .join("|");
  if (!escaped) return <span>{text}</span>;

  const regex = new RegExp(`(${escaped})`, "gi");
  const parts = text.split(regex);

  return (
    <span>
      {parts.map((part, i) => {
        const isMatch = keywords.some((k) => k.toLowerCase() === part.toLowerCase());
        return isMatch ? (
          <mark
            key={i}
            className="rounded bg-primary/25 px-1 font-semibold text-primary not-italic"
          >
            {part}
          </mark>
        ) : (
          part
        );
      })}
    </span>
  );
}

function AdMedia({ ad, rank }: { ad: NormalizedAd; rank: number }) {
  const [playing, setPlaying] = useState(false);
  const [errored, setErrored] = useState(false);
  const video = useRef<HTMLVideoElement>(null);

  const isVideo = ad.mediaType === "VIDEO" && Boolean(ad.mediaUrls[0]);
  const isImage = (ad.mediaType === "IMAGE" || ad.mediaType === "CAROUSEL") && Boolean(ad.mediaUrls[0] || ad.thumbnailUrl);
  const isText = ad.mediaType === "TEXT" || (!isVideo && !isImage);
  const topRank = rank <= 3;

  function toggle() {
    if (!video.current) return;
    if (playing) {
      video.current.pause();
      setPlaying(false);
    } else {
      video.current.play().then(() => setPlaying(true)).catch(() => setErrored(true));
    }
  }

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-surface-container-lowest">
      {topRank && (
        <span
          data-testid="ad-winner-badge"
          className="absolute top-2 left-2 z-10 flex items-center gap-1 rounded bg-secondary px-2 py-0.5 font-mono text-mono-label font-bold text-on-secondary shadow-md"
        >
          <Icon name="flame" className="size-3" />
          Top #{rank}
        </span>
      )}

      {isVideo && !errored ? (
        <>
          <video
            ref={video}
            src={ad.mediaUrls[0]}
            poster={ad.thumbnailUrl || undefined}
            playsInline
            loop
            muted
            preload="metadata"
            onEnded={() => setPlaying(false)}
            onError={() => setErrored(true)}
            className="size-full object-contain bg-black"
          />
          <button
            type="button"
            onClick={toggle}
            aria-label={playing ? "Pause ad video" : "Play ad video"}
            className="group absolute inset-0 flex items-center justify-center bg-black/25 transition hover:bg-black/40 focus:outline-none"
          >
            <span className="flex size-11 items-center justify-center rounded-full bg-surface-container-lowest/85 text-on-surface shadow-lg backdrop-blur-sm transition group-hover:scale-105 group-hover:bg-primary group-hover:text-on-primary">
              <Icon name={playing ? "play" : "play"} className={`size-5 ${playing ? "opacity-75" : "translate-x-0.5"}`} />
            </span>
          </button>
        </>
      ) : isImage && !errored ? (
        <Image
          src={ad.mediaUrls[0] || ad.thumbnailUrl}
          alt={ad.headline || ad.advertiserName || "Ad creative"}
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          className="object-cover"
          onError={() => setErrored(true)}
        />
      ) : (
        <div className="flex size-full flex-col items-center justify-center gap-1.5 p-4 text-center">
          <span className="flex size-10 items-center justify-center rounded-full bg-surface-container-high text-on-surface-variant">
            <Icon name={isText ? "layers" : "film"} />
          </span>
          <p className="font-mono text-[11px] text-outline">
            {isText ? "Search text ad · creative shown on Google" : "Creative unavailable upstream"}
          </p>
          <span className="font-mono text-[10px] text-outline-variant">
            {formatDay(ad.firstSeenDate)} – {formatDay(ad.lastSeenDate)}
          </span>
        </div>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  sub,
  tone,
  divided,
}: {
  label: string;
  value: string | number;
  sub: string;
  tone: string;
  divided?: boolean;
}) {
  return (
    <div className={`flex flex-col ${divided ? "border-x border-white/[0.06]" : ""}`}>
      <dt className="text-[10px] text-outline uppercase">{label}</dt>
      <dd className={`text-[14px] font-bold ${tone}`}>{value}</dd>
      <dd className="text-[10px] text-outline truncate px-0.5">{sub}</dd>
    </div>
  );
}

/**
 * One search result: longevity badge, total views metric, highlight keywords, expandable copy and the "Model this ad" trigger.
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
  const views = ad.totalViews ?? ad.matrixScore?.totalViews ?? 0;
  const keywords = ad.matrixScore?.highlightKeywords ?? ad.highlightKeywords ?? [];

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
              <span className={`rounded border px-2 py-0.5 font-mono text-[10px] font-semibold ${platform.chip}`}>
                {platform.label}
              </span>
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
              className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 font-mono text-[11px] font-medium ${
                proven
                  ? "border-winner-soft/30 bg-winner-soft/10 text-winner-soft"
                  : "border-white/10 bg-surface-container-highest text-on-surface-variant"
              }`}
            >
              <Icon name="flame" className="size-3" />
              Active {ad.activeDaysCount}d
            </span>
            <span className="font-mono text-[11px] font-semibold text-secondary">
              Matrix {ad.matrixScore ? ad.matrixScore.compositeScore : ad.winningScore}
            </span>
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
              <p className={`text-compact whitespace-pre-line text-on-surface ${expanded ? "" : "line-clamp-2"}`}>
                <HighlightedText text={ad.primaryCopy} keywords={keywords} />
              </p>
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

        {/* 4-Metric Grid with Total Views */}
        <dl className="grid grid-cols-4 rounded-lg border border-white/[0.06] bg-surface-container-lowest py-2 text-center font-mono">
          <Metric label="Days live" value={ad.activeDaysCount} sub={`since ${formatDay(ad.firstSeenDate)}`} tone="text-winner-soft" />
          <Metric label="Win score" value={ad.winningScore} sub="of 100" tone="text-on-surface" divided />
          <Metric label="Est. views" value={formatViews(views)} sub="reach" tone="text-primary" divided />
          <Metric label="Format" value={MEDIA_LABELS[ad.mediaType]} sub={platform.label} tone="text-secondary" divided />
        </dl>

        {ad.matrixScore && (
          <div
            data-testid={`matrix-score-box-${ad.adId}`}
            className="rounded-lg border border-primary-container/30 bg-primary-container/10 p-2.5 space-y-2"
          >
            <div className="flex items-center justify-between font-mono text-[11px]">
              <span className="font-bold flex items-center gap-1.5 text-primary">
                <Icon name="radar" className="size-3.5" />
                Matrix Match: {ad.matrixScore.compositeScore}/100
              </span>
              <span className="rounded bg-primary/20 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                Authentic
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1 pt-1 text-center font-mono text-[10px] border-t border-white/[0.08]">
              <div>
                <span className="text-outline block uppercase text-[9px]">Brand Fit</span>
                <span className="font-bold text-on-surface">{ad.matrixScore.brandFitScore}%</span>
              </div>
              <div className="border-x border-white/[0.08]">
                <span className="text-outline block uppercase text-[9px]">Hook Power</span>
                <span className="font-bold text-secondary">{ad.matrixScore.hookStrengthScore}%</span>
              </div>
              <div>
                <span className="text-outline block uppercase text-[9px]">Scale & Reach</span>
                <span className="font-bold text-winner-soft">{ad.matrixScore.longevityScore}%</span>
              </div>
            </div>

            {/* Highlighted Keywords Badges */}
            {keywords.length > 0 && (
              <div className="pt-1.5 border-t border-white/[0.06] space-y-1">
                <span className="font-mono text-[9px] uppercase tracking-wider text-outline block">
                  Resonant Keywords
                </span>
                <div className="flex flex-wrap gap-1">
                  {keywords.map((kw, i) => (
                    <span
                      key={i}
                      className="rounded bg-primary/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-primary ring-1 ring-primary/20"
                    >
                      {kw}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {ad.matrixScore.resonanceReason && (
              <p className="text-[11px] leading-tight text-on-surface-variant font-sans pt-1 border-t border-white/[0.06]">
                {ad.matrixScore.resonanceReason}
              </p>
            )}
          </div>
        )}

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
