---
name: brand-matrix-radar-engine
description: AI Agent Matrix Engine for multi-dimensional brand alignment, hook viability, total views measurement, keyword highlighting, and longevity scoring across Meta, TikTok, and Google ad intelligence.
---

# Brand Matrix Radar Engine

## 1. Overview
The **Brand Matrix Radar Engine** evaluates competitor and industry ads scraped from social ad libraries (Meta Ad Library, TikTok Creative Center, Google Ads Transparency Center) against a specific, active **Brand Profile**.

It produces a deterministic, explainable, and authentic **Composite Matrix Score (0–100)** along with **Total Views Measurement** and **Highlight Keywords**, broken into three evaluated pillars:
1. **$S_{\text{brand}}$ — Brand Resonance (40% Weight):** Problem-solution overlap with target audience avatar, core pain points, and unique mechanism/offer, extracting top resonant `highlightKeywords`.
2. **$S_{\text{hook}}$ — Hook Viability (30% Weight):** Pattern interrupt strength, emotional framing, and adaptability to direct-response frameworks (PAS, AIDA, UGC Story).
3. **$S_{\text{scale}}$ — Proven Winner Scale & Total Views (30% Weight):** Active running days in market, creative iteration density, and total verified or velocity-estimated views.

## 2. Universal Model Compatibility
This skill and its schemas are strictly compatible with all AI models, including high-efficiency and low-cost models:
- Gemini 2.5 Flash-Lite
- Claude Haiku 4.5
- gpt-6-luna
- Gemini 2.5 Pro / Claude Sonnet / GPT-5

### Strict Rules:
- All scores MUST be integers `0–100` (`Math.round`, never decimals).
- `additionalProperties: false` (strict Zod parsing on all payloads).
- Explainable `resonanceReason` under 300 characters highlighting the specific hook or pain-point overlap.
- Emits `totalViews` (integer >= 0) and `highlightKeywords` (array of max 10 strings).

## 3. Mathematical Formulation
$$\text{Matrix Score} = \min\big(100, \max\big(0, \text{round}(0.40 \cdot S_{\text{brand}} + 0.30 \cdot S_{\text{hook}} + 0.30 \cdot S_{\text{scale}})\big)\big)$$

### A. Scale & Total Views Pillar ($S_{\text{scale}}$)
Combines active market longevity with view volume:
$$V_{\text{estimated}} = \text{round}(\text{activeDays} \times 1,250 + \text{winningScore} \times 350)$$
$$S_{\text{views}} = \min\big(100, \max\big(10, \text{round}(\log_{10}(\max(100, V_{\text{total}})) \times 16.6)\big)\big)$$
$$S_{\text{longevity}} = \min\big(100, \text{round}(\text{activeDays} \times 2.0 + \text{variants} \times 5.0)\big)$$
$$S_{\text{scale}} = \min\big(100, \max\big(10, \text{round}(0.60 \cdot S_{\text{longevity}} + 0.40 \cdot S_{\text{views}})\big)\big)$$

Where:
- $\text{activeDays} \ge 28$ denotes a proven evergreen winner.
- $\text{totalViews} \ge 100\text{K}$ indicates substantial audience penetration.
- $\text{variants} \ge 3$ indicates active media budget scaling.

### B. Brand Resonance & Highlight Keywords Pillar ($S_{\text{brand}}$)
Extracts semantic word tokens from:
- Ad Headline, Primary Copy, and CTA Text.
- Brand Profile: Avatar, Core Pain Points, Unique Mechanism, Product/Service Description.

Tokens with direct overlap form the `highlightKeywords` payload (e.g. `["back pain", "lumbar", "relief", "spine posture"]`), elevating $S_{\text{brand}}$ deterministically.

### C. Hook Viability Pillar ($S_{\text{hook}}$)
Assesses the first 3 seconds / headline for pattern interrupts:
- Direct problem-agitators ("Tired of X?", "Why most people fail at Y")
- Mechanism teasers ("The real reason behind...", "We tested 50...")
- Contrarian claims and curiosity gap anchors.

## 4. Fallback Protocol
If source ad copy is minimal (e.g. video-only ads without transcript or Google Search text ads with sparse descriptions), the engine falls back to:
- Heuristic category and advertiser matching.
- Velocity-derived baseline views based on active running days.
- Runtime longevity base weight guaranteeing stable, non-null evaluation.
