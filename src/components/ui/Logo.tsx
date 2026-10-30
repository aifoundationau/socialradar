/** Radar mark plus the "AdRadar" wordmark. */
export function Logo({ wordmark = true }: { wordmark?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <svg viewBox="0 0 32 32" className="size-8 shrink-0" aria-hidden="true">
        <defs>
          <linearGradient id="adradar-mark" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#8083ff" />
            <stop offset="1" stopColor="#7bd0ff" />
          </linearGradient>
        </defs>
        <rect x="0.5" y="0.5" width="31" height="31" rx="8" fill="#181b25" stroke="url(#adradar-mark)" strokeOpacity=".5" />
        <circle cx="16" cy="16" r="9.5" fill="none" stroke="url(#adradar-mark)" strokeOpacity=".35" strokeWidth="1.5" />
        <circle cx="16" cy="16" r="5.5" fill="none" stroke="url(#adradar-mark)" strokeOpacity=".7" strokeWidth="1.5" />
        <path d="M16 16 23.5 9" stroke="url(#adradar-mark)" strokeWidth="2" strokeLinecap="round" />
        <circle cx="16" cy="16" r="1.9" fill="#c0c1ff" />
        <circle cx="21.2" cy="19.6" r="1.5" fill="#34d399" />
      </svg>
      {wordmark && <span className="text-title-sm font-semibold tracking-tight text-on-surface">AdRadar</span>}
    </span>
  );
}
