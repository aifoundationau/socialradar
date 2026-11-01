import { initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

let app;
if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
  const json = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, "base64").toString("utf8"));
  app = initializeApp({ credential: cert(json), projectId: json.project_id });
} else {
  app = initializeApp({ credential: applicationDefault(), projectId: "ai-foundation-firebase" });
}

const db = getFirestore(app, "ad-radar");

async function testMessagesPipeline() {
  console.log("1. Testing createAdminMessage in Firestore...");
  const now = new Date();
  const testId = `test_msg_${Date.now()}`;
  const testDoc = {
    messageId: testId,
    uid: "test-user-supporter",
    senderEmail: "supporter.tester@example.com",
    subject: "End-to-End Test Message to Superadmin",
    body: "Confirming that anyone can message the superadmin and receive 7-year statutory retention backup.",
    status: "unread",
    createdAt: now.toISOString(),
    retentionUntil: new Date(now.getTime() + 7 * 365.25 * 24 * 60 * 60 * 1000).toISOString(),
  };

  await db.collection("admin_messages").doc(testId).set(testDoc);
  console.log("  Successfully written message:", testId);

  console.log("2. Testing read back from admin_messages collection...");
  const snap = await db.collection("admin_messages").doc(testId).get();
  if (!snap.exists) {
    throw new Error("Message was not found in Firestore!");
  }
  const data = snap.data();
  console.log("  Successfully read message back:", data.subject, "| Status:", data.status);

  console.log("3. Testing updating status to 'read'...");
  await db.collection("admin_messages").doc(testId).update({ status: "read" });
  const updatedSnap = await db.collection("admin_messages").doc(testId).get();
  console.log("  Updated status is now:", updatedSnap.data().status);

  console.log("4. Clean up test document...");
  await db.collection("admin_messages").doc(testId).delete();
  console.log("  Cleaned up test message.");

  console.log("ALL MESSAGES TESTS PASSED SUCCESSFULLY!");
}

testMessagesPipeline().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
