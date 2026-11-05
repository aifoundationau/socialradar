================================================================================
AD RADAR (SOCIAL RADAR) - COMPLETE SYSTEM README
================================================================================
Version: 0.1.0-PROD
Framework: Next.js 16.4.3 (App Router with Turbopack) & React 19.3.0
Platform: Vercel Serverless Edge / Node.js Runtime
Database & Auth: Google Cloud Firebase 13.1.0 (Firestore & Firebase Admin 14.5.0)
AI Engine: Google Gemini 2.5 Flash via @google/genai 2.32.0 SDK
Payments & Invoicing: Stripe SDK 23.0.1 (Native Automatic Tax & AUD Invoicing)
License: MIT License (see mitlicence.txt)
Author & Founder: David Robertson (AI Foundation Australia)
Copyright: (c) 2026 AI Foundation Australia. All rights reserved.
================================================================================

TABLE OF CONTENTS
-----------------
1.  SYSTEM OVERVIEW & MISSION
2.  TECH STACK & DEPENDENCY TOPOLOGY
3.  CORE FEATURE MODULES
    3.1  Ad Radar Winner Intelligence Engine (Meta, TikTok, Google)
    3.2  Multi-Factor Winner Matrix & Longevity Scoring Algorithm
    3.3  Strict Platform Isolation Gate
    3.4  AI Creative Remix Studio (Gemini 2.5 Flash)
    3.5  Brand Strategy Portfolio & Avatar Management
    3.6  Professional Customize Brand Strategy Service
    3.7  Redistributive Token Economy & Integer Pricing
    3.8  Stripe Sandbox AUD Payments & Australian GST Compliance
    3.9  Monthly Search Subscription (1,000 Searches / Month)
    3.10 SuperAdmin & Main Admin Governance Suite
    3.11 Compliance Messaging (7-Year Statutory Retention & Anti-Tamper)
    3.12 Interactive Knowledge Base & FAQ Engine
    3.13 Geolocation, Weather & Time Footer Bar
    3.14 100% DOM Automation & Assistant Bridge
    3.15 High-Quality SEO Optimization Suite
4.  SPECIALIZED AI AGENT SKILLS
5.  DATA CONTRACTS & FIRESTORE DATABASE ARCHITECTURE
6.  ENVIRONMENT VARIABLES & SECRETS CONFIGURATION
7.  LOCAL DEVELOPMENT & VERIFICATION WORKFLOW
8.  PRODUCTION PIPELINE & DEPLOYMENT TOPOLOGY
9.  LICENSING, LEGAL & STATUTORY COMPLIANCE


================================================================================
1. SYSTEM OVERVIEW & MISSION
================================================================================
Ad Radar (Social Radar) is an enterprise-grade competitive advertising intelligence,
creative deconstruction, and AI remixing platform built for modern performance
marketers, digital agencies, and independent creators.

The platform scrapes, aggregates, and scores active top-performing direct-response
ad campaigns across Meta (Facebook & Instagram), TikTok, and Google Ads (Search,
YouTube, and Display). Rather than showing raw unranked ads, Ad Radar isolates
battle-tested, scalable ads that have demonstrated multi-week conversion longevity.

Key Operational Pillars:
* Democratic Token Economy: Pay-as-you-go integer tokens with zero lock-in contracts
  or subscriptions for basic access, plus an optional 1,000 search/mo subscription.
* Redistributive Equity Pool: Revenue from token purchases is transparently tracked
  in an automated equity ledger, distributing dividends to registered partners.
* Compliance & Safety: Complete adherence to the Australian Privacy Act and
  statutory record-keeping standards (including 7-year immutable message archives).
* 100% DOM Automation Ready: Every interactive control is tagged with deterministic
  data-agent-id, data-testid, and aria-label attributes for AI pairing.


================================================================================
2. TECH STACK & DEPENDENCY TOPOLOGY
================================================================================
Core Framework & Language:
* Next.js 16.4.3: App Router architecture with Turbopack bundler for rapid HMR.
* React 19.3.0 & React DOM 19.3.0: Modern concurrent rendering, Server Components,
  and native form actions.
* TypeScript 5: Strict type-checking with zero any-leakage.
* Tailwind CSS v4 (@tailwindcss/turbopack): High-performance utility styling.

Backend, Database & Storage:
* Firebase Client SDK 13.1.0: Real-time listeners for brand profiles, wallets,
  and user transactions.
* Firebase Admin SDK 14.5.0: Server-side privileged operations, Firestore multi-db
  support (ad-radar database), RBAC custom claims, and secure session verification.
* Zod 4.6.7: Strict runtime schema validation (additionalProperties: false) across
  all API endpoints and data contracts.

Generative AI & Search APIs:
* Google GenAI SDK (@google/genai 2.32.0): Direct integration with Gemini 2.5 Flash
  (gemini-2.5-flash) for structured JSON creative remixing and AI strategy drafting.
* SearchAPI.io: Upstream search aggregator for Meta Ad Library, TikTok Commercial
  Content Library, and Google Ads Transparency Center.
* Apify REST API: High-volume scraping pipelines for TikTok Creative Center Top Ads.

Payments, Tax & Billing:
* Stripe Node SDK 23.0.1: Native Automatic Tax calculations, exclusive Australian
  GST (10%), zero-tax international transactions, and dynamic price_data checkout.


================================================================================
3. CORE FEATURE MODULES
================================================================================

3.1 Ad Radar Winner Intelligence Engine (Meta, TikTok, Google)
--------------------------------------------------------------
The search engine orchestrates 3 distinct ad intelligence platforms:
* Meta Ads Engine: Queries Meta Ad Library with multi-level filtering, format
  classification (Direct-Response Video UGC, Static Graphic, Dynamic Carousel),
  longevity estimation, and dynamic thumbnail extraction.
* TikTok Viral Ads Engine: Dual-engine ingestion merging TikTok Creative Center
  Top Ads with TikTok Commercial Content Library. Tracks view velocity (views/day),
  CTR percentile ranks (Top 1%, Top 5%), and engagement metrics.
* Google Ads Engine: 3-engine search tracking Google Search paid text ads, YouTube
  in-stream video ads, and Google Display Network creatives via the Google Ads
  Transparency Center with advertiser resolution.

3.2 Multi-Factor Winner Matrix & Longevity Scoring Algorithm
------------------------------------------------------------
Every ad processed by Ad Radar is assigned an objective Composite Score (0-100)
based on a 4-pillar algorithmic evaluation:
1. Longevity Pillar (30% weight): Continuous active runtime.
   - Base threshold: 7-14 days.
   - Proven threshold: 28+ days (high conversion confidence).
   - Extended threshold: 60+ days (evergreen fatigue-resistant winners).
2. Creative Quality & Copy Strategy (30% weight): Structural direct-response
   elements including 3-second hook strength, problem/solution framing, social
   proof markers, and high-urgency call-to-actions.
3. Scale & Collation Velocity (20% weight): Number of duplicate ad sets, multiple
   creative aspect ratios, and horizontal publisher network distribution.
4. Social Proof & Engagement Velocity (20% weight): View velocity (views/day),
   impressions per day, and like/comment engagement ratios.
5. Elite Winners Filter (90%+): Isolates the top 1% of profitable campaigns.

3.3 Strict Platform Isolation Gate
----------------------------------
Enforces hard platform isolation across search results:
* Selecting META returns exclusively Meta (Facebook/Instagram) creatives.
* Selecting TIKTOK returns exclusively TikTok viral video creatives.
* Selecting GOOGLE returns exclusively Google Search, Display, and YouTube creatives.
Cross-platform pollution is strictly filtered out via enforcePlatformIsolation.

3.4 AI Creative Remix Studio (Gemini 2.5 Flash)
-----------------------------------------------
Allows users to click "Model this ad" on any winning ad card to open the Creative
Remix Studio modal:
* Analyzes the original creative's persuasion DNA, emotional hook, and pacing.
* Synthesizes the creative against the user's active Brand Profile.
* Generates 3 complete production-ready direct-response script variations:
  - Variation A: Direct Pain-Point Aggravation & Instant Solution.
  - Variation B: Contrast / Us vs. Them & Unfair Advantage.
  - Variation C: Curious Story / Social Proof UGC Testimonial.
* Each variation includes a 0-3s hook, scene-by-scene visual action, spoken audio,
  on-screen text overlay, and call to action.
* Supports 1-click clipboard export and CSV download for video editors.

3.5 Brand Strategy Portfolio & Avatar Management
------------------------------------------------
Users can store and manage up to 25 detailed Brand Profiles:
* Target Audience Avatar: Demographics, psychographics, core desires.
* Core Pain Points: Line-by-line breakdown of visceral customer frustrations.
* Unique Mechanism / Offer: The distinct proprietary method or pricing advantage.
* Tone of Voice: Direct-Response Aggressive, Friendly UGC, Premium Authority, etc.
* Multi-Landing Page Matrix: Primary and secondary landing page destination URLs.
* Iterative Versioning: Version tags (e.g., v1.0, v2.1) and 1-click brand cloning.

3.6 Professional Customize Brand Strategy Service
-------------------------------------------------
A bespoke service where users submit their brand profile and a 200+ word brief of
extra details and competitor angles to receive a customized multi-angle strategy:
* Dedicated Route: /customize with real-time status tracking.
* Cost: 55 tokens per customize brief submission.
* Extra Details & Notes: Rich textarea for seasonal angles, objections, and notes.
* Admin Delivery: SuperAdmin and Main Admin craft an exhaustive, production-grade
  strategy package (up to 10,000 characters) delivered directly to the user's
  Message Panel with 1-click complete text copying.

3.7 Redistributive Token Economy & Integer Pricing
--------------------------------------------------
* Integer Invariant: Strict integers only (Math.round). Zero decimal tokens.
* Action Rates: Base Search (1 token), Proven Filter (1 token), Extended Filter
  (1 token), Top Winners Filter (1 token), AI Remix (1 token), Customize (55 tokens).
* Currency Hover Display: AUD price is strictly rendered in Australia via IP
  geolocation; USD is rendered for international users. Values display on hover.
* Admin Controls: Independent master toggles for isTokenSystemEnabled, isAudEnabled,
  and isUsdEnabled.

3.8 Stripe Sandbox AUD Payments & Australian GST Compliance
-----------------------------------------------------------
* Currency: Settled strictly in Australian Dollars (currency: "aud").
* Dynamic Price Data: Zero pre-created Stripe products; unit_amount and product
  names are generated dynamically on checkout creation.
* Native Automatic Tax (automatic_tax: { enabled: true }, tax_behavior: "exclusive"):
  - Australian buyers (country === "AU") automatically pay 10% exclusive GST.
  - New Zealand & International buyers pay strictly 0% GST / $0 additional tax.
* Token Packs: PACK_10 ($19 AUD), PACK_50 ($79 AUD), PACK_100 ($139 AUD), plus
  dynamic custom token packs (PACK_CUSTOM).
* Atomic Ledger: Payments trigger fulfillCheckoutSession, atomically crediting
  tokens to the user's wallet and recording to token_transactions.

3.9 Monthly Search Subscription (1,000 Searches / Month)
--------------------------------------------------------
* High-volume subscription package providing 1,000 monthly search tokens for
  $500 AUD / month (dynamic price configurable in SuperAdmin panel).
* Dynamic Stripe Subscription checkout with recurring monthly billing.
* Prominently featured next to FAQs in the navigation header for eligible tiers.

3.10 SuperAdmin & Main Admin Governance Suite
---------------------------------------------
A role-governed modal interface offering deep operational controls:
* Main Admin Scope (role === "admin"): 5 dedicated tabs:
  1. CURRENCY: Master currency toggles, base exchange rates, and token switches.
  2. PRICING: Live token fee adjustments across all platform features.
  3. PACKS: Token pack configuration and custom pricing.
  4. MESSAGES: Customer message inbox, AI reply designer, and statutory archive.
  5. FAQS: Knowledge base article CRUD and visibility toggles.
* SuperAdmin Scope (role === "superadmin"): All 5 Main Admin tabs PLUS:
  6. LEDGER: Redistributive pool summary, master transaction ledger, token refunds,
     gift tokens, and token resets.
  7. RBAC: Role-based access control matrix mutations and user tier assignment.
  8. DIAGNOSTICS: Developer diagnostics, system cache flush, and health telemetry.

3.11 Compliance Messaging (7-Year Statutory Retention & Anti-Tamper)
--------------------------------------------------------------------
* Strict Anti-Tamper Protocol: Plain text only. Forbidden HTML tags and link/URL
  patterns are aggressively blocked to eliminate phishing and malicious payloads.
* 7-Year Statutory Retention: In compliance with the Australian Corporations Act,
  all communications are tagged with an immutable retentionUntil date (+7 years).
* AI Work Reply Designer: SuperAdmins can click "Design AI Work Reply" to have
  Gemini 2.5 Flash analyze the customer's brief and generate a 10,000-character
  structured response.
* Deletion Safeguard: Permanent message deletion requires two-step confirmation
  (Delete -> Confirm Delete) with immediate Firestore database removal.
* One-Click Copy: Prominent "Copy Text" / "Copied ✓" buttons on all message cards.

3.12 Interactive Knowledge Base & FAQ Engine
--------------------------------------------
* Accessible via top header "FAQs" button.
* Features real-time search, categorization chips (Radar, Brands, Pricing, General),
  and accessible accordion expansion.
* Full admin CRUD with live order re-indexing and draft visibility toggles.

3.13 Geolocation, Weather & Time Footer Bar
-------------------------------------------
* Thin, non-intrusive status bar fixed to the bottom of the viewport.
* Displays user's detected Australian suburb, state, real-time local clock, and
  current weather conditions.
* Clicking opens a centered popup to manually override suburb, state, or 12h/24h
  time formats without disruptive page scrollbars.

3.14 100% DOM Automation & Assistant Bridge
-------------------------------------------
* Every interactive button, input, tab, link, and modal carries synchronized
  data-agent-id, data-testid, and aria-label attributes.
* AgentDomBridge maintains a non-visual runtime bridge (window.__AD_RADAR_AGENT__)
  with pre-check element validation, layout stability checks, and post-action
  DOM mutation verification for autonomous AI pairing.

3.15 High-Quality SEO Optimization Suite
----------------------------------------
* Optimized page titles, openGraph cards, Twitter summaries, canonical URLs,
  and structured meta descriptions across all core routes:
  - Homepage / Radar Feed: "Ad Radar | Winning Direct-Response Ads & Creative Intelligence"
  - Brands Strategy: "My Brands | Direct-Response Avatar & Creative Portfolio"
  - Customize Strategy: "Customize Brand Strategy | Bespoke Creative Direction"
  - Token Wallet: "Wallet & Token Packs | Democratic Competitive Intelligence"


================================================================================
4. SPECIALIZED AI AGENT SKILLS
================================================================================
Ad Radar includes 7 specialized AI agent skill definitions located in the
skills/ directory:

1. brand-matrix-radar-engine:
   Coordinates multi-platform ad retrieval, algorithmic scoring, and deduplication.
2. custom-brand-strategist-reply:
   Guides professional strategists and Gemini in drafting comprehensive 10,000-char
   creative briefs with direct-response angles, UGC hooks, and objections.
3. google-ads-winner-intelligence:
   Scrapes, normalizes, and classifies Google Search, Display, and YouTube ad units.
4. meta-ads-winner-intelligence:
   Specialized extractor for Meta Ad Library creatives, collations, and runtimes.
5. semantic-ad-search-relevance:
   Enforces keyword relevance, platform isolation, and intent-based ad matching.
6. tiktok-viral-ad-intelligence:
   Evaluates view velocity, CTR percentiles, and sound/UGC pacing for TikTok ads.
7. website-user-assistant:
   Automates slot-filling workflows, UI navigation, and user assistance.


================================================================================
5. DATA CONTRACTS & FIRESTORE DATABASE ARCHITECTURE
================================================================================
All Firestore collections operate under the ad-radar named database with strict
security rules (firestore.rules) and Zod data contracts (data-contracts.md):

Primary Collections:
* users/{uid}: User profile, email, role, tokenBalance, subscriptionStatus.
* brands/{brandId}: User-owned brand portfolios (scoped to uid).
* normalized_ads/{adId}: Normalized ad intelligence cache with TTL timestamps.
* remixes/{remixId}: Saved AI Creative Remix scripts and scene breakdowns.
* customize_requests/{requestId}: Submitted custom brand strategy requests.
* admin_messages/{messageId}: 7-year statutory retention messages (bidirectional).
* token_transactions/{txId}: Immutable ledger of token credits, debits, and gifts.
* stripe_purchases/{purchaseId}: Stripe payment audit records with GST breakdown.
* system_config/global: Master system settings, currencies, and service costs.
* system_config/faqs: Knowledge base articles and order hierarchy.
* system_config/rbac: Role permissions matrix and user role mappings.
* redistributive_ledger/summary: Aggregate dividend pool and partner allocations.


================================================================================
6. ENVIRONMENT VARIABLES & SECRETS CONFIGURATION
================================================================================
Ad Radar strictly enforces zero hardcoded credentials. All configuration is
loaded via environment variables (.env.local for local, Vercel/Hostinger for prod):

Key Variables (.env.example):
# Firebase Client
NEXT_PUBLIC_FIREBASE_API_KEY="..."
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN="..."
NEXT_PUBLIC_FIREBASE_PROJECT_ID="ad-radar"
NEXT_PUBLIC_FIREBASE_DATABASE_ID="ad-radar"
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET="..."
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID="..."
NEXT_PUBLIC_FIREBASE_APP_ID="..."

# Firebase Admin Service Account
FIREBASE_PROJECT_ID="ad-radar"
FIREBASE_DATABASE_ID="ad-radar"
FIREBASE_CLIENT_EMAIL="..."
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."
FIREBASE_SERVICE_ACCOUNT_BASE64="..."

# Google Gemini API
GEMINI_API_KEY="..."
GEMINI_MODEL="gemini-2.5-flash"

# Stripe Sandbox / Production
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_..."
STRIPE_SECRET_KEY="sk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."

# Ad Intelligence Upstream APIs
SEARCHAPI_API_KEY="..."
APIFY_API_TOKEN="..."
APIFY_TIKTOK_TOPADS_ACTOR_ID="..."


================================================================================
7. LOCAL DEVELOPMENT & VERIFICATION WORKFLOW
================================================================================
Prerequisites:
* Node.js 20.x or 22.x LTS (compatible with Node 24)
* npm 10+
* Firebase CLI installed (firebase-tools)

Step-by-Step Local Setup:
1. Clone the repository:
   git clone https://github.com/aifoundationau/socialradar.git
   cd ad-radar

2. Install dependencies:
   npm install

3. Populate environment configuration:
   cp .env.example .env.local
   # Fill in valid Firebase, Gemini, Stripe, and SearchAPI credentials

4. Start development server:
   npm run dev -- -p 3005
   # Application opens at http://localhost:3005

5. Verification & Quality Gates:
   # Type check
   npx tsc --noEmit
   # Linting
   npm run lint
   # Production build test
   npm run build
   # Firestore security rules audit
   npm run test:rules


================================================================================
8. PRODUCTION PIPELINE & DEPLOYMENT TOPOLOGY
================================================================================
Topology:
* Source Control: GitHub (https://github.com/aifoundationau/socialradar.git)
* Frontend & Serverless Edge: Vercel Production Environment
* Hostinger: Static assets, DNS management, and reverse proxy routing
* Database & Identity: Google Cloud Firebase (Asia-East / Australia regions)

Deployment Protocol:
1. Ensure working tree is clean: git status
2. Run full local build verification: npm run build
3. Push changes to origin main: git push origin main
4. Vercel automatically deploys serverless edge functions upon commit push.
5. Verify production endpoints and confirm Stripe webhook delivery.


================================================================================
9. LICENSING, LEGAL & STATUTORY COMPLIANCE
================================================================================
* MIT License: Free and open usage under the terms of the MIT License. See full
  terms in mitlicence.txt.
* Memorandum of Agreement: Detailed stakeholder governance and equity rights
  outlined in MemorandumOfAgreement.txt.
* Australian Corporations Act: Strict 7-year retention on financial records,
  token transactions, and user communication logs.
* Australian Privacy Act (1988): Complete data protection, explicit customer
  consent, and zero unauthorized data dissemination.

================================================================================
END OF README - AD RADAR 2026
================================================================================

