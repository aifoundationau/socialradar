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
const W = { uid: "userC", token: { email: "c@example.com" } };
// Super Admin = a database admin email, verified (isSuperAdmin() in firestore.rules).
const SuperAdmin = { uid: "superUser", token: { email: "support@aifoundation.net.au", email_verified: true } };
const SuperAdminUnverified = { uid: "superUnverified", token: { email: "support@aifoundation.net.au", email_verified: false } };
// Main Admin = appointed by Super Admin, i.e. recorded on users/adminUser (mocked per case below).
const Admin = { uid: "adminUser", token: { email: "admin@example.com" } };
// Claims another app in the shared Firebase project might set. None of them may grant anything here.
const ForeignRoleAdmin = { uid: "foreignA", token: { email: "x@example.com", role: "admin" } };
const ForeignAdminFlag = { uid: "foreignB", token: { email: "y@example.com", admin: true } };
const ForeignSuperFlags = { uid: "foreignC", token: { email: "z@example.com", role: "superadmin", isSuperAdmin: true, superadmin: true } };
// The Ad Agent who owns a record that has no uid yet, matched by verified email.
const AgentD = { uid: "userD", token: { email: "d@example.com", email_verified: true } };
const AgentDUnverified = { uid: "userD", token: { email: "d@example.com", email_verified: false } };

const ownedByA = { data: { uid: "userA" } };
const messageForB = { data: { uid: "userA", recipientUid: "userB" } };
const reqAssignedToB = { data: { uid: "userA", assignedAgentUid: "userB" } };
const agentOfA = { data: { uid: "userA", email: "a@example.com", bankOrPayIdDetails: "BSB 000-000 ACC 00000000" } };
const agentOfDNoUid = { data: { email: "d@example.com", bankOrPayIdDetails: "PayID d@example.com" } };
const contractorOfA = { data: { agentUid: "userA", agentEmail: "a@example.com", payIdPaymentDetails: "PayID 0400 000 000" } };
const contractorOfDNoUid = { data: { agentEmail: "d@example.com", payIdPaymentDetails: "PayID 0400 000 001" } };

// get() of a users/{uid} record in this database, i.e. the roles Super Admin recorded for that user.
const usersRecord = (uid, data) => ({
  function: "get",
  args: [{ exactValue: P(`users/${uid}`) }],
  result: { value: data === null ? null : { data } },
});
const appointedAdmin = [usersRecord("adminUser", { role: "admin", roles: ["admin", "supporter"] })];
const supporter = (uid) => [usersRecord(uid, { role: "supporter", roles: ["supporter"] })];
const foreignUsers = [
  usersRecord("foreignA", { role: "supporter", roles: ["supporter"] }),
  usersRecord("foreignB", { role: "supporter", roles: ["supporter"] }),
  usersRecord("foreignC", { role: "supporter", roles: ["supporter"] }),
];

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
  ["other user's ledger entry: get", "DENY", { auth: V, path: P("token_transactions/tx1"), method: "get" }, ownedByA, supporter("userB")],
  ["appointed main admin: get ledger entry", "ALLOW", { auth: Admin, path: P("token_transactions/tx1"), method: "get" }, ownedByA, appointedAdmin],
  ["superadmin: get ledger entry", "ALLOW", { auth: SuperAdmin, path: P("token_transactions/tx1"), method: "get" }, ownedByA],
  ["superadmin email, unverified: get ledger entry", "DENY", { auth: SuperAdminUnverified, path: P("token_transactions/tx1"), method: "get" }, ownedByA, supporter("superUnverified")],
  ["other app's role:admin claim: get ledger entry", "DENY", { auth: ForeignRoleAdmin, path: P("token_transactions/tx1"), method: "get" }, ownedByA, foreignUsers],
  ["other app's role:admin claim, no Ad Radar record: get ledger entry", "DENY", { auth: ForeignRoleAdmin, path: P("token_transactions/tx1"), method: "get" }, ownedByA, [usersRecord("foreignA", null)]],
  ["other app's superadmin claims: get ledger entry", "DENY", { auth: ForeignSuperFlags, path: P("token_transactions/tx1"), method: "get" }, ownedByA, foreignUsers],
  ["ledger: create", "DENY", { auth: U, path: P("token_transactions/tx2"), method: "create" }],
  ["ledger: update", "DENY", { auth: U, path: P("token_transactions/tx1"), method: "update" }, ownedByA],
  ["ledger: delete", "DENY", { auth: U, path: P("token_transactions/tx1"), method: "delete" }, ownedByA],
  ["own remix: get", "ALLOW", { auth: U, path: P("remixes/r1"), method: "get" }, ownedByA],
  ["other user's remix: get", "DENY", { auth: V, path: P("remixes/r1"), method: "get" }, ownedByA],
  ["own admin message: get", "ALLOW", { auth: U, path: P("admin_messages/msg1"), method: "get" }, ownedByA],
  ["recipient user: get admin message", "ALLOW", { auth: V, path: P("admin_messages/msg_to_b"), method: "get" }, messageForB],
  ["other user's admin message: get", "DENY", { auth: V, path: P("admin_messages/msg1"), method: "get" }, ownedByA, supporter("userB")],
  ["third-party user: get admin message with recipientUid", "DENY", { auth: W, path: P("admin_messages/msg_to_b"), method: "get" }, messageForB, supporter("userC")],
  ["appointed main admin: get admin message", "ALLOW", { auth: Admin, path: P("admin_messages/msg1"), method: "get" }, ownedByA, appointedAdmin],
  ["superadmin: get admin message", "ALLOW", { auth: SuperAdmin, path: P("admin_messages/msg1"), method: "get" }, ownedByA],
  ["other app's admin:true claim: get admin message", "DENY", { auth: ForeignAdminFlag, path: P("admin_messages/msg1"), method: "get" }, ownedByA, foreignUsers],
  ["other app's superadmin claims: get admin message", "DENY", { auth: ForeignSuperFlags, path: P("admin_messages/msg1"), method: "get" }, ownedByA, foreignUsers],
  ["signed out: get admin message", "DENY", { path: P("admin_messages/msg1"), method: "get" }, ownedByA],
  ["admin message: create", "DENY", { auth: U, path: P("admin_messages/msg2"), method: "create" }],
  ["stripe purchase: get as non-admin", "DENY", { auth: U, path: P("stripe_purchases/sp1"), method: "get" }, ownedByA, supporter("userA")],
  ["stripe purchase: get as appointed main admin", "ALLOW", { auth: Admin, path: P("stripe_purchases/sp1"), method: "get" }, ownedByA, appointedAdmin],
  ["stripe purchase: get as superadmin", "ALLOW", { auth: SuperAdmin, path: P("stripe_purchases/sp1"), method: "get" }, ownedByA],
  ["stripe purchase: get with other app's role:admin claim", "DENY", { auth: ForeignRoleAdmin, path: P("stripe_purchases/sp1"), method: "get" }, ownedByA, foreignUsers],
  ["stripe purchase: get with other app's admin:true claim", "DENY", { auth: ForeignAdminFlag, path: P("stripe_purchases/sp1"), method: "get" }, ownedByA, foreignUsers],
  ["signed out: get stripe purchase", "DENY", { path: P("stripe_purchases/sp1"), method: "get" }, ownedByA],
  ["stripe purchase: create", "DENY", { auth: U, path: P("stripe_purchases/sp2"), method: "create" }],
  ["own customize request: get", "ALLOW", { auth: U, path: P("customize_requests/req1"), method: "get" }, ownedByA],
  ["assigned agent: get customize request", "ALLOW", { auth: V, path: P("customize_requests/req_assigned_b"), method: "get" }, reqAssignedToB],
  ["other user customize request: get", "DENY", { auth: V, path: P("customize_requests/req1"), method: "get" }, ownedByA, supporter("userB")],
  ["unassigned third party: get customize request", "DENY", { auth: W, path: P("customize_requests/req_assigned_b"), method: "get" }, reqAssignedToB, supporter("userC")],
  ["appointed main admin: get customize request", "ALLOW", { auth: Admin, path: P("customize_requests/req1"), method: "get" }, ownedByA, appointedAdmin],
  ["superadmin: get customize request", "ALLOW", { auth: SuperAdmin, path: P("customize_requests/req1"), method: "get" }, ownedByA],
  ["other app's role:admin claim: get customize request", "DENY", { auth: ForeignRoleAdmin, path: P("customize_requests/req1"), method: "get" }, ownedByA, foreignUsers],
  ["signed out: get customize request", "DENY", { path: P("customize_requests/req1"), method: "get" }, ownedByA],
  ["customize request: create", "DENY", { auth: U, path: P("customize_requests/req2"), method: "create" }],
  ["customize request: update", "DENY", { auth: U, path: P("customize_requests/req1"), method: "update" }, ownedByA],
  ["customize request: delete", "DENY", { auth: U, path: P("customize_requests/req1"), method: "delete" }, ownedByA],
  ["ad agent: get own record (bank details) by uid", "ALLOW", { auth: U, path: P("ad_agents/agent1"), method: "get" }, agentOfA],
  ["ad agent: get own record by verified email (no uid yet)", "ALLOW", { auth: AgentD, path: P("ad_agents/agent2"), method: "get" }, agentOfDNoUid],
  ["unverified email matching the record: get ad agent", "DENY", { auth: AgentDUnverified, path: P("ad_agents/agent2"), method: "get" }, agentOfDNoUid],
  ["other user: get ad agent (bank details)", "DENY", { auth: V, path: P("ad_agents/agent1"), method: "get" }, agentOfA],
  ["appointed main admin: get ad agent (bank details)", "DENY", { auth: Admin, path: P("ad_agents/agent1"), method: "get" }, agentOfA, appointedAdmin],
  ["other app's admin:true claim: get ad agent", "DENY", { auth: ForeignAdminFlag, path: P("ad_agents/agent1"), method: "get" }, agentOfA],
  ["superadmin: get ad agent (bank details)", "ALLOW", { auth: SuperAdmin, path: P("ad_agents/agent1"), method: "get" }, agentOfA],
  ["signed out: get ad agent", "DENY", { path: P("ad_agents/agent1"), method: "get" }, agentOfA],
  ["signed in user: create ad agent", "DENY", { auth: U, path: P("ad_agents/agent2"), method: "create" }],
  ["signed in user: update ad agent", "DENY", { auth: U, path: P("ad_agents/agent1"), method: "update" }, { data: { name: "Fake" } }],
  ["signed in user: delete ad agent", "DENY", { auth: U, path: P("ad_agents/agent1"), method: "delete" }],
  ["signed out: create ad agent", "DENY", { path: P("ad_agents/agent1"), method: "create" }, { data: { name: "Fake" } }],
  ["ad agent: get own contractor (PayID) by uid", "ALLOW", { auth: U, path: P("ad_agent_contractors/c1"), method: "get" }, contractorOfA],
  ["ad agent: get own contractor by verified email", "ALLOW", { auth: AgentD, path: P("ad_agent_contractors/c2"), method: "get" }, contractorOfDNoUid],
  ["other user: get ad agent contractor (PayID)", "DENY", { auth: V, path: P("ad_agent_contractors/c1"), method: "get" }, contractorOfA],
  ["appointed main admin: get ad agent contractor (PayID)", "DENY", { auth: Admin, path: P("ad_agent_contractors/c1"), method: "get" }, contractorOfA, appointedAdmin],
  ["superadmin: get ad agent contractor", "ALLOW", { auth: SuperAdmin, path: P("ad_agent_contractors/c1"), method: "get" }, contractorOfA],
  ["signed out: get ad agent contractor", "DENY", { path: P("ad_agent_contractors/c1"), method: "get" }, contractorOfA],
  ["signed in user: create ad agent contractor", "DENY", { auth: U, path: P("ad_agent_contractors/c1"), method: "create" }, { data: { name: "Contractor" } }],
  ["signed in user: update ad agent contractor", "DENY", { auth: U, path: P("ad_agent_contractors/c1"), method: "update" }, { data: { name: "Contractor" } }],
  ["signed in user: delete ad agent contractor", "DENY", { auth: U, path: P("ad_agent_contractors/c1"), method: "delete" }],
  ["signed out: create ad agent contractor", "DENY", { path: P("ad_agent_contractors/c1"), method: "create" }, { data: { name: "Contractor" } }],
  ["signed in user: get global brand", "ALLOW", { auth: U, path: P("global_brands/gb1"), method: "get" }],
  ["other user: get global brand", "ALLOW", { auth: V, path: P("global_brands/gb1"), method: "get" }],
  ["signed out: get global brand", "DENY", { path: P("global_brands/gb1"), method: "get" }],
  ["signed in user: create global brand", "DENY", { auth: U, path: P("global_brands/gb1"), method: "create" }, { data: { name: "Nike" } }],
  ["signed in user: update global brand", "DENY", { auth: U, path: P("global_brands/gb1"), method: "update" }, { data: { name: "Nike" } }],
  ["signed in user: delete global brand", "DENY", { auth: U, path: P("global_brands/gb1"), method: "delete" }],
  ["signed out: create global brand", "DENY", { path: P("global_brands/gb1"), method: "create" }, { data: { name: "Nike" } }],
  ["normalized_ads: get (token-gated)", "DENY", { auth: U, path: P("normalized_ads/meta_1"), method: "get" }],
  ["radar_cache: get (token-gated)", "DENY", { auth: U, path: P("radar_cache/abc"), method: "get" }],
  ["unknown collection: get", "DENY", { auth: U, path: P("anything/x"), method: "get" }],
];

const testCases = cases.map(([, expectation, request, resource, functionMocks]) => ({
  expectation,
  request,
  ...(resource ? { resource } : {}),
  ...(functionMocks ? { functionMocks } : {}),
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
