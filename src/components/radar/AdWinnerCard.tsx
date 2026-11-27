"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { PROVEN_WINNER_DAYS, type NormalizedAd } from "@/lib/contracts";
import { formatTokenEstimateHover } from "@/lib/pricing";
import { getSearchMixFileName } from "@/lib/searchmix-text-file";
import { Icon } from "@/components/ui/Icon";
import { PLATFORMS } from "./options";

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

function isLikelyVideoAsset(url: string): boolean {
  return /\.(?:mp4|webm|mov|m3u8)(?:$|\?)/i.test(url);
}

function AdMedia({
  ad,
  onCollapse,
}: {
  ad: NormalizedAd;
  onCollapse: () => void;
}) {
  const [playing, setPlaying] = useState(false);
  const [videoErrored, setVideoErrored] = useState(false);
  const [failedSrcCount, setFailedSrcCount] = useState<{ adId: string; idx: number }>({
    adId: ad.adId,
    idx: 0,
  });
  const video = useRef<HTMLVideoElement>(null);

  const primaryMediaUrl = ad.mediaUrls[0] || "";
  const isVideo = ad.mediaType === "VIDEO" && isLikelyVideoAsset(primaryMediaUrl);
  const candidateImages: string[] = [];
  const pushImage = (url?: string | null) => {
    const clean = (url || "").trim();
    if (!clean || !/^https:\/\//i.test(clean) || isLikelyVideoAsset(clean)) return;
    if (!candidateImages.includes(clean)) candidateImages.push(clean);
  };

  // Always prioritize the actual image captured from the social media ad first
  pushImage(ad.thumbnailUrl);
  for (const mediaUrl of ad.mediaUrls) {
    pushImage(mediaUrl);
  }
  if (ad.landingPageUrl) {
    pushImage(`https://api.microlink.io/?url=${encodeURIComponent(ad.landingPageUrl)}&embed=image.url`);
    pushImage(`https://s.wordpress.com/mshots/v1/${encodeURIComponent(ad.landingPageUrl)}?w=800&h=450`);
  }

  const candidateIndex = failedSrcCount.adId === ad.adId ? failedSrcCount.idx : 0;
  const imageSrc = candidateImages[candidateIndex] || "";
  const isImage = Boolean(imageSrc);
  const isText = ad.mediaType === "TEXT";

  function toggle() {
    if (!video.current) return;
    if (playing) {
      video.current.pause();
      setPlaying(false);
    } else {
      video.current.play().then(() => setPlaying(true)).catch(() => setVideoErrored(true));
    }
  }

  return (
    <div className="relative aspect-video max-h-[175px] w-full overflow-hidden rounded-lg border border-white/10 bg-surface-container-lowest sm:max-h-none">
      <button
        type="button"
        onClick={onCollapse}
        data-agent-id={`ad-hide-image-button-${ad.adId}`}
        data-testid={`ad-hide-image-button-${ad.adId}`}
        aria-label={`Hide Search Image for ${ad.advertiserName || "advertiser"}`}
        className="absolute top-2 right-2 z-10 inline-flex cursor-pointer items-center gap-1 rounded bg-black/75 px-2 py-0.5 font-mono text-[10px] font-semibold text-white/90 backdrop-blur-sm transition hover:bg-black"
      >
        <Icon name="eyeOff" className="size-3" />
        <span>Hide image</span>
      </button>

      {isVideo && !videoErrored ? (
        <>
          <video
            ref={video}
            src={primaryMediaUrl}
            poster={ad.thumbnailUrl || undefined}
            playsInline
            loop
            muted
            preload="metadata"
            onEnded={() => setPlaying(false)}
            onError={() => setVideoErrored(true)}
            className="size-full object-contain bg-black"
          />
          <button
            type="button"
            onClick={toggle}
            data-agent-id={`ad-video-toggle-${ad.adId}`}
            data-testid={`ad-video-toggle-${ad.adId}`}
            aria-label={playing ? "Pause ad video" : "Play ad video"}
            className="group absolute inset-0 flex items-center justify-center bg-black/25 transition hover:bg-black/40 focus:outline-none"
          >
            <span className="flex size-11 items-center justify-center rounded-full bg-surface-container-lowest/85 text-on-surface shadow-lg backdrop-blur-sm transition group-hover:scale-105 group-hover:bg-primary group-hover:text-on-primary">
              <Icon name={playing ? "play" : "play"} className={`size-5 ${playing ? "opacity-75" : "translate-x-0.5"}`} />
            </span>
          </button>
        </>
      ) : isImage ? (
        <>
          <Image
            src={imageSrc}
            alt={ad.headline || ad.advertiserName || "Ad creative"}
            fill
            unoptimized
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover"
            onError={() =>
              setFailedSrcCount((prev) => ({
                adId: ad.adId,
                idx: (prev.adId === ad.adId ? prev.idx : 0) + 1,
              }))
            }
          />
          {ad.mediaType === "VIDEO" && (
            <span className="pointer-events-none absolute right-2 bottom-2 z-10 flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-white backdrop-blur-sm">
              <Icon name="film" className="size-3" />
              Video preview
            </span>
          )}
        </>
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
    <div className={`flex min-w-0 flex-col overflow-hidden px-0.5 ${divided ? "border-x border-white/[0.06]" : ""}`}>
      <dt className="truncate text-[9px] text-outline uppercase sm:text-[10px]">{label}</dt>
      <dd className={`truncate text-xs font-bold sm:text-[14px] ${tone}`}>{value}</dd>
      <dd className="truncate text-[9px] text-outline sm:text-[10px]">{sub}</dd>
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
  searchQuery,
  fetchedAt,
  searchMixFee = 1,
  searchImageViewFee = 1,
  isAuNz = true,
  audRate = 100,
  isDownloadingTxt = false,
  onDownloadSearchMix,
  imageUnlocked = false,
  isViewingImage = false,
  onViewImage,
}: {
  ad: NormalizedAd;
  rank: number;
  selected: boolean;
  onModel: () => void;
  searchQuery?: string;
  fetchedAt?: string;
  searchMixFee?: number;
  searchImageViewFee?: number;
  isAuNz?: boolean;
  audRate?: number;
  isDownloadingTxt?: boolean;
  onDownloadSearchMix?: () => void;
  imageUnlocked?: boolean;
  isViewingImage?: boolean;
  onViewImage?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [imageCollapsed, setImageCollapsed] = useState(false);
  const topRank = rank <= 3;
  const platform = PLATFORMS[ad.platform];
  const proven = ad.activeDaysCount >= PROVEN_WINNER_DAYS;
  const views = ad.totalViews ?? ad.matrixScore?.totalViews ?? 0;
  const likes = ad.totalLikes ?? ad.matrixScore?.totalLikes ?? Math.round(views * 0.042);
  const keywords = ad.matrixScore?.highlightKeywords ?? ad.highlightKeywords ?? [];
  const searchMixFileName = getSearchMixFileName(ad, {
    searchQuery,
    dateIso: fetchedAt,
  });
  const downloadHoverTitle =
    searchMixFee === 0
      ? "Free to download SearchMix .txt"
      : formatTokenEstimateHover(searchMixFee, isAuNz, audRate);
  const viewImageHoverTitle =
    searchImageViewFee === 0
      ? "Free to view Search Image"
      : formatTokenEstimateHover(searchImageViewFee, isAuNz, audRate);

  return (
    <article
      data-agent-id={`ad-winner-card-${ad.adId}`}
      data-testid={`ad-winner-card-${ad.adId}`}
      className={`relative mx-auto flex h-full w-full min-w-0 max-w-[390px] flex-col overflow-hidden rounded-[22px] border bg-surface-container-low shadow-lg transition sm:max-w-none sm:rounded-xl sm:shadow-none ${
        selected
          ? "border-primary-container shadow-[0_0_24px_rgba(128,131,255,0.18)] ring-1 ring-primary-container"
          : "border-white/[0.12] ring-1 ring-white/[0.04] hover:border-white/20 sm:border-white/[0.08] sm:ring-0"
      }`}
    >
      {/* Android / iPhone Phone-Frame Status & Speaker Bezel on Mobile */}
      <div
        aria-hidden="true"
        className="flex items-center justify-between border-b border-white/[0.06] bg-surface-container-lowest/90 px-3 py-1 sm:hidden"
      >
        <span className="font-mono text-[9px] font-semibold text-outline">{platform.label}</span>
        <span className="h-1 w-10 rounded-full bg-white/15" />
        <span className="font-mono text-[9px] text-outline">{ad.countryCode}</span>
      </div>

      {selected && (
        <span className="absolute -top-3 left-4 z-10 flex items-center gap-1 rounded-full bg-primary px-2.5 py-0.5 font-mono text-[10px] font-bold tracking-wider text-on-primary uppercase shadow-md">
          <Icon name="sparkles" className="size-3" />
          Currently modeling
        </span>
      )}
      <div className={`flex min-w-0 flex-1 flex-col gap-2 p-2.5 sm:gap-3 sm:p-3 ${selected ? "pt-4 sm:pt-5" : ""}`}>
        <header className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <div className="flex flex-wrap items-center gap-1">
              {topRank && (
                <span
                  data-testid="ad-winner-badge"
                  className="inline-flex items-center gap-0.5 rounded bg-secondary px-1.5 py-0.5 font-mono text-[9px] font-bold text-on-secondary shadow-sm sm:text-[10px]"
                >
                  <Icon name="flame" className="size-2.5" />
                  Top #{rank}
                </span>
              )}
              <span className={`rounded border px-1.5 py-0.5 font-mono text-[9px] font-semibold sm:px-2 sm:text-[10px] ${platform.chip}`}>
                {platform.label}
              </span>
              <span className="rounded bg-surface-container-highest px-1.5 py-0.5 font-mono text-[9px] text-on-surface-variant sm:text-[10px]">
                {ad.countryCode}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <span
                className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px] font-medium sm:px-2 sm:text-[11px] ${
                  proven
                    ? "border-winner-soft/30 bg-winner-soft/10 text-winner-soft"
                    : "border-white/10 bg-surface-container-highest text-on-surface-variant"
                }`}
              >
                <Icon name="flame" className="size-2.5 sm:size-3" />
                Active {ad.activeDaysCount}d
              </span>
              <span className="font-mono text-[10px] font-semibold text-secondary sm:text-[11px]">
                Matrix {ad.matrixScore ? ad.matrixScore.compositeScore : ad.winningScore}
              </span>
            </div>
          </div>
          <h3 className="truncate text-sm font-semibold tracking-tight text-on-surface sm:text-title-sm">
            {ad.advertiserName || "Unknown advertiser"}
          </h3>
        </header>

        {(ad.primaryCopy || ad.landingPageUrl) && (
          <div className="flex min-w-0 flex-col gap-1 rounded border border-white/[0.04] bg-surface-container/70 p-2 sm:p-2.5">
            <div className="flex items-center justify-between gap-2 font-mono text-[10px] text-outline sm:text-[11px]">
              <span className="shrink-0">PRIMARY COPY</span>
              {ad.ctaText && <span className="truncate text-secondary">CTA · {ad.ctaText}</span>}
            </div>
            {ad.primaryCopy && (
              <p className={`text-xs leading-snug whitespace-pre-line text-on-surface sm:text-compact ${expanded ? "" : "line-clamp-2"}`}>
                <HighlightedText text={ad.primaryCopy} keywords={keywords} />
              </p>
            )}
            {(ad.primaryCopy.length > 110 || ad.landingPageUrl) && (
              <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 pt-0.5">
                {ad.primaryCopy.length > 110 && (
                  <button
                    type="button"
                    onClick={() => setExpanded((e) => !e)}
                    data-agent-id={`ad-expand-copy-${ad.adId}`}
                    data-testid={`ad-expand-copy-${ad.adId}`}
                    aria-label={expanded ? "Show less ad copy" : "Show full ad copy"}
                    aria-expanded={expanded}
                    className="py-0.5 font-mono text-[10px] text-primary hover:underline sm:py-1 sm:text-[11px]"
                  >
                    {expanded ? "Show less ▴" : "Show full copy ▾"}
                  </button>
                )}
                {ad.landingPageUrl && (
                  <a
                    href={ad.landingPageUrl}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    data-agent-id={`ad-landing-link-${ad.adId}`}
                    data-testid={`ad-landing-link-${ad.adId}`}
                    aria-label={`View Target Link for ${ad.advertiserName || "advertiser"}`}
                    title={ad.landingPageUrl}
                    className="flex max-w-full min-w-0 items-center gap-1 font-mono text-[10px] text-on-surface-variant hover:text-primary sm:text-[11px]"
                  >
                    <span className="truncate">{hostname(ad.landingPageUrl)} · View Target Link</span>
                    <Icon name="externalLink" className="size-3 shrink-0" />
                  </a>
                )}
              </div>
            )}
          </div>
        )}

        {/* 4-Metric Grid with Total Views */}
        <dl className="grid grid-cols-4 rounded-lg border border-white/[0.06] bg-surface-container-lowest py-1.5 text-center font-mono sm:py-2">
          <Metric label="Days live" value={ad.activeDaysCount} sub={`since ${formatDay(ad.firstSeenDate)}`} tone="text-winner-soft" />
          <Metric label="Win score" value={ad.winningScore} sub="of 100" tone="text-on-surface" divided />
          <Metric label="Est. views" value={formatViews(views)} sub="reach" tone="text-primary" divided />
          <Metric label="Est. likes" value={formatViews(likes)} sub="reactions" tone="text-secondary" divided />
        </dl>

        {ad.matrixScore && (
          <div
            data-testid={`matrix-score-box-${ad.adId}`}
            className="min-w-0 space-y-1.5 rounded-lg border border-primary-container/30 bg-primary-container/10 p-2 sm:space-y-2 sm:p-2.5"
          >
            <div className="flex items-center justify-between gap-2 font-mono text-[10px] sm:text-[11px]">
              <span className="font-bold flex items-center gap-1 text-primary sm:gap-1.5">
                <Icon name="radar" className="size-3 sm:size-3.5" />
                Matrix Match: {ad.matrixScore.compositeScore}/100
              </span>
              <span className="rounded bg-primary/20 px-1.5 py-0.5 text-[9px] font-semibold text-primary sm:text-[10px]">
                Authentic
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1 pt-1 text-center font-mono text-[10px] border-t border-white/[0.08]">
              <div className="min-w-0">
                <span className="text-outline block truncate uppercase text-[8px] sm:text-[9px]">Brand Fit</span>
                <span className="font-bold text-on-surface">{ad.matrixScore.brandFitScore}%</span>
              </div>
              <div className="min-w-0 border-x border-white/[0.08]">
                <span className="text-outline block truncate uppercase text-[8px] sm:text-[9px]">Hook Power</span>
                <span className="font-bold text-secondary">{ad.matrixScore.hookStrengthScore}%</span>
              </div>
              <div className="min-w-0">
                <span className="text-outline block truncate uppercase text-[8px] sm:text-[9px]">Scale &amp; Reach</span>
                <span className="font-bold text-winner-soft">{ad.matrixScore.longevityScore}%</span>
              </div>
            </div>

            {/* Highlighted Keywords Badges */}
            {keywords.length > 0 && (
              <div className="pt-1 border-t border-white/[0.06] space-y-1 sm:pt-1.5">
                <span className="font-mono text-[8px] uppercase tracking-wider text-outline block sm:text-[9px]">
                  Resonant Keywords
                </span>
                <div className="flex max-h-11 flex-wrap gap-1 overflow-hidden sm:max-h-none">
                  {keywords.map((kw, i) => (
                    <span
                      key={i}
                      className="rounded bg-primary/15 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-primary ring-1 ring-primary/20 sm:text-[10px]"
                    >
                      {kw}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {ad.matrixScore.resonanceReason && (
              <p className="line-clamp-2 pt-1 font-sans text-[10px] leading-tight text-on-surface-variant border-t border-white/[0.06] sm:line-clamp-none sm:text-[11px]">
                {ad.matrixScore.resonanceReason}
              </p>
            )}
          </div>
        )}

        {/* SearchMix .txt File Attachment & Download */}
        {onDownloadSearchMix && (
          <div
            data-agent-id={`ad-searchmix-box-${ad.adId}`}
            data-testid={`ad-searchmix-box-${ad.adId}`}
            className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-primary/25 bg-primary/[0.06] px-2 py-1.5 sm:px-2.5 sm:py-2"
          >
            <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
              <span className="flex size-5 shrink-0 items-center justify-center rounded border border-primary/30 bg-primary/15 text-primary sm:size-6">
                <Icon name="fileText" className="size-3 sm:size-3.5" />
              </span>
              <span
                data-agent-id={`ad-searchmix-filename-${ad.adId}`}
                data-testid={`ad-searchmix-filename-${ad.adId}`}
                className="truncate font-mono text-[10px] font-semibold text-on-surface sm:text-[11px]"
                title={searchMixFileName}
              >
                {searchMixFileName}
              </span>
            </div>

            <button
              type="button"
              onClick={onDownloadSearchMix}
              disabled={isDownloadingTxt}
              title={downloadHoverTitle}
              data-agent-id={`ad-searchmix-download-${ad.adId}`}
              data-testid={`ad-searchmix-download-${ad.adId}`}
              aria-label={`Download SearchMix .txt file ${searchMixFileName}`}
              className="inline-flex shrink-0 items-center gap-1 rounded-md border border-primary/40 bg-primary/20 px-2 py-1 font-mono text-[10px] font-semibold text-primary transition hover:bg-primary/30 disabled:opacity-50 cursor-pointer sm:px-2.5 sm:text-[11px]"
            >
              <Icon name="download" className="size-3" />
              <span>{isDownloadingTxt ? "Downloading…" : "SearchMix .txt"}</span>
              {searchMixFee > 0 ? (
                <span className="ml-0.5 inline-flex items-center gap-0.5 rounded-full bg-black/30 px-1.5 py-0.5 font-mono text-[9px] font-bold text-primary sm:text-[10px]">
                  <Icon name="zap" className="size-2.5" />
                  {searchMixFee}
                </span>
              ) : (
                <span className="ml-0.5 rounded-full bg-emerald-500/20 px-1.5 py-0.5 font-mono text-[9px] font-bold text-emerald-300 sm:text-[10px]">
                  Free
                </span>
              )}
            </button>
          </div>
        )}

        {/* View Search Image Button & Optional Preview below SearchMix .txt */}
        {imageUnlocked && !imageCollapsed ? (
          <AdMedia ad={ad} onCollapse={() => setImageCollapsed(true)} />
        ) : (
          <button
            type="button"
            disabled={isViewingImage}
            title={
              imageUnlocked
                ? "Show already unlocked Search Image (no extra charge)"
                : viewImageHoverTitle
            }
            onClick={() => {
              if (imageUnlocked) {
                setImageCollapsed(false);
              } else {
                onViewImage?.();
              }
            }}
            data-agent-id={`ad-view-image-button-${ad.adId}`}
            data-testid={`ad-view-image-button-${ad.adId}`}
            aria-label={`View Search Image for ${ad.advertiserName || "advertiser"}`}
            className="flex h-9 w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-primary/35 bg-primary/10 px-3 font-mono text-xs font-semibold text-primary transition hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Icon
              name={isViewingImage ? "refresh" : "eye"}
              className={`size-3.5 ${isViewingImage ? "animate-spin" : ""}`}
            />
            <span>
              {isViewingImage
                ? "Loading Image…"
                : imageUnlocked
                  ? "Show Search Image"
                  : "View Search Image"}
            </span>
            {!imageUnlocked &&
              (searchImageViewFee > 0 ? (
                <span className="ml-0.5 inline-flex items-center gap-0.5 rounded-full bg-black/30 px-1.5 py-0.5 font-mono text-[10px] font-bold text-primary">
                  <Icon name="zap" className="size-2.5" />
                  {searchImageViewFee}
                </span>
              ) : (
                <span className="ml-0.5 rounded-full bg-emerald-500/20 px-1.5 py-0.5 font-mono text-[10px] font-bold text-emerald-300">
                  Free
                </span>
              ))}
          </button>
        )}

        <button
          type="button"
          onClick={onModel}
          data-agent-id={`ad-model-button-${ad.adId}`}
          data-testid={`ad-model-button-${ad.adId}`}
          aria-label={`Model ad by ${ad.advertiserName || "advertiser"}`}
          className={`mt-auto flex h-9 w-full items-center justify-center gap-1.5 rounded-lg text-xs transition sm:text-body ${
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
