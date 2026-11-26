// npm run test:e2e — end-to-end check of the API route handlers without Next.js.
// It was written when the project lived on an exFAT drive, where Turbopack couldn't serve routes that
// import firebase-admin (the drive is NTFS now), so it loads the real handlers with jiti and calls them
// with Web Requests instead of going through the dev server. It uses the real
// `ad-radar` Firestore and Stripe test mode; logins come from the local Auth emulator (started by
// `firebase emulators:exec`), so no real users are created. Everything written is deleted at the end.
import Module, { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// jiti resolves "@/..." aliases through Node (backslash paths on Windows) but relative imports
// with forward slashes, so src/lib modules would load twice and `instanceof ApiError` would fail.
// Normalise every src/ path to forward slashes so each module has exactly one instance, as in Next.
const ROOT = process.cwd().replace(/\\/g, "/");
const SRC = `${ROOT}/src`;
const SRC_NATIVE = join(process.cwd(), "src");
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (...args) {
  const resolved = origResolve.apply(this, args);
  return resolved.startsWith(SRC_NATIVE) ? resolved.replace(/\\/g, "/") : resolved;
};
const require = createRequire(join(ROOT, "package.json"));
if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) throw new Error("Set FIREBASE_AUTH_EMULATOR_HOST");
if (!process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_")) throw new Error("Test-mode Stripe key required");

const emptyModule = join(tmpdir(), "ad-radar-empty-server-only.js");
writeFileSync(emptyModule, "module.exports = {};");
const { createJiti } = require("jiti");
const jiti = createJiti(`${ROOT}/e2e.js`, {
  alias: { "@": SRC, "server-only": emptyModule.replace(/\\/g, "/") },
  moduleCache: true,
});
const load = (p) => jiti.import(`${SRC}/${p}`);

const { adminAuth, db } = await load("lib/firebase-admin.ts");
const contracts = await load("lib/contracts.ts");
const ledger = await load("lib/token-ledger.ts");
const pricing = await load("lib/pricing.ts");
const ragEngine = await load("lib/rag-engine.ts");
const stripeLib = await load("lib/stripe.ts");
const brandsLib = await load("lib/brands.ts");
const adAgentsLib = await load("lib/ad-agents.ts");
const adAgentDisplay = await load("lib/ad-agent-display.ts");
const hashtagEngine = await load("lib/hashtag-engine.ts");
const geminiLib = await load("lib/gemini.ts");
const routes = {
  me: await load("app/api/me/route.ts"),
  brands: await load("app/api/brands/route.ts"),
  checkout: await load("app/api/wallet/checkout/route.ts"),
  webhook: await load("app/api/webhooks/stripe/route.ts"),
  rag: await load("app/api/rag/route.ts"),
  adminConfig: await load("app/api/admin/config/route.ts"),
  contractors: await load("app/api/contractors/route.ts"),
  customize: await load("app/api/customize/route.ts"),
  customizeAiAssist: await load("app/api/customize/ai-assist/route.ts"),
  library: await load("app/api/library/route.ts"),
  brandsGlobal: await load("app/api/brands/global/route.ts"),
  adAgent: await load("app/api/ad-agent/route.ts"),
};
const Stripe = require("stripe");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// ---------- tiny test kit ----------
let passed = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    passed++;
    console.log(`PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`FAIL  ${name}  ${detail === undefined ? "" : JSON.stringify(detail).slice(0, 400)}`);
  }
}
async function callUrl(route, method, url, { token, body, key, headers = {}, raw } = {}) {
  const h = { "Content-Type": "application/json", ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  if (key) h["x-idempotency-key"] = key;
  const res = await route[method](
    new Request(url, { method, headers: h, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)) }),
  );
  return { status: res.status, json: await res.json().catch(() => null) };
}
const call = (route, method, opts) => callUrl(route, method, "http://localhost:3000/api/test", opts);
const userDoc = async (uid) => (await db.doc(`users/${uid}`).get()).data();
const key = (label) => `e2e_${label}_${Date.now()}`;

// ---------- fixtures ----------
const stamp = Date.now().toString(36);
const UID = `e2eUser${stamp}`;
const OTHER = `e2eOther${stamp}`;
const AGENT2 = `e2eAgentTwo${stamp}`;
const SUPER_UID = `e2eSuper${stamp}`;
const created = { sessions: [], ragIds: [], leadIds: [], messageIds: [], agentIds: [] };

async function idTokenFor(uid, email, emailVerified = false) {
  await adminAuth.createUser({ uid, email, emailVerified }).catch((e) => {
    if (e.code !== "auth/uid-already-exists") throw e;
  });
  const custom = await adminAuth.createCustomToken(uid);
  const res = await fetch(
    `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=emulator`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: custom, returnSecureToken: true }) },
  );
  const json = await res.json();
  if (!json.idToken) throw new Error(`emulator sign-in failed: ${JSON.stringify(json)}`);
  return json.idToken;
}

const brandInput = (name) => ({
  brandName: name,
  productServiceDescription: "Cold-brew coffee concentrate delivered monthly.",
  targetAudienceAvatar: "Busy professionals who want cafe coffee at home.",
  corePainPoints: ["Cafe coffee is expensive", "No time in the morning"],
  uniqueMechanismOrOffer: "20-hour slow steep, first box free.",
  toneOfVoice: "UGC_CASUAL",
  destinationUrl: "https://example.com/coffee",
});

function signedEvent(type, session) {
  const payload = JSON.stringify({
    id: `evt_e2e_${stamp}_${Math.random().toString(36).slice(2, 8)}`,
    object: "event",
    type,
    api_version: "2026-09-30.endive",
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    data: { object: session },
  });
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET });
  return { raw: payload, headers: { "stripe-signature": header } };
}
const paidSession = (id, overrides = {}) => ({
  id,
  object: "checkout.session",
  mode: "payment",
  payment_status: "paid",
  client_reference_id: UID,
  customer: "cus_e2eTest123",
  customer_details: { email: "e2e@example.com" },
  metadata: { uid: UID, packId: "PACK_500", tokens: "500" },
  ...overrides,
});

try {
  const token = await idTokenFor(UID, "e2e@example.com");
  const otherToken = await idTokenFor(OTHER, "other@example.com");

  // ---------- auth ----------
  check("me: no token → 401", (await call(routes.me, "POST")).status === 401);
  check("me: garbage token → 401", (await call(routes.me, "POST", { token: "abc.def.ghi" })).status === 401);
  const me = await call(routes.me, "POST", { token });
  check("me: bootstraps user doc with 0 tokens", me.status === 200 && me.json.user.tokenBalance === 0 && me.json.user.uid === UID, me);
  check(
    "me: default claims supporter",
    me.json?.claims?.role === "supporter" && me.json?.claims?.tier === "supporter" && me.json?.claims?.isSuperAdmin === false,
    me.json?.claims,
  );
  check("me: second call is a no-op", (await call(routes.me, "POST", { token })).json.user.updatedAt === me.json.user.updatedAt);

  // ---------- brands ----------
  const k1 = key("brand1");
  const b1 = await call(routes.brands, "POST", { token, key: k1, body: brandInput("Brew Co") });
  check("brands POST: 201 + server brandId", b1.status === 201 && /^[a-f0-9]{24}$/.test(b1.json.brand.brandId), b1);
  const b1Id = b1.json.brand.brandId;
  check(
    "brands POST: defaults to in Library (isGlobal: true + synced to global_brands)",
    b1.json.brand.isGlobal === true && (await db.doc(`global_brands/${b1Id}`).get()).exists,
    b1.json.brand,
  );
  const replay = await call(routes.brands, "POST", { token, key: k1, body: brandInput("Brew Co") });
  check("brands POST replay (same key): 200, same brand, no duplicate", replay.status === 200 && replay.json.brand.brandId === b1Id, replay);
  check("first brand auto-active", (await userDoc(UID)).activeBrandId === b1Id);

  const b2 = await call(routes.brands, "POST", { token, key: key("brand2"), body: brandInput("Alpha Tea") });
  const b2Id = b2.json.brand.brandId;
  check("second brand created, active unchanged", b2.status === 201 && (await userDoc(UID)).activeBrandId === b1Id);
  const count = (await db.collection(`users/${UID}/brands`).count().get()).data().count;
  check("exactly 2 brand docs", count === 2, count);

  check(
    "brands POST: invalid body → 400 INVALID_INPUT",
    (await call(routes.brands, "POST", { token, body: { ...brandInput("X"), destinationUrl: "http://insecure" } })).json.error.code === "INVALID_INPUT",
  );
  check("brands POST: malformed idempotency key → 400", (await call(routes.brands, "POST", { token, key: "bad key!", body: brandInput("Y") })).status === 400);

  const patch = await call(routes.brands, "PATCH", { token, body: { activeBrandId: b2Id } });
  check("brands PATCH: switch active brand", patch.status === 200 && (await userDoc(UID)).activeBrandId === b2Id, patch);
  check(
    "brands PATCH: unknown brand → 404 NOT_FOUND",
    (await call(routes.brands, "PATCH", { token, body: { activeBrandId: "doesnotexist000" } })).status === 404,
  );
  check(
    "brands PATCH: other user can't select my brand (404)",
    (await call(routes.brands, "PATCH", { token: otherToken, body: { activeBrandId: b1Id } })).status === 404,
  );

  const put = await call(routes.brands, "PUT", { token, body: { brandId: b1Id, ...brandInput("Brew Co Renamed") } });
  const stored = (await db.doc(`users/${UID}/brands/${b1Id}`).get()).data();
  check("brands PUT: full replace persisted", put.status === 200 && stored.brandName === "Brew Co Renamed", { put, stored });
  check(
    "brands PUT: other user → 404 (scoped to own uid)",
    (await call(routes.brands, "PUT", { token: otherToken, body: { brandId: b1Id, ...brandInput("Hijack") } })).status === 404,
  );
  check(
    "brands PUT: missing brand → 404",
    (await call(routes.brands, "PUT", { token, body: { brandId: "missing0000", ...brandInput("Z") } })).status === 404,
  );

  const del = await call(routes.brands, "DELETE", { token, body: { brandId: b2Id } });
  check("brands DELETE active brand → cleared activeBrandId", del.status === 200 && (await userDoc(UID)).activeBrandId === "", del);
  check("brands DELETE again → 404", (await call(routes.brands, "DELETE", { token, body: { brandId: b2Id } })).status === 404);

  // ---------- checkout (real Stripe test API) ----------
  const pubPricing = await call(routes.checkout, "GET", { headers: { accept: "application/json" } });
  const pack500Cfg = pubPricing.json?.tokenPacks?.find((p) => p.id === "PACK_500");
  const baseCents = Number(pubPricing.json?.audCentsPerToken ?? 100);
  const expectedPack500Cents =
    typeof pack500Cfg?.priceCents === "number" && pack500Cfg.priceCents >= 100
      ? pack500Cfg.priceCents
      : Math.round(500 * baseCents);
  const ck = key("checkout");
  const c1 = await call(routes.checkout, "POST", { token, key: ck, body: { packId: "PACK_500" } });
  check("checkout: returns Stripe URL", c1.status === 200 && c1.json.url?.startsWith("https://checkout.stripe.com/"), c1);
  const c2 = await call(routes.checkout, "POST", { token, key: ck, body: { packId: "PACK_500" } });
  check("checkout replay (same key) → same session URL", c2.json?.url === c1.json?.url);
  const sessions = await stripe.checkout.sessions.list({ limit: 5 });
  const s = sessions.data.find((x) => x.client_reference_id === UID);
  if (s) created.sessions.push(s.id);
  check(
    "checkout session: live PACK_500 AUD amount + metadata uid/pack/tokens",
    s && (s.amount_subtotal === expectedPack500Cents || s.amount_total === expectedPack500Cents) && s.currency === "aud" && s.metadata.uid === UID && s.metadata.packId === "PACK_500" && s.metadata.tokens === "500",
    s && { amountSubtotal: s.amount_subtotal, amountTotal: s.amount_total, expectedPack500Cents, currency: s.currency, metadata: s.metadata },
  );
  check("checkout: no key → 400", (await call(routes.checkout, "POST", { token, body: { packId: "PACK_500" } })).status === 400);
  check("checkout: malformed pack → 400", (await call(routes.checkout, "POST", { token, key: key("badfmt"), body: { packId: "bad id!" } })).status === 400);
  check("checkout: unknown pack → 404", (await call(routes.checkout, "POST", { token, key: key("bad"), body: { packId: "PACK_9" } })).status === 404);

  // ---------- webhook ----------
  const sessId = `cs_test_e2e_${stamp}`;
  const ev = signedEvent("checkout.session.completed", paidSession(sessId));
  const w1 = await call(routes.webhook, "POST", ev);
  check("webhook: paid session credits 500", w1.status === 200 && w1.json.credited === true && w1.json.balanceAfter === 500, w1);
  const u1 = await userDoc(UID);
  check("webhook: balance 500 + stripeCustomerId saved", u1.tokenBalance === 500 && u1.stripeCustomerId === "cus_e2eTest123", u1);
  const tx = (await db.doc(`token_transactions/${sessId}`).get()).data();
  check("ledger: TOPUP +500, balanceAfter 500, ref includes session id", tx?.type === "TOPUP" && tx.delta === 500 && tx.balanceAfter === 500 && typeof tx.referenceId === "string" && tx.referenceId.includes(sessId), tx);

  const w2 = await call(routes.webhook, "POST", signedEvent("checkout.session.completed", paidSession(sessId)));
  check("webhook: redelivery is a no-op", w2.status === 200 && w2.json.credited === false && (await userDoc(UID)).tokenBalance === 500, w2);
  const w3 = await call(routes.webhook, "POST", signedEvent("checkout.session.async_payment_succeeded", paidSession(sessId)));
  check("webhook: async_payment_succeeded for same session doesn't double-credit", w3.json?.credited === false && (await userDoc(UID)).tokenBalance === 500, w3);

  const tampered = { ...signedEvent("checkout.session.completed", paidSession(`cs_test_e2e_tamper_${stamp}`)) };
  tampered.raw = tampered.raw.replace('"tokens":"500"', '"tokens":"50000"');
  check("webhook: tampered body → 400 bad signature", (await call(routes.webhook, "POST", tampered)).status === 400);
  check("webhook: no signature → 400", (await call(routes.webhook, "POST", { raw: "{}" })).status === 400);

  const unpaid = await call(routes.webhook, "POST", signedEvent("checkout.session.completed", paidSession(`cs_test_e2e_unpaid_${stamp}`, { payment_status: "unpaid" })));
  check("webhook: unpaid session not credited", unpaid.json?.credited === false && (await userDoc(UID)).tokenBalance === 500, unpaid);
  const spoof = await call(
    routes.webhook,
    "POST",
    signedEvent("checkout.session.completed", paidSession(`cs_test_e2e_spoof_${stamp}`, { client_reference_id: OTHER })),
  );
  check("webhook: uid ≠ client_reference_id → not credited", spoof.json?.credited === false && (await userDoc(UID)).tokenBalance === 500, spoof);
  check(
    "webhook: other event types acknowledged",
    (await call(routes.webhook, "POST", signedEvent("payment_intent.created", { id: "pi_x", object: "payment_intent" }))).json?.received === true,
  );

  // ---------- Phase 1 ledger gate (used by Phase 3/4 routes) ----------
  // The app may run with free actions or an active freeAccessWindow; the paid path is exercised with fixed costs.
  const liveCosts = { ...pricing.ACTION_COSTS };
  const sysCfgRef = db.doc("system_config/global");
  const sysCfgBefore = (await sysCfgRef.get()).data() ?? null;
  const sysCfgHadFreeOverride =
    sysCfgBefore &&
    (sysCfgBefore.isTokenSystemEnabled === false || sysCfgBefore.freeAccessWindow?.enabled === true);
  if (sysCfgHadFreeOverride) {
    await sysCfgRef.set(
      {
        isTokenSystemEnabled: true,
        freeAccessWindow: {
          ...(sysCfgBefore.freeAccessWindow ?? {}),
          enabled: false,
        },
      },
      { merge: true },
    );
  }
  const okReq = (k) => new Request("http://localhost/api/x", { headers: { Authorization: `Bearer ${token}`, "x-idempotency-key": k } });
  try {
    Object.assign(pricing.ACTION_COSTS, { RADAR_SEARCH: 2, AI_REMIX: 5 });
    const g1 = await ledger.withTokenGate(okReq(key("gate_ok")), "RADAR_SEARCH", "q", async (ctx) => Response.json({ balanceAfter: ctx.balanceAfter }));
    check("gate: successful search charges 2 (500 → 498)", g1.status === 200 && (await userDoc(UID)).tokenBalance === 498);
    const failKey = key("gate_fail");
    const g2 = await ledger.withTokenGate(okReq(failKey), "AI_REMIX", "ad", async () => {
      throw new ledger.UpstreamError("Gemini 503");
    });
    check("gate: upstream failure → 502 + auto-refund (stays 498)", g2.status === 502 && (await userDoc(UID)).tokenBalance === 498, await g2.clone().json());
    const gk = key("gate_replay");
    await ledger.withTokenGate(okReq(gk), "AI_REMIX", "ad", async () => Response.json({}));
    let replayed = null;
    await ledger.withTokenGate(okReq(gk), "AI_REMIX", "ad", async (ctx) => {
      replayed = ctx.replayed;
      return Response.json({});
    });
    check("gate: retried key charges once (498 → 493)", replayed === true && (await userDoc(UID)).tokenBalance === 493);
    await db.doc(`users/${UID}`).update({ tokenBalance: 1 });
    const g4 = await ledger.withTokenGate(okReq(key("gate_poor")), "AI_REMIX", "ad", async () => Response.json({}));
    check("gate: insufficient balance → 402 INSUFFICIENT_TOKENS", g4.status === 402 && (await g4.json()).error.code === "INSUFFICIENT_TOKENS");
    await db.doc(`users/${UID}`).update({ tokenBalance: 50 });
    const g5 = await ledger.withTokenGate(okReq(`${failKey}_refund`), "AI_REMIX", "ad", async () => Response.json({}));
    check("gate: key matching a refund record → 409, not a free replay", g5.status === 409 && (await userDoc(UID)).tokenBalance === 50);
    const g6 = await ledger.withTokenGate(okReq(failKey), "AI_REMIX", "ad", async () => Response.json({}));
    check("gate: replaying a refunded key → 409", g6.status === 409 && (await userDoc(UID)).tokenBalance === 50);
    const g7 = await ledger.withTokenGate(okReq(gk), "AI_REMIX", "other-ad", async () => Response.json({}));
    check("gate: paid key reused for another reference → 409", g7.status === 409 && (await userDoc(UID)).tokenBalance === 50);

    Object.assign(pricing.ACTION_COSTS, { RADAR_SEARCH: 0, AI_REMIX: 0 });
    const freeKey = key("gate_free");
    const g8 = await ledger.withTokenGate(okReq(freeKey), "RADAR_SEARCH", "q", async (ctx) => Response.json({ balanceAfter: ctx.balanceAfter }));
    const freeTx = (await db.doc(`token_transactions/${UID}_${freeKey}`).get()).data();
    check(
      "gate: free action runs with no charge and delta 0 ledger entry",
      g8.status === 200 &&
        (await g8.json()).balanceAfter === 50 &&
        (await userDoc(UID)).tokenBalance === 50 &&
        freeTx?.delta === 0,
      freeTx,
    );
    const g9 = await ledger.withTokenGate(new Request("http://localhost/api/x", { headers: { "x-idempotency-key": key("gate_anon") } }), "RADAR_SEARCH", "q", async () => Response.json({}));
    check("gate: free action still requires sign-in → 401", g9.status === 401);

    // H2: Free window / 0-cost calls must never overwrite earlier paid ledger rows or bypass idempotency checks
    const gFreeOverwritePaid = await ledger.withTokenGate(okReq(gk), "RADAR_SEARCH", "q", async () => Response.json({}));
    const origPaidTx = (await db.doc(`token_transactions/${UID}_${gk}`).get()).data();
    check(
      "gate: free action reusing earlier paid key → 409 and paid delta untouched",
      gFreeOverwritePaid.status === 409 && origPaidTx?.delta === -5 && origPaidTx?.type === "AI_REMIX",
      { status: gFreeOverwritePaid.status, origPaidTx },
    );
    let freeReplayFlag = null;
    const gFreeReplay = await ledger.withTokenGate(okReq(freeKey), "RADAR_SEARCH", "q", async (ctx) => {
      freeReplayFlag = ctx.replayed;
      return Response.json({ balanceAfter: ctx.balanceAfter });
    });
    const gFreeConflictRef = await ledger.withTokenGate(okReq(freeKey), "RADAR_SEARCH", "other-q", async () => Response.json({}));
    check(
      "gate: free key replay → replayed:true; different ref → 409",
      gFreeReplay.status === 200 && freeReplayFlag === true && gFreeConflictRef.status === 409,
      { replayStatus: gFreeReplay.status, freeReplayFlag, conflictStatus: gFreeConflictRef.status },
    );
  } finally {
    Object.assign(pricing.ACTION_COSTS, liveCosts);
    if (sysCfgHadFreeOverride && sysCfgBefore) {
      await sysCfgRef.set(
        {
          isTokenSystemEnabled: sysCfgBefore.isTokenSystemEnabled,
          freeAccessWindow: sysCfgBefore.freeAccessWindow,
        },
        { merge: true },
      );
    }
  }

  // ---------- RAG Studio, Mandatory Human Edit & Multi-Role Approval ----------
  check(
    "rag POST: unauthenticated → 401",
    (await callUrl(routes.rag, "POST", "http://localhost:3000/api/rag", { body: { action: "ADD_ENTRY", translatedText: "Test" } })).status === 401,
  );

  const ragAutoReject = await callUrl(routes.rag, "POST", "http://localhost:3000/api/rag", {
    token,
    body: {
      action: "ADD_ENTRY",
      sourceType: "FAQ",
      section: "E2E FAQ",
      originalText: "How do tokens work on AdRadarHQ?",
      languageCode: "id",
      translatedText: "Bagaimana cara kerja token di AdRadarHQ?",
      autoTranslatedText: "Bagaimana cara kerja token di AdRadarHQ?",
    },
  });
  check("rag POST: unedited auto-translation rejected → 400 INVALID_INPUT", ragAutoReject.status === 400 && ragAutoReject.json?.error?.code === "INVALID_INPUT", ragAutoReject);

  const ragSameSourceReject = await callUrl(routes.rag, "POST", "http://localhost:3000/api/rag", {
    token,
    body: {
      action: "ADD_ENTRY",
      sourceType: "FAQ",
      section: "E2E FAQ",
      originalText: "How do tokens work on AdRadarHQ?",
      languageCode: "id",
      translatedText: "How do tokens work on AdRadarHQ?",
    },
  });
  check("rag POST: untranslated source copy rejected → 400 INVALID_INPUT", ragSameSourceReject.status === 400 && ragSameSourceReject.json?.error?.code === "INVALID_INPUT", ragSameSourceReject);

  const ragPendingRes = await callUrl(routes.rag, "POST", "http://localhost:3000/api/rag", {
    token,
    body: {
      action: "ADD_ENTRY",
      sourceType: "FAQ",
      section: "E2E FAQ",
      originalText: "How do tokens work on AdRadarHQ?",
      languageCode: "id",
      translatedText: "Token AdRadarHQ menggunakan bilangan bulat penuh (1 Token = 1 AUD) secara otomatis.",
    },
  });
  const pendingRagId = ragPendingRes.json?.item?.ragId;
  if (pendingRagId) created.ragIds.push(pendingRagId);
  check(
    "rag POST: supporter human-edited translation → 200 pending approval",
    ragPendingRes.status === 200 && Boolean(pendingRagId) && ragPendingRes.json?.item?.approvalStatus === "pending",
    ragPendingRes,
  );

  const publicBefore = await callUrl(routes.rag, "GET", "http://localhost:3000/api/rag?sourceType=FAQ&approvedOnly=1");
  check(
    "rag GET public approvedOnly: excludes pending translation",
    publicBefore.status === 200 && !publicBefore.json?.entries?.some((e) => e.ragId === pendingRagId),
    publicBefore.json?.stats,
  );

  const supporterApprove = await callUrl(routes.rag, "PUT", "http://localhost:3000/api/rag", {
    token,
    body: { action: "APPROVE_ENTRY", ragId: pendingRagId },
  });
  check("rag PUT APPROVE_ENTRY: supporter forbidden → 403", supporterApprove.status === 403, supporterApprove);

  await call(routes.me, "POST", { token: otherToken });
  await db.doc(`users/${OTHER}`).set({ role: "ad_agent", roles: ["ad_agent", "supporter"] }, { merge: true });
  const adAgentApprove = await callUrl(routes.rag, "PUT", "http://localhost:3000/api/rag", {
    token: otherToken,
    body: { action: "APPROVE_ENTRY", ragId: pendingRagId },
  });
  check(
    "rag PUT APPROVE_ENTRY: ad_agent approves pending translation → 200 approved",
    adAgentApprove.status === 200 &&
      adAgentApprove.json?.item?.approvalStatus === "approved" &&
      adAgentApprove.json?.item?.approvedByRole === "ad_agent",
    adAgentApprove,
  );

  const publicAfter = await callUrl(routes.rag, "GET", "http://localhost:3000/api/rag?sourceType=FAQ&approvedOnly=1");
  check(
    "rag GET public approvedOnly: includes translation once approved",
    publicAfter.status === 200 && publicAfter.json?.entries?.some((e) => e.ragId === pendingRagId),
    publicAfter.json?.stats,
  );

  // ---------- Timed Free Access Window: Free 15m/30m/60m/24h for ALL Subscribers ----------
  check(
    "freeAccess schema: accepts 1440m (24h) and rejects 120m",
    contracts.FreeAccessDurationMinutesSchema.safeParse(1440).success === true &&
      contracts.FreeAccessDurationMinutesSchema.safeParse(120).success === false,
  );
  check(
    "freeAccess countdown: formats >=1h and <1h cleanly",
    pricing.formatFreeAccessCountdown(86399) === "23h 59m 59s" &&
      pricing.formatFreeAccessCountdown(900) === "15m 00s",
  );
  const future24hIso = new Date(Date.now() + 86_400_000).toISOString();
  const nonSubProfile = { tokenBalance: 0, role: "supporter" };
  check(
    "freeAccess pricing: all 4 durations (15m/30m/60m/1440m) waive charging for non-monthly supporter subscribers in AU",
    [15, 30, 60, 1440].every((dur) => {
      const win = { enabled: true, durationMinutes: dur, expiresAt: future24hIso, allowedCountries: ["AU"] };
      return (
        pricing.isFreeAccessWindowActive(win) === true &&
        pricing.isChargingEnabled({ isTokenSystemEnabled: true, freeAccessWindow: win }, Date.now(), nonSubProfile, false, "AU") === false
      );
    }),
  );
  check(
    "freeAccess pricing: country-restricted window requires matching country and Worldwide waives omitted country",
    pricing.isChargingEnabled(
      {
        isTokenSystemEnabled: true,
        freeAccessWindow: { enabled: true, durationMinutes: 60, expiresAt: future24hIso, allowedCountries: ["AU"] },
      },
      Date.now(),
      nonSubProfile,
      false,
      "DE",
    ) === true &&
      pricing.isChargingEnabled(
        {
          isTokenSystemEnabled: true,
          freeAccessWindow: { enabled: true, durationMinutes: 60, expiresAt: future24hIso, allowedCountries: ["AU"] },
        },
        Date.now(),
        nonSubProfile,
        false,
        undefined,
      ) === true &&
      pricing.isChargingEnabled(
        {
          isTokenSystemEnabled: true,
          freeAccessWindow: { enabled: true, durationMinutes: 1440, expiresAt: future24hIso, allowedCountries: ["ALL"] },
        },
        Date.now(),
        nonSubProfile,
        false,
        undefined,
      ) === false,
  );
  const nonSuperFree24 = await callUrl(routes.adminConfig, "PUT", "http://localhost:3000/api/admin/config", {
    token,
    body: { action: "SET_FREE_ACCESS_WINDOW", durationMinutes: 1440 },
  });
  check("admin config PUT SET_FREE_ACCESS_WINDOW (1440m): non-superadmin forbidden → 403", nonSuperFree24.status === 403, nonSuperFree24);

  // ---------- Security & hardening regressions (M4, H4, M6) ----------
  const repeatCheckout = stripeLib.buildCheckoutParams({
    uid: UID,
    email: "e2e@example.com",
    stripeCustomerId: "cus_TestCustomer123",
    pack: { id: "PACK_100", name: "Growth Pack", tokens: 100, priceCents: 10000, priceUsdCents: 6500 },
    appUrl: "http://localhost:3000",
    buyerCountry: "AU",
  });
  check(
    "stripe M4: repeat purchase reuses stored stripeCustomerId without creating duplicate customer",
    repeatCheckout.customer === "cus_TestCustomer123" &&
      repeatCheckout.customer_update?.address === "auto" &&
      repeatCheckout.customer_email === undefined &&
      repeatCheckout.customer_creation === undefined,
    { customer: repeatCheckout.customer, customer_email: repeatCheckout.customer_email, customer_creation: repeatCheckout.customer_creation },
  );

  const sampleCommunityBrand = {
    ...brandInput("Acme Community"),
    brandId: "gb_test_redact",
    productServiceDescription: "A".repeat(220),
    targetAudienceAvatar: "B".repeat(140),
    corePainPoints: ["Pain 1 " + "X".repeat(70), "Pain 2", "Pain 3", "Pain 4"],
    uniqueMechanismOrOffer: "Secret 20-hour extraction formula worth $10,000",
    landingPageUrls: ["https://example.com/a", "https://example.com/b"],
    isGlobal: true,
    authorUid: UID,
    brandTextFileName: "Acme Community - 2026-11-20.txt",
    brandTextFileContent: "FULL SECRET BRAND DOSSIER CONTENT",
  };
  const redactedForOther = brandsLib.redactCommunityBrandForListing(sampleCommunityBrand, {
    callerUid: OTHER,
    isSuperAdmin: false,
    cloneCharging: true,
    txtDownloadCharging: true,
  });
  const unredactedForOwner = brandsLib.redactCommunityBrandForListing(sampleCommunityBrand, {
    callerUid: UID,
    isSuperAdmin: false,
    cloneCharging: true,
    txtDownloadCharging: true,
  });
  check(
    "brands H4: community listing redacts txt & offer for non-owner when paid, preserves for owner",
    redactedForOther.brandTextFileContent === undefined &&
      redactedForOther.uniqueMechanismOrOffer === "" &&
      redactedForOther.landingPageUrls?.length === 1 &&
      redactedForOther.productServiceDescription.length <= 160 &&
      unredactedForOwner.brandTextFileContent === "FULL SECRET BRAND DOSSIER CONTENT" &&
      unredactedForOwner.uniqueMechanismOrOffer === sampleCommunityBrand.uniqueMechanismOrOffer,
  );

  const contractorForbidden = await callUrl(routes.contractors, "POST", "http://localhost:3000/api/contractors", {
    token,
    body: {
      action: "CREATE_CONTRACTOR",
      contractor: {
        name: "Unauthorized Contractor",
        location: "Sydney, NSW",
        email: "c@example.com",
        phone: "+61 400 000 000",
        expertise: "Video Editor",
      },
    },
  });
  check(
    "contractors M6: non-Ad-Agent supporter forbidden → 403 FORBIDDEN",
    contractorForbidden.status === 403 && contractorForbidden.json?.error?.code === "FORBIDDEN",
    contractorForbidden,
  );

  // ---------- Customize never free (M2) & Ad Agent share after Stripe fees (H1) ----------
  const custGetRes = await callUrl(routes.customize, "GET", "http://localhost:3000/api/customize", { token });
  check(
    "customize M2: GET /api/customize always returns costTokens >= 1",
    custGetRes.status === 200 && Number(custGetRes.json?.costTokens) >= 1,
    custGetRes.json?.costTokens,
  );
  await db.doc(`users/${UID}`).update({ tokenBalance: 0 });
  const custZeroCostGate = await ledger.withTokenGate(
    new Request("http://localhost/api/customize", {
      headers: { Authorization: `Bearer ${token}`, "x-idempotency-key": key("cust_m2") },
    }),
    "CUSTOMIZE_SERVICE",
    "cust_m2_ref",
    async () => Response.json({ ok: true }),
    0,
  );
  check(
    "customize M2: CUSTOMIZE_SERVICE never free (0 cost clamped >=1 → 402 INSUFFICIENT_TOKENS)",
    custZeroCostGate.status === 402 && (await custZeroCostGate.json()).error?.code === "INSUFFICIENT_TOKENS",
    { status: custZeroCostGate.status },
  );

  // SuperAdmin Free Rule: isChargingEnabled & withTokenGate always treat SuperAdmin as 0 tokens (Free)
  check(
    "superadmin free rule: isChargingEnabled(..., isSuperAdmin=true) always returns false",
    pricing.isChargingEnabled({ isTokenSystemEnabled: true, freeAccessWindow: null }, Date.now(), { tokenBalance: 0 }, true, "US") === false,
  );
  const superToken = await idTokenFor(SUPER_UID, "davidrobertson.info@gmail.com", true);
  await db.doc(`users/${SUPER_UID}`).set({ uid: SUPER_UID, email: "davidrobertson.info@gmail.com", role: "superadmin", roles: ["superadmin"], tokenBalance: 0 }, { merge: true });
  const [superCustomizeGet, superLibraryGet, superBrandsGet, superGateRes] = await Promise.all([
    callUrl(routes.customize, "GET", "http://localhost:3000/api/customize", { token: superToken }),
    callUrl(routes.library, "GET", "http://localhost:3000/api/library", { token: superToken }),
    callUrl(routes.brandsGlobal, "GET", "http://localhost:3000/api/brands/global", { token: superToken }),
    ledger.withTokenGate(
      new Request("http://localhost/api/customize", {
        headers: { Authorization: `Bearer ${superToken}`, "x-idempotency-key": key("super_free") },
      }),
      "CUSTOMIZE_SERVICE",
      "super_free_ref",
      async (ctx) => Response.json({ ok: true, cost: ctx.cost, balanceAfter: ctx.balanceAfter }),
      55,
    ),
  ]);
  const superGateJson = await superGateRes.json();
  check(
    "superadmin free rule: 0 tokens charged across GET /api/customize, /api/library, /api/brands/global & withTokenGate(CUSTOMIZE_SERVICE) even with balance 0",
    superCustomizeGet.status === 200 &&
      superCustomizeGet.json?.costTokens === 0 &&
      superCustomizeGet.json?.customizeAiFeeTokens === 0 &&
      superLibraryGet.status === 200 &&
      superLibraryGet.json?.libraryItemFee === 0 &&
      superBrandsGet.status === 200 &&
      superBrandsGet.json?.brandCloneFee === 0 &&
      superBrandsGet.json?.brandTxtDownloadFee === 0 &&
      superGateRes.status === 200 &&
      superGateJson?.cost === 0 &&
      superGateJson?.balanceAfter === 0,
    {
      custCost: superCustomizeGet.json?.costTokens,
      custAi: superCustomizeGet.json?.customizeAiFeeTokens,
      libFee: superLibraryGet.json?.libraryItemFee,
      cloneFee: superBrandsGet.json?.brandCloneFee,
      txtFee: superBrandsGet.json?.brandTxtDownloadFee,
      gateStatus: superGateRes.status,
      gateJson: superGateJson,
    },
  );

  const netAud55 = pricing.netAudCentsAfterStripeFee(5500, 1);
  const sampleAgent = {
    agentId: "agent_e2e_h1",
    uid: UID,
    name: "E2E Agent",
    email: "e2e@example.com",
    phone: "Not specified",
    location: { suburb: "Sydney", state: "NSW", country: "AU", latitude: -33.8688, longitude: 151.2093, label: "Sydney, NSW, AU" },
    redistributionPercentage: 30,
    status: "active",
    inActiveLedger: true,
    isSuperAdminBuiltIn: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const sampleCustomizeReq = {
    requestId: "cust_e2e_h1",
    uid: OTHER,
    userEmail: "other@example.com",
    tokensCharged: 55,
    status: "pending",
    assignedAgentId: "agent_e2e_h1",
    assignedAgentEmail: "e2e@example.com",
    brandName: "Acme",
    productServiceDescription: "Cold brew",
    targetAudienceAvatar: "Founders",
    corePainPoints: ["Cost"],
    uniqueMechanismOrOffer: "Slow steep",
    toneOfVoice: "DIRECT_RESPONSE",
    destinationUrl: "https://example.com",
    extraDetailsAndNotes: "Test",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const [ledgerH1] = await adAgentsLib.getAdAgentDistributionLedger(100, 55, {
    agents: [sampleAgent],
    requests: [sampleCustomizeReq],
    partial: true,
  });
  const displayH1 = adAgentDisplay.computeAdAgentDisplayItem(ledgerH1, {
    customizeServiceUnitTokens: 55,
    audCentsPerTokenUnit: 100,
  });
  check(
    "adAgents H1: share customization revenue after Stripe fees (net 5374c × 30% = 1612c)",
    netAud55 === 5374 &&
      ledgerH1.redistributionAudCents === 1612 &&
      ledgerH1.redistributionUsdCents === pricing.audToUsdCents(1612) &&
      displayH1.redistributionAudCents === 1612,
    { netAud55, serverAud: ledgerH1.redistributionAudCents, displayAud: displayH1.redistributionAudCents },
  );

  // ---------- Optional Customize AI Agent Assistant & Customization AI Fee ----------
  const aiFee = Number(custGetRes.json?.customizeAiFeeTokens);
  check(
    "customize AI: GET /api/customize returns customizeAiFeeTokens >= 0",
    Number.isInteger(aiFee) && aiFee >= 0,
    custGetRes.json?.customizeAiFeeTokens,
  );
  const aiAssistPayload = {
    brandNameHint: "Acme Cold Brew",
    whatYouSell: "Small-batch cold brew coffee concentrate for busy founders",
    preferredTone: "AUTO",
    idealCustomerAndPains: "Founders spending too much on slow cafes\nAfternoon energy crashes",
    uniqueOfferOrMechanism: "20-hour cold steep with 60-day taste guarantee",
    landingPageUrls: ["https://example.com/coffee"],
    versionHint: "Q4 Launch",
    location: {
      suburb: "Sydney",
      state: "NSW",
      country: "AU",
      latitude: -33.8688,
      longitude: 151.2093,
      label: "Sydney, NSW, AU",
    },
    strategistGoalsAndNotes: "Focus on morning speed and cafe savings for Meta video ads",
  };
  if (aiFee >= 1) {
    const aiNoBal = await callUrl(routes.customizeAiAssist, "POST", "http://localhost:3000/api/customize/ai-assist", {
      token,
      key: key("cust_ai_nobal"),
      body: aiAssistPayload,
    });
    check(
      "customize AI: insufficient tokens → 402 INSUFFICIENT_TOKENS",
      aiNoBal.status === 402 && aiNoBal.json?.error?.code === "INSUFFICIENT_TOKENS",
      aiNoBal,
    );
  }
  const startBal = aiFee + 5;
  await db.doc(`users/${UID}`).update({ tokenBalance: startBal });
  const aiKey = key("cust_ai_ok");
  const aiRes = await callUrl(routes.customizeAiAssist, "POST", "http://localhost:3000/api/customize/ai-assist", {
    token,
    key: aiKey,
    body: aiAssistPayload,
  });
  const aiParsed = contracts.CustomizeAiAssistResponseSchema.safeParse(aiRes.json?.brief);
  const balAfterAi = (await userDoc(UID)).tokenBalance;
  const aiReplay = await callUrl(routes.customizeAiAssist, "POST", "http://localhost:3000/api/customize/ai-assist", {
    token,
    key: aiKey,
    body: aiAssistPayload,
  });
  check(
    "customize AI: generates 10-field brief, charges Customization AI Fee once, replays idempotently",
    aiRes.status === 200 &&
      aiParsed.success &&
      aiRes.json?.brief?.brandName === "Acme Cold Brew" &&
      aiRes.json?.brief?.customerLocation?.suburb === "Sydney" &&
      balAfterAi === startBal - aiFee &&
      aiReplay.status === 200 &&
      aiReplay.json?.replayed === true &&
      (await userDoc(UID)).tokenBalance === balAfterAi,
    { status: aiRes.status, parsedOk: aiParsed.success, balAfterAi, expectedBal: startBal - aiFee, replayed: aiReplay.json?.replayed },
  );

  // ---------- Remixed Social Media Ad Text: Hashtag Separation & Algorithm ----------
  const dirtyAdCopy =
    "Upgrade your morning brew in 30 seconds with slow-steeped concentrate. Zero bitterness, café smoothness. #ColdBrew #CoffeeLover\n\nHashtags: #MorningRoutine #BaristaAtHome";
  const extractedInline = hashtagEngine.extractInlineHashtags(dirtyAdCopy);
  const { adText: cleanEnforcedCopy, wordCount: enforcedWords } = geminiLib.enforceMaxAdWords(dirtyAdCopy);
  const hashtagPlatforms = [
    { platform: "TIKTOK", label: "TikTok" },
    { platform: "FACEBOOK", label: "Facebook" },
    { platform: "INSTAGRAM", label: "Instagram" },
    { platform: "GOOGLE_ADS", label: "Google Ads" },
  ];
  const hashtagChecks = hashtagPlatforms.map(({ platform, label }) => {
    const tags = hashtagEngine.buildRemixedAdHashtags({
      platform,
      brand: brandInput("Acme Cold Brew"),
      headline: "Cafe-Grade Cold Brew in 30 Seconds",
      adText: cleanEnforcedCopy,
      cta: "Shop now",
      aiHashtags: extractedInline,
      limit: 8,
    });
    const parsedItem = contracts.RemixedAdTextItemSchema.safeParse({
      platform,
      platformLabel: label,
      headline: "Cafe-Grade Cold Brew in 30 Seconds",
      adText: cleanEnforcedCopy,
      hashtags: tags,
      cta: "Shop now",
      wordCount: enforcedWords,
    });
    return { platform, tags, ok: parsedItem.success && tags.length >= 6 && tags.length <= 8 };
  });
  check(
    "remixedAdText hashtags: adText contains 0 hashtags and all 4 platforms generate 6-8 ranked hashtags",
    !cleanEnforcedCopy.includes("#") &&
      extractedInline.length === 4 &&
      contracts.RemixedAdTextItemSchema.safeParse({
        platform: "INSTAGRAM",
        platformLabel: "Instagram",
        headline: "Test Headline",
        adText: "Copy with #forbiddenTag inside",
        hashtags: ["#AcmeBrand"],
        cta: "Learn more",
        wordCount: 5,
      }).success === false &&
      hashtagChecks.every((c) => c.ok),
    { cleanEnforcedCopy, extractedInline, hashtagChecks },
  );

  // ---------- Ad Agent Completed Search Leads (Australia + First to Respond Claims Customer Details) ----------
  const agent1Email = "other@example.com";
  const agent2Email = "agent2@example.com";
  const agent2Token = await idTokenFor(AGENT2, agent2Email, true);
  await call(routes.me, "POST", { token: agent2Token });
  await db.doc(`users/${AGENT2}`).set({ role: "ad_agent", roles: ["ad_agent", "supporter"], isAdAgent: true }, { merge: true });
  const auAgent1Id = `agent_e2e_au1_${stamp}`;
  const auAgent2Id = `agent_e2e_au2_${stamp}`;
  created.agentIds.push(auAgent1Id, auAgent2Id);
  await Promise.all([
    db.collection("ad_agents").doc(auAgent1Id).set({
      agentId: auAgent1Id,
      uid: OTHER,
      name: "AU Agent One",
      phone: "+61 400 111 111",
      email: agent1Email,
      location: { suburb: "Sydney", state: "NSW", country: "AU", latitude: -33.8688, longitude: 151.2093, label: "Sydney, NSW, AU" },
      status: "active",
      inActiveLedger: true,
      redistributionPercentage: 30,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
    db.collection("ad_agents").doc(auAgent2Id).set({
      agentId: auAgent2Id,
      uid: AGENT2,
      name: "AU Agent Two",
      phone: "+61 400 222 222",
      email: agent2Email,
      location: { suburb: "Melbourne", state: "VIC", country: "AU", latitude: -37.8136, longitude: 144.9631, label: "Melbourne, VIC, AU" },
      status: "active",
      inActiveLedger: true,
      redistributionPercentage: 30,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
  ]);
  const e2eLead = await adAgentsLib.dispatchCompletedSearchLeadToAdAgents({
    txId: `e2e_search_lead_${stamp}`,
    customerUid: UID,
    customerEmail: "e2e@example.com",
    customerRole: "supporter",
    customerCountry: "AU",
    search: {
      platform: "META",
      query: "Solar Batteries Australia",
      country: "AU",
      mediaType: "ALL",
      provenWinnersOnly: true,
      extendedLongevity: false,
      eliteWinnersOnly: false,
      brandId: "",
    },
    resultsCount: 14,
    tokensCharged: 4,
    brand: brandInput("SunPeak Solar"),
  });
  created.leadIds.push(e2eLead.leadId);
  const agent1BeforeClaimGet = await callUrl(routes.adAgent, "GET", "http://localhost:3000/api/ad-agent", { token: otherToken });
  const maskedLeadView = agent1BeforeClaimGet.json?.searchLeads?.find((l) => l.leadId === e2eLead.leadId);
  const firstClaimRes = await callUrl(routes.adAgent, "POST", "http://localhost:3000/api/ad-agent", {
    token: otherToken,
    body: { action: "CLAIM_SEARCH_LEAD", leadId: e2eLead.leadId },
  });
  const secondClaimRes = await callUrl(routes.adAgent, "POST", "http://localhost:3000/api/ad-agent", {
    token: agent2Token,
    body: { action: "CLAIM_SEARCH_LEAD", leadId: e2eLead.leadId },
  });
  const agent2AfterClaimGet = await callUrl(routes.adAgent, "GET", "http://localhost:3000/api/ad-agent", { token: agent2Token });
  const rivalView = agent2AfterClaimGet.json?.searchLeads?.find((l) => l.leadId === e2eLead.leadId);
  const outreachRes = await callUrl(routes.adAgent, "POST", "http://localhost:3000/api/ad-agent", {
    token: otherToken,
    body: {
      action: "SEND_SEARCH_LEAD_OUTREACH",
      leadId: e2eLead.leadId,
      subject: "Custom Ad Package for SunPeak Solar",
      body: "Hi e2e customer, I saw your AU Meta search and can customize a campaign strategy for SunPeak Solar.",
    },
  });
  check(
    "searchLeads: AU lead masks customer until first AU agent claims (unlocks email), blocks 2nd agent (409), allows outreach",
    e2eLead.notifiedAgentEmails.includes(agent1Email) &&
      e2eLead.notifiedAgentEmails.includes(agent2Email) &&
      maskedLeadView?.customerEmail === "hidden-until-claimed@adradarhq.com" &&
      firstClaimRes.status === 200 &&
      firstClaimRes.json?.lead?.customerEmail === "e2e@example.com" &&
      secondClaimRes.status === 409 &&
      rivalView?.customerEmail === "hidden-until-claimed@adradarhq.com" &&
      outreachRes.status === 200 &&
      Boolean(outreachRes.json?.message?.messageId),
    {
      notified: e2eLead.notifiedAgentEmails.slice(0, 4),
      maskedEmail: maskedLeadView?.customerEmail,
      firstClaimStatus: firstClaimRes.status,
      claimedEmail: firstClaimRes.json?.lead?.customerEmail,
      secondClaimStatus: secondClaimRes.status,
      rivalEmail: rivalView?.customerEmail,
      outreachStatus: outreachRes.status,
    },
  );
} catch (err) {
  failures.push(`harness crashed: ${err.stack ?? err}`);
  console.log("CRASH", err);
} finally {
  // ---------- cleanup ----------
  for (const id of created.sessions) await stripe.checkout.sessions.expire(id).catch(() => {});
  for (const ragId of created.ragIds) await ragEngine.deleteRagEntry(ragId).catch(() => {});
  for (const leadId of created.leadIds) {
    const msgs = await db.collection("admin_messages").where("searchLeadId", "==", leadId).get();
    const batch = db.batch();
    msgs.docs.forEach((d) => batch.delete(d.ref));
    batch.delete(db.doc(`ad_agent_search_leads/${leadId}`));
    await batch.commit();
  }
  for (const agentId of created.agentIds) {
    await db.doc(`ad_agents/${agentId}`).delete().catch(() => {});
  }
  for (const uid of [UID, OTHER, AGENT2, SUPER_UID]) {
    const brands = await db.collection(`users/${uid}/brands`).listDocuments();
    const txs = await db.collection("token_transactions").where("uid", "==", uid).get();
    const aiDrafts = await db.collection("customize_ai_drafts").where("uid", "==", uid).get();
    const batch = db.batch();
    brands.forEach((ref) => {
      batch.delete(ref);
      batch.delete(db.doc(`global_brands/${ref.id}`));
    });
    txs.docs.forEach((d) => batch.delete(d.ref));
    aiDrafts.docs.forEach((d) => batch.delete(d.ref));
    batch.delete(db.doc(`users/${uid}`));
    await batch.commit();
    await adminAuth.deleteUser(uid).catch(() => {});
  }
  const remainingCustomRag = await ragEngine.getCustomRagEntries();
  const ragLeftovers = remainingCustomRag.filter((e) => created.ragIds.includes(e.ragId)).length;
  const leftovers = (await db.collection("token_transactions").where("uid", "in", [UID, OTHER, AGENT2, SUPER_UID]).get()).size +
    (await db.collection("customize_ai_drafts").where("uid", "in", [UID, OTHER, AGENT2, SUPER_UID]).get()).size +
    (await db.collection("users").where("uid", "in", [UID, OTHER, AGENT2, SUPER_UID]).get()).size +
    ragLeftovers;
  console.log(`\ncleanup: ${created.sessions.length} Stripe session(s) expired, ${created.ragIds.length} RAG test entry deleted, test docs deleted (leftovers: ${leftovers})`);
  console.log(`${passed} passed, ${failures.length} failed`);
  if (failures.length) console.log("failed:", failures);
  process.exit(failures.length ? 1 : 0);
}
