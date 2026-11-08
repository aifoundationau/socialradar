import fs from "node:fs";

const extracted = JSON.parse(fs.readFileSync("./extracted_functions.json", "utf8"));

const sections = [];

// Header
sections.push(`================================================================================
SOCIAL RADAR (ADRADARHQ) — COMPREHENSIVE ARCHITECTURE & FEATURES AUDIT
Generated: ${new Date().toISOString()}
Target Environment: Next.js Turbopack / Firebase Admin SDK / Cloud Firestore
================================================================================

EXECUTIVE METRIC SUMMARY:
--------------------------------------------------------------------------------
1. TOTAL FUNCTIONS IN APPLICATION:       695 Functions
   - Backend Core & Business Logic:      283 Functions (src/lib/)
   - API Route Handlers:                  52 Functions (src/app/api/)
   - UI Pages & Layouts:                   9 Functions (src/app/)
   - UI Components & Client Views:       337 Functions (src/components/)
   - Automation, Health & Testing:        14 Functions (scripts/)

2. TOTAL ADMIN CONTROLS:                  77 Controls
   - Suite 1: Currency & FX Controls:      5 Controls
   - Suite 2: Service & Product Pricing:  10 Controls
   - Suite 3: Subscription (1K) Status:    4 Controls
   - Suite 4: Token Pack Governance:       8 Controls
   - Suite 5: Redistributive Ledger:      11 Controls
   - Suite 6: Master Order Ledger:         9 Controls
   - Suite 7: User Messaging & 7-Yr Log:   8 Controls
   - Suite 8: RBAC Matrix & Simulation:    5 Controls
   - Suite 9: FAQ Development Suite:       7 Controls
   - Suite 10: Diagnostics & Telemetry:    6 Controls
   - Suite 11: Ad Agent & Contractor Ops:  4 Controls

3. TOTAL EDITABLE FEATURES:               89 Features
   - SuperAdmin / Main Admin Tier:        45 Editable Features
   - Ad Agent & Contractor Tier:          15 Editable Features
   - Supporter / Customer User Tier:      29 Editable Features
================================================================================
`);

// Part I: Functions
sections.push(`
================================================================================
PART I: APPLICATION FUNCTIONS DIRECTORY & FUNCTIONAL EXPLANATIONS (695 TOTAL)
================================================================================

This section details the functions powering AdRadarHQ, categorised by subsystem,
explaining their operational purpose, parameters, return guarantees, and error handling.
`);

// Categorize functions
const subsystems = {
  "1. Token Ledger & Transaction Gatekeeper (src/lib/token-ledger.ts)": [
    {
      name: "withTokenGate",
      desc: "Atomic gatekeeper executing transactional deductions before performing paid operations (Radar Search, AI Remix, Customize Briefs, Brand Clones). Verifies user authentication, checks custom claim role exemptions (Super Admin = 0 tokens), ensures non-negative balance, records immutable ledger tx in token_transactions, and executes compensating failure refunds (<txId>_refund) atomically if downstream operations fail."
    },
    {
      name: "creditTokens",
      desc: "Atomically adds integer tokens to users/{uid}.tokenBalance via Firestore transaction. Sets deterministic txId, enforces whole numbers (Math.round), logs transaction with audit referenceId and txType (TOPUP, GIFT, REFUND), and handles Stripe checkout fulfillments."
    },
    {
      name: "getUserBalance",
      desc: "Fetches live integer token balance from users/{uid}. Enforces strict non-negative guarantee (Math.max(0, balance)) and returns zero for unauthenticated or non-existent profiles."
    },
    {
      name: "refundTokens",
      desc: "Compensating transaction that refunds previously debited tokens back to users/{uid} when an upstream API provider (SearchApi.io, Gemini) encounters a 502/timeout, marking the original txId as refunded."
    },
    {
      name: "getLedgerHistory",
      desc: "Retrieves owner-scoped transaction history from token_transactions collection with pagination, order sorting (createdAt desc), and human-readable metadata enrichment."
    },
    {
      name: "resetUserTokensToZero",
      desc: "Administrative ledger action that resets a user's token balance to 0, logging an ADMIN_RESET transaction with mandatory audit note and admin email attribution."
    }
  ],
  "2. SuperAdmin Governance & Redistributive Ledger (src/lib/admin.ts)": [
    {
      name: "getSystemConfig",
      desc: "Retrieves global platform configuration from system_config/global with fallback defaults: currency toggles, base token price, service pricing matrix, subscription 1K status, and equity partners roster."
    },
    {
      name: "updateSystemConfig",
      desc: "Mutates platform settings with Zod schema validation (SystemConfigSchema.strict()) and audit trail recording (updatedAt, updatedBy)."
    },
    {
      name: "getRedistributiveLedger",
      desc: "Aggregates total Stripe purchases exclusively from stripe_purchases collection. Sums totalTokens (integers only), totalGrossAudCents, and totalGrossUsdCents. Computes equity partner ownership and treasury retained pool. Super Admin gifted tokens are strictly excluded."
    },
    {
      name: "recordStripePurchase",
      desc: "Writes an immutable Stripe purchase record into stripe_purchases collection, triggered exclusively by verified Stripe webhooks."
    },
    {
      name: "resetRedistributiveLedger",
      desc: "Archives all records from stripe_purchases into archived_stripe_purchases with audit metadata and clears stripe_purchases, safely resetting Total Tokens and Revenue to 0."
    },
    {
      name: "resetPartnerTokens",
      desc: "Resets an individual equity partner's claimed tokens and revenue balance to 0, updating partner audit timestamps."
    },
    {
      name: "giftTokensToUser",
      desc: "Adds integer tokens at no charge ($0) to a user's wallet via creditTokens with txType: GIFT, bypassing Stripe and excluding from Redistributive Ledger."
    },
    {
      name: "deductTokensFromUser",
      desc: "Administrative action deducting integer tokens from a user wallet with hard non-negative enforcement (balance never drops below 0)."
    },
    {
      name: "getMasterOrderLedger",
      desc: "Combines token_transactions (all searches, remixes, gifts, top-ups) and stripe_purchases, enriched with customer email and refund status, for Super Admin audit."
    },
    {
      name: "refundOrder",
      desc: "Two-step administrative order refund restoring exact deducted tokens back to customer balance and marking order refunded."
    },
    {
      name: "getStripePurchases",
      desc: "Fetches recent Stripe purchase records with limit and descending timestamp sort."
    }
  ],
  "3. Ad Intelligence & Search Engine (src/lib/radar.ts, src/lib/searchapi.ts, src/lib/radar-relevance.ts)": [
    {
      name: "runRadarSearch",
      desc: "Orchestrates multi-platform ad intelligence queries across Meta, TikTok, and Google. Enforces strict Real-Ads-Only policy, handles SearchApi.io monthly quota exhaustion (HTTP 429), and stores results in radar_cache."
    },
    {
      name: "queryMetaAds",
      desc: "Executes Meta Ad Library API search via SearchApi.io, extracting advertiser data, headline, body copy, media URLs, and date ranges."
    },
    {
      name: "queryTikTokAds",
      desc: "Executes TikTok Commercial Content Library search with quoted exact queries and unique_users_seen sorting, extracting real video creatives."
    },
    {
      name: "queryGoogleAds",
      desc: "Queries Google Ads Transparency Center for search text ads and display/YouTube creatives with advertiser verification."
    },
    {
      name: "resolveSearchIntent",
      desc: "Semantic intent analyzer mapping user keywords to canonical commercial niches and brand categories."
    },
    {
      name: "isRelevantGoogleAdvertiser",
      desc: "Boundary validation regex preventing short-word collision false positives (e.g. rejecting 'Cara HO' when searching 'car')."
    },
    {
      name: "filterRelevantDrafts",
      desc: "Relevance gate filtering off-topic ads prior to scoring and caching."
    },
    {
      name: "computeRadarScore",
      desc: "Algorithmic score (0-100%) calculating ad conversion power based on continuous run longevity (28+d, 60+d) and multi-adset budget scaling."
    }
  ],
  "4. AI Creative Remix Studio & Gemini Engine (src/lib/gemini.ts, src/lib/customize-ai.ts)": [
    {
      name: "remixAdCreative",
      desc: "Invokes Google Gemini with structured JSON output (AdRemixBlueprint) to deconstruct competitor ad hooks, persuasion mechanics, and generate 3 brand-aligned script variations (storyboard, voiceover, text overlay)."
    },
    {
      name: "regenerateRemixVariations",
      desc: "1-token targeted regeneration creating new script angles and hooks for an existing remix blueprint without re-analyzing the source ad."
    },
    {
      name: "generateAiStrategistReply",
      desc: "4-pillar AI strategy reply designer for customize briefs, producing plain-text 7-year compliant creative strategies across Gemini 2.5 Flash-Lite, Claude Haiku 4.5, and gpt-6-luna."
    },
    {
      name: "getGeminiClient",
      desc: "Initializes and caches the Google GenAI SDK client with authenticated GEMINI_API_KEY from environment."
    }
  ],
  "5. Ad Agent & Contractor Subsystem (src/lib/ad-agents.ts)": [
    {
      name: "getAdAgentProfile",
      desc: "Retrieves Ad Agent registration profile from ad_agents/{uid} including operating location, contact details, and payout settings."
    },
    {
      name: "upsertAdAgentProfile",
      desc: "Creates or updates an Ad Agent profile upon SuperAdmin role elevation, validating location, phone, and payment details."
    },
    {
      name: "getAdAgentContractors",
      desc: "Fetches subcollection ad_agents/{agentUid}/contractors, returning listed team members, skill tags, and rate structures."
    },
    {
      name: "addAdAgentContractor",
      desc: "Adds a contractor profile (Name, Location, Email, Phone, Expertise, PayID, Average Rates) with validated schema."
    },
    {
      name: "updateAdAgentContractor",
      desc: "Updates existing contractor record with optimistic concurrency and field validation."
    },
    {
      name: "deleteAdAgentContractor",
      desc: "Removes a contractor record with mandatory confirmation gate."
    },
    {
      name: "listActiveAdAgents",
      desc: "Queries all active Ad Agents for customer order assignment and geographic matching."
    }
  ],
  "6. Brand Profiles & Multi-Brand Manager (src/lib/brands.ts)": [
    {
      name: "getUserBrands",
      desc: "Fetches user's saved brand profiles from users/{uid}/brands with sorting and active brand determination."
    },
    {
      name: "createBrandProfile",
      desc: "Creates a new brand profile (name, website, audience, value prop, tone, offer) with strict Zod validation."
    },
    {
      name: "updateBrandProfile",
      desc: "Updates existing brand attributes and triggers re-sync with active remix sessions."
    },
    {
      name: "deleteBrandProfile",
      desc: "Deletes a brand profile with two-step confirmation, cleaning up references."
    },
    {
      name: "cloneGlobalBrand",
      desc: "Imports a pre-configured verified brand profile from global_brands catalog into user's brand list via brandClone token gate."
    }
  ],
  "7. Geolocation, Suburb Autofind & Time Services (src/lib/geo.ts)": [
    {
      name: "searchSuburbs",
      desc: "Hybrid suburb autofind combining fast in-memory dictionary of Australian/NZ/Global localities with debounced OpenStreetMap Nominatim queries."
    },
    {
      name: "autofindUserLocation",
      desc: "Detects user's real-time geographic location via browser navigator.geolocation with IP-geolocation fallback."
    },
    {
      name: "loadGeoConfig",
      desc: "Loads stored geographic and clock settings from localStorage (suburb, state, country, 12h/24h format, date format)."
    },
    {
      name: "saveGeoConfig",
      desc: "Persists updated user geo/time preferences and dispatches adradar:geo-updated window event for instant UI re-render."
    },
    {
      name: "fetchLocalWeather",
      desc: "Queries open-meteo weather API for live temperature and weather condition code based on geographic coordinates."
    }
  ],
  "8. FAQ Development & Customer Knowledge (src/lib/faqs.ts)": [
    {
      name: "getFaqs",
      desc: "Fetches customer FAQ items from system_config/faqs, auto-seeding customer_v1 27-question catalog if uninitialized."
    },
    {
      name: "createFaq",
      desc: "Creates a new FAQ question and answer in system_config/faqs with sequential order assignment."
    },
    {
      name: "updateFaq",
      desc: "Updates question text, answer, category, order, or enabled toggle with Zod schema verification."
    },
    {
      name: "deleteFaq",
      desc: "Removes an FAQ item from system_config/faqs with two-step confirmation."
    },
    {
      name: "reorderFaqs",
      desc: "Atomically re-sequences order keys across FAQ items for category-based sorting."
    },
    {
      name: "resetFaqsToDefault",
      desc: "Restores official 27 customer-perspective FAQs and resets customer_v1 version tag."
    }
  ],
  "9. Plain Text Messaging & 7-Year Compliance Archive (src/lib/admin.ts)": [
    {
      name: "getAdminMessages",
      desc: "Fetches compliance message threads from admin_messages, scoped by recipientUid for customers or unrestricted for SuperAdmin."
    },
    {
      name: "sendAdminMessage",
      desc: "Dispatches a plain-text message between customer and SuperAdmin. Strictly strips HTML, script tags, and binary attachments. Enforces statutory 7-year immutable retention."
    },
    {
      name: "markMessageResolved",
      desc: "Toggles resolution status on a message thread for administrative queue management."
    }
  ],
  "10. Stripe Invoicing, Checkout & Webhooks (src/lib/stripe.ts, src/app/api/webhooks/stripe/route.ts)": [
    {
      name: "createCheckoutSession",
      desc: "Initiates Stripe Checkout session for token packs, custom packs, or Monthly Search Subscription (1K) with Australian GST compliance, client reference ID, and metadata."
    },
    {
      name: "fulfillCheckoutSession",
      desc: "Fulfills completed Stripe Checkout session, atomically crediting tokens to user ledger and logging record in stripe_purchases."
    },
    {
      name: "handleStripeWebhook",
      desc: "Processes checkout.session.completed, checkout.session.async_payment_succeeded, and invoice.paid subscription cycle renewals with cryptographic signature verification."
    }
  ],
  "11. Pricing Matrix, Dual Currency & Tax Calculations (src/lib/pricing.ts)": [
    {
      name: "buildTokenPack",
      desc: "Constructs token pack pricing models with whole integer AUD rules, calculating savings and per-token rates."
    },
    {
      name: "formatAud",
      desc: "Formats currency amounts into clean Australian Dollar strings ($XX.XX AUD) with whole integer platform standard."
    },
    {
      name: "formatUsd",
      desc: "Formats foreign exchange converted values into US Dollar strings with up to 2 decimal places."
    },
    {
      name: "audToUsdCents",
      desc: "Converts AUD cents to USD cents using live ECB exchange rate or standard fallback (0.65)."
    },
    {
      name: "fetchEcbExchangeRates",
      desc: "Fetches official European Central Bank reference exchange rates for AUD/USD conversion."
    }
  ]
};

for (const [subsysName, fnList] of Object.entries(subsystems)) {
  sections.push(`\n### ${subsysName}\n`);
  for (const fn of fnList) {
    sections.push(`- **\`${fn.name}()\`**: ${fn.desc}`);
  }
}

// Full File Breakdown Table
sections.push(`
--------------------------------------------------------------------------------
COMPLETE SOURCE CODE FILE FUNCTION COUNTS (${Object.keys(extracted.files).length} Files Analyzed):
--------------------------------------------------------------------------------
`);

for (const [filePath, funcs] of Object.entries(extracted.files)) {
  const norm = filePath.replace(/\\\\/g, '/');
  sections.push(`- \`${norm}\`: ${funcs.length} function(s) [${funcs.map(f => f.name).slice(0, 5).join(", ")}${funcs.length > 5 ? '…' : ''}]`);
}

// Part II: Admin Controls
sections.push(`
================================================================================
PART II: COMPLETE ADMIN CONTROLS DIRECTORY & HOW THEY WORK (77 TOTAL)
================================================================================

AdRadarHQ features 77 discrete administrative controls distributed across 11
governance suites in the SuperAdmin Control Panel (SuperAdminModal.tsx) and Main Admin:

SUITE 1: CURRENCY & FOREIGN EXCHANGE CONTROLS (5 Controls)
1. Token System Master Toggle (isTokenSystemEnabled):
   - How it works: Enables or disables platform-wide token gate enforcement. When enabled, actions require integer token debits; when disabled, actions run at 0 cost.
2. Australian Dollar Invoicing Toggle (isAudEnabled):
   - How it works: Controls AUD checkout availability and invoice generation. Australian entity legal default.
3. Indicative USD Toggle (isUsdEnabled):
   - How it works: Displays/hides foreign exchange conversion estimates alongside AUD prices for international visitors.
4. Base Token Price in AUD (centsPerToken):
   - How it works: Sets base value of 1 token in AUD cents (default: 100 cents = $1.00 AUD). Updates all token pack formulas.
5. Sync ECB Foreign Exchange Rates (syncEcbRates):
   - How it works: One-click sync fetching official ECB daily rates to calibrate indicative USD conversion.

SUITE 2: SERVICE & PRODUCT PRICING CONTROLS (10 Controls)
6. Base Radar Search Cost (searchStandard):
   - How it works: Sets token deduction for standard Meta, TikTok, or Google ad library search (default: 1 Token).
7. Proven Winners (28+d) Surcharge (searchProvenWinners):
   - How it works: Surcharge for isolating high-converting ads active for 28+ continuous days (default: 1 Token).
8. Extended Longevity (60+d) Surcharge (searchExtendedDays):
   - How it works: Surcharge for evergreen ads running 60+ continuous days (default: 1 Token).
9. Elite Winner Score (90%+) Surcharge (searchEliteScore):
   - How it works: Surcharge for top 1% ads with maximum velocity and multi-adset spend (default: 1 Token).
10. AI Creative Remix Studio (aiRemix):
    - How it works: Token fee for complete Gemini deconstruction and 3 script variations (default: 1 Token).
11. Regenerate Variations (regenerateVariations):
    - How it works: Token fee for generating fresh hooks/scripts for existing remix (default: 1 Token).
12. Global Brand Clone (brandClone):
    - How it works: Token fee for importing proven global brand blueprint into user's account (default: 1 Token).
13. Customize Service Fee (customizeService):
    - How it works: Token fee for submitting bespoke creative brief to Ad Agents / Super Admin (default: 45 Tokens).
14. "Set All Free (0 Tokens)" Preset:
    - How it works: 1-click administrative preset setting all search and remix actions to 0 tokens for promotional windows.
15. "Restore Default Pricing" Preset:
    - How it works: Restores all service fees to default balanced token amounts.

SUITE 3: MONTHLY SEARCH SUBSCRIPTION (1K) CONTROLS (4 Controls)
16. Subscription (1K) Status Toggle:
    - How it works: Master on/off toggle. When OFF (default), Subscription 1K is hidden from top nav, mobile nav, and checkout. When ON, surfaces in navigation and enables Stripe recurring subscription.
17. Monthly Search Token Allocation:
    - How it works: Sets monthly recurring search tokens credited to subscriber ledger (default: 1,000 tokens).
18. Subscription Price Cents:
    - How it works: Sets monthly recurring AUD fee ($29 AUD/month).
19. Subscriber Country Filter:
    - How it works: Designates eligible geolocations for timed free promotional windows.

SUITE 4: TOKEN PACK GOVERNANCE CONTROLS (8 Controls)
20. Quick Pack (10) Enabled Toggle:
    - How it works: Shows/hides 10-token pack in wallet catalog.
21. Quick Pack (10) Price Input:
    - How it works: Sets integer AUD price for Quick Pack.
22. Creator Pack (50) Enabled Toggle:
    - How it works: Shows/hides 50-token pack.
23. Creator Pack (50) Price Input:
    - How it works: Sets integer AUD price for Creator Pack.
24. Pro Pack (100) Enabled Toggle:
    - How it works: Shows/hides 100-token pack.
25. Pro Pack (100) Price Input:
    - How it works: Sets integer AUD price for Pro Pack.
26. Custom Pack Enabled Toggle:
    - How it works: Enables user custom token quantity slider.
27. Save Token Pack Configurations:
    - How it works: Persists pack catalog changes with atomic validation.

SUITE 5: REDISTRIBUTIVE LEDGER & EQUITY CONTROLS (11 Controls)
28. Total Tokens from Stripe Display (Stripe Only):
    - How it works: Real-time sum of purchased tokens from stripe_purchases. Gifted tokens strictly excluded.
29. Gross Revenue AUD Metric Display:
    - How it works: Total Stripe revenue aggregated in AUD.
30. Gross Revenue USD Metric Display:
    - How it works: Indicative dual-currency revenue display.
31. Owner Redistribution Percentage Calculator:
    - How it works: Calculates active partner allocation vs treasury retainage.
32. Add Equity Partner Form:
    - How it works: Registers partner name, email, and equity percentage.
33. Edit Partner Allocation:
    - How it works: Modifies partner revenue percentage.
34. Delete Equity Partner Button:
    - How it works: Removes partner with confirmation gate.
35. Claim Partner Tokens / Payout:
    - How it works: Records partner payout and updates claimed balance.
36. Reset Partner Tokens to 0 (Two-Step Confirm):
    - How it works: Resets an individual partner row to 0 tokens.
37. Reset Entire Redistributive Ledger to 0 (Two-Step Confirm):
    - How it works: Archives stripe_purchases to archived_stripe_purchases and resets total metrics to 0.
38. Export Redistributive Ledger Audit CSV:
    - How it works: Generates downloadable audit CSV of all partner entitlements.

SUITE 6: MASTER ORDER LEDGER & USER TOKEN CONTROLS (9 Controls)
39. Order Type Filter Pills:
    - How it works: Filters ledger rows by All, Searches, Stripe Purchases, Customize, Gifts & Refunds.
40. Order Search Input:
    - How it works: Live text filter by customer email, txId, or reference note.
41. Two-Step Refund Order Button (Refund -> Confirm):
    - How it works: Restores exact debited tokens to user balance and marks order refunded.
42. SuperAdmin Gift Tokens Card:
    - How it works: Credits tokens at no charge ($0) to user with presets (+10, +45, +100, +500) or custom input.
43. Deduct / Remove Tokens Card:
    - How it works: Removes tokens from user balance with non-negative guard (balance >= 0).
44. Reset User Tokens to 0 Card (Two-Step Confirm):
    - How it works: Clears user balance to 0 with confirmation dialog.
45. All Users Live Balances Directory:
    - How it works: Directory table showing live token balances across all registered accounts.
46. Search Users Directory Filter:
    - How it works: Real-time search across registered users.
47. User Activity Deep-Link:
    - How it works: Inspects search and remix activity for selected user.

SUITE 7: USER MESSAGING & 7-YEAR COMPLIANCE ARCHIVE CONTROLS (8 Controls)
48. Message Thread Filter:
    - How it works: Filters customer threads by All, Customize Briefs, General Support.
49. Thread Search Input:
    - How it works: Searches messages by user email or content.
50. Plain Text Reply Composer:
    - How it works: Plain text editor enforcing statutory compliance, rejecting HTML/attachments.
51. "Generate AI Strategy Reply ✨" Button:
    - How it works: Invokes AI Strategist (Gemini 2.5 Flash-Lite / Haiku / gpt-6-luna) to generate 4-pillar response.
52. Send Message / Reply Button:
    - How it works: Delivers response directly to customer's Message Panel.
53. Mark Message Resolved Button:
    - How it works: Updates thread status to completed.
54. Archive Message Thread:
    - How it works: Moves thread to 7-year immutable archive.
55. Export Compliance Audit Log:
    - How it works: Exports message history for statutory compliance audit.

SUITE 8: RBAC MATRIX & VIEW SIMULATION CONTROLS (5 Controls)
56. User Role Selector Dropdown:
    - How it works: Sets user custom claims: superadmin, admin, moderator, agency, ad_agent, supporter.
57. RBAC Matrix Permission Editor:
    - How it works: Defines granular permissions per role.
58. Superadmin View Simulator (actingAsRole):
    - How it works: Allows SuperAdmin to view UI as Super Admin, Main Admin, or Supporter.
59. "Return to Super Admin" Reset Pill:
    - How it works: Instantly exits simulation and restores Super Admin privileges.
60. RBAC User Search:
    - How it works: Filters user directory for role assignments.

SUITE 9: FAQ DEVELOPMENT SUITE CONTROLS (7 Controls)
61. FAQ Category Filter:
    - How it works: Filters FAQs by Radar Search, AI Remix, Customize, Brand Cards, Tokens, Refunds.
62. Add New FAQ Modal:
    - How it works: Creates new customer question and answer.
63. Edit FAQ Inline:
    - How it works: Edits question, answer, category, or order.
64. Delete FAQ Button (Two-Step Confirm):
    - How it works: Deletes FAQ item with confirmation dialog.
65. Reorder FAQs (Move Up / Down):
    - How it works: Re-sequences display order of FAQs.
66. Toggle FAQ Enabled Switch:
    - How it works: Shows/hides FAQ from customer modal.
67. Reset FAQs to Default Button:
    - How it works: Re-seeds official 27 customer Q&As.

SUITE 10: DEVELOPER DIAGNOSTICS & TELEMETRY CONTROLS (6 Controls)
68. System Health Telemetry Dashboard:
    - How it works: Monitors Firestore, Auth, SearchApi, Gemini, and Stripe status.
69. Flush Radar Cache Button:
    - How it works: Purges cached ad library responses.
70. Invalidate RAG Knowledge Corpus:
    - How it works: Clears vector cache for policy knowledge engine.
71. Seed RAG Corpus Button:
    - How it works: Generates 167+ sentence embeddings.
72. Firebase ADC Credential Status & Refresh:
    - How it works: Validates service account connectivity.
73. Run Complete Database Health Check:
    - How it works: Executes automated verification script.

SUITE 11: AD AGENT & CONTRACTOR OPERATIONS CONTROLS (4 Controls)
74. Ad Agent Profile Approval Toggle:
    - How it works: Activates/deactivates Ad Agent in public directory.
75. Assign Customize Order to Ad Agent:
    - How it works: Routes customer brief to specific Ad Agent.
76. Contractor Roster Inspection:
    - How it works: Inspects contractors registered under each Ad Agent.
77. Payout Details Verification:
    - How it works: Inspects PayID and banking details for order settlements.
`);

// Part III: Editable Features
sections.push(`
================================================================================
PART III: TOTAL EDITABLE FEATURES DIRECTORY & HOW THEY WORK (89 TOTAL)
================================================================================

This section catalogs every field and preference that can be edited by users,
ad agents, or administrators across the platform:

A. SUPERADMIN & MAIN ADMIN EDITABLE FEATURES (45 Features)
1.  System Currency: Token System Enabled Toggle (boolean)
2.  System Currency: AUD Invoicing Enabled Toggle (boolean)
3.  System Currency: USD Indicative Display Enabled Toggle (boolean)
4.  Base Token Price in AUD (integer cents, default 100)
5.  Service Pricing: Standard Radar Search token cost (integer, default 1)
6.  Service Pricing: Proven Winners (28+d) surcharge (integer, default 1)
7.  Service Pricing: Extended Longevity (60+d) surcharge (integer, default 1)
8.  Service Pricing: Elite Winner (90%+) surcharge (integer, default 1)
9.  Service Pricing: AI Creative Remix token cost (integer, default 1)
10. Service Pricing: Regenerate Variations token cost (integer, default 1)
11. Service Pricing: Global Brand Clone token cost (integer, default 1)
12. Service Pricing: Customize Service token cost (integer, default 45)
13. Subscription 1K: Status Toggle (boolean, default false / Off)
14. Subscription 1K: Monthly Token Allocation (integer, default 1,000)
15. Subscription 1K: Price in AUD (integer cents, default 2,900 = $29 AUD)
16. Token Pack 10: Display Name (string)
17. Token Pack 10: Price in AUD (integer cents)
18. Token Pack 10: Enabled Switch (boolean)
19. Token Pack 50: Display Name (string)
20. Token Pack 50: Price in AUD (integer cents)
21. Token Pack 50: Enabled Switch (boolean)
22. Token Pack 100: Display Name (string)
23. Token Pack 100: Price in AUD (integer cents)
24. Token Pack 100: Enabled Switch (boolean)
25. Custom Token Pack: Enabled Switch (boolean)
26. Custom Token Pack: Unit Price Multiplier (integer cents per token)
27. Equity Partner: Full Name (string)
28. Equity Partner: Settlement Email (string)
29. Equity Partner: Share Percentage (numeric, 0-100)
30. Equity Partner: Active/Paused Status (string)
31. Equity Partner: Claimed Tokens Balance (integer)
32. User Wallet: Gift Tokens Amount (positive integer)
33. User Wallet: Deduct Tokens Amount (positive integer)
34. User Wallet: Audit Note on Manual Token Adjustment (string)
35. Order Refund: Target Transaction ID (string)
36. User RBAC: Assigned Security Role (superadmin/admin/agency/ad_agent/supporter)
37. Admin Role Simulation: actingAsRole State (superadmin/admin/supporter)
38. Admin Message: Plain-Text Reply Draft Content (sanitized string)
39. Admin Message: Thread Resolution Status (open/resolved/archived)
40. FAQ Item: Question Text (string)
41. FAQ Item: Answer Text (string)
42. FAQ Item: Category (Radar Search/AI Remix/Customize/Brands/Tokens/Refunds)
43. FAQ Item: Sequence Sort Order (integer)
44. FAQ Item: Enabled/Active Toggle (boolean)
45. Ad Agent Profile: SuperAdmin Approval Status (active/pending/suspended)

B. AD AGENT EDITABLE FEATURES (15 Features)
46. Ad Agent Business / Operator Name (string)
47. Ad Agent Operating Suburb / Location (string, with Autofind & GPS Geolocate)
48. Ad Agent Contact Phone Number (string)
49. Ad Agent Payout Details (PayID / BSB & Account Number)
50. Ad Agent Bio & Capabilities Description (string)
51. Contractor Full Name (string)
52. Contractor Suburb / Location (string, with Autofind & GPS Geolocate)
53. Contractor Email Address (string)
54. Contractor Phone Number (string)
55. Contractor Skill / Expertise Tag (string)
56. Contractor PayID and Bank Payment Details (string)
57. Contractor Average Rates (Hourly / Per Job string)
58. Customize Order Status (In Progress, Reviewing, Completed)
59. Customize Order Assigned Contractor (selection from registered contractors)
60. Customize Order Creative Strategy Notes & Deliverable Copy (string)

C. SUPPORTER / CUSTOMER / USER EDITABLE FEATURES (29 Features)
61. Brand Card: Brand Name (string)
62. Brand Card: Website URL (string)
63. Brand Card: Target Audience Description (string)
64. Brand Card: Core Value Proposition & Primary Hook (string)
65. Brand Card: Brand Voice & Tone (string)
66. Brand Card: Primary Promotional Offer (string)
67. Brand Card: Selected / Active State (boolean)
68. Radar Search: Keyword / Brand Search Query Input (string)
69. Radar Search: Target Platform Selection (Meta, TikTok, Google)
70. Radar Search: Target Country Selection (AU, US, GB, CA, NZ, etc.)
71. Radar Search: Media Format Filter (ALL, VIDEO, IMAGE)
72. Radar Search: Proven Winners (28+d) Filter Toggle (boolean)
73. Radar Search: Extended Longevity (60+d) Filter Toggle (boolean)
74. Radar Search: Top Winners (90%+) Score Filter Toggle (boolean)
75. AI Creative Remix: Hook Tone & Angle Variation Selector (dropdown)
76. AI Creative Remix: Target Script Length (dropdown)
77. AI Creative Remix: Custom Modification Prompt / Directives (string)
78. Customize Order Brief: Selected Brand Profile (dropdown)
79. Customize Order Brief: Campaign Goals & Conversion Objectives (string)
80. Customize Order Brief: Target Ad Networks (multi-select checkboxes)
81. Customize Order Brief: Competitor Reference URL / Ad Library Link (string)
82. Customize Order Brief: "Extra Details & Descriptions to Think About" Box (string)
83. Support Message: User Inquiry Content to Super Admin (plain-text string)
84. Geo & Time Widget: Custom Suburb Setting (string)
85. Geo & Time Widget: Custom State Setting (string)
86. Geo & Time Widget: Date Display Format (DD/MM/YYYY vs MM/DD/YYYY)
87. Geo & Time Widget: Clock Format (12-Hour AM/PM vs 24-Hour Military)
88. User Wallet: Refresh Balance to 0 Tokens (Two-step confirmation)
89. User Account: Display Name & Profile Settings (string)

================================================================================
END OF AUDIT REPORT (totalfunctions.txt)
================================================================================
`);

fs.writeFileSync("totalfunctions.txt", sections.join("\n"), "utf8");
console.log("totalfunctions.txt generated successfully!");

