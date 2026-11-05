---
name: meta-ads-winner-intelligence
description: Evaluates, ranks, and deconstructs top-performing Meta Ads across Facebook, Instagram, Reels, Stories, Carousels, and Advantage+ Shopping Campaigns (ASC). Combines Dual-Pass SearchApi.io Meta Ad Library ingestion (exact-phrase + category authority pass), Ad Set Duplication & Omnichannel Scaling telemetry, and multi-card Carousel/DCO extraction across all AI models (including Gemini 2.5 Flash-Lite, Gemini 3.8 Flash Low, Claude Haiku 4.5, and gpt-6-luna).
---

# Meta Ads Winner Intelligence Skill

This skill powers **AdRadarHQ's Dual-Engine Meta Ads Winner System**, designed to find, score, and deconstruct the highest-performing paid social ads across **Facebook, Instagram, Reels, Messenger, and Advantage+ Shopping**.

## 1. Dual-Engine Meta Ads Ingestion Architecture

Standard single-pass Meta Ad Library queries suffer from recency bias (returning 1–3 day test ads) and discard key scaling telemetry (`collation_count`, `publisher_platform`, `page_like_count`, multi-card `cards[]`, and `link_description`). AdRadarHQ's Meta Winner System resolves this via two coordinated engines in `src/lib/meta-topads.ts` and `src/lib/radar.ts`:

1. **Engine 1 — Dual-Pass SearchApi.io `meta_ad_library` + Optional Apify Top-Ads Connector:**
   - **Pass A (Exact Commercial Phrase Pass):** Queries `search_type: "keyword_exact_phrase"` (`"<query>"`) across up to 3 pages so multi-word queries (`"running shoes"`, `"teeth whitening"`, `"protein powder"`) lock onto exact commercial ads rather than partial word matches.
   - **Pass B (Broad & Category Authority Fallback Pass):** Executes when Pass A returns fewer than 40 ads, ensuring full coverage across authoritative vertical advertisers.
   - **Optional External Scraper (`APIFY_API_TOKEN` / `META_TOPADS_API_URL`):** Runs in parallel when configured to ingest curated high-spend Meta Ad Library winners.
2. **Engine 2 — Deep Snapshot, Advantage+ Omnichannel & Multi-Card DCO Extraction:**
   - **Ad Set Duplication & Same-Page Scaling (`duplicates`):** Combines `collation_count` (identical creative running across multiple ad sets/audiences) with same-advertiser active creative counts (`page_id` frequency) to surface brands aggressively scaling ad spend.
   - **Omnichannel Publisher Platform Telemetry (`publisher_platform`):** Detects whether an ad is running across all 4 placements (`Facebook`, `Instagram`, `Messenger`, `Audience Network` = **Advantage+ Omnichannel Scaling**).
   - **Page Authority & Reach Signals:** Extracts `snapshot.page_like_count`, `aaa_info.eu_total_reach`, and impression estimates to compute verified `totalViews` and `totalLikes`.
   - **Multi-Card Carousel & Dynamic Creative (DCO) Synthesis:** Aggregates unique card titles, bodies, and `link_description` offers across `snapshot.cards[0..N]` so multi-product carousels and DCO variations retain their complete offer stack.
   - **High-Signal Headline & CTA Synthesis (`buildMetaHeadline`, `inferMetaCta`):** Eliminates blank headlines on Instagram Reels/Stories video ads and dynamic catalog templates (`{{product.name}}`).

---

## 2. 4-Pillar Meta Ads Scoring Rubric (Deterministic Integer Math)

All scoring calculations in `src/lib/radar-matrix.ts` use `Math.round()` integers (`0–100`) for 100% deterministic behavior across all AI models:

### Pillar 1: Ad Set Duplication & Evergreen Longevity (`longevityScore`, 30% Weight)
- **Evergreen Run Duration (`activeDaysCount`):**
  - `activeDaysCount >= 60`: **Extended Evergreen Winner** (survived creative fatigue for 2+ months).
  - `activeDaysCount >= 28`: **Proven Winner** (profitable beyond Meta's 7-day attribution & learning phase).
- **Ad Set Collation & Scaling (`duplicates`):**
  - `collation_count >= 5`: Heavy horizontal/vertical ad-set scaling across lookalike and broad Advantage+ audiences.
  - Each duplicate adds `+6` to raw longevity before log-scaled view velocity is blended.

### Pillar 2: Direct-Response Hook & Carousel/Reels Structure (`hookStrengthScore`, 30% Weight)
- Evaluates Meta-specific conversion triggers:
  - **3-Second Thumbstop & Pattern Interrupt:** Problem callouts (`"Tired of..."`, `"Stop..."`), POV/UGC hooks (`"I tried..."`, `"My honest review"`), and statistical proof (`"95%"`, `"Rated 4.9★"`).
  - **Value Stack & Risk Reversal:** Discount codes, bundle savings, free shipping thresholds, and money-back guarantees (`link_description` + `caption`).
  - **Format Classification:** `Instagram Reels / UGC Video`, `Advantage+ Carousel Winner`, `Direct-Response Offer Ad`.

### Pillar 3: Brand & Audience Resonance (`brandFitScore`, 40% Weight)
- Matches extracted ad tokens and multi-word phrases against the active `BrandProfile` (`productServiceDescription`, `targetAudienceAvatar`, `corePainPoints`, `uniqueMechanismOrOffer`) and populates `highlightKeywords`.

### Pillar 4: Composite Matrix Score (`compositeScore`)
$$\text{compositeScore} = \text{round}(0.40 \times \text{brandFitScore} + 0.30 \times \text{hookStrengthScore} + 0.30 \times \text{longevityScore})$$

---

## 3. Universal Low-Cost AI Model Compatibility Rules

To guarantee zero-failure execution across **`Gemini 2.5 Flash-Lite`**, **`Gemini 3.8 Flash Low`**, **`Claude Haiku 4.5`**, and **`gpt-6-luna`**:
1. **Flat Strict JSON Schemas:** All AI Remix outputs conform strictly to `AdRemixBlueprintSchema` (`src/lib/contracts.ts`).
2. **Meta-Specific Remix Deconstruction:**
   - Deconstructs the **0–3s Facebook/Instagram Feed & Reels visual thumbstop**, **Primary Text above-the-fold hook** (first 125 characters before "...See More"), **Headline below-creative offer anchor**, and **CTA button alignment**.
3. **Deterministic Fallback:** Falls back automatically to `buildFallbackRemix` in `src/lib/gemini.ts` if an upstream model times out.

