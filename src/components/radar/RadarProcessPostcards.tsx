"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { RadarProcessPostcardSchema, type RadarProcessPostcard } from "@/lib/contracts";

const RAW_RADAR_PROCESS_POSTCARDS: RadarProcessPostcard[] = [
  {
    id: "add-brands",
    stepNumber: "01",
    category: "Brand Setup",
    icon: "tag",
    title: "Add your brands to My Brands",
    shortExplanation:
      "Save your brand name, product offer, audience pain points, tone of voice, and landing URLs in My Brands before researching.",
    hoverExplanation:
      "Adding your brand profiles in My Brands gives the Winner Matrix and AI Creative Remix Studio the exact context of your offer, target customer, unique mechanism, and brand voice. Create up to 25 brand profiles for free and switch your active brand anytime in the top bar or Radar brand selector.",
  },
  {
    id: "choose-combination",
    stepNumber: "02",
    category: "Winner Filters",
    icon: "sliders",
    title: "Choose your combination",
    chips: ["Proven (28+d)", "Extended (60+d)", "Top Winners (90%+)"],
    shortExplanation:
      "Toggle a single longevity or score filter — or stack them together — to isolate battle-tested ads with sustained spend.",
    hoverExplanation:
      "Pick the exact filter combination for your research: Proven (28+d) strips out short split-tests to show ads running 4+ weeks, Extended (60+d) isolates evergreen campaigns active 2+ months, and Top Winners (90%+) surfaces elite creatives scoring 90+ across brand fit, hook strength, and scale.",
  },
  {
    id: "perform-search",
    stepNumber: "03",
    category: "Live Ad Libraries",
    icon: "search",
    title: "Perform your search",
    shortExplanation:
      "Select Meta, TikTok, or Google, pick your target country and media format, type a keyword, hook, or brand, and press Search.",
    hoverExplanation:
      "Radar queries live ad library data for your chosen platform, country market, and creative format (All formats, Video, or Image). Every returned ad is scored automatically against your active brand profile, and repeat searches with identical filters return from 24-hour cache.",
  },
  {
    id: "sort-results",
    stepNumber: "04",
    category: "Instant Ranking",
    icon: "chevronsUpDown",
    title: "Sort by",
    chips: ["Winning score", "Most likes", "Most views", "Longest ad online"],
    shortExplanation:
      "Re-order your search results instantly for free to spot top composite scores, audience engagement, reach, or run duration.",
    hoverExplanation:
      "Sorting is instant and costs zero extra tokens. Rank returned ads by Winning score (0–100 composite match for your active brand), Most likes, Most views, or Longest ad online (total active days running) to quickly compare which creative angles perform best.",
  },
  {
    id: "choose-ad-to-model",
    stepNumber: "05",
    category: "Select Winner",
    icon: "zap",
    title: "Choose which ad to remix your brand with the model ad",
    shortExplanation:
      "Browse the winning ad cards and click Model this ad on the creative whose hook and structure you want to adapt for your brand.",
    hoverExplanation:
      "Inspect each ad card's creative preview, ad copy, CTA, active day count, and score breakdown. Clicking Model this ad loads that reference creative alongside your active brand inside the Remix Studio workbench — without spending tokens until you press Generate remix.",
  },
  {
    id: "remix-the-ad",
    stepNumber: "06",
    category: "Remix Studio",
    icon: "sparkles",
    title: "Remix the ad",
    shortExplanation:
      "Press Generate remix in Remix Studio to deconstruct why the model ad works and synthesize original variations for your brand.",
    hoverExplanation:
      "AI Creative Remix Studio breaks down the model ad's 0–3 second hook, pacing, visual style, and persuasion framework, then adapts those proven conversion mechanics to your brand's product, customer pain points, and tone of voice — never copying competitor trademarks.",
  },
  {
    id: "receive-video-versions",
    stepNumber: "07",
    category: "Video Scripts",
    icon: "film",
    title: "Receive the three versions for your video ad",
    shortExplanation:
      "Get 3 distinct ready-to-shoot video ad variations (Variations A, B, and C) with headlines, copy, CTAs, and storyboards.",
    hoverExplanation:
      "Each remix delivers three distinct testing angles — such as Direct Response, Storytelling/Social Proof, and Pattern Interrupt — complete with editable headlines, primary copy, CTA buttons, and timestamped 4–6 scene video storyboards (visual action, spoken audio, and on-screen text) ready to copy or export to CSV.",
  },
  {
    id: "receive-image-prompts",
    stepNumber: "08",
    category: "Static Visuals",
    icon: "image",
    title: "Receive the image prompts for your remix",
    shortExplanation:
      "Alongside every variation's video storyboard, receive tailored AI image prompts built around your remixed angle and brand.",
    hoverExplanation:
      "Every generated variation includes a detailed image prompt describing composition, subject focus, lighting, and visual mood matched to that ad angle — ready to paste into your preferred AI image tool or share with a designer for static and carousel ad testing.",
  },
  {
    id: "build-remixed-ad-text",
    stepNumber: "09",
    category: "Social Ad Copy",
    icon: "fileText",
    title: "Option to build a remixed ad text for social media text posts",
    shortExplanation:
      "Click Build Remixed Ad Text to produce 4 platform-tailored social media ad text descriptions (maximum 150 words each).",
    hoverExplanation:
      "Located to the left of Regenerate variations in Remix Studio, Build Remixed Ad Text uses your active brand, the current model ad, and AI to craft 4 ready-to-post social ad descriptions tailored for TikTok, Facebook, Instagram, and Google Ads — strictly capped at 150 words per platform.",
  },
  {
    id: "regenerate-variations",
    stepNumber: "10",
    category: "Fresh Angles",
    icon: "refresh",
    title: "Option to regenerate variations again",
    shortExplanation:
      "Click Regenerate variations anytime to create 3 fresh creative angles, video scripts, storyboards, and image prompts.",
    hoverExplanation:
      "Want additional hooks to split-test? Press Regenerate variations inside Remix Studio to generate a brand-new set of three video variations, beat-by-beat storyboards, and image prompts from the same model ad — with every generated remix saved automatically to your Library.",
  },
];

const RADAR_PROCESS_POSTCARDS: RadarProcessPostcard[] = RAW_RADAR_PROCESS_POSTCARDS.map((card) =>
  RadarProcessPostcardSchema.parse(card),
);

export function RadarProcessPostcards() {
  const [activeId, setActiveId] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!activeId) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setActiveId(null);
      }
    }

    function handlePointerDown(e: PointerEvent) {
      if (gridRef.current && !gridRef.current.contains(e.target as Node)) {
        setActiveId(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("pointerdown", handlePointerDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [activeId]);

  return (
    <section
      aria-labelledby="radar-process-postcards-heading"
      data-agent-id="radar-process-postcards-section"
      data-testid="radar-process-postcards-section"
      className="w-full max-w-[1520px] space-y-3.5 text-left"
    >
      <div className="space-y-1 text-center">
        <p className="font-mono text-mono-label tracking-widest text-secondary uppercase">
          How Radar &amp; Remix Studio Work
        </p>
        <h2
          id="radar-process-postcards-heading"
          className="text-title-md font-semibold tracking-tight text-on-surface"
        >
          From brand setup to ready-to-launch creative
        </h2>
        <p className="text-compact text-on-surface-variant">
          10-step workflow from brand setup to ready-to-launch video, image, and social text ads — hover or tap any postcard for a deeper guide.
        </p>
      </div>

      <div
        ref={gridRef}
        data-agent-id="radar-process-postcards-grid"
        data-testid="radar-process-postcards-grid"
        className="grid grid-cols-1 items-stretch gap-2.5 sm:grid-cols-2 sm:gap-3.5 xl:grid-cols-5"
      >
        {RADAR_PROCESS_POSTCARDS.map((card) => {
          const isActive = activeId === card.id;
          const tooltipId = `radar-process-tooltip-${card.id}`;

          return (
            <div
              key={card.id}
              data-agent-id={`radar-process-postcard-${card.id}`}
              data-testid={`radar-process-postcard-${card.id}`}
              className={`group relative grid min-w-0 overflow-hidden rounded-xl border p-3.5 text-left backdrop-blur transition-all duration-150 sm:p-4 [&:has(:focus-visible)]:ring-2 [&:has(:focus-visible)]:ring-primary-container ${
                isActive
                  ? "border-primary-container/55 bg-surface-container-high/95 shadow-lg"
                  : "border-white/[0.08] bg-surface-container-low/80 hover:border-primary-container/55 hover:bg-surface-container-high/95 hover:shadow-lg"
              }`}
            >
              {/* Layer 1: Default short summary face */}
              <button
                type="button"
                onClick={() => setActiveId((prev) => (prev === card.id ? null : card.id))}
                aria-expanded={isActive}
                aria-describedby={tooltipId}
                data-agent-id={`radar-process-trigger-${card.id}`}
                data-testid={`radar-process-trigger-${card.id}`}
                className={`col-start-1 row-start-1 flex h-full w-full min-w-0 cursor-pointer flex-col justify-between gap-2.5 text-left transition-opacity duration-150 outline-none ${
                  isActive
                    ? "opacity-0"
                    : "opacity-100 group-hover:opacity-0 group-focus-within:opacity-0"
                }`}
              >
                <div className="min-w-0 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-primary-container/40 bg-primary-container/15 text-primary">
                        <Icon name={card.icon} className="size-4" />
                      </span>
                      <span className="truncate rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 font-mono text-mono-label text-secondary uppercase">
                        {card.category}
                      </span>
                    </div>
                    <span className="shrink-0 font-mono text-mono-label text-outline">
                      Step {card.stepNumber}
                    </span>
                  </div>

                  <h3 className="text-title-sm font-semibold break-words text-on-surface">
                    {card.title}
                  </h3>

                  {card.chips && card.chips.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {card.chips.map((chip) => (
                        <span
                          key={chip}
                          className="rounded-md border border-primary-container/30 bg-primary-container/10 px-2 py-0.5 font-mono text-[11px] font-medium text-primary"
                        >
                          {chip}
                        </span>
                      ))}
                    </div>
                  )}

                  <p className="text-compact leading-relaxed break-words text-on-surface-variant">
                    {card.shortExplanation}
                  </p>
                </div>

                <div className="flex items-center justify-between border-t border-white/[0.06] pt-2.5 font-mono text-[11px] text-outline">
                  <span className="transition-colors group-hover:text-primary group-focus-within:text-primary">
                    Hover for full guide
                  </span>
                  <Icon
                    name="helpCircle"
                    className="size-3.5 text-primary/70 transition-colors group-hover:text-primary"
                  />
                </div>
              </button>

              {/* Layer 2: In-box full guide revealed on hover, focus, or tap */}
              <div
                id={tooltipId}
                role="tooltip"
                data-agent-id={tooltipId}
                data-testid={tooltipId}
                className={`pointer-events-none col-start-1 row-start-1 flex h-full min-w-0 flex-col justify-between gap-2.5 text-left transition-opacity duration-150 ${
                  isActive
                    ? "visible opacity-100"
                    : "invisible opacity-0 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
                }`}
              >
                <div className="min-w-0 space-y-2">
                  <div className="flex items-center justify-between gap-2 border-b border-white/[0.08] pb-2 font-mono text-[11px] font-semibold text-primary">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <Icon name={card.icon} className="size-3.5 shrink-0" />
                      <span className="truncate">Step {card.stepNumber} · Full Guide</span>
                    </div>
                  </div>
                  <p className="text-compact font-semibold break-words text-on-surface">
                    {card.title}
                  </p>
                  <p className="text-[12px] leading-relaxed break-words text-on-surface-variant">
                    {card.hoverExplanation}
                  </p>
                </div>
                <div className="flex items-center justify-between border-t border-white/[0.06] pt-2 font-mono text-[11px] text-primary/80">
                  <span>{isActive ? "Tap card to return" : "Full workflow guide"}</span>
                  <Icon name="sparkles" className="size-3.5 text-primary" />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
