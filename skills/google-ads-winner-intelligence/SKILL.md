---
name: google-ads-winner-intelligence
description: Evaluates, ranks, and deconstructs top-performing Google Ads across Google Search (Responsive Search Ads / RSAs), YouTube Video Ads, Google Shopping, and Google Display / Performance Max. Combines Live Google SERP Auction Discovery, Multi-Advertiser Google Ads Transparency Center longevity tracking, and Deep Winner Detail Enrichment across all AI models (including Gemini 2.5 Flash-Lite, Gemini 3.8 Flash Low, Claude Haiku 4.5, and gpt-6-luna).
---

# Google Ads Winner Intelligence Skill

This skill powers **AdRadarHQ's 3-Engine Google Ads Winner System**, designed to find, score, and deconstruct the highest-performing paid search, shopping, video, and display ads on Google.

## 1. 3-Engine Google Ads Ingestion Architecture

Google's Ad Transparency Center alone only searches by advertiser name or website domain and omits ad copy on list results. To capture the **true best-performing Google Ads** for any keyword, brand, or category, AdRadarHQ combines three complementary engines using `SEARCHAPI_API_KEY`:

1. **Engine 1 — Live Google SERP Sponsored Search & Shopping Auction (`engine: "google"`):**
   - Queries live Google Search in the target country (`AU`, `NZ`, `US`, `GB`, `CA`) to capture active **Sponsored Responsive Search Ads (`ads`)** and **Sponsored Google Shopping Ads (`shopping_ads`)** bidding on the exact keyword right now.
   - Extracts real-time auction signals: SERP position (`#1–#4`), full RSA headlines, description copy, sitelink extensions, callout extensions, merchant ratings/pricing, and destination URLs.
   - Automatically extracts the domains of live auction bidders (`discoveredDomains`) to feed into Engine 2.
2. **Engine 2 — Multi-Advertiser Google Ads Transparency Center (`engine: "google_ads_transparency_center"`):**
   - Queries up to **3 authoritative advertiser targets or domains in parallel** (combining live SERP bidding domains from Engine 1, verified category domains from `src/lib/radar-relevance.ts`, and word-boundary-verified advertiser IDs from `google_ads_transparency_center_advertiser_search`).
   - Retrieves **YouTube Video Ads (`VIDEO`)**, **Performance Max / Display Banners (`IMAGE`)**, and **Search Creatives (`TEXT`)**, sorted by evergreen run duration (`total_days_shown`).
   - Tracks multi-creative and cross-format scaling (`duplicates` count per advertiser).
3. **Engine 3 — Deep Winner Detail Enrichment (`engine: "google_ads_transparency_center_ad_details"`):**
   - Automatically enriches top longevity winners with `long_headline`, `description`, `call_to_action`, `video_link`, and YouTube `video_id` thumbnails (`https://i.ytimg.com/vi/<video_id>/hqdefault.jpg`).
   - Synthesizes deterministic format classifications (`Google Search RSA · Top Auction Winner`, `YouTube Video Ad · Evergreen Winner`, `Google Shopping Sponsored Product`, `Google Display / PMax Creative`), headlines, and CTAs so no Google Ad card ever renders with blank fields.

---

## 2. 4-Pillar Google Ads Scoring Rubric (Deterministic Integer Math)

All scoring calculations in `src/lib/radar-matrix.ts` use `Math.round()` integers (`0–100`) for 100% deterministic behavior across all models:

### Pillar 1: Auction Position & Evergreen Longevity (`longevityScore`, 30% Weight)
- **Transparency Center Longevity (`activeDaysCount`):**
  - `activeDaysCount >= 60`: **Extended Evergreen Winner** (sustained profitable ROAS across 60+ days).
  - `activeDaysCount >= 28`: **Proven Winner** (survived initial Google Ads learning & optimization window).
- **Live SERP Auction Dominance:**
  - Ads actively winning top-of-page Sponsored Search slots (`SERP Position #1–#4`) or prime Google Shopping carousel placements demonstrate active commercial bid conviction.
- **Cross-Format & Multi-Creative Scaling (`duplicates`):**
  - Advertisers running multiple concurrent variations across Search, YouTube, and Display receive a scaling multiplier (`duplicates * 6.0`).

### Pillar 2: High-Intent Search Copy & Hook Strength (`hookStrengthScore`, 30% Weight)
- Evaluates direct-response search & video persuasion markers:
  - **Value & Offer Anchors:** `% Off`, `Free Quote`, `Free Shipping`, `From $...`, `Compare`, `Official Site`, `Guaranteed`, `No Obligation`, `Instant Estimate`.
  - **Social Proof & Authority Signals:** Star ratings (`4.8★`, `5-Star`), review counts, `Trusted by`, `#1 Rated`, `Award-Winning`, `Australian Owned`.
  - **RSA Extension Depth:** Presence of sitelink extensions, structured callouts, or price qualifiers.

### Pillar 3: Brand & Search Intent Resonance (`brandFitScore`, 40% Weight)
- Computes token & phrase overlap between the Google Ad's headline/copy/sitelinks and the active `BrandProfile` (`productServiceDescription`, `targetAudienceAvatar`, `corePainPoints`, `uniqueMechanismOrOffer`).
- Populates `highlightKeywords` (up to 10 matched commercial keywords) for UI highlighting.

### Pillar 4: Composite Matrix Score (`compositeScore`)
$$\text{compositeScore} = \text{round}(0.40 \times \text{brandFitScore} + 0.30 \times \text{hookStrengthScore} + 0.30 \times \text{longevityScore})$$

---

## 3. Universal Low-Cost AI Model Compatibility Rules

To guarantee identical, zero-failure execution across **`Gemini 2.5 Flash-Lite`**, **`Gemini 3.8 Flash Low`**, **`Claude Haiku 4.5`**, and **`gpt-6-luna`**:
1. **Flat Strict JSON Schemas:** Enforce flat keys (`hookAnalysis`, `pacingStructure`, `persuasionFramework`, `whyItWorks`, `variations`) validated via Zod `.strict()`.
2. **Format-Aware Deconstruction:**
   - For **Google Search RSAs (`TEXT`)**: Deconstruct the Headline 1 keyword mirror, Headline 2 value/offer hook, Description proof stack, and Sitelink extension funnel while also generating multi-channel video/image creative extensions for the brand.
   - For **YouTube Video Ads (`VIDEO`)**: Deconstruct the **0–5s pre-skip bumper hook** (before the "Skip Ad" button appears at 5 seconds), the **5–15s mechanism demonstration**, and the **end-screen companion banner CTA**.
   - For **Google Display / Shopping (`IMAGE`)**: Deconstruct the visual contrast, offer badge, price anchor, and headline hierarchy.
3. **Deterministic Fallback:** If an upstream LLM times out or returns malformed JSON, `buildFallbackRemix` in `src/lib/gemini.ts` deterministically constructs a complete, schema-valid 3-variation blueprint.

