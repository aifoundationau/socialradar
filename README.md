# Ad Radar (Social Radar)

> Competitive Advertising Intelligence, 4-Pillar Longevity Scoring, and AI Creative Remix Studio for Direct-Response Marketers and Digital Agencies.

[![MIT License](https://img.shields.io/badge/License-MIT-blue.svg)](mitlicence.txt)
[![Next.js 16](https://img.shields.io/badge/Next.js-16.4.3-black)](https://nextjs.org/)
[![React 19](https://img.shields.io/badge/React-19.3.0-blue)](https://react.dev/)
[![Firebase](https://img.shields.io/badge/Firebase-13.1.0-orange)](https://firebase.google.com/)
[![Gemini 2.5 Flash](https://img.shields.io/badge/Google%20GenAI-Gemini%202.5%20Flash-green)](https://deepmind.google/technologies/gemini/)
[![Stripe](https://img.shields.io/badge/Stripe-SDK%2023.0.1-blueviolet)](https://stripe.com/)

---

## Complete Documentation

For the full, detailed system documentation, technical architecture, and operations manual, see **[`readme.txt`](readme.txt)**.

---

## Key Highlights

- **Multi-Platform Winner Intelligence:** Live scraping and ranking across **Meta (Facebook/Instagram)**, **TikTok (Top Ads + Commercial Content Library)**, and **Google Ads (Search, YouTube, Display)** with strict platform isolation.
- **4-Pillar Longevity Matrix:** Objective Composite Scoring (0–100) based on continuous runtime (**Proven 28+d**, **Extended 60+d**, **Top Winners 90%+**), view velocity, scale, and direct-response copy structure.
- **AI Creative Remix Studio:** Powered by Google Gemini 2.5 Flash (`@google/genai`) to deconstruct the persuasion DNA of any winning ad and output 3 production-ready UGC script variations with scene-by-scene storyboards, voiceover, and text overlays.
- **Brand Strategy Portfolio:** Store up to 25 detailed brand profiles (target audience avatars, visceral pain points, unique mechanisms, landing page funnels, tone of voice, and versioning).
- **Customize Brand Strategy Service:** Direct routing to strategy team with 200+ word brief input, 55 token fee, and 10,000-character multi-angle strategy delivery with 1-click Copy Text.
- **Democratic Token Economy:** Strict integer tokens (`Math.round`), AUD platform pricing with exclusive Australian GST (10%) and $0 tax for international/NZ buyers via native Stripe Automatic Tax.
- **Monthly Search Subscription:** 1,000 monthly search tokens for AUD $700/month (configurable by SuperAdmin).
- **Redistributive Equity Ledger:** Automated dividend distribution pool allocating token revenue to registered equity partners under Australian statutory standards.
- **SuperAdmin & Main Admin Governance Suite:** Role-governed administration (5 tabs for Main Admin, full suite for SuperAdmin including messages, RBAC, ledger, pricing, and diagnostics).
- **7-Year Statutory Retention Messaging:** Plain-text anti-tamper compliance archive with Gemini-assisted AI Work Reply Designer and two-step permanent deletion (`Delete` → `Confirm Delete`).
- **Interactive Knowledge Base:** 27 customer-perspective FAQs with instant search, category filtering, and live admin CRUD.
- **100% DOM Automation Bridge:** Deterministic `data-agent-id`, `data-testid`, and `aria-label` attributes on every interactive control (`window.__AD_RADAR_AGENT__`).

---

## Quick Start

```bash
# 1. Clone repository
git clone https://github.com/aifoundationau/socialradar.git
cd ad-radar

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env.local
# Set Firebase, Gemini API, SearchAPI, and Stripe credentials

# 4. Run local development server
npm run dev -- -p 3005

# 5. Open http://localhost:3005
```

---

## Verification & Quality Gates

```bash
# Type-checking
npx tsc --noEmit

# Linting
npm run lint

# Production build test
npm run build

# Firestore security rules audit
npm run test:rules
```

---

## License & Copyright

- **License:** MIT License — see [`mitlicence.txt`](mitlicence.txt) for details.
- **Memorandum of Agreement:** See [`MemorandumOfAgreement.txt`](MemorandumOfAgreement.txt).
- **Copyright:** &copy; 2026 AI Foundation Australia. All rights reserved.
