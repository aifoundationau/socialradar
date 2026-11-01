import { HomeCta } from "@/components/auth/HomeCta";
import { AmbientGlow } from "@/components/ui/AmbientGlow";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Logo } from "@/components/ui/Logo";
import { ACTION_COSTS } from "@/lib/pricing";
import { AppFooter } from "@/components/layout/AppFooter";

const STEPS: { title: string; body: string; icon: IconName }[] = [
  {
    title: "Find proven winners",
    body: "Search the Meta, TikTok and Google ad libraries. Ads that have run for weeks rise to the top.",
    icon: "radar",
  },
  {
    title: "Deconstruct the ad",
    body: "See the hook, pacing and persuasion framework behind why it works.",
    icon: "flask",
  },
  {
    title: "Remix for your brand",
    body: "Get three ready-to-test variations with copy and a shot-by-shot storyboard.",
    icon: "sparkles",
  },
];

export default function Home() {
  return (
    <div className="relative flex flex-1 flex-col">
      <AmbientGlow />
      <header className="relative mx-auto flex w-full max-w-5xl items-center justify-between px-4 pt-[calc(1rem+env(safe-area-inset-top))] sm:px-6">
        <Logo />
        <span className="rounded-full border border-primary-container/40 bg-primary-container/20 px-2 py-0.5 font-mono text-mono-label text-primary uppercase">
          Remix Studio
        </span>
      </header>

      <main className="relative mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center gap-12 px-4 py-14 sm:gap-16 sm:px-6 sm:py-20">
        <section className="max-w-2xl space-y-6">
          <p className="flex items-center gap-2 font-mono text-mono-label tracking-widest text-secondary uppercase">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full rounded-full bg-secondary opacity-75 motion-safe:animate-ping" />
              <span className="relative inline-flex size-2 rounded-full bg-secondary" />
            </span>
            Ad intelligence, pay as you go
          </p>
          <h1 className="text-[2rem] leading-10 font-semibold tracking-tight text-on-surface sm:text-display">
            Model the ads that are already winning.
          </h1>
          <p className="text-base text-on-surface-variant sm:text-title-sm">
            {ACTION_COSTS.RADAR_SEARCH || ACTION_COSTS.AI_REMIX
              ? `Pay as you go with tokens: a search costs ${ACTION_COSTS.RADAR_SEARCH} token, a full remix costs ${ACTION_COSTS.AI_REMIX} token. No subscription.`
              : "Search the ad libraries and remix winning ads for your brand. Free right now, no subscription."}
          </p>
          <HomeCta />
        </section>

        <ol className="grid gap-3 sm:grid-cols-3 sm:gap-4">
          {STEPS.map((step, i) => (
            <li key={step.title} className="rounded-xl border border-white/[0.08] bg-surface-container-low/80 p-4 backdrop-blur sm:p-5">
              <div className="flex items-center justify-between">
                <span className="flex size-9 items-center justify-center rounded-lg border border-primary-container/40 bg-primary-container/15 text-primary">
                  <Icon name={step.icon} className="size-5" />
                </span>
                <span className="font-mono text-mono-label text-outline">0{i + 1}</span>
              </div>
              <h2 className="mt-3 text-title-sm font-semibold">{step.title}</h2>
              <p className="mt-1 text-body text-on-surface-variant">{step.body}</p>
            </li>
          ))}
        </ol>
      </main>

      <AppFooter />
    </div>
  );
}
