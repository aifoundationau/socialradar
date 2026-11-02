# Ad Radar Data Contracts

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
- **Superadmin Authority:** Strictly restricted to the Firebase database admin email (`davidrobertson.info@gmail.com` / `support@aifoundation.net.au` or configured via `FIREBASE_DATABASE_ADMIN_EMAIL`).
- **Supporter Level (Default):** All other users start at supporter level `{ "role": "supporter", "tier": "supporter", "isSuperAdmin": false, "admin": false }`.
- Missing/unassigned claims automatically fall back to `{ role: "supporter", tier: "supporter" }`.
- UI displays a "Super Admin" badge for database admins and a "Supporter" badge for all standard users.
- The Super Admin Panel is strictly visible and accessible only to the database admin. Non-admin users are provided with the "Message Super Admin" modal.

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
- **Platform Search Volume & Quality Normalization (`CACHE_VERSION = "7"`, `MAX_RESULTS = 100`, `PAGE_SIZE = 18`):**
  - **Semantic Ad Search & Relevance Engine (`src/lib/radar-relevance.ts` & `skills/semantic-ad-search-relevance/SKILL.md`):**
    1. *Intent-to-Domain & Vertical Taxonomy Resolver:* Maps generic category queries (e.g., `"car"`, `"running shoes"`, `"skincare"`, `"pet food"`, `"horse"`) to authoritative category domains (such as `carsales.com.au`, `toyota.com.au`, `mazda.com.au`, `drive.com.au` for `"car"`).
    2. *Word-Boundary & Prefix Collision Guard:* Blocks false-positive substring matches on Google advertiser lookups (e.g., blocking `"Cara HO"`, `"Care"`, `"Skincare"`, `"CeraVe"`, `"Carpet"` when searching `"car"`).
    3. *Post-Fetch Semantic Ad Gate:* Purges any off-topic ads matching negative collision patterns before ranking and caching.
    4. *Single-Call Credit Saver & Zero-Downtime Fallback:* Uses 1 SearchApi credit per search and automatically recovers via category-verified Firestore cache + benchmark ads if upstream SearchApi credits are exhausted (`HTTP 429`).
  - **Meta:** Follows `pagination.next_page_token` up to 3 pages (~60–100 ads per search).
  - **TikTok:** Uses exact-phrase quoted keyword queries (`"..."`, with unquoted fallback) so `sort_by: "unique_users_seen_high_to_low"` surfaces high-reach commercial ads across up to 4 pages, defaults non-European English markets (`AU`, `US`, `CA`, `NZ`) to `GB`, maps `estimated_audience_max` to `totalViews`, and collates duplicate ad variations from the same advertiser.
  - **Google:** Fetches up to 100 creatives (`num: "100"`, plus page 2 fallback) across verified category domains or word-boundary-validated advertiser IDs, extracts `c.image.link` into `mediaUrls` and `thumbnailUrl` for Image/Video ads, and preserves pure Text ads as `TEXT`.
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
{ "packId": "PACK_10|PACK_50|PACK_100|PACK_CUSTOM", "customTokens": 25 }
```
`customTokens` is required when `packId` is `"PACK_CUSTOM"` (integer $\ge 1$). Requires `x-idempotency-key` (reused as the Stripe idempotency key). Returns `{ "url": "https://checkout.stripe.com/..." }`.

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
| `createdAt` | ISO-8601 | |

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
  - `ownedTokens = Math.round(totalTokens * (percentage / 100))` (Strict integer)
  - `ownedAudCents = Math.round(totalGrossAudCents * (percentage / 100))`
  - `ownedUsdCents = Math.round(totalGrossUsdCents * (percentage / 100))`
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
| `body` | string | Plain text message body, max 2000 chars. **STRICTLY PLAIN TEXT ONLY: NO ATTACHMENTS, NO UPLOAD LINKS, NO URLS**. |
| `status` | enum | `"unread" \| "read" \| "archived"` |
| `createdAt` | ISO-8601 | Date message sent |
| `retentionUntil` | ISO-8601 | **Strict 7-year statutory compliance date** (`createdAt + 7 years`). Messages are preserved for 7 years in database backup. |

### Statutory Compliance & Anti-Tamper Policies
- **Plain Text Only:** Zero HTML tags and zero links/URLs (`https?://`, `ftp://`, `www.`, `data:`, markdown `[text](url)`). Any message containing links or upload URLs is rejected.
- **7-Year Retention:** All messages are indexed with an immutable `retentionUntil` set 7 years from creation.
- **Superadmin Authority:** Superadmin can message **anyone** (any email or registered user).

### `POST /api/contact`
Body: `{ "subject": "string (1-150)", "body": "string (1-2000)" }`.
Requires authenticated user. Validates plain text only, rejects file upload links & URLs, sets `retentionUntil = now + 7 years`, sets `direction = "user_to_admin"`.

### `GET /api/contact`
Requires authenticated user. Returns messages where caller is either sender (`uid == caller.uid`) or recipient (`recipientEmail == caller.email` or `recipientUid == caller.uid`).

### `POST /api/admin/messages`
Body: `{ "recipientEmail": "email", "subject": "string (1-150)", "body": "string (1-2000)" }`.
Requires Superadmin. Allows Superadmin to message anyone. Validates plain text only, rejects file upload links & URLs, sets `direction = "admin_to_user"`, sets `retentionUntil = now + 7 years`.

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
- **Copyright:** `Copyright © 2026 AI Foundation · All rights reserved.`
- **Founder Welcome:** David Robertson welcome briefing detailing democratic access and redistributive token economics.
- **Privacy Policy:** Australian Privacy Principles (APPs) and Privacy Act 1988 (Cth) compliance, 7-year statutory data retention on financial logs, zero selling of personal data.
- **Terms of Service:** Commercial contract specifying that all invoices are in Australian Dollars (AUD), the default currency is AUD, the default token price is 1 Token = AUD $1 (with product & service token amounts customizable by SuperAdmin), that the business never uses decimals, operating strictly on whole numbers, and that currency conversion can show up to 2 decimal places. Explains what tokens are: *"You exchange money for a token, tokens mean more flexible payment options, as a payment may be distributed to multiple service providers."* Specifies refund rules: all formal refund requests must be made in writing by sending a message to the Superadmin. Nations outside Australia and New Zealand view an AUD to USD currency conversion.
- **AI Policy (ISO/IEC 42001):** Artificial Intelligence Management System compliance, model ethics, bias mitigations, and human-in-the-loop oversight.
- **Security Policy (ISO/IEC 27001):** Information Security Management System standards, defense-in-depth, RBAC matrix, and encrypted storage.

### Geo & Time Widget Specifications
- **Display:** Embedded thin bar displaying user suburb, state, weather temperature & condition, active currency indicator, and live real-time clock.
- **Interactive Configuration:** Clicking the widget opens a centered popup dialog (with no scrollbar) enabling the user to configure suburb, state/region, country, date format, and clock mode (12h / 24h).
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





