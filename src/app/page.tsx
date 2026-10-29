import { HomeCta } from "@/components/auth/HomeCta";
import { ACTION_COSTS } from "@/lib/pricing";

const STEPS = [
  {
    title: "Find proven winners",
    body: "Search the Meta, TikTok and Google ad libraries. Ads that have run for weeks rise to the top.",
  },
  {
    title: "Deconstruct the ad",
    body: "See the hook, pacing and persuasion framework behind why it works.",
  },
  {
    title: "Remix for your brand",
    body: "Get three ready-to-test variations with copy and a shot-by-shot storyboard.",
  },
];

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center gap-12 px-4 py-20">
      <section className="space-y-6">
        <p className="text-sm font-semibold uppercase tracking-widest text-emerald-700 dark:text-emerald-400">Ad Radar</p>
        <h1 className="max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
          Model the ads that are already winning.
        </h1>
        <p className="max-w-xl text-lg text-zinc-600 dark:text-zinc-400">
          Pay as you go with tokens: a search costs {ACTION_COSTS.RADAR_SEARCH}, a full remix costs {ACTION_COSTS.AI_REMIX}.
          No subscription.
        </p>
        <HomeCta />
      </section>

      <ol className="grid gap-4 sm:grid-cols-3">
        {STEPS.map((step, i) => (
          <li key={step.title} className="rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
            <p className="text-sm font-semibold text-zinc-400">0{i + 1}</p>
            <h2 className="mt-2 font-semibold">{step.title}</h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{step.body}</p>
          </li>
        ))}
      </ol>
    </main>
  );
}
