import "server-only";
import { randomBytes } from "crypto";
import { db, setUserClaims } from "./firebase-admin";
import {
  type AdminMessage,
  type EquityPartner,
  type PartnerDistribution,
  type RedistributiveLedgerSummary,
  type StripePurchaseRecord,
  type SystemConfig,
  type TokenPackId,
} from "./contracts";
import { TOKEN_PACKS } from "./pricing";

const CONFIG_DOC_PATH = "system_config/global";
const PURCHASES_COL = "stripe_purchases";
const MESSAGES_COL = "admin_messages";

export interface ExtendedTokenPack {
  id: TokenPackId | string;
  name: string;
  tokens: number;
  priceCents: number;
  enabled: boolean;
}

export interface AdminSystemConfig extends SystemConfig {
  tokenPacks: ExtendedTokenPack[];
  equityPartners: EquityPartner[];
}

export const DEFAULT_CONFIG: AdminSystemConfig = {
  isTokenSystemEnabled: true,
  isAudEnabled: true,
  isUsdEnabled: true,
  audCentsPerToken: 100,
  usdCentsPerToken: 100,
  serviceCosts: {
    searchStandard: 1,
    searchProvenWinners: 1,
    searchExtendedDays: 1,
    searchEliteScore: 1,
    aiRemix: 1,
    brandClone: 1,
  },
  tokenPacks: [
    { id: "PACK_10", name: "Quick Pack (10)", tokens: TOKEN_PACKS.PACK_10.tokens, priceCents: TOKEN_PACKS.PACK_10.priceCents, enabled: true },
    { id: "PACK_50", name: "Creator Pack (50)", tokens: TOKEN_PACKS.PACK_50.tokens, priceCents: TOKEN_PACKS.PACK_50.priceCents, enabled: true },
    { id: "PACK_100", name: "Pro Pack (100)", tokens: TOKEN_PACKS.PACK_100.tokens, priceCents: TOKEN_PACKS.PACK_100.priceCents, enabled: true },
  ],
  equityPartners: [],
  updatedAt: new Date().toISOString(),
};

/** Retrieves system config from Firestore or returns default. */
export async function getSystemConfig(): Promise<AdminSystemConfig> {
  try {
    const snap = await db.doc(CONFIG_DOC_PATH).get();
    if (!snap.exists) {
      await db.doc(CONFIG_DOC_PATH).set(DEFAULT_CONFIG);
      return DEFAULT_CONFIG;
    }
    const data = snap.data() || {};
    return {
      ...DEFAULT_CONFIG,
      ...data,
      serviceCosts: {
        ...DEFAULT_CONFIG.serviceCosts,
        ...(data.serviceCosts || {}),
      },
      equityPartners: Array.isArray(data.equityPartners) ? data.equityPartners : [],
      audCentsPerToken: typeof data.audCentsPerToken === "number" ? data.audCentsPerToken : DEFAULT_CONFIG.audCentsPerToken,
      tokenPacks:
        Array.isArray(data.tokenPacks) && data.tokenPacks.some((p: { id?: string }) => p.id === "PACK_10")
          ? data.tokenPacks
          : DEFAULT_CONFIG.tokenPacks,
    };
  } catch (err) {
    console.warn("[admin] failed to fetch system config, using default", err);
    return DEFAULT_CONFIG;
  }
}

/** Updates system config document in Firestore. */
export async function updateSystemConfig(patch: Partial<AdminSystemConfig>): Promise<AdminSystemConfig> {
  const current = await getSystemConfig();
  const next: AdminSystemConfig = {
    ...current,
    ...patch,
    serviceCosts: {
      ...current.serviceCosts,
      ...(patch.serviceCosts ?? {}),
    },
    updatedAt: new Date().toISOString(),
  };
  await db.doc(CONFIG_DOC_PATH).set(next);
  return next;
}

/** Sets superadmin claims on an authorized administrator account. */
export async function grantDevAdminRole(uid: string): Promise<void> {
  await setUserClaims(uid, {
    role: "superadmin",
    tier: "agency",
    isSuperAdmin: true,
    admin: true,
    superadmin: true,
  });
}

/** Flushes all documents in radar_cache collection. */
export async function flushRadarCache(): Promise<number> {
  const col = db.collection("radar_cache");
  const snap = await col.limit(200).get();
  if (snap.empty) return 0;
  const batch = db.batch();
  for (const doc of snap.docs) {
    batch.delete(doc.ref);
  }
  await batch.commit();
  return snap.size;
}

// ============================================================================
// REDISTRIBUTIVE LEDGER & STRIPE PURCHASES
// ============================================================================

/** Records an immutable Stripe purchase to the ledger. Idempotent on purchaseId. */
export async function recordStripePurchase(record: StripePurchaseRecord): Promise<void> {
  const ref = db.collection(PURCHASES_COL).doc(record.purchaseId);
  await ref.set(record, { merge: true });
}

/** Fetches recent recorded Stripe purchases. */
export async function getStripePurchases(limit = 100): Promise<StripePurchaseRecord[]> {
  try {
    const snap = await db.collection(PURCHASES_COL).orderBy("createdAt", "desc").limit(limit).get();
    if (snap.empty) return [];
    return snap.docs.map((d) => d.data() as StripePurchaseRecord);
  } catch (err) {
    console.warn("[admin] failed to fetch stripe purchases", err);
    return [];
  }
}

/** Aggregates total purchases and computes the redistributive equity breakdown. */
export async function getRedistributiveLedger(): Promise<RedistributiveLedgerSummary> {
  const [config, purchasesSnap] = await Promise.all([
    getSystemConfig(),
    db.collection(PURCHASES_COL).get(),
  ]);

  let totalTokens = 0;
  let totalGrossAudCents = 0;
  let totalGrossUsdCents = 0;

  for (const doc of purchasesSnap.docs) {
    const data = doc.data() as StripePurchaseRecord;
    const tokens = Math.round(Number(data.tokens || 0));
    const rawCents = Math.round(Number(data.amountCents || 0));
    const curr = (data.currency || "aud").toLowerCase();

    totalTokens += tokens;

    if (curr === "usd") {
      totalGrossUsdCents += rawCents;
      totalGrossAudCents += Math.round(rawCents / 0.65);
    } else {
      totalGrossAudCents += rawCents;
      totalGrossUsdCents += Math.round(rawCents * 0.65);
    }
  }

  const totalGrossCents = totalGrossAudCents;

  const partners = config.equityPartners || [];
  const activePartners = partners.filter((p) => p.status === "active");
  const allocatedPercentage = activePartners.reduce((acc, p) => acc + (Number(p.percentage) || 0), 0);
  const treasuryPercentage = Math.max(0, 100 - allocatedPercentage);

  const treasuryTokens = Math.round(totalTokens * (treasuryPercentage / 100));
  const treasuryAudCents = Math.round(totalGrossAudCents * (treasuryPercentage / 100));
  const treasuryUsdCents = Math.round(totalGrossUsdCents * (treasuryPercentage / 100));
  const treasuryCents = treasuryAudCents;

  const distributions: PartnerDistribution[] = partners.map((p) => {
    const pct = Number(p.percentage) || 0;
    const isActive = p.status === "active";
    const ownedTokens = isActive ? Math.round(totalTokens * (pct / 100)) : 0;
    const ownedAudCents = isActive ? Math.round(totalGrossAudCents * (pct / 100)) : 0;
    const ownedUsdCents = isActive ? Math.round(totalGrossUsdCents * (pct / 100)) : 0;
    const ownedCents = ownedAudCents;
    return {
      partnerId: p.partnerId,
      name: p.name || p.email.split("@")[0] || p.email,
      email: p.email,
      percentage: pct,
      ownedTokens,
      ownedCents,
      ownedAudCents,
      ownedUsdCents,
      status: p.status,
    };
  });

  return {
    totalTokens,
    totalGrossCents,
    totalGrossAudCents,
    totalGrossUsdCents,
    totalPurchasesCount: purchasesSnap.size,
    allocatedPercentage,
    treasuryPercentage,
    treasuryTokens,
    treasuryCents,
    treasuryAudCents,
    treasuryUsdCents,
    distributions,
  };
}

/** Adds a new equity partner to system config. */
export async function addEquityPartner(
  partner: Omit<EquityPartner, "createdAt" | "partnerId">
): Promise<EquityPartner[]> {
  const current = await getSystemConfig();
  const partners = current.equityPartners || [];

  const activeTotal = partners
    .filter((p) => p.status === "active")
    .reduce((acc, p) => acc + p.percentage, 0);

  if (partner.status === "active" && activeTotal + partner.percentage > 100) {
    throw new Error(`Total active partner allocation cannot exceed 100%. Currently allocated: ${activeTotal}%.`);
  }

  const cleanEmail = partner.email.trim().toLowerCase();
  const cleanName = partner.name?.trim() || cleanEmail.split("@")[0] || cleanEmail;

  const newPartner: EquityPartner = {
    ...partner,
    name: cleanName,
    email: cleanEmail,
    partnerId: `eq_${Date.now()}_${randomBytes(4).toString("hex")}`,
    createdAt: new Date().toISOString(),
  };

  const updatedPartners = [...partners, newPartner];
  await updateSystemConfig({ equityPartners: updatedPartners });
  return updatedPartners;
}

/** Updates an equity partner. */
export async function updateEquityPartner(
  partnerId: string,
  patch: Partial<EquityPartner>
): Promise<EquityPartner[]> {
  const current = await getSystemConfig();
  const partners = current.equityPartners || [];
  const updatedPartners = partners.map((p) => (p.partnerId === partnerId ? { ...p, ...patch } : p));
  await updateSystemConfig({ equityPartners: updatedPartners });
  return updatedPartners;
}

/** Deletes an equity partner. */
export async function deleteEquityPartner(partnerId: string): Promise<EquityPartner[]> {
  const current = await getSystemConfig();
  const partners = current.equityPartners || [];
  const updatedPartners = partners.filter((p) => p.partnerId !== partnerId);
  await updateSystemConfig({ equityPartners: updatedPartners });
  return updatedPartners;
}

// ============================================================================
// ADMIN MESSAGING (7-YEAR PLAIN TEXT STATUTORY RETENTION)
// ============================================================================

const LINK_URL_PATTERN = /(?:https?:\/\/|ftp:\/\/|www\.|data:|[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,5}(:[0-9]{1,5})?(\/.*)?|\[.*?\]\(.*?\))/i;

export function assertPlainTextNoLinks(text: string, fieldName = "Text") {
  if (/<[^>]*>/i.test(text)) {
    throw new Error(`${fieldName} contains forbidden HTML tags. Plain text only.`);
  }
  if (LINK_URL_PATTERN.test(text)) {
    throw new Error(`${fieldName} contains links or file upload URLs. Plain text communication only.`);
  }
}

/** Creates a user message for superadmin with 7-year statutory retention backup. */
export async function createAdminMessage(params: {
  uid: string;
  senderEmail: string;
  subject: string;
  body: string;
}): Promise<AdminMessage> {
  const cleanSubject = params.subject.trim().slice(0, 150);
  const cleanBody = params.body.trim().slice(0, 2000);
  if (!cleanSubject) throw new Error("Subject is required");
  if (!cleanBody) throw new Error("Message body is required");

  assertPlainTextNoLinks(cleanSubject, "Subject");
  assertPlainTextNoLinks(cleanBody, "Message body");

  const now = new Date();
  // 7-year statutory retention in milliseconds
  const retentionDate = new Date(now.getTime() + 7 * 365.25 * 24 * 60 * 60 * 1000);
  const messageId = `msg_${Date.now()}_${randomBytes(4).toString("hex")}`;

  const message: AdminMessage = {
    messageId,
    uid: params.uid,
    senderEmail: params.senderEmail.toLowerCase().trim(),
    direction: "user_to_admin",
    subject: cleanSubject,
    body: cleanBody,
    status: "unread",
    createdAt: now.toISOString(),
    retentionUntil: retentionDate.toISOString(),
  };

  await db.collection(MESSAGES_COL).doc(messageId).set(message);
  return message;
}

/** Allows Superadmin to message anyone. Stored for 7 years in compliance archive. Plain text only, no upload links. */
export async function sendSuperadminMessage(params: {
  superadminUid: string;
  superadminEmail: string;
  recipientEmail: string;
  subject: string;
  body: string;
}): Promise<AdminMessage> {
  const cleanEmail = params.recipientEmail.toLowerCase().trim();
  const cleanSubject = params.subject.trim().slice(0, 150);
  const cleanBody = params.body.trim().slice(0, 2000);

  if (!cleanEmail) throw new Error("Recipient email is required.");
  if (!cleanSubject) throw new Error("Subject is required.");
  if (!cleanBody) throw new Error("Message body is required.");

  assertPlainTextNoLinks(cleanSubject, "Subject");
  assertPlainTextNoLinks(cleanBody, "Message body");

  let recipientUid: string | undefined;
  try {
    const userQuery = await db.collection("users").where("email", "==", cleanEmail).limit(1).get();
    if (!userQuery.empty) {
      recipientUid = userQuery.docs[0].id;
    }
  } catch {
    // Proceed without recipientUid
  }

  const now = new Date();
  const retentionDate = new Date(now.getTime() + 7 * 365.25 * 24 * 60 * 60 * 1000);
  const messageId = `msg_out_${Date.now()}_${randomBytes(4).toString("hex")}`;

  const message: AdminMessage = {
    messageId,
    uid: params.superadminUid,
    senderEmail: params.superadminEmail.toLowerCase().trim(),
    recipientEmail: cleanEmail,
    recipientUid,
    direction: "admin_to_user",
    subject: cleanSubject,
    body: cleanBody,
    status: "unread",
    createdAt: now.toISOString(),
    retentionUntil: retentionDate.toISOString(),
  };

  await db.collection(MESSAGES_COL).doc(messageId).set(message);
  return message;
}

/** Fetches messages sent to superadmin or created by superadmin. */
export async function getAdminMessages(limit = 100): Promise<AdminMessage[]> {
  try {
    const snap = await db.collection(MESSAGES_COL).orderBy("createdAt", "desc").limit(limit).get();
    if (snap.empty) return [];
    return snap.docs.map((d) => d.data() as AdminMessage);
  } catch (err) {
    console.warn("[admin] failed to fetch admin messages", err);
    return [];
  }
}

/** Retrieves messages for a standard user (sent by user or sent to user by Superadmin). */
export async function getUserMessages(email: string, uid: string, limit = 50): Promise<AdminMessage[]> {
  const cleanEmail = email.toLowerCase().trim();
  try {
    const [sentSnap, receivedSnap] = await Promise.all([
      db.collection(MESSAGES_COL).where("uid", "==", uid).limit(limit).get(),
      db.collection(MESSAGES_COL).where("recipientEmail", "==", cleanEmail).limit(limit).get(),
    ]);

    const map = new Map<string, AdminMessage>();
    sentSnap.docs.forEach((d) => map.set(d.id, d.data() as AdminMessage));
    receivedSnap.docs.forEach((d) => map.set(d.id, d.data() as AdminMessage));

    return Array.from(map.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  } catch (err) {
    console.warn("[admin] failed to fetch user messages", err);
    return [];
  }
}

/** Updates the status of an admin message (unread | read | archived). */
export async function updateAdminMessageStatus(
  messageId: string,
  status: "unread" | "read" | "archived"
): Promise<void> {
  await db.collection(MESSAGES_COL).doc(messageId).update({ status });
}
