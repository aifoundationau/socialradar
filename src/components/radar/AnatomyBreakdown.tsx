import type { AdRemixBlueprint } from "@/lib/contracts";
import { Icon } from "@/components/ui/Icon";

type Deconstruction = AdRemixBlueprint["deconstruction"];

const FRAMEWORKS: Record<Deconstruction["persuasionFramework"], { name: string; steps: string[] }> = {
  PAS: { name: "Problem · Agitate · Solve", steps: ["Problem", "Agitate", "Solve"] },
  AIDA: { name: "AIDA", steps: ["Attention", "Interest", "Desire", "Action"] },
  UGC_STORY: { name: "UGC story", steps: ["Relatable moment", "Discovery", "Transformation", "Recommendation"] },
  US_VS_THEM: { name: "Us vs them", steps: ["Old way", "Why it fails", "New way", "Proof"] },
  SOCIAL_PROOF_STACK: { name: "Social proof stack", steps: ["Claim", "Proof", "More proof", "Ask"] },
};

const SEGMENT_COLORS = ["bg-hot", "bg-warm", "bg-primary", "bg-winner", "bg-secondary", "bg-meta"];

/** Parses "0-3s · Hook · Extreme close-up" (the format the remix prompt asks for); tolerant of anything else. */
function parseBeat(entry: string) {
  const [range = "", name = "", ...rest] = entry.split("·").map((s) => s.trim());
  const m = /(\d+(?:\.\d+)?)\s*[-–—]\s*(\d+(?:\.\d+)?)/.exec(range);
  if (!m || !name) return { start: null, end: null, range: "", name: entry, detail: "" };
  return { start: Number(m[1]), end: Number(m[2]), range: `${m[1]}–${m[2]}s`, name, detail: rest.join(" · ") };
}

const section = "flex flex-col gap-2 rounded-xl border border-white/[0.08] bg-surface-container-low p-3 sm:p-4";
const sectionTitle = "text-body font-semibold text-on-surface";

/** Left pane of the Remix Studio: hook, pacing timeline, persuasion framework and why the ad works. */
export function AnatomyBreakdown({ deconstruction }: { deconstruction: Deconstruction }) {
  const beats = deconstruction.pacingStructure.map(parseBeat);
  const timed = beats.every((b) => b.start !== null && b.end !== null && b.end > b.start);
  const total = timed ? Math.max(...beats.map((b) => b.end ?? 0)) : 0;
  const framework = FRAMEWORKS[deconstruction.persuasionFramework];

  return (
    <aside className="flex flex-col gap-3 bg-surface-container-low/40 p-3 sm:gap-4 sm:p-4 xl:col-span-4">
      <p className="flex items-center gap-1.5 border-b border-white/[0.06] pb-2 font-mono text-mono-label font-bold tracking-wider text-outline uppercase">
        <Icon name="flask" className="size-4 text-primary" />
        Deconstructed anatomy
      </p>

      <section className={section}>
        <div className="flex items-center justify-between gap-2">
          <h3 className={sectionTitle}>1. Hook pattern</h3>
          <span className="rounded bg-hot/15 px-2 py-0.5 font-mono text-[10px] font-bold text-hot-soft">0–3s</span>
        </div>
        <p className="text-compact text-on-surface-variant">{deconstruction.hookAnalysis}</p>
      </section>

      <section className={section}>
        <div className="flex items-center justify-between gap-2">
          <h3 className={sectionTitle}>2. Pacing & retention</h3>
          {timed && <span className="font-mono text-[11px] text-outline">{total}s</span>}
        </div>
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-surface-container-highest">
          {beats.map((b, i) => (
            <div
              key={i}
              title={`${b.range} ${b.name}`}
              className={`h-full ${SEGMENT_COLORS[i % SEGMENT_COLORS.length]}`}
              style={{ width: timed ? `${(((b.end ?? 0) - (b.start ?? 0)) / total) * 100}%` : `${100 / beats.length}%` }}
            />
          ))}
        </div>
        <ul className="mt-1 flex flex-col gap-2 font-mono text-[11px]">
          {beats.map((b, i) => (
            <li key={i} className="grid grid-cols-[auto_1fr] gap-x-2 text-on-surface-variant">
              <span className={`mt-1 size-2 rounded-full ${SEGMENT_COLORS[i % SEGMENT_COLORS.length]}`} />
              <span>
                {b.range && <span className="text-outline">{b.range} </span>}
                <span className="font-medium text-on-surface">{b.name}</span>
                {b.detail && <span className="block font-sans text-compact text-on-surface-variant">{b.detail}</span>}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className={section}>
        <h3 className={sectionTitle}>3. Persuasion framework</h3>
        <p className="font-mono text-mono-code text-secondary">{framework.name}</p>
        <ol className="flex flex-wrap gap-1.5">
          {framework.steps.map((step, i) => (
            <li
              key={step}
              className="rounded border border-white/10 bg-surface-container-highest px-2 py-0.5 font-mono text-[10px] text-on-surface"
            >
              {i + 1}. {step}
            </li>
          ))}
        </ol>
      </section>

      <section className={section}>
        <h3 className={sectionTitle}>4. Why it works</h3>
        <p className="text-compact text-on-surface-variant">{deconstruction.whyItWorks}</p>
      </section>
    </aside>
  );
}
