---
name: semantic-ad-search-relevance
description: 4-stage semantic ad search resolution, word-boundary collision guard, vertical taxonomy mapping, and zero-downtime fallback skill across Google, TikTok, and Meta ad libraries. Compatible with Gemini 2.5 Flash-Lite, Claude Haiku 4.5, and gpt-6-luna.
---

# Semantic Ad Search & Relevance Engine (`semantic-ad-search-relevance`)

## 1. Overview
Upstream ad transparency endpoints—especially **Google Ads Transparency Center** (`google_ads_transparency_center_advertiser_search`) and **TikTok Commercial Content Library** (`tiktok_ads_library`)—use naive prefix or advertiser-name substring matching rather than semantic product classification.

Without a semantic resolution and collision-guard layer:
- Searching `"car"` on Google matches advertisers named `"Cara HO"` or `"Skin Care"` because `"Cara"` and `"Care"` share the 3-letter prefix `"car"`, returning skincare ads instead of automotive ads.
- Short or generic category queries (`"car"`, `"horse"`, `"pet"`, `"running shoes"`, `"dog bed"`) fail to resolve to authoritative vertical domains when no single advertiser's corporate name equals the generic noun.

This skill defines the **4-Stage Semantic Ad Search & Relevance Algorithm** implemented in [`src/lib/radar-relevance.ts`](../../src/lib/radar-relevance.ts) and invoked by [`src/lib/radar.ts`](../../src/lib/radar.ts).

---

## 2. Universal AI Model Compatibility
All schemas, taxonomy lookups, and scoring formulas in this skill are engineered to run deterministically across **all AI models**, including low-cost, high-speed models:
- **Gemini 2.5 Flash-Lite** (`gemini-2.5-flash-lite`)
- **Claude Haiku 4.5** (`claude-haiku-4-5`)
- **gpt-6-luna** (`gpt-6-luna`)
- **Gemini 2.5 Pro / Claude Sonnet / GPT-5**

### Strict Contract Rules
1. **Integer Scores Only:** Every relevance score $R \in [0, 100]$ is wrapped in `Math.round()` and validated as an integer.
2. **Strict Schemas (`additionalProperties: false`):** All inputs and outputs conform to [`src/lib/contracts.ts`](../../src/lib/contracts.ts) (`NormalizedAdSchema`, `RadarCacheDocSchema`).
3. **Zero Unescaped Prefix Matching:** Short queries ($\le 4$ characters) MUST use word-boundary token checks or canonical domain/taxonomy resolution—never raw prefix substring matching.

---

## 3. The 4-Stage Relevance Pipeline

### Stage 1 — Intent-to-Domain & Vertical Taxonomy Resolver
Given a raw search query $Q$, normalize $Q_{\text{norm}} = \text{lowercase}(\text{trim}(Q))$ and classify into:
- **Exact Domain Query:** Matches `^(?:[a-z0-9-]+\.)+[a-z]{2,}$` (e.g. `carsales.com.au`, `nike.com`).
- **Known Vertical / Product Category:** Matches a curated taxonomy entry (Automotive, Skincare & Beauty, Fitness & Supplements, Pets & Equestrian, Footwear & Apparel, Consumer Tech, Home & Sleep, Oral Care, Coffee & Beverages, Accessories & Gear).
  - Resolves to authoritative `googleDomains` (e.g. `"car"` $\rightarrow$ `carsales.com.au`, `drive.com.au`, `toyota.com.au`, `mazda.com.au`, `kia.com`, `hyundai.com`, `ford.com`).
  - Resolves to unambiguous `googleAdvertiserQueries` (e.g. `"Carsales"`, `"Toyota"`, `"Mazda"` instead of ambiguous `"car"`).
- **General Brand / Keyword Query:** Uses word-boundary token matching with prefix-collision protection.

### Stage 2 — Word-Boundary & Prefix Collision Guard
When evaluating candidate advertisers or domains from `google_ads_transparency_center_advertiser_search`:
1. **Negative Collision Blocklist:** Reject any advertiser whose name or domain contains a known collision stem for the active query without any positive vertical keyword.
   - Example (`"car"` / Automotive): Block `cara`, `care`, `caring`, `skincare`, `cerave`, `carpe`, `carpet`, `cardigan`, `carbon`, `cartoon`, `cardio`, `carol`, `carmen`, `cartier`.
2. **Word-Boundary Stem Check:** For short queries ($\le 4$ characters), require the token to appear as a standalone word `\bcar(?:s|sales|ify|vana|max|guide|loan|insure|dealer)?\b` or match a positive category token (`auto`, `motor`, `vehicle`, `drive`, `suv`, `sedan`, `ute`, `truck`, `hybrid`, `ev`).

### Stage 3 — Post-Fetch Semantic Ad Gate
Every normalized `Draft` ad across **Google**, **TikTok**, and **Meta** is scored against the resolved intent before caching:
$$R_{\text{semantic}} = \text{clamp}_{0..100}\Big(50 + 20 \cdot N_{\text{positive}} - 60 \cdot N_{\text{negative}}\Big)$$
- Any ad with $N_{\text{negative}} > 0$ and $N_{\text{positive}} = 0$ (e.g., an ad mentioning `serum`, `moisturizer`, `skin`, `cleanser`, or `Cara HO` during a `"car"` search) yields $R_{\text{semantic}} < 0$ and is **purged** prior to ranking and Firestore caching.

### Stage 4 — Single-Call Credit Saver & Zero-Downtime Fallback
1. **Credit Conservation:** For category queries mapped to authoritative domains, `searchGoogle` queries `google_ads_transparency_center` directly by `domain` (1 credit) instead of burning extra credits on ambiguous advertiser lookups and detail-page loops.
2. **Quota & Outage Recovery:** If SearchApi returns `HTTP 429` (monthly quota exhausted) or a transient upstream error, the engine first queries existing Firestore `normalized_ads` / `radar_cache` documents filtered through Stage 3, and falls back to deterministic, category-verified benchmark ad records so the user never experiences a `502` failure or off-topic results.
