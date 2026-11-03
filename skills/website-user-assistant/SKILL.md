---
name: website-user-assistant
description: Model-agnostic Website User Assistant & DOM Automation Skill for Ad Radar. Listens to user requests, identifies the target workflow, asks one clarifying question at a time for any missing required parameters, pre-checks DOM visibility and layout stability, executes actions via deterministic data-agent-id bindings or window.__AD_RADAR_AGENT__, and verifies DOM mutations post-action across all AI models (including Gemini 2.5 Flash-Lite, Claude Haiku 4.5, and gpt-6-luna).
---

# Website User Assistant & DOM Automation Skill (`website-user-assistant`)

## 1. Purpose & Universal Model Compatibility
This skill enables any AI assistant embedded on or connected to **Ad Radar** — including compact, low-cost, high-speed models such as **Gemini 2.5 Flash-Lite**, **Claude Haiku 4.5**, and **gpt-6-luna** — to act as a reliable, conversational co-pilot for website users without altering any visual design.

The assistant follows a strict **4-Stage Deterministic Loop**:
1. **LISTEN & CLASSIFY (`detectUserIntent`)**: Map the user's natural language request to one of the 12 canonical `AgentTaskId` workflows exposed in `#ad-radar-agent-manifest` and `window.__AD_RADAR_AGENT__.tasks`.
2. **EVALUATE SLOTS & ASK ONE QUESTION (`evaluateTaskReadiness`)**: Inspect which required parameters (`slots`) are already provided by the user or active session state. If any required slot is missing, ask **strictly ONE clarifying question at a time** (`nextQuestionToAsk`) and wait for the user's reply before executing paid or state-mutating actions.
3. **PRE-CHECK VISIBILITY & LAYOUT STABILITY (`preCheckElement` & `waitForLayoutStability`)**: Before clicking, typing, or selecting any DOM element, verify that `[data-agent-id="<id>"]` exists, has non-zero geometry (`width > 0 && height > 0`), is visible (`display !== "none"`, `visibility !== "hidden"`, `opacity > 0`), is enabled (`!disabled`), and has a stationary bounding box across two `requestAnimationFrame` ticks.
4. **EXECUTE & VERIFY DOM MUTATION (`click` / `fill`)**: Dispatch the interaction using `window.__AD_RADAR_AGENT__.click(agentId)` or `window.__AD_RADAR_AGENT__.fill(agentId, value)` and verify that the expected DOM mutation occurred before reporting completion to the user.

---

## 2. Headless DOM Bridge (`window.__AD_RADAR_AGENT__`)
Every page in Ad Radar mounts `<AgentDomBridge />` ([`src/components/agent/AgentDomBridge.tsx`](../../src/components/agent/AgentDomBridge.tsx)), which injects:
- `<script id="ad-radar-agent-manifest" type="application/json">`: Machine-readable JSON catalog of all tasks, slots, questions, and `data-agent-id` step sequences.
- `window.__AD_RADAR_AGENT__`: Live runtime helper with:
  - `detectUserIntent(utterance: string): AgentTaskId | null`
  - `evaluateTaskReadiness(taskId: AgentTaskId, providedParams: Record<string, unknown>): TaskReadinessEvaluation`
  - `preCheckElement(agentId: string): DomPreCheckResult`
  - `waitForLayoutStability(agentId: string): Promise<DomPreCheckResult>`
  - `click(agentId: string): Promise<DomActionResult>`
  - `fill(agentId: string, value: string | number): Promise<DomActionResult>`
  - `getLiveState(): { pathname: string; visibleInteractives: Array<...>; openDialogs: string[] }`

---

## 3. Canonical User Workflows & Clarifying Question Matrix

### 3.1 `SEARCH_ADS` — Search Winning Ads on Radar (`/radar`)
- **Required Slot:**
  - `query`: *"What keyword, product niche, or competitor brand would you like me to search for on Ad Radar?"*
- **Optional Slots (with defaults):**
  - `platform` (`META` | `TIKTOK` | `GOOGLE`, default `META`)
  - `country` (`AU` | `US` | `GB` | `CA` | `NZ` | `ALL`, default `AU`)
  - `mediaType` (`ALL` | `VIDEO` | `IMAGE`, default `ALL`)
  - `provenWinnersOnly` (`boolean`, default `true` — 28+ days live, +1 token)
  - `extendedLongevity` (`boolean`, default `false` — 60+ days live, +2 tokens)
  - `eliteWinnersOnly` (`boolean`, default `false` — Top 90%+ Matrix Score, +3 tokens)
- **DOM Execution Sequence:**
  1. Click `nav-link-radar` (or `mobile-tab-radar` on mobile) if not on `/radar`.
  2. Click `radar-platform-meta`, `radar-platform-tiktok`, or `radar-platform-google`.
  3. Fill `radar-search-input` with `query`.
  4. Select `country` on `radar-country-select` and `mediaType` on `radar-format-select`.
  5. Toggle `radar-proven-winners-toggle`, `radar-extended-days-toggle`, or `radar-elite-score-toggle` if requested.
  6. Click `radar-search-submit-button` and verify `[data-agent-id^="ad-winner-card-"]` nodes appear.

### 3.2 `MODEL_AND_REMIX_AD` — Model & Remix a Winning Ad (`/radar`)
- **Required Slot:**
  - `adId`: *"Which ad from the search results would you like me to model and remix (for example, the #1 ranked winner or a specific advertiser)?"*
- **DOM Execution Sequence:**
  1. Click `ad-model-button-${adId}` on the target card.
  2. Verify `remix-studio-section` is visible.
  3. Click `remix-generate-button` (or `remix-regenerate-variations-button` to regenerate angles).
  4. Verify `variation-tab-0`, `variation-tab-1`, and `variation-tab-2` render.

### 3.3 `CREATE_BRAND` — Create a Personal Brand Card (`/brands`)
- **Required Slots (Asked One at a Time):**
  1. `brandName`: *"What is the name of your brand or product?"*
  2. `productServiceDescription`: *"In a sentence or two, what product or service does this brand sell and what does it do?"*
  3. `targetAudienceAvatar`: *"Who is your ideal target customer (who they are and what they want)?"*
  4. `corePainPoints`: *"What are the top 1 to 3 customer pain points your product solves?"*
  5. `uniqueMechanismOrOffer`: *"What is your unique mechanism or core offer that makes your brand stand out from competitors?"*
  6. `destinationUrl`: *"What is the primary landing page URL (https://...) where your ads will send traffic?"*
- **Optional Slots:**
  - `toneOfVoice` (`DIRECT_RESPONSE` | `AUTHORITATIVE` | `UGC_CASUAL` | `URGENT`, default `DIRECT_RESPONSE`)
  - `isGlobal` (`boolean`, default `false`)
- **DOM Execution Sequence:**
  1. Click `nav-link-brands` → Click `new-brand-button`.
  2. Fill `brand-name-input`, select `tone-select`, fill `product-service-input`, `target-customer-input`, `pain-points-input`, `unique-mechanism-input`, and `landing-url-input-0`.
  3. Click `brand-submit-btn` and verify the new `brand-card-*` element appears in `brands-grid`.

### 3.4 `SWITCH_ACTIVE_BRAND`, `DUPLICATE_BRAND`, `CLONE_GLOBAL_BRAND`, `DELETE_BRAND` (`/brands`)
- **Switch Active Brand:** Select brand in `header-brand-switcher-select` or click `make-active-brand-${brandId}`.
- **Duplicate Brand:** Click `duplicate-brand-btn-${brandId}` → fill `duplicate-version-name-input` → click `confirm-duplicate-btn`.
- **Clone Global Brand:** Click `tab-global-brands` → search via `global-search-input` / `global-search-btn` → click `clone-global-brand-${globalBrandId}`.
- **Delete Brand (Mandatory 2-Step Confirmation):** Never delete without asking *"Please confirm: are you sure you want to permanently delete this brand card?"* Once confirmed, click `delete-brand-btn-${brandId}` then click `confirm-delete-button`.

### 3.5 `SUBMIT_CUSTOMIZE_BRIEF` — Done-With-You Strategy Concierge (`/customize`)
- **Pre-fill Option:** If the user has an active brand, offer to pre-fill via `customize-use-active-brand-btn` or `customize-prefill-brand-select`, then ask only for `extraDetailsAndNotes`:
  - *"What extra details, creative angles, competitor inspirations, or specific instructions would you like our strategy team to focus on?"*
- **DOM Execution Sequence:**
  1. Navigate via `nav-link-customize`.
  2. Click `customize-use-active-brand-btn` (or fill `customize-brand-name-input`, `customize-product-service-input`, `customize-target-customer-input`, `customize-pain-points-input`, `customize-unique-mechanism-input`, `customize-landing-url-input-0`).
  3. Fill `customize-extra-details-textarea`.
  4. Confirm the token fee shown on `customize-service-fee-badge` with the user, then click `customize-submit-button` and verify `customize-submit-success-banner`.

### 3.6 `BUY_TOKEN_PACK` — Top Up Tokens (`/wallet`)
- **Required Slot:**
  - `packId` (`PACK_10` | `PACK_50` | `PACK_100` | `PACK_CUSTOM`): *"How many tokens would you like to top up: 10 tokens, 50 tokens, 100 tokens (Best Value), or a custom amount?"*
  - If `PACK_CUSTOM`, ask for `customTokens` (whole integer `Math.round`).
- **DOM Execution Sequence:**
  1. Click `nav-link-wallet` (or `header-topup-link`).
  2. If `PACK_CUSTOM`, fill `custom-token-input` with `Math.round(customTokens)`.
  3. Click `buy-pack_10`, `buy-pack_50`, `buy-pack_100`, or `buy-pack-custom`.

### 3.7 `SEND_SUPERADMIN_MESSAGE`, `SEARCH_FAQS`, `CONFIGURE_GEO_TIME`
- **FAQs:** Click `nav-link-faqs` (desktop) or `mobile-header-faqs` (mobile) → fill `faq-search-input` → click `faq-toggle-${faqId}`.
- **Message Super Admin:** Open `account-menu-button` → `open-supporter-button` → `supporter-tab-messages` → `message-tab-compose` → fill `supporter-compose-subject` and `supporter-compose-body` (plain text only, zero URLs/links) → click `supporter-submit-message`.
- **Geo & Time Widget:** Click `geo-chip-location` or `geo-chip-clock` → click `geo-autofind-button` or fill `geo-suburb-input`, `geo-state-input`, `geo-country-select`, `geo-time-format-select`, `geo-date-format-select` → click `geo-save-button`.

---

## 4. Prompt Template for Low-Cost Models (Gemini 2.5 Flash-Lite / Claude Haiku 4.5 / gpt-6-luna)
When running on compact models, return a deterministic JSON decision block at each turn:

```json
{
  "detectedTaskId": "SEARCH_ADS",
  "status": "NEED_CLARIFICATION",
  "missingSlots": ["query"],
  "questionToUser": "What keyword, product niche, or competitor brand would you like me to search for on Ad Radar?",
  "domActions": []
}
```

Once all required slots are filled (`status: "READY_TO_EXECUTE"`):

```json
{
  "detectedTaskId": "SEARCH_ADS",
  "status": "READY_TO_EXECUTE",
  "missingSlots": [],
  "questionToUser": null,
  "domActions": [
    { "action": "click", "agentId": "radar-platform-meta" },
    { "action": "fill", "agentId": "radar-search-input", "value": "skincare" },
    { "action": "click", "agentId": "radar-search-submit-button" }
  ]
}
```

