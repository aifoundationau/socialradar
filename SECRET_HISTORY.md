# SECRET_HISTORY — Ad Radar Architectural Log

Local architectural log and milestone tracking. Do not record secrets here.

## Stack
- Next.js 16 (App Router, Turbopack) + TypeScript + Tailwind CSS v4
- Firebase Admin SDK (server authority) + Firebase Web SDK (auth + read-only listeners)
- Firestore database `ad-radar` (nam5, Standard, native mode)
- `@google/genai` (Gemini structured output), Stripe Checkout, SearchApi.io

## Milestones

### 2026-10-29 — Phase 1: Workspace Init, Contracts & Firebase RBAC
- Scaffolded Next.js project. `create-next-app` install step failed under npm 11 `allowScripts` policy; dependencies were installed manually afterwards.
- Added `data-contracts.md` and runtime Zod contracts (`src/lib/contracts.ts`).
- `src/lib/firebase-admin.ts`: singleton Admin app, Firestore bound to named DB `ad-radar`, `verifyRequest()` (Bearer token → custom claims, `role`/`tier` defaults).
- `src/lib/token-ledger.ts`: `deductTokens()` / `refundTokens()` / `creditTokens()` atomic transactions with idempotent deterministic `txId`s, plus `withTokenGate()` (verify → deduct → run → auto-refund on upstream failure).
- `src/lib/api.ts`: standard error envelope and idempotency key parsing.
- Security: `package.json` override pins `@grpc/grpc-js@^1.14.6` under `@firebase/firestore` (GHSA-m9gg-hp2v-232j, GHSA-f596-whhp-79r4). `npm audit` → 0 vulnerabilities.
- Verified: `tsc --noEmit` ✅, `eslint src` ✅, Zod contract tests (7/7) ✅, `npm run dev` ✅.
- Pending: Admin credentials in `.env.local` for live ledger tests against Firestore `ad-radar`; first git commit is blocked by Git's `safe.directory` ownership check on drive E:.

### 2026-10-29 — Isolation requirement & Firestore rules
- Requirement: ad-radar has its own rules and shares nothing with other apps. A named database inside a shared Firebase project is not enough (Auth users, custom claims, IAM/service accounts, Storage bucket and authorized domains are project-wide), so ad-radar needs a dedicated Firebase project.
- Added `firestore.rules` (owner-scoped read-only client access, all writes server-only, default deny) and `firebase.json` targeting the `ad-radar` database only.
- No `.firebaserc` on purpose: deploy with an explicit `--project <dedicated-id>` so nothing lands in a shared project by accident. (Superseded below once the dedicated project existed.)

### 2026-10-29 — Dedicated Firebase project `ad-radar-au`
- Created GCP project `ad-radar-au` (display name "ad-radar", org aifoundation.net.au; `ad-radar` was taken globally). Added Firebase, web app "ad-radar", Firestore database `ad-radar` (nam5, native, Standard; no billing needed). Rules released to `cloud.firestore/ad-radar`; composite index `token_transactions (uid ASC, createdAt DESC)` READY.
- `.firebaserc` now pins `default: ad-radar-au`, so the CLI can't fall back to a shared project.
- Org policy `iam.managed.disableServiceAccountKeyCreation` is enforced: no service-account keys. Local server auth = gcloud ADC with `GOOGLE_CLOUD_QUOTA_PROJECT=ad-radar-au` (the ADC file's quota project is the shared `ai-foundation-firebase`). Vercel will need Workload Identity Federation (keyless) at deploy time.
- Drive E: is exFAT (no junctions, no ownership). Turbopack can't link `firebase-admin` into `.next/`, so locally every API route returns 500 and `next build` panics; webpack fails on `readlink` too. Same root cause as Git's `safe.directory` error. Fix: keep the project on NTFS.

### 2026-10-29 — Phase 2: Brand Profiles & Stripe Token Wallet
- `src/lib/pricing.ts`: `ACTION_COSTS` (moved from token-ledger, re-exported) + `TOKEN_PACKS` (100/500/2000 tokens, AUD 19/79/249, placeholder prices).
- API: `POST /api/me` (bootstraps `users/{uid}`), `POST|PUT|DELETE|PATCH /api/brands` (`src/lib/brands.ts`: idempotent create via sha256(uid:key) brandId, 25-brand cap counted inside the transaction, first brand auto-active, delete clears active), `POST /api/wallet/checkout` (hosted Checkout, line items from server table, Stripe idempotency key = ledger txId), `POST /api/webhooks/stripe` (signature-verified; credits `metadata.tokens` with txId = session id; 500 only on ledger failure).
- Contracts: `NOT_FOUND` error code; `BrandDeleteRequest`, `ActiveBrandRequest`, `CheckoutRequest`, `TopupMetadata` schemas.
- UI: `SessionProvider` (Google sign-in, live `users/{uid}` + brands listeners), `(dashboard)` layout with client auth gate, `TopNavWallet` (live balance, brand switcher, Buy tokens), `/brands` manager + form, `/wallet` (balance, packs → Checkout, return banner, live ledger history).
- Verified: `tsc` ✅, `eslint .` ✅, contract checks 13/13 ✅, Stripe test API accepts both Checkout variants (new + returning customer) ✅, `/`, `/brands`, `/wallet` render 200 in dev ✅.
- Decision: project stays on E: (exFAT). API routes are tested outside Next instead:
  - `npm run test:rules` — 16/16 ✅ (firestore.rules via the Rules :test API; nothing deployed).
  - `npm run test:e2e` — 39/39 ✅ (real route handlers via jiti, real `ad-radar` Firestore + Stripe test mode, Auth emulator logins; covers auth, brands CRUD/idempotency/cross-user isolation, Checkout, webhook signature/redelivery/tamper/unpaid/spoof, token gate charge/refund/replay/402; cleans up after itself).
- Google sign-in enabled on `ad-radar-au` (authorized domains: localhost, ad-radar-au.firebaseapp.com, ad-radar-au.web.app). Stripe CLI 1.55.3 installed; `STRIPE_WEBHOOK_SECRET` is the CLI forwarding secret.
