import { initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync, existsSync } from "node:fs";

// Load environment variables from .env.local if present
if (existsSync(".env.local")) {
  const envContent = readFileSync(".env.local", "utf8");
  for (const line of envContent.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

const DATABASE_ID = process.env.FIRESTORE_DATABASE_ID || "ad-radar";
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "ai-foundation-firebase";

console.log(`[verify-database] Initializing Admin SDK for project "${PROJECT_ID}", database "${DATABASE_ID}"...`);

const app = initializeApp({
  credential: applicationDefault(),
  projectId: PROJECT_ID,
});

const db = getFirestore(app, DATABASE_ID);

async function run() {
  const results = [];

  // 1. Check system_config/global
  try {
    const globalSnap = await db.doc("system_config/global").get();
    if (globalSnap.exists) {
      const data = globalSnap.data();
      results.push({ test: "system_config/global", status: "OK", details: `Loaded (isTokenSystemEnabled: ${data?.isTokenSystemEnabled}, AUD base: ${data?.audCentsPerToken}c)` });
    } else {
      results.push({ test: "system_config/global", status: "WARN", details: "Document does not exist yet (will auto-bootstrap on read)" });
    }
  } catch (err) {
    results.push({ test: "system_config/global", status: "FAIL", error: err.message });
  }

  // 2. Check system_config/faqs
  try {
    const faqsSnap = await db.doc("system_config/faqs").get();
    if (faqsSnap.exists) {
      const data = faqsSnap.data();
      const count = Array.isArray(data?.faqs) ? data.faqs.length : 0;
      results.push({ test: "system_config/faqs", status: "OK", details: `Loaded (${count} FAQ items, version: ${data?.version})` });
    } else {
      results.push({ test: "system_config/faqs", status: "WARN", details: "Document does not exist yet" });
    }
  } catch (err) {
    results.push({ test: "system_config/faqs", status: "FAIL", error: err.message });
  }

  // 3. Check system_config/rbac
  try {
    const rbacSnap = await db.doc("system_config/rbac").get();
    if (rbacSnap.exists) {
      const data = rbacSnap.data();
      results.push({ test: "system_config/rbac", status: "OK", details: `Loaded (matrix roles: ${Object.keys(data?.matrix || {}).join(", ")})` });
    } else {
      results.push({ test: "system_config/rbac", status: "WARN", details: "Document does not exist yet" });
    }
  } catch (err) {
    results.push({ test: "system_config/rbac", status: "FAIL", error: err.message });
  }

  // 4. Test atomic transaction write/read/delete on token_transactions
  const testTxId = `test_healthcheck_${Date.now()}`;
  try {
    const testDocRef = db.doc(`token_transactions/${testTxId}`);
    await testDocRef.set({
      txId: testTxId,
      uid: "healthcheck_agent",
      email: "healthcheck@aifoundation.net.au",
      type: "GIFT",
      delta: 0,
      balanceAfter: 0,
      referenceId: "Healthcheck probe",
      createdAt: new Date().toISOString(),
    });

    const verifySnap = await testDocRef.get();
    if (verifySnap.exists && verifySnap.data().txId === testTxId) {
      await testDocRef.delete();
      results.push({ test: "token_transactions (write/read/delete)", status: "OK", details: "Atomic write, verification read & cleanup succeeded" });
    } else {
      results.push({ test: "token_transactions (write/read/delete)", status: "FAIL", details: "Document was not created properly" });
    }
  } catch (err) {
    results.push({ test: "token_transactions (write/read/delete)", status: "FAIL", error: err.message });
  }

  // 5. Check users collection
  try {
    const usersSnap = await db.collection("users").limit(3).get();
    results.push({ test: "users collection", status: "OK", details: `Readable (${usersSnap.size} sample docs fetched)` });
  } catch (err) {
    results.push({ test: "users collection", status: "FAIL", error: err.message });
  }

  // 6. Check admin_messages collection
  try {
    const msgSnap = await db.collection("admin_messages").limit(3).get();
    results.push({ test: "admin_messages collection", status: "OK", details: `Readable (${msgSnap.size} sample docs fetched)` });
  } catch (err) {
    results.push({ test: "admin_messages collection", status: "FAIL", error: err.message });
  }

  // 7. Check customize_requests collection
  try {
    const reqSnap = await db.collection("customize_requests").limit(3).get();
    results.push({ test: "customize_requests collection", status: "OK", details: `Readable (${reqSnap.size} sample docs fetched)` });
  } catch (err) {
    results.push({ test: "customize_requests collection", status: "FAIL", error: err.message });
  }

  // Print results summary
  console.log("\n==================== FIRESTORE DATABASE HEALTH CHECK ====================");
  let allPass = true;
  for (const r of results) {
    const icon = r.status === "OK" ? "✅" : r.status === "WARN" ? "⚠️" : "❌";
    console.log(`${icon} [${r.status}] ${r.test}: ${r.details || r.error}`);
    if (r.status === "FAIL") allPass = false;
  }
  console.log("=========================================================================\n");

  if (!allPass) {
    process.exit(1);
  }
}

run().catch((e) => {
  console.error("Verification failed with uncaught exception:", e);
  process.exit(1);
});
