// npm run test:e2e — end-to-end check of the API route handlers without Next.js.
// The project lives on an exFAT drive where Turbopack can't serve routes that import firebase-admin,
// so this loads the real handlers with jiti and calls them with Web Requests. It uses the real
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
const ledger = await load("lib/token-ledger.ts");
const pricing = await load("lib/pricing.ts");
const routes = {
  me: await load("app/api/me/route.ts"),
  brands: await load("app/api/brands/route.ts"),
  checkout: await load("app/api/wallet/checkout/route.ts"),
  webhook: await load("app/api/webhooks/stripe/route.ts"),
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
async function call(route, method, { token, body, key, headers = {}, raw } = {}) {
  const h = { "Content-Type": "application/json", ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  if (key) h["x-idempotency-key"] = key;
  const res = await route[method](
    new Request("http://localhost:3000/api/test", { method, headers: h, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)) }),
  );
  return { status: res.status, json: await res.json().catch(() => null) };
}
const userDoc = async (uid) => (await db.doc(`users/${uid}`).get()).data();
const key = (label) => `e2e_${label}_${Date.now()}`;

// ---------- fixtures ----------
const stamp = Date.now().toString(36);
const UID = `e2eUser${stamp}`;
const OTHER = `e2eOther${stamp}`;
const created = { sessions: [] };

async function idTokenFor(uid, email) {
  await adminAuth.createUser({ uid, email }).catch((e) => {
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
  check("me: default claims user/starter", me.json?.claims?.role === "user" && me.json?.claims?.tier === "starter", me.json?.claims);
  check("me: second call is a no-op", (await call(routes.me, "POST", { token })).json.user.updatedAt === me.json.user.updatedAt);

  // ---------- brands ----------
  const k1 = key("brand1");
  const b1 = await call(routes.brands, "POST", { token, key: k1, body: brandInput("Brew Co") });
  check("brands POST: 201 + server brandId", b1.status === 201 && /^[a-f0-9]{24}$/.test(b1.json.brand.brandId), b1);
  const b1Id = b1.json.brand.brandId;
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
  const ck = key("checkout");
  const c1 = await call(routes.checkout, "POST", { token, key: ck, body: { packId: "PACK_500" } });
  check("checkout: returns Stripe URL", c1.status === 200 && c1.json.url?.startsWith("https://checkout.stripe.com/"), c1);
  const c2 = await call(routes.checkout, "POST", { token, key: ck, body: { packId: "PACK_500" } });
  check("checkout replay (same key) → same session URL", c2.json?.url === c1.json?.url);
  const sessions = await stripe.checkout.sessions.list({ limit: 5 });
  const s = sessions.data.find((x) => x.client_reference_id === UID);
  if (s) created.sessions.push(s.id);
  check(
    "checkout session: A$79 AUD, metadata uid/pack/tokens",
    s && s.amount_total === 7900 && s.currency === "aud" && s.metadata.uid === UID && s.metadata.packId === "PACK_500" && s.metadata.tokens === "500",
    s && { amount: s.amount_total, currency: s.currency, metadata: s.metadata },
  );
  check("checkout: no key → 400", (await call(routes.checkout, "POST", { token, body: { packId: "PACK_500" } })).status === 400);
  check("checkout: unknown pack → 400", (await call(routes.checkout, "POST", { token, key: key("bad"), body: { packId: "PACK_9" } })).status === 400);

  // ---------- webhook ----------
  const sessId = `cs_test_e2e_${stamp}`;
  const ev = signedEvent("checkout.session.completed", paidSession(sessId));
  const w1 = await call(routes.webhook, "POST", ev);
  check("webhook: paid session credits 500", w1.status === 200 && w1.json.credited === true && w1.json.balanceAfter === 500, w1);
  const u1 = await userDoc(UID);
  check("webhook: balance 500 + stripeCustomerId saved", u1.tokenBalance === 500 && u1.stripeCustomerId === "cus_e2eTest123", u1);
  const tx = (await db.doc(`token_transactions/${sessId}`).get()).data();
  check("ledger: TOPUP +500, balanceAfter 500, ref = session id", tx?.type === "TOPUP" && tx.delta === 500 && tx.balanceAfter === 500 && tx.referenceId === sessId, tx);

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
  // The app may run with free actions; the paid path is exercised with fixed costs.
  const liveCosts = { ...pricing.ACTION_COSTS };
  Object.assign(pricing.ACTION_COSTS, { RADAR_SEARCH: 2, AI_REMIX: 5 });
  const okReq = (k) => new Request("http://localhost/api/x", { headers: { Authorization: `Bearer ${token}`, "x-idempotency-key": k } });
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
  check(
    "gate: free action runs with no charge and no ledger entry",
    g8.status === 200 &&
      (await g8.json()).balanceAfter === 50 &&
      (await userDoc(UID)).tokenBalance === 50 &&
      !(await db.doc(`token_transactions/${UID}_${freeKey}`).get()).exists,
  );
  const g9 = await ledger.withTokenGate(new Request("http://localhost/api/x", { headers: { "x-idempotency-key": key("gate_anon") } }), "RADAR_SEARCH", "q", async () => Response.json({}));
  check("gate: free action still requires sign-in → 401", g9.status === 401);
  Object.assign(pricing.ACTION_COSTS, liveCosts);
} catch (err) {
  failures.push(`harness crashed: ${err.stack ?? err}`);
  console.log("CRASH", err);
} finally {
  // ---------- cleanup ----------
  for (const id of created.sessions) await stripe.checkout.sessions.expire(id).catch(() => {});
  for (const uid of [UID, OTHER]) {
    const brands = await db.collection(`users/${uid}/brands`).listDocuments();
    const txs = await db.collection("token_transactions").where("uid", "==", uid).get();
    const batch = db.batch();
    brands.forEach((ref) => batch.delete(ref));
    txs.docs.forEach((d) => batch.delete(d.ref));
    batch.delete(db.doc(`users/${uid}`));
    await batch.commit();
    await adminAuth.deleteUser(uid).catch(() => {});
  }
  const leftovers = (await db.collection("token_transactions").where("uid", "in", [UID, OTHER]).get()).size +
    (await db.collection("users").where("uid", "in", [UID, OTHER]).get()).size;
  console.log(`\ncleanup: ${created.sessions.length} Stripe session(s) expired, test docs deleted (leftovers: ${leftovers})`);
  console.log(`${passed} passed, ${failures.length} failed`);
  if (failures.length) console.log("failed:", failures);
  process.exit(failures.length ? 1 : 0);
}
