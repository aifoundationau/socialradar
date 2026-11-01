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
| `type` | enum | `"TOPUP" \| "RADAR_SEARCH" \| "AI_REMIX" \| "REFUND"` |
| `delta` | integer | non-zero (e.g. `-2`, `-5`, `+100`) |
| `balanceAfter` | integer | `>= 0` |
| `referenceId` | string | queryHash, adId, stripeSessionId, or refunded txId; max 256 |
| `createdAt` | ISO-8601 | |

### Token packs (server constants, `src/lib/pricing.ts`)
One-off Stripe Checkout purchases, AUD, tokens never expire.
| Pack id | Tokens | Price |
|---|---|---|
| `PACK_100` | 100 | A$19.00 |
| `PACK_500` | 500 | A$79.00 |
| `PACK_2000` | 2000 | A$249.00 |

### `TopupMetadata` (Checkout Session `metadata`, also copied to the PaymentIntent)
| Field | Type | Rules |
|---|---|---|
| `uid` | string | same as `UserDoc.uid`; must equal the session's `client_reference_id` |
| `packId` | enum | `PACK_100 \| PACK_500 \| PACK_2000` |
| `tokens` | string | integer `1–1000000` (Stripe metadata values are strings) |

The webhook credits `tokens` to `uid` with `txId = referenceId = <Checkout Session id>`, so redelivered events are no-ops.

### Action costs (server constants, `src/lib/pricing.ts`)
| Action | Cost now | Paid price |
|---|---|---|
| `RADAR_SEARCH` | 0 (free) | 2 tokens (cache hit and miss) |
| `AI_REMIX` | 0 (free) | 5 tokens |

A cost of `0` makes the action free: the caller must still be signed in and send an idempotency key, but nothing is written to the ledger and no balance check is made.

### Superadmin Token Exemption Rule
- If the authenticated caller has custom claim `{ "role": "admin" }` (Superadmin), the effective token cost for **all actions** (`RADAR_SEARCH`, extended longevity filters, elite winner filters, and `AI_REMIX`) is strictly **0 tokens**.
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
| `highlightKeywords` | string[] | max 20, resonant keywords overlapping brand profile |
| `matrixScore` | object | optional `{ brandFitScore, hookStrengthScore, longevityScore, compositeScore, resonanceReason, totalViews, highlightKeywords }` |

- **Winning score:** `raw = activeDaysCount × 2.5 + duplicateCreativeCount × 10` (duplicates = Meta `collation_count − 1`, 0 elsewhere). Results are sorted by `raw` descending; the stored value is `min(100, round(raw))`.
- **countryCode** is the searched country, or `EU` when TikTok (whose library only covers Europe) was searched for a country outside it.
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

## 3. Brand Profile Contract (`users/{uid}/brands/{brandId}`)

| Field | Type | Rules |
|---|---|---|
| `brandId` | string | server-generated |
| `brandName` | string | 1–100 |
| `productServiceDescription` | string | 1–2000 |
| `targetAudienceAvatar` | string | 1–2000 |
| `corePainPoints` | string[] | 1–10 items, each 1–300 |
| `uniqueMechanismOrOffer` | string | 1–1000 |
| `toneOfVoice` | enum | `"DIRECT_RESPONSE" \| "AUTHORITATIVE" \| "UGC_CASUAL" \| "URGENT"` |
| `destinationUrl` | string | https URL (primary landing page) |
| `landingPageUrls` | string[] | array of https URLs, max 50 (defaults to `[destinationUrl]`) |

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
{ "packId": "PACK_100|PACK_500|PACK_2000" }
```
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
| `subject` | string | Message subject, max 150 chars |
| `body` | string | Plain text message body, max 2000 chars. **STRICTLY NO ATTACHMENTS OR FILES ALLOWED**. |
| `status` | enum | `"unread" | "read" | "archived"` |
| `createdAt` | ISO-8601 | Date message sent |
| `retentionUntil` | ISO-8601 | **Strict 7-year statutory compliance date** (`createdAt + 7 years`). Messages are preserved for 7 years in database backup. |

### `POST /api/contact`
Body: `{ "subject": "string (1-150)", "body": "string (1-2000)" }`.
Requires authenticated user. Strips HTML, validates plain text only, rejects file payloads, sets `retentionUntil = now + 7 years`.

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

### API Endpoints
- `GET /api/faqs`: Open to all authenticated users. Returns enabled FAQs sorted by `order`.
- `GET /api/admin/faqs`: Requires `superadmin` role. Returns all FAQs (including disabled).
- `POST /api/admin/faqs`: Requires `superadmin` role. Creates a new FAQ item.
- `PUT /api/admin/faqs`: Requires `superadmin` role. Updates an existing FAQ item.
- `DELETE /api/admin/faqs`: Requires `superadmin` role. Deletes a FAQ item (requires confirmation).


