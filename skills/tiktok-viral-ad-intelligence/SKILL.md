---
name: tiktok-viral-ad-intelligence
description: Dual-Engine TikTok Top-Performing Ads & Viral Creative Intelligence Skill for AdRadarHQ. Combines TikTok Creative Center Top Ads (CTR percentiles, 2s/6s hook retention, conversion objectives, global AU/NZ/US/UK coverage) with the TikTok Commercial Content Library (SearchApi.io competitor & reach tracking), scores winners across 4 viral pillars (View Velocity, Auction CTR/Engagement, Creative Scaling, and UGC Hook Mechanics), and deconstructs 0-2s thumbstops and 2-6s retention bridges across all AI models (including Gemini 2.5 Flash-Lite, Claude Haiku 4.5, and gpt-6-luna).
---

# TikTok Viral Ad Intelligence Skill (`tiktok-viral-ad-intelligence`)

## 1. Purpose & Universal Model Compatibility
This skill governs how **AdRadarHQ** discovers, scores, ranks, and remixes the best-performing ads on TikTok. Every schema, scoring formula, and AI prompt is strictly deterministic (`Math.round` integers, `additionalProperties: false`) so that compact, low-cost, high-speed models (**Gemini 2.5 Flash-Lite**, **Claude Haiku 4.5**, **gpt-6-luna**) produce identical structural fidelity to frontier reasoning models.

---

## 2. Dual-Engine TikTok Data Ingestion Architecture

AdRadarHQ queries two complementary upstream TikTok intelligence engines in parallel via [`src/lib/tiktok-topads.ts`](../../src/lib/tiktok-topads.ts) and [`src/lib/radar.ts`](../../src/lib/radar.ts):

### Engine 1: TikTok Creative Center — Top Ads (`https://ads.tiktok.com/business/creativecenter/inspiration/topads/`)
- **Connector:** [`fetchTikTokCreativeCenterTopAds`](../../src/lib/tiktok-topads.ts) via Apify REST API (`APIFY_API_TOKEN` / `APIFY_TIKTOK_TOPADS_ACTOR_ID`) or custom Creative Center endpoint (`TIKTOK_CREATIVE_CENTER_API_URL`).
- **Regional Coverage:** Native global support including **Australia (`AU`)**, **New Zealand (`NZ`)**, **United States (`US`)**, **United Kingdom (`GB`)**, and **Canada (`CA`)** — eliminating the EU/UK-only limitation when configured.
- **Telemetry Extracted:**
  - Direct video stream (`https://*.tiktokcdn.com/...`) & high-resolution cover thumbnail.
  - **CTR Tier Badge:** `Top 1% CTR`, `Top 5% CTR`, `Top 10% CTR`, or `High-Performing Winner`.
  - **Campaign Objective:** `Conversions`, `Product Sales (TikTok Shop)`, `Lead Generation`, `Traffic`, `App Installs`, or `Video Views`.
  - **Hook Retention Signals:** 2-second thumbstop rate and 6-second view-through retention indicators.
  - **Engagement Proof:** Verified `totalLikes`, `totalViews` (or impression tier), comments, shares, and active duration.

### Engine 2: TikTok Commercial Content Library (`library.tiktok.com`)
- **Connector:** [`searchApi("tiktok_ads_library", ...)`](../../src/lib/searchapi.ts) in [`src/lib/radar.ts`](../../src/lib/radar.ts).
- **Multi-Pass Query Strategy:**
  1. **Pass 1 (Exact Commercial Index):** Quoted phrase `"${cleanQuery}"` sorted by `unique_users_seen_high_to_low` (up to 4 pages) to surface ads with the highest verified unique reach.
  2. **Pass 2 (Broad Niche Discovery):** Unquoted keyword query sorted by `unique_users_seen_high_to_low` when Pass 1 yields fewer than 30 ads.
  3. **Pass 3 (Semantic Category Expansion):** If a user searches a broad category intent (resolved by [`resolveSearchIntent`](../../src/lib/radar-relevance.ts)), supplements with high-converting category terms.
- **Collation & Deduplication:** Merges identical creative variations run by the same advertiser, incrementing `duplicates` (creative scaling signal) and preserving the widest `[firstSeenDate, lastSeenDate]` window and maximum `totalViews`.

---

## 3. 4-Pillar TikTok Viral Winner Matrix (`src/lib/radar-matrix.ts`)

Every TikTok candidate is scored deterministically (integers `0`–`100`) in [`calculateMatrixScore`](../../src/lib/radar-matrix.ts):

1. **Pillar 1 — Scale, Longevity & View Velocity (`longevityScore`, 0–100):**
   - **Longevity Base:** `activeDaysCount * 2.0 + duplicates * 6.0` (capped at 100).
   - **Total Views Volume:** Logarithmic scale from `100` to `10,000,000+` views.
   - **View Velocity Bonus (`viewsPerDay`):** `Math.round(totalViews / Math.max(1, activeDaysCount))`. Ads generating `5,000+` views/day receive up to `+15` velocity boost, surfacing breakout viral winners alongside long-running evergreen ads.
2. **Pillar 2 — TikTok Hook & UGC Format Viability (`hookStrengthScore`, 0–100):**
   - Evaluates 12 TikTok-native viral hook patterns:
     - *Pattern Interrupts:* `"stop scrolling"`, `"wait before you"`, `"don't buy"`, `"unpopular opinion"`
     - *UGC Social Proof:* `"tiktok made me buy"`, `"i tried"`, `"my honest review"`, `"obsessed with"`, `"holy grail"`
     - *Curiosity & Listicle:* `"3 reasons why"`, `"how i went from"`, `"the secret to"`, `"pov:"`, `"day in the life"`
     - *Offer & Risk Reversal:* `"free shipping"`, `"money back"`, `"limited stock"`, `"link in bio"`, `"shop now"`
   - Awards bonus points for verified Creative Center CTR tiers (`Top 1% CTR`, `Top 5% CTR`) and high like-to-view engagement velocity (`totalLikes / totalViews >= 3.5%`).
3. **Pillar 3 — Brand & Niche Resonance (`brandFitScore`, 0–100):**
   - Measures lexical and semantic overlap between the ad's caption/headline/CTA and the active `BrandProfile` (`productServiceDescription`, `corePainPoints`, `targetAudienceAvatar`, `uniqueMechanismOrOffer`).
4. **Pillar 4 — Composite Winner Score (`compositeScore`, 0–100):**
   - `Math.round(0.40 * brandFitScore + 0.30 * hookStrengthScore + 0.30 * longevityScore)`
   - Generates a human-readable `resonanceReason` explaining the exact velocity, reach, hook format, and longevity why the ad is winning.

---

## 4. TikTok-Native AI Remix Deconstruction Contract

When remixing a TikTok ad in [`generateRemix`](../../src/lib/gemini.ts), the model must adhere to the strict [`AdRemixBlueprintSchema`](../../src/lib/contracts.ts) (`additionalProperties: false`):

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["deconstruction", "variations"],
  "properties": {
    "deconstruction": {
      "type": "object",
      "additionalProperties": false,
      "required": ["hookAnalysis", "pacingStructure", "persuasionFramework", "whyItWorks"],
      "properties": {
        "hookAnalysis": {
          "type": "string",
          "description": "0-2s visual thumbstop + 2-6s spoken retention bridge and on-screen native text hook."
        },
        "pacingStructure": {
          "type": "array",
          "items": { "type": "string" },
          "description": "Beat-by-beat breakdown formatted '<start>-<end>s · <beat name> · <what happens>'."
        },
        "persuasionFramework": {
          "type": "string",
          "enum": ["PAS", "AIDA", "US_VS_THEM", "SOCIAL_PROOF_FIRST", "FOUNDER_STORY", "OTHER"]
        },
        "whyItWorks": {
          "type": "string",
          "description": "Psychological & algorithmic explanation (2-4 sentences) referencing UGC authenticity, retention velocity, and CTA friction removal."
        }
      }
    },
    "variations": {
      "type": "array",
      "description": "Exactly 3 distinct TikTok-ready creative variations tailored to the BrandProfile.",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["angleName", "headline", "primaryCopy", "ctaButton", "videoStoryboard", "imageGenerationPrompt"],
        "properties": {
          "angleName": { "type": "string" },
          "headline": { "type": "string" },
          "primaryCopy": { "type": "string" },
          "ctaButton": { "type": "string" },
          "videoStoryboard": {
            "type": "array",
            "items": {
              "type": "object",
              "additionalProperties": false,
              "required": ["timestamp", "visualAction", "spokenAudio", "onScreenText"],
              "properties": {
                "timestamp": { "type": "string" },
                "visualAction": { "type": "string" },
                "spokenAudio": { "type": "string" },
                "onScreenText": { "type": "string" }
              }
            }
          },
          "imageGenerationPrompt": { "type": "string" }
        }
      }
    }
  }
}
```
