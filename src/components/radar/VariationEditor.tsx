import type { AdRemixBlueprint } from "@/lib/contracts";
import { Icon } from "@/components/ui/Icon";

export type Variation = AdRemixBlueprint["variations"][number];
type Beat = Variation["videoStoryboard"][number];

const BEAT_TONES = [
  "bg-hot/20 text-hot-soft",
  "bg-warm/20 text-warm-soft",
  "bg-primary/20 text-primary",
  "bg-secondary/20 text-secondary",
  "bg-meta/20 text-meta-soft",
];

export const variationLetter = (i: number) => String.fromCharCode(65 + i);

/** First beat is the hook and the last the call to action; colour the rest in order. */
function beatTag(i: number, count: number) {
  if (i === 0) return { label: "Hook", tone: BEAT_TONES[0] };
  if (i === count - 1) return { label: "CTA", tone: "bg-winner/20 text-winner-soft" };
  return { label: `Beat ${i + 1}`, tone: BEAT_TONES[i % BEAT_TONES.length] };
}

/** "0:18-0:28" → "0:28": the last m:ss in the final beat's timestamp. */
function runTime(beats: Beat[]) {
  const stamps = beats.at(-1)?.timestamp.match(/\d+:\d{2}/g);
  return stamps?.at(-1) ?? null;
}

const block = "flex flex-col gap-1.5 rounded-xl border border-white/[0.06] bg-surface-container-low p-3";
const blockLabel = "font-mono text-[11px] text-outline uppercase";

/** Right pane of the Remix Studio: the three variations, their copy and a shot-by-shot storyboard. */
export function VariationEditor({
  variations,
  active,
  onSelect,
  badges,
}: {
  variations: Variation[];
  active: number;
  onSelect: (index: number) => void;
  badges: string[];
}) {
  const v = variations[active];
  const beats = v.videoStoryboard;
  const length = runTime(beats);

  return (
    <div className="flex min-w-0 flex-col gap-4 bg-surface-container-lowest p-3 sm:p-4 xl:col-span-8">
      <div className="flex flex-col gap-3 border-b border-white/[0.06] pb-3 2xl:flex-row 2xl:items-center 2xl:justify-between">
        <div className="-mx-3 overflow-x-auto px-3 no-scrollbar sm:mx-0 sm:px-0">
          <div role="tablist" aria-label="Variations" className="inline-flex gap-1 rounded-lg border border-white/[0.08] bg-surface-container-low p-1">
            {variations.map((variation, i) => (
              <button
                key={i}
                type="button"
                role="tab"
                id={`variation-tab-${i}`}
                aria-selected={i === active}
                aria-controls="variation-panel"
                onClick={() => onSelect(i)}
                className={`flex h-10 items-center rounded px-3 text-compact whitespace-nowrap transition sm:h-8 ${
                  i === active
                    ? "bg-primary font-semibold text-on-primary shadow-[0_0_12px_rgba(192,193,255,0.35)]"
                    : "font-medium text-on-surface-variant hover:text-on-surface"
                }`}
              >
                {variationLetter(i)}: {variation.angleName}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 font-mono text-[11px]">
          {badges.map((b, i) => (
            <span
              key={b}
              className={`flex items-center gap-1 rounded border border-white/10 bg-surface-container-low px-2 py-1 ${i === 0 ? "text-on-surface" : "text-outline"}`}
            >
              {i === 0 && <span className="size-1.5 rounded-full bg-secondary" />}
              {b}
            </span>
          ))}
        </div>
      </div>

      <div id="variation-panel" role="tabpanel" aria-labelledby={`variation-tab-${active}`} className="flex flex-col gap-4">
        <div className="grid gap-3 md:grid-cols-2">
          <div className={block}>
            <p className={blockLabel}>Headline</p>
            <p className="rounded border border-white/[0.04] bg-surface-container-lowest p-2 text-body font-semibold text-on-surface">
              “{v.headline}”
            </p>
          </div>
          <div className={block}>
            <p className={blockLabel}>Call to action</p>
            <div className="flex items-center justify-between gap-2 rounded border border-white/[0.04] bg-surface-container-lowest p-2">
              <span className="text-body font-semibold text-on-surface">{v.ctaButton}</span>
              <span className="shrink-0 rounded bg-primary-container/20 px-2 py-0.5 font-mono text-[10px] font-bold text-primary uppercase">
                Button
              </span>
            </div>
          </div>
        </div>

        <div className={block}>
          <p className={blockLabel}>Primary copy</p>
          <p className="text-body whitespace-pre-line text-on-surface">{v.primaryCopy}</p>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-body font-semibold text-on-surface">
              <Icon name="film" className="size-4 text-secondary" />
              Storyboard & directing blueprint
            </h3>
            {length && <span className="shrink-0 font-mono text-[11px] text-outline">Run time {length}</span>}
          </div>

          {/* Phones: one card per beat */}
          <ol className="flex flex-col gap-2 md:hidden">
            {beats.map((b, i) => {
              const tag = beatTag(i, beats.length);
              return (
                <li key={i} className="space-y-2 rounded-xl border border-white/[0.08] bg-surface-container-low p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase ${tag.tone}`}>{tag.label}</span>
                    <span className="font-mono text-[11px] text-outline">{b.timestamp}</span>
                  </div>
                  <p className="text-compact text-on-surface">{b.visualAction}</p>
                  <p className="border-l-2 border-secondary/40 pl-2 font-mono text-mono-code text-on-surface-variant">“{b.spokenAudio}”</p>
                  {b.onScreenText && (
                    <span className="inline-block rounded border border-white/10 bg-surface-container-highest px-2 py-0.5 font-mono text-[11px] font-semibold text-on-surface">
                      {b.onScreenText}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>

          {/* Tablet and up: the 4-column table */}
          <div className="hidden overflow-hidden rounded-xl border border-white/[0.08] md:block">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-white/[0.08] bg-surface-container-low font-mono text-[11px] tracking-wider text-outline uppercase">
                    <th className="w-[30%] px-3 py-2.5 font-medium">Visual direction</th>
                    <th className="w-[34%] px-3 py-2.5 font-medium">Voiceover</th>
                    <th className="w-[24%] px-3 py-2.5 font-medium">On-screen text</th>
                    <th className="w-[12%] px-3 py-2.5 text-right font-medium">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04] text-compact text-on-surface">
                  {beats.map((b, i) => {
                    const tag = beatTag(i, beats.length);
                    return (
                      <tr key={i} className="align-top transition-colors hover:bg-white/[0.02]">
                        <td className="px-3 py-3">
                          <span className={`mb-1 inline-block rounded px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase ${tag.tone}`}>
                            {tag.label}
                          </span>
                          <p className="leading-relaxed">{b.visualAction}</p>
                        </td>
                        <td className="px-3 py-3 font-mono text-mono-code leading-relaxed">“{b.spokenAudio}”</td>
                        <td className="px-3 py-3">
                          {b.onScreenText && (
                            <span className="inline-block rounded border border-white/10 bg-surface-container-highest px-2 py-0.5 font-mono text-[11px] font-semibold">
                              {b.onScreenText}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-[11px] whitespace-nowrap text-outline">{b.timestamp}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className={block}>
          <p className={blockLabel}>Static image prompt</p>
          <p className="font-mono text-mono-code text-on-surface-variant">{v.imageGenerationPrompt}</p>
        </div>
      </div>
    </div>
  );
}
