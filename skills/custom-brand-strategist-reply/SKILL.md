---
name: custom-brand-strategist-reply
description: Automated 4-pillar brand & ad strategy reply generator for SuperAdmin and Main Admin staff working on customer Customize requests. Engineered to run deterministically across all AI models including Gemini 2.5 Flash-Lite, Claude Haiku 4.5, and gpt-6-luna while enforcing 7-year statutory plain-text compliance.
---

# Custom Brand Strategist Reply Skill (`custom-brand-strategist-reply`)

## 1. Overview
When a customer submits a **Customize** request (`45 tokens` default, customizable by SuperAdmin), their full brand brief—including all standard Brand Card fields plus the **"Extra Details & Descriptions to Think About"** box—is routed to **SuperAdmin** and **Main Admin** (`admin` role, immediately below `superadmin`).

This skill defines the automated AI workflow (`src/lib/customize-ai.ts`) that staff trigger inside the **User Messages** panel (`SuperAdminModal.tsx`) to design a bespoke, agency-grade **Customized Reply Work Message** for the customer.

---

## 2. Universal AI Model Compatibility
All prompts, schemas, and sanitization gates are engineered to run deterministically across **all AI models**, including low-cost, high-speed models:
- **Gemini 2.5 Flash-Lite** (`gemini-2.5-flash-lite` / `gemini-flash-latest`)
- **Claude Haiku 4.5** (`claude-haiku-4-5`)
- **gpt-6-luna** (`gpt-6-luna`)
- **Gemini 2.5 Pro / Claude Sonnet / GPT-5**

### Strict Contract Rules
1. **Strict Schema Validation (`additionalProperties: false`):** Validated via `AiCustomizeReplyDraftResponseSchema` in [`src/lib/contracts.ts`](../../src/lib/contracts.ts).
2. **7-Year Statutory Plain-Text Compliance (`LINK_URL_PATTERN` Guard):** All admin-to-customer messages in Social Radar are archived for 7 years and strictly forbid raw hyperlinks (`https://`, `www.`, or bare `.com` domain syntax) or HTML tags. The post-processing sanitizer automatically converts domain references (e.g., `example.com` $\rightarrow$ `example [dot] com`) and strips markdown/HTML so the drafted reply always passes `assertPlainTextNoLinks` without error.
3. **Character Budget Enforcement:** Guarantees the generated `subject` ($\le 150$ chars) and `body` ($\le 1,950$ chars, safely inside the 2,000-char limit) fit within the statutory message contract.
4. **Zero-Downtime Deterministic Fallback:** If an upstream LLM times out or is unavailable, `generateCustomizeStaffReply` deterministically constructs the full 4-pillar customized strategy reply directly from the customer's submitted Customize fields and staff notes.

---

## 3. The 4-Pillar Reply Architecture
Every generated staff work reply contains four structured plain-text sections tailored to the customer's submission:
1. **Executive Brand & Offer Positioning:** Synthesizes `brandName`, `productServiceDescription`, `uniqueMechanismOrOffer`, and the customer's `extraDetailsAndNotes`.
2. **Audience & Pain-Point Hook Matrix:** Maps `targetAudienceAvatar` and `corePainPoints` into high-converting pattern interrupts.
3. **3 Bespoke Ad Creative Concepts (Ready to Produce):**
   - **Angle 1 — Direct Response Problem-Agitate-Solve:** 3-second hook, primary copy, headline, and CTA.
   - **Angle 2 — Unique Mechanism & Proof Contrast:** Differentiates the brand's mechanism against generic alternatives.
   - **Angle 3 — UGC / Native Story Script:** Tailored to the customer's selected `toneOfVoice` and special instructions.
4. **Recommended Next Steps & Implementation Notes:** Actionable launch checklist referencing their campaign version and staff guidance.

