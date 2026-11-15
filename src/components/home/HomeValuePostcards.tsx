"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { btnSecondary } from "@/components/ui/styles";
import { HomeValuePostcardSchema, type HomeValuePostcard } from "@/lib/contracts";

const RAW_VALUE_POSTCARDS: HomeValuePostcard[] = [
  {
    id: "beat-agency-retainers",
    numberLabel: "04",
    category: "Why AdRadarHQ",
    icon: "shield",
    title: "Skip $3,000–$10,000/mo Agency Retainers",
    teaser:
      "Get senior-level competitor ad research and test-ready creative scripts in minutes without lock-in contracts.",
    description:
      "Traditional agencies charge steep monthly retainers before you spend a dollar on media, lock you into 3–6 month minimums, and take weeks to deliver initial drafts. With AdRadarHQ you start from 1 token (AUD $1 default), move from market research to three campaign variations in minutes, and keep every script forever.",
    bullets: [
      "Zero monthly retainers, zero lock-in terms, and zero cancellation penalties.",
      "Move from competitor discovery to shot-by-shot scripts in under a minute.",
      "You own every brief, creative breakdown, and exported production file.",
    ],
    valueTakeaway: "Zero retainers • Zero lock-in contracts • Instant turnaround",
  },
  {
    id: "evidence-over-gurus",
    numberLabel: "05",
    category: "Evidence vs. Opinion",
    icon: "flame",
    title: "Live Market Proof Over Outdated \"Guru\" Courses",
    teaser:
      "See what real advertisers are scaling right now instead of buying static $997–$2,997 swipe files.",
    description:
      "Ad platform algorithms change every week, making static PDF swipe files and generic coaching courses outdated quickly. AdRadarHQ queries live official ad repositories in your target market and explains the hook, pacing, and persuasion framework behind ads running today.",
    bullets: [
      "Powered by live official Meta, TikTok, and Google ad libraries — never canned templates.",
      "Teaches you why winning ads convert while building creatives specifically for your brand.",
      "Grounded evidence so you test informed angles instead of paying for generic opinions.",
    ],
    valueTakeaway: "Live official libraries • Learn by doing • Built around your offer",
  },
  {
    id: "proven-longevity-filter",
    numberLabel: "06",
    category: "Profit Signal",
    icon: "clock",
    title: "28+ & 60+ Day Proven Winner Filters",
    teaser:
      "Advertisers stop paying for ads that lose money — isolate campaigns running 4 to 8+ weeks.",
    description:
      "Longevity is the clearest public market signal of ad performance. Filter out short-lived losing tests with one switch: target Proven Winners active 28+ days, evergreen Extended Winners running 60+ days, or high-confidence Top Winners scoring 90% and above.",
    bullets: [
      "Proven (28+ days) surfaces creatives that survived four weeks of real ad spend.",
      "Extended (60+ days) isolates evergreen workhorse campaigns running two months or longer.",
      "Top Winners (90%+) combines brand alignment, hook strength, and campaign longevity.",
    ],
    valueTakeaway: "Model market-tested longevity instead of guessing from scratch",
  },
  {
    id: "multi-platform-radar",
    numberLabel: "07",
    category: "Core Feature",
    icon: "radar",
    title: "Meta, TikTok, Google & YouTube Ad Radar",
    teaser:
      "Search Facebook, Instagram, TikTok, Google Search, Shopping, Display, and YouTube in one place.",
    description:
      "Search by competitor brand name, product keyword, market niche, or exact hook phrase across the major ad networks with strict platform isolation so results stay clean. Choose target country and media format, with 24-hour instant caching on repeat searches.",
    bullets: [
      "Strict platform isolation across Meta (Facebook & Instagram), TikTok, and Google/YouTube.",
      "Filter by country market and video or image creative format with one click.",
      "Repeat lookups within 24 hours return immediately from high-speed cache.",
    ],
    valueTakeaway: "Four major ad ecosystems • Country & format filters • 24h speed cache",
  },
  {
    id: "winner-matrix-scoring",
    numberLabel: "08",
    category: "Smart Ranking",
    icon: "sliders",
    title: "0–100 Winner Matrix Scoring Engine",
    teaser:
      "Every ad is ranked on Brand Fit (40%), Hook Strength (30%), and Longevity & Scale (30%).",
    description:
      "Activate one of your Brand Profiles before running a search so every live competitor ad is scored automatically for relevance to your business. Each card explains why the creative resonates, highlights matched keywords, and surfaces CTA, copy, landing page, and days active.",
    bullets: [
      "40% Brand Fit checks alignment against your product, target avatar, and offer.",
      "30% Hook Strength & 30% Longevity & Scale weigh opening pattern interrupts and active run time.",
      "Every ad card displays copy, headline, call to action, destination URL, and engagement estimates.",
    ],
    valueTakeaway: "Personalized 0–100 composite score on every competitor ad card",
  },
  {
    id: "gemini-remix-studio",
    numberLabel: "09",
    category: "AI Creative Studio",
    icon: "sparkles",
    title: "AI Deconstruction & 3-Angle Creative Remix",
    teaser:
      "Break down the 0–3s hook and persuasion framework, then generate 3 original scripts & storyboards.",
    description:
      "Google Gemini inspects a winning ad's 0–3 second hook, beat-by-beat pacing, and persuasion mechanics (PAS, AIDA, UGC story, social proof), then writes three distinct ready-to-test variations tailored to your Brand Profile with full video storyboards and static image prompts.",
    bullets: [
      "Three ready-to-test angles: Direct Response, Storytelling/Social Proof, and Contrarian Pattern Interrupt.",
      "Includes 4–6 beat video storyboards (visual shot, voiceover, on-screen text) plus AI image prompts.",
      "Strict originality guardrails: never copies competitor trademarks or invents unverified claims.",
    ],
    valueTakeaway: "Full teardown + 3 ready-to-test variations in one click",
  },
  {
    id: "brand-vault-library",
    numberLabel: "10",
    category: "Brand Profiles",
    icon: "layers",
    title: "Multi-Brand Vault & Community Library",
    teaser:
      "Store up to 25 detailed brand profiles for free, or clone ready-made setups from the Community Library.",
    description:
      "Build up to 25 brand identities under one account — ideal for entrepreneurs testing new products or agencies managing multiple client brands. Define your customer avatar, pain points, unique mechanism, tone of voice, and landing URLs, or clone shared community profiles in seconds.",
    bullets: [
      "Creating, editing, switching, and duplicating your own Brand Profiles is always free.",
      "Supports Direct Response, Authoritative, UGC Casual, and Urgent brand tones.",
      "Browse and search the Community Brand Library by keyword or tone and clone for 1 token (default).",
    ],
    valueTakeaway: "Up to 25 brand profiles • Free to create, edit & duplicate",
  },
  {
    id: "local-human-ad-agents",
    numberLabel: "11",
    category: "Human Experts",
    icon: "mapPin",
    title: "Customize Strategy with Local Ad Agents",
    teaser:
      "Want human expertise? Geolocation matching routes your brief to a nearby specialist for a fixed fee.",
    description:
      "When you want a seasoned strategist to refine your positioning and hooks, send a Customize brief instead of hiring a retainer agency. Proximity matching locates the nearest active independent Ad Agent — or lets you pick your preferred specialist — for a transparent fixed token fee.",
    bullets: [
      "Haversine geolocation matching connects you with active specialists near your suburb or country.",
      "Includes positioning refinement, pain-point hooks, 3 custom ad blueprints, and rollout steps.",
      "Ad Agents can also recommend vetted local videographers, graphic designers, and editors.",
    ],
    valueTakeaway: "Human specialists on demand • Fixed fee, never a monthly retainer",
  },
  {
    id: "exports-and-workflows",
    numberLabel: "12",
    category: "Production Ready",
    icon: "fileText",
    title: "1-Click Scripts, CSV Spreadsheets & TXT Dossiers",
    teaser:
      "Export everything cleanly for your video editors, media buyers, UGC creators, or client decks.",
    description:
      "Turn research straight into production without reformatting in docs. Copy full scripts in one click, export AI Remix variations to structured CSV files for editors and creators, and download clean `.txt` packs for SearchMix results, ad teardowns, and Brand Vault dossiers.",
    bullets: [
      "One-click script copy and regenerate buttons inside the AI Creative Remix Studio.",
      "Structured CSV spreadsheet exports formatted for video editors and UGC talent.",
      "Downloadable `.txt` dossiers for brand positioning briefs, search results, and deconstructions.",
    ],
    valueTakeaway: "Zero vendor lock-in • Instant .csv & .txt production handoffs",
  },
  {
    id: "pay-as-you-go-value",
    numberLabel: "13",
    category: "Best Online Value",
    icon: "wallet",
    title: "Pay-As-You-Go Tokens That Never Expire",
    teaser:
      "Transparent integer token pricing from AUD $1 — pay only when you search, remix, or order strategy.",
    description:
      "Spend only when you launch an action: every button shows its live integer token cost upfront (default 1 token = AUD $1). Top up securely via Stripe Checkout with live AUD/USD estimates via European Central Bank rates, automatic Australian GST handling, and zero-balance debt protection.",
    bullets: [
      "Tokens never expire — keep your balance for weeks, months, or years until you need it.",
      "Hard non-negative protection (balance cannot drop below 0) with no surprise subscription rebills.",
      "Full wallet ledger records every purchase, search, remix, clone, customize order, and refund.",
    ],
    valueTakeaway: "Non-expiring tokens • Hard zero-debt guard • Upfront pricing",
  },
  {
    id: "reliability-recredit",
    numberLabel: "14",
    category: "Fairness & Safety",
    icon: "refresh",
    title: "No Double-Charging & Automatic Failure Re-Credits",
    teaser:
      "Protected by idempotent billing keys and automatic token refunds if an upstream request fails.",
    description:
      "Every paid operation sends a deterministic idempotency key so unstable mobile connections or automatic retries never deduct tokens twice. If an upstream ad library or AI generation experiences a technical error, exact integer tokens are re-credited automatically right away.",
    bullets: [
      "Deterministic idempotency prevents duplicate charges across network dropouts or browser retries.",
      "Automatic technical-failure re-credits restore your tokens straight to your live wallet ledger.",
      "All messages and compliance ledgers are stored plain-text safely with audit trails.",
    ],
    valueTakeaway: "100% auditable wallet ledger • Automatic technical-failure re-credits",
  },
  {
    id: "pwa-global-support",
    numberLabel: "15",
    category: "Anywhere Access",
    icon: "smartphone",
    title: "Installable Web App + 30+ Language Help Center",
    teaser:
      "Run fullscreen on Chrome Desktop, Android, iPhone & iPad with multilingual FAQs across 30+ languages.",
    description:
      "Install AdRadarHQ as a standalone app directly from your browser on Windows, macOS, Android, iPhone, or iPad — no app-store middlemen required. Get built-in multilingual FAQs across 30+ ASEAN and world languages plus a live local suburb, weather, clock, and currency bar.",
    bullets: [
      "Desktop Chrome, Android, and iPhone/iPad PWA installer built right into the navigation bar.",
      "Searchable FAQ and RAG help center supporting English, ASEAN, East Asian, and European languages.",
      "Built in Australia by AI Foundation Australia under Australian Privacy Principles and Consumer Law.",
    ],
    valueTakeaway: "Desktop, Android & iOS PWA • 30+ languages • Built in Australia",
  },
];

const VALUE_POSTCARDS: HomeValuePostcard[] = RAW_VALUE_POSTCARDS.map((card) =>
  HomeValuePostcardSchema.parse(card),
);

export function HomeValuePostcards() {
  // Always start with every postcard collapsed across desktop, laptop, Android, and iPhone.
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({});

  const expandedCount = VALUE_POSTCARDS.reduce(
    (count, card) => (openMap[card.id] ? count + 1 : count),
    0,
  );
  const allExpanded = expandedCount === VALUE_POSTCARDS.length;

  function handleCardToggle(id: string, isOpen: boolean) {
    setOpenMap((prev) => (Boolean(prev[id]) === isOpen ? prev : { ...prev, [id]: isOpen }));
  }

  function handleToggleAll() {
    if (allExpanded) {
      setOpenMap({});
      return;
    }
    const next: Record<string, boolean> = {};
    for (const card of VALUE_POSTCARDS) {
      next[card.id] = true;
    }
    setOpenMap(next);
  }

  return (
    <section
      aria-labelledby="home-value-postcards-heading"
      data-agent-id="home-value-postcards-section"
      data-testid="home-value-postcards-section"
      className="space-y-4 pt-2"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <p className="font-mono text-mono-label tracking-widest text-secondary uppercase">
            Platform Overview &amp; Online Value
          </p>
          <h2
            id="home-value-postcards-heading"
            className="text-headline-md font-semibold tracking-tight text-on-surface"
          >
            Why marketers &amp; businesses choose AdRadarHQ
          </h2>
          <p className="text-body text-on-surface-variant">
            Click any collapsed postcard below to explore features, workflows, and transparent pay-as-you-go value.
          </p>
        </div>

        <button
          type="button"
          onClick={handleToggleAll}
          aria-expanded={allExpanded}
          aria-label={allExpanded ? "Collapse all feature postcards" : "Expand all feature postcards"}
          data-agent-id="home-postcards-toggle-all-btn"
          data-testid="home-postcards-toggle-all-btn"
          className={`${btnSecondary} w-full shrink-0 sm:w-auto`}
        >
          <Icon name="chevronsUpDown" className="size-4 text-primary" />
          <span>{allExpanded ? "Collapse all (12)" : "Expand all (12)"}</span>
        </button>
      </div>

      <div
        data-agent-id="home-value-postcards-grid"
        data-testid="home-value-postcards-grid"
        className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3"
      >
        {VALUE_POSTCARDS.map((card) => {
          const isOpen = Boolean(openMap[card.id]);
          return (
            <details
              key={card.id}
              open={isOpen}
              onToggle={(event) => handleCardToggle(card.id, event.currentTarget.open)}
              data-agent-id={`home-postcard-${card.id}`}
              data-testid={`home-postcard-${card.id}`}
              className="postcard-disclosure group self-start rounded-xl border border-white/[0.08] bg-surface-container-low/80 backdrop-blur transition-colors hover:border-white/[0.16] open:border-primary-container/40 open:bg-surface-container/90"
            >
              <summary
                data-agent-id={`home-postcard-trigger-${card.id}`}
                data-testid={`home-postcard-trigger-${card.id}`}
                className="flex cursor-pointer list-none flex-col gap-2.5 rounded-xl p-4 outline-none select-none focus-visible:ring-2 focus-visible:ring-primary-container sm:p-5 [&::-webkit-details-marker]:hidden"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-primary-container/40 bg-primary-container/15 text-primary">
                      <Icon name={card.icon} className="size-5" />
                    </span>
                    <span className="truncate rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 font-mono text-mono-label text-secondary uppercase">
                      {card.category}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span className="font-mono text-mono-label text-outline">{card.numberLabel}</span>
                    <span className="flex size-6 items-center justify-center rounded-md border border-white/[0.08] bg-white/[0.03] text-outline transition-colors group-hover:text-on-surface group-open:border-primary-container/40 group-open:bg-primary-container/15 group-open:text-primary">
                      <Icon
                        name="chevronDown"
                        className="size-3.5 transition-transform duration-200 motion-reduce:transition-none group-open:rotate-180"
                      />
                    </span>
                  </div>
                </div>

                <span className="block text-title-sm font-semibold text-on-surface sm:min-h-[2.75rem]">
                  {card.title}
                </span>

                <span className="block text-body text-on-surface-variant sm:min-h-[3.75rem]">
                  {card.teaser}
                </span>
              </summary>

              <div
                data-agent-id={`home-postcard-body-${card.id}`}
                data-testid={`home-postcard-body-${card.id}`}
                className="space-y-3 border-t border-white/[0.08] px-4 pt-3.5 pb-4 sm:px-5 sm:pb-5"
              >
                <p className="text-body leading-relaxed text-on-surface-variant">{card.description}</p>
                <ul className="space-y-1.5 text-compact text-on-surface">
                  {card.bullets.map((bullet) => (
                    <li key={bullet} className="flex items-start gap-2">
                      <Icon name="checkCircle" className="mt-0.5 size-3.5 shrink-0 text-winner-soft" />
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
                <p className="rounded-lg border border-primary-container/25 bg-primary-container/10 px-3 py-2 font-mono text-mono-label text-primary">
                  {card.valueTakeaway}
                </p>
              </div>
            </details>
          );
        })}
      </div>
    </section>
  );
}
