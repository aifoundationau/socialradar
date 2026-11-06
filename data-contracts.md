# AdRadarHQ Data Contracts

> Single source of truth for every schema and payload. The runtime enforcement lives in
> [`src/lib/contracts.ts`](src/lib/contracts.ts) (Zod, `.strict()` ≡ `additionalProperties: false`).
> Any change here MUST be mirrored there in the same commit.

## Global Rules

- **Strict objects:** every schema rejects unknown keys (`additionalProperties: false`).
- **Integers only:** all token values (`tokenBalance`, `delta`, `balanceAfter`, costs) are integers. Server code wraps every computed value with `Math.round()` and validates with `z.number().int()`.
- **Timestamps:** ISO-8601 UTC strings (`new Date().toISOString()`).
- **Sanitization:** user-supplied free text is trimmed, control characters are stripped, and length is capped. URLs must be `https://`.
- **Australian Privacy Act 1988 (APPs):** collect only what the feature needs (APP 3). No sensitive information (APP 3.3) is stored. Email is the only PII on `UserDoc`. Users can request deletion (APP 13), which cascades to `brands`, `remixes`, and anonymises `token_transactions` (`uid` replaced with a hash, kept for financial record keeping).
- **Write authority:** `users/*`, `users/{uid}/brands/*`, `token_transactions/*`, `radar_cache/*`, `normalized_ads/*` and `remixes/*` are written **only** by the Firebase Admin SDK on the server. Client SDK access is read-only and scoped to the owner via Firestore rules (`firestore.rules`); `radar_cache` and `normalized_ads` are not client-readable at all.
- **Idempotency:** every mutating API call accepts an `x-idempotency-key` header (`^[A-Za-z0-9_-]{8,128}$`). The key becomes the deterministic `txId`, so a retried request never double-charges. A key only replays the identical charge (same uid, action type and `referenceId`); reusing it for anything else, or replaying a refunded key, returns `409`.

## 1. UserAuth & Token Ledger (`users/{uid}` & `token_transactions/{txId}`)

### Custom Claims (Firebase Admin)
```json
{
  "role": "superadmin" | "admin" | "supporter" | "user",
  "tier": "supporter" | "starter" | "growth" | "agency",
  "isSuperAdmin"?: boolean,
  "admin"?: boolean,
  "superadmin"?: boolean
}
```
- **Superadmin Authority:** Strictly restricted to the Firebase database admin email (`davidrobertson.info@gmail.com` / `support@aifoundation.net.au` or configured via `FIREBASE_DATABASE_ADMIN_EMAIL`). Super Admin has access to all 8 admin control suites: Currency Controls, Service Pricing, Token Packs (CRUD), Redistributive Ledger, User Messages & 7-Year Archive, RBAC Matrix & Role Assignments, FAQ Development, and Developer Diagnostics.
- **Superadmin "Act As Role" Simulation:** The Super Admin can dynamically view and act as all other roles (`admin`, `supporter`) throughout the application:
  - *Super Admin View (`superadmin`):* Full 8-tab governance and control.
  - *Main Admin View (`admin`):* Simulates the exact 5-tab Main Admin Panel, Main Admin badge, and operational controls.
  - *Supporter View (`supporter`):* Simulates the exact 3-tab Supporter Admin Panel (Tokens, Buy More Tokens, Messages only), Supporter badge, and customer navigation.
  - Dynamic notification banner in the top navigation and 1-click "Return to Super Admin" reset in the header, account menu, and modals.
- **Main Admin Authority (`role: "admin"`):** Operational administrators assigned the `"admin"` role. Main Admin has access to the Main Admin Panel with 5 operational control tabs:
  1. **Currency Controls:** System currency toggles (Token Economy, AUD, USD) and Base Token Price (AUD).
  2. **Service Pricing:** Product and service token amounts (Search, Remix, Regenerate, Customize).
  3. **Token Packs:** Token pack catalog and Stripe pricing management.
  4. **User Messages:** User compliance messaging, Customize service requests, and AI strategy replies.
  5. **FAQ Development:** Creating, editing, reordering, and maintaining customer-facing FAQ questions and answers.
  - *Super Admin-Exclusive Protections:* Main Admin is strictly barred from viewing or mutating the Redistributive Ledger (equity partners, profit distributions, simulated purchases, order refunds, gift tokens), the RBAC Matrix (elevating accounts or altering security permissions), and Developer Diagnostics (flushing query caches, granting admin claims).
- **Supporter Level (Default):** All first-time and standard users start at supporter level `{ "role": "supporter", "tier": "supporter", "isSuperAdmin": false, "admin": false }`.
- Missing/unassigned claims automatically fall back to `{ role: "supporter", tier: "supporter" }`.
- UI displays a "Super Admin" badge for database admins, a "Main Admin" badge for main admins, and a "Supporter" badge for standard users.
- The Admin Panel button in the account menu displays "Super Admin Panel" for Super Admin and "Main Admin Panel" for Main Admin. Non-admin supporters see "Supporter Admin Panel".

### `UserDoc`
| Field | Type | Rules |
|---|---|---|
| `uid` | string | `^[A-Za-z0-9]{1,128}$` |
| `email` | string | RFC email, max 254, lower-cased |
| `tokenBalance` | integer | `>= 0`, mutated ONLY via server-side `runTransaction` |
| `activeBrandId` | string | `""` or brandId |
| `stripeCustomerId` | string | `""` or `^cus_[A-Za-z0-9]+$` |
| `updatedAt` | ISO-8601 | |

### `TokenTransactionDoc`
| Field | Type | Rules |
|---|---|---|
| `txId` | string | idempotency key / deterministic id |
| `uid` | string | |
| `type` | enum | `"TOPUP" \| "RADAR_SEARCH" \| "AI_REMIX" \| "REGENERATE_VARIATIONS" \| "REFUND" \| "BRAND_CLONE"` |
| `delta` | integer | non-zero (e.g. `-2`, `-5`, `+100`) |
| `balanceAfter` | integer | `>= 0` |
| `referenceId` | string | queryHash, adId, stripeSessionId, globalBrandId, or refunded txId; max 256 |
| `createdAt` | ISO-8601 | |

### Token packs (server constants, `src/lib/pricing.ts`)
One-off Stripe Checkout purchases. Tokens never expire.
- **Default Currency & Base Rate:** The default platform currency is **AUD** (`aud`), and the default token price is **1 Token = AUD $1** (`100 cents AUD`, stored in `audCentsPerToken`).
- **SuperAdmin Customization:** From the SuperAdmin Control Panel (`system_config/global`), both `audCentsPerToken` and the token amounts for each product and service (`serviceCosts`: `searchStandard`, `searchProvenWinners`, `searchExtendedDays`, `searchEliteScore`, `aiRemix`, `regenerateVariations`, `brandClone`) are fully customizable.
- **Base Currency & Invoicing:** All platform token fees and Stripe invoices operate strictly in Australian Dollars (**AUD**) with whole numbers.
- **Geolocation & International Currency Conversion:**
  - If geolocation is in Australia or New Zealand (`AU` or `NZ`), users strictly see **AUD** prices (`$1 AUD` per token) with no currency conversion display.
  - **GST Invariant:** New Zealand (`NZ`) is strictly no GST. Any reference to "+ GST" or "+ 10% GST" is for **Australia (`AU`) only**.
  - For **all nations except Australia and New Zealand**, a currency converter displays the **AUD to USD conversion**, which can show up to 2 decimal places (e.g. `$1 AUD ≈ $0.65 USD`, `$10 AUD ≈ $6.50 USD`), while all formal invoices remain in Australian Dollars (AUD).
- **Pack Sizes:** Packs are offered in 10, 50, 100, and Custom quantities.

| Pack id | Tokens | Default Price in AUD (All Invoices) | International Display (Nations Outside AU & NZ) |
|---|---|---|---|
| `PACK_10` | 10 | $10 AUD | $10 AUD (≈ $6.50 USD) |
| `PACK_50` | 50 | $50 AUD | $50 AUD (≈ $32.50 USD) |
| `PACK_100` | 100 | $100 AUD | $100 AUD (≈ $65 USD) |
| `PACK_CUSTOM` | Custom ($N \ge 1$) | $N \times \text{audCentsPerToken}$ | $\text{AUD} \times 0.65\text{ USD (up to 2 decimal places)}$ |

### `TopupMetadata` (Checkout Session `metadata`, also copied to the PaymentIntent)
| Field | Type | Rules |
|---|---|---|
| `uid` | string | same as `UserDoc.uid`; must equal the session's `client_reference_id` |
| `packId` | enum | `PACK_10 \| PACK_50 \| PACK_100 \| PACK_CUSTOM` |
| `tokens` | string | integer `1–1000000` (Stripe metadata values are strings) |

The webhook credits `tokens` to `uid` with `txId = referenceId = <Checkout Session id>`, so redelivered events are no-ops.

### Action costs & Service surcharges (server constants, `src/lib/pricing.ts`)
Standard Paid Rates for all services, products, and surcharges across the platform are strictly **1 Token** each.

| Action / Surcharge | Standard Paid Rate | Description |
|---|---|---|
| `searchStandard` (Base Radar Search) | 1 token | Base platform search across ad libraries |
| `searchProvenWinners` | +1 token | Proven winners longevity filter (Active 28+ days) |
| `searchExtendedDays` | +1 token | Extended longevity filter (Active 60+ days) |
| `searchEliteScore` | +1 token | Top Winners composite score filter (90%+ score) |
| `aiRemix` (AI Creative Remix) | 1 token | Multimodal AI remix deconstruction & script generation |
| `regenerateVariations` (Regenerate Variations) | 1 token | Regenerate fresh angles & 3 script variations in Remix Studio |
| `brandClone` (Global Brand Copy) | 1 token | Copying global brand card into personal workspace |

From the SuperAdmin Control Panel, all rates can be dynamically set to free (`0 tokens`) using the "Set All Free (0)" preset or customized individually. A cost of `0` makes the action free: the caller must still be signed in and send an idempotency key, but nothing is written to the ledger and no balance check is made.

### Refund Policy & Dispute Process
- **Automatic Failure Refunds:** If an upstream API provider (SearchApi.io, Gemini) or system operation fails during a search or remix, tokens are automatically refunded atomically via compensating transaction (`<txId>_refund`).
- **Written Refund Requests:** All formal or manual refund requests are to be made in writing by sending a message to the Superadmin via the secure in-app messaging interface (`/api/contact`).
- **Statutory Audit Retention:** Written refund requests and compliance communications are cryptographically preserved for 7 years under Australian statutory recordkeeping standards and reviewed in accordance with the Australian Consumer Law (ACL).

### Superadmin Token Exemption Rule
- If the authenticated caller has custom claim `{ "role": "admin" }` (Superadmin), the effective token cost for **all actions** (`RADAR_SEARCH`, proven winners filters, extended longevity filters, elite winner filters, and `AI_REMIX`) is strictly **0 tokens**.
- Superadmin pays **no tokens** under any circumstance.
- Superadmin incurs zero balance deductions and is never blocked by insufficient token balances.

## 2. Normalized Ad Contract (`normalized_ads/{adId}`)

| Field | Type | Rules |
|---|---|---|
| `adId` | string | `^(meta\|tiktok\|google)_[A-Za-z0-9_-]{1,200}$` |
| `platform` | enum | `"META" \| "TIKTOK" \| "GOOGLE"` |
| `advertiserName` | string | max 300 |
| `advertiserId` | string | max 200 |
| `mediaType` | enum | `"VIDEO" \| "IMAGE" \| "CAROUSEL" \| "TEXT"` (TEXT = Google Search text ads) |
| `mediaUrls` | string[] | https URLs, max 20 |
| `thumbnailUrl` | string | https URL or `""` |
| `primaryCopy` | string | max 5000 |
| `headline` | string | max 500 |
| `ctaText` | string | max 100 |
| `landingPageUrl` | string | https URL or `""` |
| `countryCode` | string | ISO 3166-1 alpha-2, upper-case |
| `firstSeenDate` | ISO-8601 | |
| `lastSeenDate` | ISO-8601 | |
| `activeDaysCount` | integer | `>= 1` |
| `winningScore` | integer | `0–100` |
| `totalViews` | integer | optional, `>= 0` (total verified views or velocity-derived impressions) |
| `totalLikes` | integer | optional, `>= 0` (estimated or observed likes/reactions) |
| `highlightKeywords` | string[] | max 20, resonant keywords overlapping brand profile |
| `matrixScore` | object | optional `{ brandFitScore, hookStrengthScore, longevityScore, compositeScore, resonanceReason, totalViews, totalLikes, highlightKeywords }` |

- **Winning score:** `raw = activeDaysCount × 2.5 + duplicateCreativeCount × 10` (duplicates = Meta `collation_count − 1`, TikTok collated creative count, 0 elsewhere). Results are sorted by `raw` / `compositeScore` descending; the stored value is `min(100, round(raw))`.
- **Feed Sort Keys:**
  - `SCORE`: Winning score (`compositeScore ?? winningScore`) descending.
  - `LIKES`: Most likes (`totalLikes ?? compositeLikes`) descending.
  - `VIEWS`: Most views (`totalViews ?? compositeViews`) descending.
  - `LONGEST`: Longest ad online (`activeDaysCount`) descending.
- **Platform Search Volume & Quality Normalization (`CACHE_VERSION = "12"`, `MAX_RESULTS = 100`, `PAGE_SIZE = 18`):**
  - **Strict Platform Isolation Gate (`enforcePlatformIsolation` in `src/lib/radar-relevance.ts`, `src/lib/radar.ts` & `src/components/radar/RadarView.tsx`):**
    - Selecting `META` strictly returns only Meta (Facebook, Instagram, Reels, Messenger, Audience Network) ads (`platform === "META"`, `adId` prefixed `meta_`, blocking TikTok/Google/YouTube domains and media).
    - Selecting `TIKTOK` strictly returns only TikTok ads (`platform === "TIKTOK"`, `adId` prefixed `tiktok_`, blocking Meta/Facebook/Instagram/Google/YouTube domains and media).
    - Selecting `GOOGLE` strictly returns only Google Ads (Search RSA, Google Shopping, Display/Performance Max) and YouTube Video Ads (`platform === "GOOGLE"`, `adId` prefixed `google_`, blocking Meta/Facebook/Instagram/TikTok domains and media).
    - Switching the platform selector in `RadarView.tsx` immediately isolates results to the selected platform and triggers a platform-isolated search when a query is present.
  - **Semantic Ad Search & Relevance Engine (`src/lib/radar-relevance.ts` & `skills/semantic-ad-search-relevance/SKILL.md`):**
    1. *Intent-to-Domain & Vertical Taxonomy Resolver:* Maps generic category queries (e.g., `"car"`, `"running shoes"`, `"skincare"`, `"pet food"`, `"horse"`) to authoritative category domains (such as `carsales.com.au`, `toyota.com.au`, `mazda.com.au`, `drive.com.au` for `"car"`).
    2. *Word-Boundary & Prefix Collision Guard:* Blocks false-positive substring matches on Google advertiser lookups (e.g., blocking `"Cara HO"`, `"Care"`, `"Skincare"`, `"CeraVe"`, `"Carpet"` when searching `"car"`).
    3. *Post-Fetch Semantic Ad Gate:* Purges any off-topic ads matching negative collision patterns before ranking and caching.
    4. *Zero-Downtime Cache Recovery:* Recovers previously cached real upstream ads if SearchApi credits are temporarily exhausted (`HTTP 429`).
  - **Meta Dual-Engine Winner Intelligence System (`src/lib/meta-topads.ts` & `skills/meta-ads-winner-intelligence/SKILL.md`):**
    1. *Engine 1 — Dual-Pass `meta_ad_library` + Optional External Connector:* Runs an exact-phrase commercial pass (`search_type: "keyword_exact_phrase"`, up to 3 pages) supplemented by a broad/category pass when <40 ads return, plus optional `APIFY_META_ADS_ACTOR_ID` / `META_TOPADS_API_URL` ingestion.
    2. *Engine 2 — Deep Snapshot, Advantage+ Omnichannel & Multi-Card DCO Extraction:* Combines `collation_count` with same-page active creative counts (`duplicates`), extracts `publisher_platform` (`Facebook · Instagram · Messenger · Audience Network`), `page_like_count`, `aaa_info.eu_total_reach`, multi-card `snapshot.cards[]` copy, `link_description`, and synthesizes headlines (`buildMetaHeadline`) & CTAs (`inferMetaCta`).
  - **TikTok Dual-Engine Top Ads System (`src/lib/tiktok-topads.ts` & `skills/tiktok-viral-ad-intelligence/SKILL.md`):** Combines SearchApi.io `tiktok_ads_library` (`sort_by: "unique_users_seen_high_to_low"`, exact-phrase + broad pass) with TikTok Creative Center Top Ads (`ads.tiktok.com/business/creativecenter/inspiration/topads/` via `APIFY_API_TOKEN` / `TIKTOK_CREATIVE_CENTER_API_URL`), classifies UGC creative formats, infers CTAs/headlines, and scores daily view velocity ($V_{\text{daily}} = V_{\text{total}} / D_{\text{active}}$).
  - **Google 3-Engine Winner Intelligence System (`src/lib/google-topads.ts` & `skills/google-ads-winner-intelligence/SKILL.md`):**
    1. *Engine 1 — Live SERP Sponsored Search & Shopping Auction (`engine: "google"`):* Captures live Sponsored Responsive Search Ads (`ads`) with sitelink/callout extensions, live Sponsored Google Shopping Ads (`shopping_ads`) with pricing/ratings, and extracts top bidding domains (`discoveredDomains`).
    2. *Engine 2 — Multi-Advertiser Google Ads Transparency Center (`engine: "google_ads_transparency_center"`):* Queries up to 3 verified domains/advertiser IDs in parallel across Search (`TEXT`), YouTube (`VIDEO`), and Display/PMax (`IMAGE`), tracking multi-creative scaling (`duplicates`) and sorting by `total_days_shown`.
    3. *Engine 3 — Deep Winner Detail Enrichment (`engine: "google_ads_transparency_center_ad_details"`):* Automatically enriches top longevity winners with YouTube video links/thumbnails, `long_headline`, `description`, and `call_to_action`, while synthesizing format-aware headlines, copy, and CTAs so no Google Ad card ever renders blank.
- Written by `/api/radar/search` to `normalized_ads/{adId}`; `/api/radar/remix` reads the ad from there and never accepts ad content from the client.

### `RadarCacheDoc` (`radar_cache/{queryHash}`)
`queryHash` = SHA-256 of `platform`, lower-cased `query`, `country` and `mediaType` (`provenWinnersOnly` is applied when serving). Served for 24 hours from `createdAt`.
| Field | Type | Rules |
|---|---|---|
| `queryHash` | string | 64 hex chars |
| `platform`, `query`, `country`, `mediaType` | as in the search request | |
| `ads` | `NormalizedAd[]` | max 100, ranked |
| `notice` | string | max 500, `""` if none |
| `createdAt`, `expiresAt` | ISO-8601 | `expiresAt = createdAt + 24h` |

### Radar Search Quick Recommendations (Top 24 Most Searched Items)
The empty radar view presents a curated, interactive tag cloud of the top 24 most searched consumer & ecommerce items across internet ad libraries (Meta, TikTok, Google):
1. `skincare`
2. `protein powder`
3. `pet food`
4. `meal kit`
5. `running shoes`
6. `activewear`
7. `wireless earbuds`
8. `smart watch`
9. `air purifier`
10. `reusable water bottle`
11. `sunscreen`
12. `hair oil`
13. `teeth whitening`
14. `mushroom coffee`
15. `collagen peptides`
16. `magnesium spray`
17. `massage gun`
18. `weighted blanket`
19. `phone case`
20. `dog harness`
21. `yoga mat`
22. `travel backpack`
23. `blue light glasses`
24. `heatless curler`

Every interactive pill binds `data-agent-id="radar-example-<item>"`, `data-testid="radar-example-<item>"`, and `aria-label="Search ads for <item>"`.

## 3. Brand Profile Contract (`users/{uid}/brands/{brandId}` and `global_brands/{brandId}`)

| Field | Type | Rules |
|---|---|---|
| `brandId` | string | server-generated alphanumeric ID |
| `brandName` | string | 1–100 |
| `productServiceDescription` | string | 1–2000 |
| `targetAudienceAvatar` | string | 1–2000 |
| `corePainPoints` | string[] | 1–10 items, each 1–300 |
| `uniqueMechanismOrOffer` | string | 1–1000 |
| `toneOfVoice` | enum | `"DIRECT_RESPONSE" \| "AUTHORITATIVE" \| "UGC_CASUAL" \| "URGENT"` |
| `destinationUrl` | string | https URL (primary landing page) |
| `landingPageUrls` | string[] | array of https URLs, max 50 (defaults to `[destinationUrl]`) |
| `isGlobal` | boolean | `default: false` — when `true`, synced to `global_brands/{brandId}` for global discovery & cloning |
| `version` | string | optional version tag or campaign identifier (e.g. "v1", "v2", "Q4 2026") |
| `authorUid` | string | optional creator UID for attribution |
| `authorEmail` | string | optional creator email for global display |
| `clonedFromBrandId` | string | optional ID of source brand if cloned from community or duplicated |
| `createdAt` | ISO-8601 | creation timestamp |
| `updatedAt` | ISO-8601 | last updated timestamp |

### Global Brands & Duplication Endpoints
- `POST /api/brands/duplicate`: `{ "brandId": string, "versionName"?: string }` clones a personal brand into a new version.
- `GET /api/brands/global`: `?q=...&tone=...&limit=...` searches public community brands in `global_brands`.
- `POST /api/brands/clone`: `{ "globalBrandId": string }` copies a global brand into the caller's personal `users/{uid}/brands`.

## 4. AI Deconstruction & Remix Contract (`remixes/{remixId}`)

| Field | Type |
|---|---|
| `remixId` | string |
| `uid` | string |
| `sourceAdId` | string |
| `brandId` | string |
| `deconstruction.hookAnalysis` | string (0–3s visual & verbal pattern interrupt) |
| `deconstruction.pacingStructure` | string[] (timestamped beat breakdown) |
| `deconstruction.persuasionFramework` | `"PAS" \| "AIDA" \| "UGC_STORY" \| "US_VS_THEM" \| "SOCIAL_PROOF_STACK"` |
| `deconstruction.whyItWorks` | string |
| `variations` | exactly 3 × `{ angleName, primaryCopy, headline, ctaButton, videoStoryboard[], imageGenerationPrompt }` |
| `variations[].videoStoryboard[]` | `{ timestamp, visualAction, spokenAudio, onScreenText }` |

## 5. API Request Payloads

### `POST /api/radar/search`
```json
{ "platform": "META|TIKTOK|GOOGLE", "query": "string 2-100", "country": "AU", "mediaType": "ALL|VIDEO|IMAGE", "provenWinnersOnly": true, "extendedLongevity": false, "eliteWinnersOnly": false, "brandId": "string" }
```
Requires `x-idempotency-key`; the body is validated before any charge. `provenWinnersOnly` keeps ads with `activeDaysCount >= 28` (default). `extendedLongevity` filters for `activeDaysCount >= 60`. `eliteWinnersOnly` filters for `compositeScore >= 90`. Engines: Meta `meta_ad_library` (active ads); TikTok `tiktok_ads_library` (sorted by reach); Google `google_ads_transparency_center` (Search, YouTube and Display). Google is searched by advertiser: a query that isn't a domain goes through `..._advertiser_search` (the whole query, then its longest word; a matching domain is used when no advertiser matches). Credits per search: Meta 1, TikTok 1, Google by domain 1, Google by keyword 2 (3 when the whole phrase matches nothing), cache hits 0. Google results carry no creative or copy; `/api/radar/remix` fetches `..._ad_details` once (1 credit) and saves it to `normalized_ads`. The cache key includes a version that is bumped whenever normalization changes.
Returns `{ ads: NormalizedAd[], unfilteredCount, cached, queryHash, fetchedAt, notice, balanceAfter }` (`unfilteredCount` = ads before the proven-winners filter). The UI shows 9 per page.

### `POST /api/radar/remix`
```json
{ "adId": "meta_123", "brandId": "string" }
```
Requires `x-idempotency-key`. Sends the stored ad (with its creative inline, or a YouTube link by reference) and the brand profile to Gemini (`GEMINI_MODEL`, default `gemini-flash-latest`) with `responseMimeType: "application/json"` and the `AdRemixBlueprint` schema, validates the reply, and stores it at `remixes/{txId}`. Returns `{ remix: RemixDoc, ad?: NormalizedAd, balanceAfter }` (`ad` is the source ad as remixed, so the client can show a Google ad's newly loaded creative). Upstream failures return `502 UPSTREAM_FAILURE` and refund any charge.

### `POST|PUT|DELETE|PATCH /api/brands`
Body for POST: Brand Profile without `brandId` (→ `201 { brand }`; replaying the same `x-idempotency-key` returns `200` with the same brand). PUT: full Brand Profile (`404 NOT_FOUND` if missing). DELETE: `{ "brandId": "string" }`. PATCH: `{ "activeBrandId": "" | brandId }` selects the active brand. Max 25 brands per user. The first brand created becomes active; deleting the active brand clears `activeBrandId`. Reads use the client's Firestore listener, so there is no GET.

### `POST /api/me`
No body. Creates `users/{uid}` on first sign-in (balance 0) and returns `{ user, claims }`.

### `POST /api/wallet/checkout`
```json
{ "packId": "PACK_10|PACK_50|PACK_100|PACK_CUSTOM|SUB_MONTHLY_1000", "customTokens": 25, "buyerCountry": "AU" }
```
`customTokens` is required when `packId` is `"PACK_CUSTOM"` (integer $\ge 1$). `buyerCountry` (optional 2-letter ISO country code, fallback to IP geo headers) governs tax treatment:
- **Australia (`AU`):** 10% exclusive GST is added on top (`tax_behavior: "exclusive"` via native Stripe Tax `automatic_tax: { enabled: true }`).
- **New Zealand (`NZ`) & International:** Strictly no GST / $0 tax added or deducted. All purchases outside Australia pay the exact base AUD price with no tax.
Requires `x-idempotency-key` (reused as the Stripe idempotency key). Returns `{ "url": "https://checkout.stripe.com/..." }`.

### `POST /api/webhooks/stripe`
Stripe only (verified by `Stripe-Signature` + `STRIPE_WEBHOOK_SECRET`). Handles `checkout.session.completed` and `checkout.session.async_payment_succeeded` when `payment_status = "paid"`. Returns `500` only when the ledger write fails, so Stripe retries.

### Standard Error Envelope
```json
{ "error": { "code": "UNAUTHENTICATED|FORBIDDEN|NOT_FOUND|INVALID_INPUT|INSUFFICIENT_TOKENS|UPSTREAM_FAILURE|INTERNAL", "message": "string" } }
```

## 6. Redistributive Ledger & Equity Partners

### `EquityPartner` (`system_config/global.equityPartners` or `equity_partners/{partnerId}`)
| Field | Type | Rules |
|---|---|---|
| `partnerId` | string | Unique partner identifier |
| `name` | string | Optional partner name / display label, max 100 (defaults to email username) |
| `email` | string | Partner email address (required), RFC format |
| `percentage` | number | Percentage share (0.01 - 100), total across all active partners <= 100% |
| `notes` | string | Optional description or account reference, max 500 |
| `status` | enum | `"active" | "inactive"` |
| `createdAt` | ISO-8601 | Creation date |
| `claimedTokens` | integer | Cumulative tokens claimed/cleared via Individual Reset (Strict integer) |
| `claimedAudCents` | integer | Cumulative AUD cents claimed/cleared via Individual Reset |
| `claimedUsdCents` | integer | Cumulative USD cents claimed/cleared via Individual Reset |
| `lastResetAt` | ISO-8601 | optional, timestamp of last reset to 0 tokens |
| `lastResetBy` | string | optional, email of admin who performed the reset |

### `StripePurchaseRecord` (`stripe_purchases/{purchaseId}`)
| Field | Type | Rules |
|---|---|---|
| `purchaseId` | string | Stripe Checkout Session id |
| `uid` | string | Buyer User ID |
| `email` | string | Optional buyer email |
| `packId` | string | Token pack id purchased |
| `tokens` | integer | Tokens purchased (positive integer) |
| `amountCents` | integer | Amount paid in cents (AUD/USD) |
| `currency` | string | `"aud" | "usd"` |
| `createdAt` | ISO-8601 | |

### Redistributive Calculation Rules
- **Total Tokens Pool**: Sum of `tokens` across all recorded Stripe purchases (`totalTokens`). Strict integers only (`Math.round`).
- **Total Revenue Pool (Dual Currency)**:
  - `totalGrossAudCents`: Sum of all Stripe purchases in AUD cents (USD amounts converted at standard FX `0.65`).
  - `totalGrossUsdCents`: Sum of all Stripe purchases in USD cents (AUD amounts converted at standard FX `0.65`).
- **Partner Entitlement**:
  - `grossTokens = Math.round(totalTokens * (percentage / 100))` (Strict integer)
  - `ownedTokens = Math.max(0, grossTokens - (claimedTokens || 0))` (Strict integer)
  - `ownedAudCents = Math.max(0, Math.round(totalGrossAudCents * (percentage / 100)) - (claimedAudCents || 0))`
  - `ownedUsdCents = Math.max(0, Math.round(totalGrossUsdCents * (percentage / 100)) - (claimedUsdCents || 0))`
- **Individual Partner Refresh to 0 Tokens (`PUT /api/admin/config` action `RESET_PARTNER_TOKENS`)**:
  - Sets `claimedTokens = grossTokens`, `claimedAudCents = grossAudCents`, `claimedUsdCents = grossUsdCents`, `lastResetAt = now`, `lastResetBy = caller.email`.
  - Resets that partner's row in `Owner Redistribution Breakdown` to `⚡ 0` tokens.
  - Also resets the partner's user wallet balance in `users/{uid}` to 0 tokens (if registered) and logs `ADMIN_RESET` in `token_transactions`.
  - Requires two-step UI confirmation (`reset-partner-tokens-{partnerId}` -> `confirm-reset-partner-{partnerId}`).
- **Treasury Retained**:
  - `treasuryPercentage = 100% - sum(active partners percentage)`.
  - `treasuryTokens = Math.round(totalTokens * (treasuryPercentage / 100))`
  - `treasuryAudCents = Math.round(totalGrossAudCents * (treasuryPercentage / 100))`
  - `treasuryUsdCents = Math.round(totalGrossUsdCents * (treasuryPercentage / 100))`

## 7. Admin Messaging (7-Year Plain Text Retention)

### `AdminMessage` (`admin_messages/{messageId}`)
| Field | Type | Rules |
|---|---|---|
| `messageId` | string | Unique message identifier |
| `uid` | string | Sender user ID |
| `senderEmail` | string | Sender email |
| `recipientEmail` | string | optional, Recipient email (for Superadmin messaging anyone or targeted notifications) |
| `recipientUid` | string | optional, Recipient user ID |
| `direction` | enum | `"user_to_admin" \| "admin_to_user"`, default `"user_to_admin"` |
| `subject` | string | Message subject, max 150 chars. Plain text only, strictly NO URLs or upload links. |
| `body` | string | Plain text message body, max 10000 chars. **STRICTLY PLAIN TEXT ONLY: NO ATTACHMENTS, NO UPLOAD LINKS, NO URLS**. |
| `status` | enum | `"unread" \| "read" \| "archived"` |
| `createdAt` | ISO-8601 | Date message sent |
| `retentionUntil` | ISO-8601 | **Strict 7-year statutory compliance date** (`createdAt + 7 years`). Messages are preserved for 7 years in database backup. |

### Statutory Compliance & Anti-Tamper Policies
- **Plain Text Only:** Zero HTML tags and zero links/URLs (`https?://`, `ftp://`, `www.`, `data:`, markdown `[text](url)`). Any message containing links or upload URLs is rejected.
- **7-Year Retention:** All messages are indexed with an immutable `retentionUntil` set 7 years from creation.
- **Superadmin Authority:** Superadmin can message **anyone** (any email or registered user).

### `POST /api/contact`
Body: `{ "subject": "string (1-150)", "body": "string (1-10000)" }`.
Requires authenticated user. Validates plain text only, rejects file upload links & URLs, sets `retentionUntil = now + 7 years`, sets `direction = "user_to_admin"`.

### `GET /api/contact`
Requires authenticated user. Returns messages where caller is either sender (`uid == caller.uid`) or recipient (`recipientEmail == caller.email` or `recipientUid == caller.uid`).

### `POST /api/admin/messages`
Body: `{ "recipientEmail": "email", "subject": "string (1-150)", "body": "string (1-10000)" }`.
Requires Admin / Superadmin. Allows Superadmin to message anyone. Validates plain text only, rejects file upload links & URLs, sets `direction = "admin_to_user"`, sets `retentionUntil = now + 7 years`.

### `PATCH /api/admin/messages`
Body: `{ "messageId": "string", "status": "unread|read|archived" }` (`additionalProperties: false`).
Requires Admin / Superadmin. Updates message status in `admin_messages/{messageId}`.

### `DELETE /api/admin/messages`
Body: `{ "messageId": "string" }` (`additionalProperties: false`).
Requires Admin / Superadmin (`verifyRequest(req, { requireRole: "admin" })`). Permanently deletes `admin_messages/{messageId}` from the Firestore database after two-step UI confirmation (`viewer-delete-message-btn` → `viewer-confirm-delete-message-btn`).

## 8. Role-Based Access Control (RBAC) Matrix (`system_config/rbac`)

### System Roles
- `superadmin`: Permanent Firebase database admin email (`davidrobertson.info@gmail.com` / `support@aifoundation.net.au`). Cannot be demoted or edited. Permanently holds all permissions.
- `admin`: Co-administrator with delegated management access.
- `moderator`: Operational manager (messages, analytics, cache inspection).
- `agency`: Advanced agency tier (multiple brands, elite searches).
- `supporter`: Default baseline tier for all authenticated users.

### Permissions List
- `view_analytics`: View global search and remix metrics
- `manage_config`: Adjust token packs, pricing, and system currencies
- `manage_ledger`: Modify redistributive equity ledger & partners
- `flush_cache`: Flush radar cache and temporary indexes
- `manage_messages`: Read, update, and archive compliance messages
- `manage_rbac`: Modify the RBAC matrix and assign user roles
- `manage_users`: Inspect registered users and adjust token balances
- `search_radar`: Execute Meta ad library intelligence searches
- `ai_remix`: Generate AI remixes using Gemini 2.5 Flash
- `manage_brands`: Create and manage brand profiles

### `RbacConfigDoc` (`system_config/rbac`)
| Field | Type | Rules |
|---|---|---|
| `matrix` | object | Mapping of role to array of granted `RbacPermission` |
| `updatedAt` | ISO-8601 | Last updated timestamp |
| `updatedBy` | string | Email of superadmin who made the change |

### Default Knowledge Base Seed Items
1. `faq_base_radar_search`: *"What is Base Radar Search?"* — *"It is the core platform search that queries the ad libraries (Meta, TikTok, and Google) for any keyword, hook, or competitor brand to find winning ad creatives and performance data."* (`category: "Radar"`, `order: 1`).
2. `faq_proven_winners`: *"What is Proven (28+d)?"* — *"In performance marketing, unprofitable ads get turned off quickly. The Proven (28+d) filter isolates ads that have run continuously for 28 days or longer across the ad libraries. This strips away short-lived split tests and noise, showing you only the high-converting, profitable creatives that brands continue to fund—ready to deconstruct and remix for your own brand."* (`category: "Radar"`, `order: 2`).
3. `faq_extended_longevity`: *"What is Extended (60+d)?"* — *"The Extended (60+d) filter uncovers rare 'evergreen' ads that have run continuously for more than two months. While most ad creatives suffer audience fatigue within weeks, 60+ day ads are high-performing flagship winners with proven, fatigue-resistant hooks and massive multi-month ad spend behind them—making them prime candidates to study and remix."* (`category: "Radar"`, `order: 3`).
4. `faq_elite_winners`: *"What is Top Winners (90%+)?* — *"Top Winners (90%+) isolates the elite top 1% of ad campaigns that score 90 out of 100 or higher on our multi-factor scoring algorithm. The score evaluates longevity, view volume, and horizontal ad set scaling (where an advertiser runs multiple duplicate collations of the same creative across massive budgets). Filtering for 90%+ gives you immediate access to category-dominating ads with unmatched conversion power."* (`category: "Radar"`, `order: 4`).
5. `faq_remix_studio`: *"What is AI Creative Remix Studio & how do I use it?"* — *"AI Creative Remix Studio deconstructs the persuasion DNA of any winning competitor ad—its 3-second hook, pacing, and emotional triggers—and remixes it specifically for your brand profile. To use it: 1. On any ad card in the Radar Feed, click 'Model this ad ⚡' to open the workbench. 2. Click 'Generate remix ✨' to generate 3 complete script variations (including scene directions, voiceover, and text overlays) ready to copy or export to CSV for your video creators."* (`category: "Radar"`, `order: 5`).
6. `faq_radar_overview`: *"What is Radar Feed?"* — Ad intelligence engine searching live ads (`category: "Radar"`, `order: 6`).
7. `faq_brands_overview`: *"What is My Brands?"* — Brand configuration for tailored AI remixes (`category: "Brands"`, `order: 7`).
8. `faq_tokens_overview`: *"How do Token Deductions Work?"* — Strict integer token ledger, 1 token standard paid rates, and refund request rules (`category: "General"`, `order: 8`).

### Header & Superadmin Integration
- **Header FAQs Button:** Displays in top desktop navigation and mobile user account menu. Opens the user-facing `FaqModal` featuring live search, categorized chips, and expandable accordion items.
- **Superadmin FAQ Development Suite:** Accessible directly from the Super Admin Panel (`SuperAdminModal` tab `FAQS`) and via the highlighted "FAQ Development Suite" action in `FaqModal` for superadmins. Supports real-time Q&A authoring, live inline editing, priority ordering, draft visibility toggling, and confirmation-protected deletion.

### API Endpoints
- `GET /api/admin/rbac`: Requires `superadmin` role. Returns matrix, all permissions, roles, and user list.
- `PUT /api/admin/rbac`: Requires `superadmin` role.
  - Action `UPDATE_ROLE_PERMISSIONS`: `{ "action": "UPDATE_ROLE_PERMISSIONS", "role": "admin"|"moderator"|"agency"|"supporter", "permissions": RbacPermission[] }`
  - Action `ASSIGN_USER_ROLE`: `{ "action": "ASSIGN_USER_ROLE", "email": "valid-email", "role": "admin"|"moderator"|"agency"|"supporter" }`

## 9. Frequently Asked Questions (FAQs) (`system_config/faqs`)

### `FaqItem`
| Field | Type | Rules |
|---|---|---|
| `faqId` | string | `^[A-Za-z0-9_-]{1,64}$` |
| `question` | string | Question text, max 200 chars |
| `answer` | string | Answer text, max 2000 chars |
| `category` | string | Category label (e.g. "Brands", "Radar", "General") |
| `order` | integer | Display sorting integer |
| `enabled` | boolean | Toggle whether shown to users |
| `createdAt` | ISO-8601 | Creation timestamp |
| `updatedAt` | ISO-8601 | Last updated timestamp |

### Default Knowledge Base Seed Items
1. `faq_base_radar_search`: *"What is Base Radar Search?"* — *"It is the core platform search that queries the ad libraries (Meta, TikTok, and Google) for any keyword, hook, or competitor brand to find winning ad creatives and performance data."* (`category: "Radar"`, `order: 1`).
2. `faq_proven_winners`: *"What is Proven (28+d)?"* — *"In performance marketing, unprofitable ads get turned off quickly. The Proven (28+d) filter isolates ads that have run continuously for 28 days or longer across the ad libraries. This strips away short-lived split tests and noise, showing you only the high-converting, profitable creatives that brands continue to fund—ready to deconstruct and remix for your own brand."* (`category: "Radar"`, `order: 2`).
3. `faq_extended_longevity`: *"What is Extended (60+d)?"* — *"The Extended (60+d) filter uncovers rare 'evergreen' ads that have run continuously for more than two months. While most ad creatives suffer audience fatigue within weeks, 60+ day ads are high-performing flagship winners with proven, fatigue-resistant hooks and massive multi-month ad spend behind them—making them prime candidates to study and remix."* (`category: "Radar"`, `order: 3`).
4. `faq_elite_winners`: *"What is Top Winners (90%+)?* — *"Top Winners (90%+) isolates the elite top 1% of ad campaigns that score 90 out of 100 or higher on our multi-factor scoring algorithm. The score evaluates longevity, view volume, and horizontal ad set scaling (where an advertiser runs multiple duplicate collations of the same creative across massive budgets). Filtering for 90%+ gives you immediate access to category-dominating ads with unmatched conversion power."* (`category: "Radar"`, `order: 4`).
5. `faq_remix_studio`: *"What is AI Creative Remix Studio & how do I use it?"* — *"AI Creative Remix Studio deconstructs the persuasion DNA of any winning competitor ad—its 3-second hook, pacing, and emotional triggers—and remixes it specifically for your brand profile. To use it: 1. On any ad card in the Radar Feed, click 'Model this ad ⚡' to open the workbench. 2. Click 'Generate remix ✨' to generate 3 complete script variations (including scene directions, voiceover, and text overlays) ready to copy or export to CSV for your video creators."* (`category: "Radar"`, `order: 5`).
6. `faq_radar_overview`: *"What is Radar Feed?"* — Ad intelligence engine searching live ads (`category: "Radar"`, `order: 6`).
7. `faq_brands_overview`: *"What is My Brands?"* — Brand configuration for tailored AI remixes (`category: "Brands"`, `order: 7`).
8. `faq_tokens_overview`: *"How do Token Deductions Work?"* — Strict integer token ledger, 1 token standard paid rates, and refund request rules (`category: "General"`, `order: 8`).

### Header & Superadmin Integration
- **Header FAQs Button:** Displays in top desktop navigation and mobile user account menu. Opens the user-facing `FaqModal` featuring live search, categorized chips, and expandable accordion items.
- **Superadmin FAQ Development Suite:** Accessible directly from the Super Admin Panel (`SuperAdminModal` tab `FAQS`) and via the highlighted "FAQ Development Suite" action in `FaqModal` for superadmins. Supports real-time Q&A authoring, live inline editing, priority ordering, draft visibility toggling, and confirmation-protected deletion.

### API Endpoints
- `GET /api/faqs`: Open to all authenticated users. Returns enabled FAQs sorted by `order`.
- `GET /api/admin/faqs`: Requires `superadmin` role. Returns all FAQs (including disabled).
- `POST /api/admin/faqs`: Requires `superadmin` role. Creates a new FAQ item.
- `PUT /api/admin/faqs`: Requires `superadmin` role. Updates an existing FAQ item.
- `DELETE /api/admin/faqs`: Requires `superadmin` role. Deletes a FAQ item (requires confirmation).

## 10. Platform Governance, Footer & Geolocation

### Mandatory Footer Elements
- **Copyright Button:** Interactive link button `2026 AI Foundation` navigating to `https://aifoundation.net.au/` (new tab, `rel="noopener noreferrer"`) with `· All rights reserved.`
- **Founder Welcome:** David Robertson welcome briefing detailing democratic access and redistributive token economics.
- **Privacy Policy:** Australian Privacy Principles (APPs) and Privacy Act 1988 (Cth) compliance, 7-year statutory data retention on financial logs, zero selling of personal data.
- **Terms of Service:** Commercial contract specifying that all invoices are in Australian Dollars (AUD), the default currency is AUD, the default token price is 1 Token = AUD $1 (with product & service token amounts customizable by SuperAdmin), that the business never uses decimals, operating strictly on whole numbers, and that currency conversion can show up to 2 decimal places. Explains what tokens are: *"You exchange money for a token, tokens mean more flexible payment options, as a payment may be distributed to multiple service providers."* Specifies refund rules: all formal refund requests must be made in writing by sending a message to the Superadmin. Nations outside Australia and New Zealand view an AUD to USD currency conversion.
- **AI Policy (ISO/IEC 42001):** Artificial Intelligence Management System compliance, model ethics, bias mitigations, and human-in-the-loop oversight.
- **Security Policy (ISO/IEC 27001):** Information Security Management System standards, defense-in-depth, RBAC matrix, and encrypted storage.

### Geo, Time & Frankfurter Currency Widget Specifications
- **Display:** Embedded thin bar displaying user suburb, state, weather temperature & condition, active currency indicator chip (`AUD $1.00 / Token (AU/NZ Local Currency)`), and live real-time clock.
- **Position Preservation:** The currency indicator chip position remains strictly stationary in the footer layout.
- **Interactive Frankfurter Currency Converter Modal (`GET /api/currency`):**
  - Clicking the currency chip triggers a centered modal (`CurrencyConverterModal`) without scrollbars.
  - Queries real-time European Central Bank (ECB) AUD → USD exchange rates via the open Frankfurter API (`https://api.frankfurter.dev/v1/latest?from=AUD&to=USD` and `https://api.frankfurter.app/latest?from=AUD&to=USD`, cached 1h with fallback to 0.65).
  - Interactive conversion calculator converts user-entered Token amounts or AUD dollars into USD with 2 decimal places.
  - Quick token preset buttons: `1`, `10`, `50`, `100`, `500` tokens.
  - Invoicing & tax notice: clarifies that AI Foundation is an Australian registered business, all formal checkouts/invoices settle in AUD, Australia charges 10% GST, while New Zealand and international orders incur 0% GST.
- **Interactive Geo/Time Configuration:** Clicking the clock/configure widget opens a centered popup dialog (with no scrollbar) enabling the user to configure suburb, state/region, country, date format, and clock mode (12h / 24h).
- **Geolocation Currency Gate:** When country is Australia (`AU`) or New Zealand (`NZ`), visitors strictly view AUD prices. Visitors in all other nations view AUD prices alongside the AUD $1.00 converted to USD indicator.

## 11. Semantic Ad Search & Strict Real-Ads-Only Policy (`CACHE_VERSION = "8"`)

### Strict Real-Ads-Only & Real-Media-Only Contract
- **No Synthetic Ads or Stock Photos:** The platform strictly stores and displays genuine upstream ad creatives and genuine upstream ad media (`fbcdn.net`, `tiktokcdn.com`, `googlesyndication.com`, `gstatic.com`, `ytimg.com`, or pure `TEXT` ads when `format === "text"`) returned by Meta Ad Library, TikTok Commercial Content Library, and Google Ads Transparency Center. Synthetic/benchmark ad generation and third-party stock images (`images.unsplash.com`) are strictly prohibited.
- **Semantic Relevance Filtering (`src/lib/radar-relevance.ts`):**
  1. `resolveSearchIntent(rawQuery)` resolves category queries (e.g. `"car"`) to authoritative domains (`carsales.com.au`, `toyota.com.au`, etc.) and positive/negative collision tokens.
  2. `isRelevantGoogleAdvertiser(candidate, intent)` enforces word-boundary checks and blocks prefix collisions (such as `"Cara HO"` or `"Skin Care"` when searching `"car"`).
  3. `filterRelevantDrafts(drafts, intent)` purges off-topic upstream ads prior to scoring and Firestore caching.
- **Upstream Quota Exhaustion (`HTTP 429`):** When `SEARCHAPI_API_KEY` hits its monthly plan quota on SearchApi.io (`HTTP 429`), `runRadarSearch` serves previously cached *real* ads from Firestore `radar_cache` if available, or throws a clear `UpstreamError` in `src/lib/searchapi.ts` so `withTokenGate` automatically refunds the user's token.

## 12. Professional Customize Service & Staff AI Reply Designer (`custom-brand-strategist-reply`)

### Overview & Pricing Contract
- **Navigation & Route:** Top header and mobile navigation include `'Customize'` (`/customize`).
- **Token Fee (`customizeService`):** Default is **`45` tokens** (integer-only), configurable by SuperAdmin in the Admin Panel (`Service Pricing` tab) and enforced via `withTokenGate` (`CUSTOMIZE_SERVICE` transaction type).
- **Customer Input Contract (`CustomizeRequestInputSchema`):**
  - `brandName`: string (1..100)
  - `toneOfVoice`: `"DIRECT_RESPONSE" | "AUTHORITATIVE" | "UGC_CASUAL" | "URGENT"`
  - `productServiceDescription`: string (1..2000)
  - `targetAudienceAvatar`: string (1..2000)
  - `corePainPoints`: string[] (1..10 items, 1..300 chars each)
  - `uniqueMechanismOrOffer`: string (1..1000)
  - `destinationUrl`: https URL
  - `landingPageUrls`: https URL[] (up to 50)
  - `version`: optional string (up to 50)
  - `extraDetailsAndNotes`: string (1..2000) — extra strategic details & descriptions to think about
  - `sourceBrandId`: optional string (up to 128)
- **Routing to `SuperAdmin` and `Main Admin` (`admin` role):**
  - Submitting `/api/customize` stores `customize_requests/{requestId}`, creates an `admin_messages` entry (`requestType: "customize_request"`) visible to both `SuperAdmin` (`superadmin`) and `Main Admin` (`admin`), and immediately sends a customized confirmation message (`requestType: "customize_reply"`) to the customer's Message Panel.
- **Automated Staff AI Reply Process (`POST /api/admin/messages/ai-draft`):**
  - Implements `skills/custom-brand-strategist-reply/SKILL.md` (`src/lib/customize-ai.ts`), compatible across Gemini 2.5 Flash-Lite, Claude Haiku 4.5, and gpt-6-luna, producing a 7-year-archive-compliant plain-text 4-pillar strategy reply for staff to review and send to the customer's Message Panel.

## 13. Master Order Ledger, Token Refunds & SuperAdmin / Main Admin Token Controls (`/api/admin/orders`)

### Master Order Ledger (`TokenTransactionDocSchema`)
- **Collection:** `token_transactions/{txId}` (Firestore rules: `allow read: if ownsDoc() || isAdmin(); allow write: if false;`)
- **Transaction Types (`TokenTxTypeSchema`):**
  - `"TOPUP"` (Stripe purchase credit)
  - `"GIFT"` (SuperAdmin / Main Admin no-charge complimentary token gift)
  - `"ADMIN_DEDUCT"` (SuperAdmin / Main Admin token deduction with explicit confirmation)
  - `"ADMIN_RESET"` (SuperAdmin / Main Admin token balance reset to 0 with explicit confirmation)
  - `"RADAR_SEARCH"` (Every AdRadarHQ search order, including 0-token superadmin searches)
  - `"AI_REMIX"`
  - `"REGENERATE_VARIATIONS"`
  - `"BRAND_CLONE"`
  - `"CUSTOMIZE_SERVICE"`
  - `"REFUND"`
- **Fields (`additionalProperties: false` via `.strict()`):**
  - `txId`: string (1..128)
  - `uid`: string (1..128)
  - `email`: optional string (up to 320)
  - `type`: `TokenTxType`
  - `delta`: integer (`Math.round()`, negative for deductions, `0` for 0-token superadmin orders, positive for `TOPUP`, `GIFT`, and `REFUND`)
  - `balanceAfter`: non-negative integer
  - `idempotencyKey`: string (`^[a-zA-Z0-9_-]{8,128}$`)
  - `description`: string (1..240)
  - `refunded`: optional boolean (set to `true` when refunded by admin or system)
  - `refundTxId`: optional string (1..128)
  - `createdAt`: ISO 8601 datetime

### Order Refund Contract (`AdminRefundOrderRequestSchema`)
- **Endpoint:** `POST /api/admin/orders` (`action: "REFUND_ORDER"`)
- **Fields (`additionalProperties: false`):**
  - `action`: `"REFUND_ORDER"`
  - `txId`: string (1..128)
- **Behavior:** Requires `Confirm Refund` confirmation in UI; atomically credits `Math.abs(delta)` integer tokens back to `users/{uid}.tokenBalance`, writes a `REFUND` record in `token_transactions`, and marks the original order `refunded: true`.

### SuperAdmin & Main Admin Gift Tokens Contract (`AdminGiftTokensRequestSchema`)
- **Endpoint:** `POST /api/admin/orders` (`action: "GIFT_TOKENS"`) — authorized for `superadmin` and `admin` roles.
- **Fields (`additionalProperties: false`):**
  - `action`: `"GIFT_TOKENS"`
  - `recipientEmail`: valid email string (up to 254 chars)
  - `tokens`: positive integer (`1..1,000,000`, `Math.round()`)
  - `note`: optional string (up to 200 chars)
- **Behavior:** Credits integer tokens at `$0` charge (`type: "GIFT"`) to the recipient's wallet without creating a `stripe_purchases` revenue record.

### SuperAdmin & Main Admin Deduct Tokens Contract (`AdminDeductTokensRequestSchema`)
- **Endpoint:** `POST /api/admin/orders` (`action: "DEDUCT_TOKENS"`) — authorized for `superadmin` and `admin` roles.
- **Fields (`additionalProperties: false`):**
  - `action`: `"DEDUCT_TOKENS"`
  - `recipientEmail`: valid email string (up to 254 chars)
  - `tokens`: positive integer (`1..1,000,000`, `Math.round()`)
  - `note`: optional string (up to 200 chars)
- **Behavior:** Deducts specified integer tokens (clamped to 0 so balance never becomes negative, `type: "ADMIN_DEDUCT"`). Mandatory 2-step confirmation with explicit confirmation button required in UI.

### SuperAdmin & Main Admin Reset Tokens Contract (`AdminResetTokensRequestSchema`)
- **Endpoint:** `POST /api/admin/orders` (`action: "RESET_TOKENS"`) — authorized for `superadmin` and `admin` roles.
- **Fields (`additionalProperties: false`):**
  - `action`: `"RESET_TOKENS"`
  - `recipientEmail`: valid email string (up to 254 chars)
  - `note`: optional string (up to 200 chars)
- **Behavior:** Clears the user's token balance completely to `0` (`delta = -currentBalance`, `type: "ADMIN_RESET"`). Mandatory 2-step confirmation with explicit confirmation button required in UI before execution.

### SuperAdmin & Main Admin Reset Redistributive Ledger Contract (`AdminResetRedistributiveLedgerRequestSchema`)
- **Endpoint:** `PUT /api/admin/config` (`action: "RESET_REDISTRIBUTIVE_LEDGER"`) — authorized for `superadmin` and `admin` roles.
- **Fields (`additionalProperties: false`):**
  - `action`: `"RESET_REDISTRIBUTIVE_LEDGER"`
- **Behavior:** Safely archives all active records from `stripe_purchases` into `archived_stripe_purchases` (with `archivedAt` timestamp and admin UID) and clears `stripe_purchases`. Resets Total Tokens, Sum Amount (AUD), Sum Amount (USD), transaction count, and partner distribution amounts completely to `0`. Mandatory 2-step confirmation with explicit confirmation button required in UI before execution.

## 14. Permanent Supporter Role, Human-Readable Search Recording & Supporter Admin Panel

### Permanent Supporter Role
- **First-Time Login Assignment:** When a user logs in for the first time, they are permanently assigned `role: "supporter"` (tier: `"supporter"`). They remain supporters indefinitely across all sessions unless granted `superadmin` / `admin` authority.
- **Authority Scope:** Supporters have full access to Radar Search, Remix Studio, Brand Cards, Token Wallet, Customize Service, Message Super Admin, and their own **Supporter Admin Panel**.

### Database Search Recording (`type: "RADAR_SEARCH"`)
- **Collection:** `token_transactions/{txId}`
- **Logging Trigger:** Every search executed on Meta Ad Library, TikTok Creative Center, or Google Ads Transparency Center is recorded atomically via `withTokenGate`.
- **Human-Readable Query Description:** The `referenceId` field stores the descriptive search metadata rather than an opaque hash, e.g.:
  `${platform} Search: "${query}" (${country}${provenWinnersOnly ? ", 28+d" : ""})`
- **Zero-Token Tracking:** Even searches conducted at 0 tokens (e.g. when `searchStandard === 0` or executed by admins) are recorded with `delta: 0` so supporters have a complete historical search log.

### Supporter Admin Panel (`SupporterModal`)
- **Trigger:** Accessible from the top-navigation Account Menu via the "Supporter Admin Panel" button (`data-testid="open-supporter-button"`).
- **Navigation & Architectural Structure (Strictly 3 tabs: Tokens, Buy More Tokens, Messages, only):**
  1. **Tokens (`TOKENS`):**
     - Live integer token balance card (`1 Token = $1.00 AUD` default rate, non-expiring, integer economy).
     - Direct "Buy More Tokens" action button.
     - Chronological activity & search ledger from `token_transactions` (query details, country code, longevity filter, tokens deducted/credited, balance after, delivery status).
     - Search and platform filters (`ALL`, `META`, `TIKTOK`, `GOOGLE`, and action types).
  2. **Buy More Tokens (`BUY_TOKENS`):**
     - Embedded token pack catalog (`PACK_10`, `PACK_50`, `PACK_100`, `PACK_CUSTOM`) powered by Stripe Checkout.
     - AUD platform pricing with USD indicative estimate for non-AU/NZ supporters.
     - Statutory Australian Consumer Law 100% money-back guarantee.
  3. **Messages (`MESSAGES`):**
     - Direct communications and message history with Super Admin (`/api/contact`).
     - Plain-text message composer (subject, body, 0 tokens / free).
     - Statutory 7-year compliance archive and customized strategy deliverable replies.

### Global FAQ & Navigation Rules
- **Universal Top Header FAQ:**
  - "FAQs" is permanently and unconditionally rendered at the top of the header navigation across all viewports (desktop nav button and mobile header action button) and in the Account Menu for all user states (unauthenticated, supporter, main admin, super admin).
- **For all admin roles (`superadmin`, `admin`):**
  - Admins can open FAQs directly from the top header or manage full FAQ CRUD via the `FAQ Development` tab in the Admin Panel.
  - "Message Super Admin" is accessed strictly behind the Admin Panel (`User Messages` tab).
- **For supporters (`supporter`):**
  - The Account Menu provides single-click access to the Supporter Admin Panel containing Tokens, Buy More Tokens, and Messages only.

## 15. Main Admin Authority Scope & Superadmin Multi-Role View Simulation

### Main Admin Panel (`role === "admin"`)
- **Permitted Admin Tabs (Strictly 5 Tabs):**
  1. `CURRENCY` (Currency Controls: `isTokenSystemEnabled`, `isAudEnabled`, `isUsdEnabled`, `audToUsdRate`, `baseTokenRateAudCents`)
  2. `PRICING` (Service Pricing: integer token fees across all 7 platform actions)
  3. `PACKS` (Token Packs: `PACK_10`, `PACK_50`, `PACK_100` integer pricing)
  4. `MESSAGES` (User Messages: customer threads, 45-token Customize briefs, and AI Strategy Reply Designer)
  5. `FAQS` (FAQ Development: full CRUD over `system_config/faqs` via `/api/admin/faqs` with `requireRole: "admin"`)
- **Restricted SuperAdmin Exclusive Privileges:**
  - `LEDGER` (Redistributive Pool, Master Order Ledger, Token Refunds, SuperAdmin Gift Tokens)
  - `RBAC` (Role-Based Access Control matrix mutations & user tier assignments)
  - `DIAGNOSTICS` (Developer Diagnostics & system health telemetry)

### Superadmin Multi-Role View Simulation (`actingAsRole`)
- **State Contract (`SessionValue` in `src/components/auth/SessionProvider.tsx`):**
  - `isActualSuperadmin`: boolean (`true` strictly when authenticated user holds `superadmin` authority)
  - `actingAsRole`: `"superadmin" | "admin" | "supporter" | null`
  - `setActingRole(role)`: switches active UI role, permissions, navigation bar, and admin modal view in real time
  - `resetRole()`: immediately restores `superadmin` authority and clears simulation state
- **DOM Automation Bindings:**
  - `data-testid="act-as-role-superadmin"`, `data-testid="act-as-role-admin"`, `data-testid="act-as-role-supporter"`
  - `data-testid="acting-as-banner"`, `data-testid="reset-acting-role-button"`

## 16. 100% DOM Automation & Website User Assistant Contract (`window.__AD_RADAR_AGENT__`)

### 16.1 Universal Interactive Element Contract
- Every interactive element (`<button>`, `<a href>`, `<input>`, `<select>`, `<textarea>`, `[role="button"]`, `[role="tab"]`, `[role="radio"]`, `[role="switch"]`) across the application carries:
  - `data-agent-id`: Deterministic automation selector ID.
  - `data-testid`: Matching test selector ID.
  - `aria-label` (or `aria-labelledby`): Accessible label describing the element's purpose.
- `<AgentDomBridge />` (`src/components/agent/AgentDomBridge.tsx`) renders a non-visual `<script id="ad-radar-agent-manifest" type="application/json">` tag and maintains a runtime `MutationObserver` that guarantees any dynamically mounted modal or popover interactive element has synchronized `data-agent-id`, `data-testid`, and `aria-label` attributes with zero visual UI impact.

### 16.2 AI Assistant Slot-Filling & DOM Execution Engine (`src/lib/dom-agent-bridge.ts`)
- **Supported `AgentTaskId` Workflows:**
  1. `SEARCH_ADS`: Requires `query` (2–100 chars); optional `platform`, `country`, `mediaType`, `provenWinnersOnly`, `extendedLongevity`, `eliteWinnersOnly`.
  2. `MODEL_AND_REMIX_AD`: Requires `adId`.
  3. `CREATE_BRAND`: Requires `brandName`, `productServiceDescription`, `targetAudienceAvatar`, `corePainPoints`, `uniqueMechanismOrOffer`, `destinationUrl`; optional `toneOfVoice`.
  4. `SWITCH_ACTIVE_BRAND`: Requires `brandId`.
  5. `DUPLICATE_BRAND`: Requires `brandId`, `versionName`.
  6. `CLONE_GLOBAL_BRAND`: Requires `globalBrandId`.
  7. `DELETE_BRAND`: Requires `brandId` and explicit `userConfirmedDelete: true` (mandatory 2-step confirmation).
  8. `SUBMIT_CUSTOMIZE_BRIEF`: Requires `brandName`, `productServiceDescription`, `targetAudienceAvatar`, `corePainPoints`, `uniqueMechanismOrOffer`, `destinationUrl`, `extraDetailsAndNotes`.
  9. `BUY_TOKEN_PACK`: Requires `packId` (`PACK_10` | `PACK_50` | `PACK_100` | `PACK_CUSTOM`) and integer `customTokens` when `PACK_CUSTOM`.
  10. `SEND_SUPERADMIN_MESSAGE`: Requires plain-text `subject` and `body` (no external URLs/links).
  11. `SEARCH_FAQS`: Optional `searchQuery`.
  12. `CONFIGURE_GEO_TIME`: Requires `suburb`, `state`; optional `country`, `timeFormat`.
- **Pre-Check & Post-Mutation Verification:**
  - `preCheckElement(agentId)` and `waitForLayoutStability(agentId)` verify DOM presence, non-zero bounding box, computed visibility, enabled state, and two-frame layout stability before any click or fill.
  - `click(agentId)` and `fill(agentId, value)` verify post-action DOM mutation (`MutationObserver` + React-controlled value verification).

## 17. Monthly Search Subscription Contract (SuperAdmin & MainAdmin)

### 17.1 Subscription Specification
- **Allowance:** 1,000 monthly searches (1,000 tokens/month).
- **Pricing:** AUD $500/month default (50,000 AUD cents). Zero decimal places for platform AUD pricing.
- **Value Proposition:** Options for every search: Every option is one token. This gives you 1,000 of those (e.g. 1,000 base searches, or combinations of Proven winners, Extended days, Top winners, and AI remix tokens). Can also be used to pay for Customize your Brand Strategy with Professional Experts.
- **SuperAdmin & MainAdmin Exclusive:**
  - Only visible and accessible when `role === "superadmin"` or `role === "admin"`.
  - Only advertised strictly next to "FAQs" in the top header (`TopNavWallet.tsx` desktop nav and mobile header) and inside the Admin FAQ panel.
  - The monthly AUD price can be changed at any time through the SuperAdmin / MainAdmin panel under the "PRICING" tab with instant debounced Firestore synchronization (`system_config/global.monthlySubscription.priceAud`).

### 17.2 Schema & State Contract
```json
{
  "monthlySubscription": {
    "enabled": true,
    "priceAud": 500,
    "searchesPerMonth": 1000,
    "name": "Monthly Search Subscription",
    "description": "1,000 monthly searches for AUD $500/month. Options for every search: Every option is one token. This gives you 1,000 of those."
  }
}
```

### 17.3 Interactive DOM Bindings
- `data-agent-id="nav-link-subscription"`, `data-testid="nav-link-subscription"`
- `data-agent-id="mobile-header-subscription"`, `data-testid="mobile-header-subscription"`
- `data-agent-id="monthly-subscription-modal"`, `data-testid="monthly-subscription-modal"`
- `data-agent-id="subscribe-monthly-button"`, `data-testid="subscribe-monthly-button"`
- `data-agent-id="admin-grant-subscription-button"`, `data-testid="admin-grant-subscription-button"`
- `data-agent-id="sub-price-input"`, `data-testid="sub-price-input"`
- `data-agent-id="sub-option-base-search"`, `data-testid="sub-option-base-search"`, `data-agent-id="sub-tooltip-base-search"`
- `data-agent-id="sub-option-proven-winners"`, `data-testid="sub-option-proven-winners"`, `data-agent-id="sub-tooltip-proven-winners"`
- `data-agent-id="sub-option-extended-days"`, `data-testid="sub-option-extended-days"`, `data-agent-id="sub-tooltip-extended-days"`
- `data-agent-id="sub-option-top-winners"`, `data-testid="sub-option-top-winners"`, `data-agent-id="sub-tooltip-top-winners"`
- `data-agent-id="sub-option-ai-remix"`, `data-testid="sub-option-ai-remix"`, `data-agent-id="sub-tooltip-ai-remix"`
- `data-agent-id="sub-option-regenerate-variations"`, `data-testid="sub-option-regenerate-variations"`, `data-agent-id="sub-tooltip-regenerate-variations"`
- `data-agent-id="sub-option-customize-strategy"`, `data-testid="sub-option-customize-strategy"`, `data-agent-id="sub-tooltip-customize-strategy"`

## 18. Stripe Sandbox AUD Payments (Native Automatic Tax & Exclusive GST) & Subscription Fulfillment Contract

### 18.1 Zero Pre-Created Stripe Products & Native Automatic Stripe Tax
- **No Static Stripe Products:** All Checkout Sessions use dynamic inline `price_data` and `product_data` so SuperAdmin and MainAdmin price/token modifications in `system_config/global` apply immediately without creating or editing products in the Stripe Dashboard.
- **Currency & Tax Invariant:** Strictly settled in Australian Dollars (`currency: "aud"`).
- **Native Automatic Stripe Tax (`automatic_tax: { enabled: true }`, `tax_behavior: "exclusive"`):**
  - Stripe automatically calculates and adds 10% Australian GST for Australian buyers (`country === "AU"`).
  - New Zealand (`NZ`) has no GST. All buyers outside Australia (including New Zealand and international) pay $0 tax.
  - Zero manual `tax_rates` (`txr_...`) or `ensureAuGstTaxRateId` logic.
- **Two Payment Modes:**
  1. **Buy Tokens (`PACK_10`, `PACK_50`, `PACK_100`, `PACK_CUSTOM`):**
     - `mode: "payment"`, `invoice_creation: { enabled: true }`, `automatic_tax: { enabled: true }`
     - `price_data`: `{ currency: "aud", tax_behavior: "exclusive", unit_amount: pack.priceCents, product_data: { name, description } }`
     - Upon payment confirmation, the purchased integer tokens are atomically distributed to `users/{uid}.tokenBalance` and logged in `token_transactions/{sessionId}` and `stripe_purchases/{sessionId}`.
  2. **Buy Monthly Search Subscription (`SUB_MONTHLY_1000`):**
     - `mode: "subscription"`, `automatic_tax: { enabled: true }`
     - `price_data`: `{ currency: "aud", tax_behavior: "exclusive", unit_amount: pack.priceCents, recurring: { interval: "month" }, product_data: { name: "Monthly Search Subscription", description } }`
     - Upon payment confirmation, the subscription starts (`subscriptionStatus: "active"`, `stripeSubscriptionId`, `subscriptionTokensPerMonth: 1000`) and 1,000 tokens are atomically distributed to `users/{uid}.tokenBalance`.

### 18.2 Direct Session Confirmation Endpoint (`POST /api/wallet/confirm`)
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "ConfirmCheckoutSessionRequest",
  "type": "object",
  "additionalProperties": false,
  "required": ["sessionId"],
  "properties": {
    "sessionId": {
      "type": "string",
      "pattern": "^cs_(test|live)_[A-Za-z0-9_]+$"
    }
  }
}
```
- **Idempotency Guarantee:** Both `POST /api/wallet/confirm` (triggered on return to `/wallet?checkout=success&session_id={CHECKOUT_SESSION_ID}`) and `POST /api/webhooks/stripe` (`checkout.session.completed`, `checkout.session.async_payment_succeeded`, `invoice.paid`) share `fulfillCheckoutSession(session)` with deterministic `txId = session.id`, preventing any possibility of double-crediting.

## 19. Dual-Engine TikTok Top-Performing Ads & `tiktok-viral-ad-intelligence` Skill Contract (`CACHE_VERSION = "9"`)

### 19.1 Dual-Engine Ingestion (`src/lib/tiktok-topads.ts` & `src/lib/radar.ts`)
- **Engine 1 — TikTok Creative Center Top Ads (`fetchTikTokCreativeCenterTopAds`):**
  - Connects to `https://ads.tiktok.com/business/creativecenter/inspiration/topads/` via Apify REST API (`APIFY_API_TOKEN` + `APIFY_TIKTOK_TOPADS_ACTOR_ID`) or custom endpoint (`TIKTOK_CREATIVE_CENTER_API_URL`).
  - Supports native global countries (`AU`, `NZ`, `US`, `CA`, `GB`), CTR percentile badges (`Top 1% CTR`, `Top 5% CTR`), campaign objectives (`Conversions`, `Product Sales`), and verified engagement (`totalLikes`, `totalViews`).
  - Gracefully returns `[]` when no optional token is configured, ensuring zero-config reliability.
- **Engine 2 — TikTok Commercial Content Library (`searchApi("tiktok_ads_library")`):**
  - Multi-pass query strategy: Pass 1 queries exact quoted phrase `"${cleanQuery}"` sorted by `unique_users_seen_high_to_low` (up to 4 pages); Pass 2 supplements with unquoted keywords when Pass 1 yields fewer than 30 raw ads.
  - Enriches every TikTok ad with extracted/inferred `headline` (`buildTikTokHeadline`), `ctaText` (`inferTikTokCta`), UGC format classification (`detectTikTokUgcFormat`), `landingPageUrl`, and calibrated `totalLikes`.

### 19.2 4-Pillar TikTok Viral Winner Matrix (`src/lib/radar-matrix.ts`)
- **View Velocity (`viewsPerDay`):** `Math.round(totalViews / Math.max(1, activeDaysCount))` awards up to `+15` scale points to high-velocity breakout ads alongside evergreen longevity (`28+d`, `60+d`, `90+d`).
- **Universal Hook & UGC Evaluation:** Evaluates 9 direct-response and TikTok UGC pattern groups across both brand-scoped and unbranded searches.
- **Skill Specification:** Documented in [`skills/tiktok-viral-ad-intelligence/SKILL.md`](skills/tiktok-viral-ad-intelligence/SKILL.md) with strict `additionalProperties: false` schemas compatible with Gemini 2.5 Flash-Lite, Claude Haiku 4.5, and gpt-6-luna.

## 20. FAQ & Website Sentence RAG Corpus + Multilingual Google Translator with Human Edit (`/api/rag`, `/api/rag/translate`)

### 20.1 RAG Sentence Item Schema (`RagSentenceItemSchema`)
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "RagSentenceItem",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "ragId",
    "sourceType",
    "section",
    "originalText",
    "languageCode",
    "languageName",
    "translatedText",
    "keywords",
    "isHumanVerified",
    "contributorEmail",
    "createdAt",
    "updatedAt"
  ],
  "properties": {
    "ragId": { "type": "string", "minLength": 1, "maxLength": 128 },
    "sourceType": {
      "type": "string",
      "enum": ["FAQ", "WEBSITE_UI", "RADAR_SEARCH", "AI_REMIX", "CUSTOMIZE_AI"]
    },
    "sourceId": { "type": "string", "maxLength": 128 },
    "section": { "type": "string", "minLength": 1, "maxLength": 120 },
    "originalText": { "type": "string", "minLength": 1, "maxLength": 4000 },
    "question": { "type": "string", "maxLength": 500 },
    "answer": { "type": "string", "maxLength": 4000 },
    "languageCode": { "type": "string", "minLength": 2, "maxLength": 16, "default": "en" },
    "languageName": { "type": "string", "minLength": 1, "maxLength": 64, "default": "English" },
    "translatedQuestion": { "type": "string", "maxLength": 500 },
    "translatedText": { "type": "string", "minLength": 1, "maxLength": 4000 },
    "keywords": {
      "type": "array",
      "maxItems": 40,
      "items": { "type": "string", "maxLength": 64 }
    },
    "isHumanVerified": { "type": "boolean", "default": true },
    "contributorEmail": { "type": "string", "maxLength": 254 },
    "createdAt": { "type": "string", "format": "date-time" },
    "updatedAt": { "type": "string", "format": "date-time" }
  }
}
```

### 20.2 Instant Google Translate Request Schema (`POST /api/rag/translate`)
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "GoogleTranslateRequest",
  "type": "object",
  "additionalProperties": false,
  "required": ["text", "targetLang"],
  "properties": {
    "text": { "type": "string", "minLength": 1, "maxLength": 4000 },
    "question": { "type": "string", "maxLength": 500 },
    "sourceLang": { "type": "string", "minLength": 2, "maxLength": 16, "default": "en" },
    "targetLang": { "type": "string", "minLength": 2, "maxLength": 16 }
  }
}
```
- **Human-in-the-Loop Gate:** `POST /api/rag/translate` translates via Google Translator and returns draft text for human review. Only after the user or admin edits/approves the text in the Human Edit fields does `POST /api/rag` persist the verified entry to Firestore `system_config/rag_corpus` (`isHumanVerified: true`).

