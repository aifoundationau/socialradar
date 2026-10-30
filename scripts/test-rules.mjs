// npm run test:rules — checks firestore.rules with the Firebase Rules :test API (the console's Rules
// Playground). Nothing is deployed and no data is read; needs a gcloud login with access to ai-foundation-firebase.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const PROJECT = "ai-foundation-firebase";
const rules = readFileSync(process.argv[2] ?? "firestore.rules", "utf8");
const token = execSync("gcloud auth print-access-token", { encoding: "utf8" }).trim();
const P = (p) => `/databases/ad-radar/documents/${p}`;
const U = { uid: "userA", token: { email: "a@example.com" } };
const V = { uid: "userB", token: { email: "b@example.com" } };
const ownedByA = { data: { uid: "userA" } };

const cases = [
  ["own user doc: get", "ALLOW", { auth: U, path: P("users/userA"), method: "get" }],
  ["other user doc: get", "DENY", { auth: V, path: P("users/userA"), method: "get" }],
  ["signed out: get user doc", "DENY", { path: P("users/userA"), method: "get" }],
  ["own user doc: update (balance tamper)", "DENY", { auth: U, path: P("users/userA"), method: "update" }, { data: { tokenBalance: 0 } }],
  ["own user doc: create", "DENY", { auth: U, path: P("users/userA"), method: "create" }],
  ["own brand: get", "ALLOW", { auth: U, path: P("users/userA/brands/b1"), method: "get" }],
  ["other user's brand: get", "DENY", { auth: V, path: P("users/userA/brands/b1"), method: "get" }],
  ["own brand: create", "DENY", { auth: U, path: P("users/userA/brands/b2"), method: "create" }],
  ["own ledger entry: get", "ALLOW", { auth: U, path: P("token_transactions/tx1"), method: "get" }, ownedByA],
  ["other user's ledger entry: get", "DENY", { auth: V, path: P("token_transactions/tx1"), method: "get" }, ownedByA],
  ["ledger: create", "DENY", { auth: U, path: P("token_transactions/tx2"), method: "create" }],
  ["own remix: get", "ALLOW", { auth: U, path: P("remixes/r1"), method: "get" }, ownedByA],
  ["other user's remix: get", "DENY", { auth: V, path: P("remixes/r1"), method: "get" }, ownedByA],
  ["normalized_ads: get (token-gated)", "DENY", { auth: U, path: P("normalized_ads/meta_1"), method: "get" }],
  ["radar_cache: get (token-gated)", "DENY", { auth: U, path: P("radar_cache/abc"), method: "get" }],
  ["unknown collection: get", "DENY", { auth: U, path: P("anything/x"), method: "get" }],
];

const testCases = cases.map(([, expectation, request, resource]) => ({
  expectation,
  request,
  ...(resource ? { resource } : {}),
}));

const res = await fetch(`https://firebaserules.googleapis.com/v1/projects/${PROJECT}:test`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "x-goog-user-project": PROJECT,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    source: { files: [{ name: "firestore.rules", content: rules }] },
    testSuite: { testCases },
  }),
});
const json = await res.json();
if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(json)}`);
if (json.issues?.length) console.log("compile issues:", JSON.stringify(json.issues));

let failed = 0;
json.testResults.forEach((r, i) => {
  const ok = r.state === "SUCCESS";
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${cases[i][1].padEnd(5)}  ${cases[i][0]}${ok ? "" : "  " + JSON.stringify(r.debugMessages ?? r.errorPosition ?? r)}`);
});
console.log(`\n${cases.length - failed}/${cases.length} rules cases passed`);
process.exit(failed ? 1 : 0);
