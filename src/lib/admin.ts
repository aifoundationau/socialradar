import "server-only";
import { randomBytes } from "crypto";
import { adminAuth, db, setUserClaims } from "./firebase-admin";
import {
  type AdminMessage,
  type CustomizeRequestDoc,
  type CustomizeRequestInput,
  type EquityPartner,
  type FreeAccessDurationMinutes,
  type FreeAccessWindow,
  type PartnerDistribution,
  type RedistributiveLedgerSummary,
  type StripePurchaseRecord,
  type SystemConfig,
  type TokenPackId,
  type TokenTransactionDoc,
} from "./contracts";
import { TOKEN_PACKS, isFreeAccessWindowActive, normalizeAllowedCountries } from "./pricing";
import { creditTokens } from "./token-ledger";
import { findClosestAdAgent, formatAgentLocationLabel } from "./ad-agents";

const CONFIG_DOC_PATH = "system_config/global";
const PURCHASES_COL = "stripe_purchases";
const MESSAGES_COL = "admin_messages";
const CUSTOMIZE_COL = "customize_requests";

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
  freeAccessWindow: FreeAccessWindow;
}

export const DEFAULT_FREE_ACCESS_WINDOW: FreeAccessWindow = {
  enabled: false,
  durationMinutes: null,
  startedAt: null,
  expiresAt: null,
  activatedByEmail: null,
  allowedCountries: ["ALL"],
};

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
    regenerateVariations: 1,
    brandClone: 1,
    customizeService: 55,
  },
  tokenPacks: [
    { id: "PACK_10", name: "Quick Pack (10)", tokens: TOKEN_PACKS.PACK_10.tokens, priceCents: TOKEN_PACKS.PACK_10.priceCents, enabled: true },
    { id: "PACK_50", name: "Creator Pack (50)", tokens: TOKEN_PACKS.PACK_50.tokens, priceCents: TOKEN_PACKS.PACK_50.priceCents, enabled: true },
    { id: "PACK_100", name: "Pro Pack (100)", tokens: TOKEN_PACKS.PACK_100.tokens, priceCents: TOKEN_PACKS.PACK_100.priceCents, enabled: true },
  ],
  monthlySubscription: {
    enabled: true,
    priceAud: 500,
    searchesPerMonth: 1000,
    name: "Monthly Search Subscription",
    description: "1,000 monthly searches for AUD $500/month. Options for every search: Every option is one token. This gives you 1,000 of those.",
  },
  freeAccessWindow: DEFAULT_FREE_ACCESS_WINDOW,
  equityPartners: [],
  updatedAt: new Date().toISOString(),
};

/** Retrieves system config from Firestore or returns default. Auto-expires Timed Free Access Windows past expiresAt. */
export async function getSystemConfig(): Promise<AdminSystemConfig> {
  try {
    const snap = await db.doc(CONFIG_DOC_PATH).get();
    if (!snap.exists) {
      await db.doc(CONFIG_DOC_PATH).set(DEFAULT_CONFIG);
      return DEFAULT_CONFIG;
    }
    const data = snap.data() || {};
    const rawWindow = data.freeAccessWindow as Partial<FreeAccessWindow> | undefined;
    const savedCountries = normalizeAllowedCountries(rawWindow?.allowedCountries);
    let normalizedWindow: FreeAccessWindow = {
      ...DEFAULT_FREE_ACCESS_WINDOW,
      ...(rawWindow || {}),
      allowedCountries: savedCountries,
    };

    if (normalizedWindow.enabled && !isFreeAccessWindowActive(normalizedWindow)) {
      normalizedWindow = {
        ...DEFAULT_FREE_ACCESS_WINDOW,
        allowedCountries: savedCountries,
      };
      // Best-effort async cleanup in Firestore when timer expires
      db.doc(CONFIG_DOC_PATH)
        .update({
          freeAccessWindow: normalizedWindow,
          updatedAt: new Date().toISOString(),
        })
        .catch(() => {});
    }

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
        Array.isArray(data.tokenPacks) && data.tokenPacks.length > 0
          ? data.tokenPacks
          : DEFAULT_CONFIG.tokenPacks,
      monthlySubscription: {
        ...DEFAULT_CONFIG.monthlySubscription!,
        ...(data.monthlySubscription || {}),
      },
      freeAccessWindow: normalizedWindow,
    };
  } catch (err) {
    console.warn("[admin] failed to fetch system config, using default", err);
    return DEFAULT_CONFIG;
  }
}

/**
 * SuperAdmin-exclusive control to turn on a Timed Free Access Window (15, 30, or 60 minutes),
 * turn it off (`durationMinutes = null`), or update `allowedCountries` (`durationMinutes = undefined`).
 * While active, the web app is free to use for Monthly Subscribers in the selected countries.
 */
export async function setFreeAccessWindow(
  durationMinutes: FreeAccessDurationMinutes | null | undefined,
  callerEmail: string,
  allowedCountries?: string[]
): Promise<AdminSystemConfig> {
  const current = await getSystemConfig();
  const nextCountries =
    allowedCountries !== undefined
      ? normalizeAllowedCountries(allowedCountries)
      : normalizeAllowedCountries(current.freeAccessWindow?.allowedCountries);

  if (durationMinutes === undefined) {
    const freeAccessWindow: FreeAccessWindow = {
      ...(current.freeAccessWindow ?? DEFAULT_FREE_ACCESS_WINDOW),
      allowedCountries: nextCountries,
    };
    return updateSystemConfig({ freeAccessWindow });
  }

  const now = new Date();
  const freeAccessWindow: FreeAccessWindow =
    durationMinutes === 15 || durationMinutes === 30 || durationMinutes === 60
      ? {
          enabled: true,
          durationMinutes,
          startedAt: now.toISOString(),
          expiresAt: new Date(now.getTime() + durationMinutes * 60_000).toISOString(),
          activatedByEmail: callerEmail.toLowerCase(),
          allowedCountries: nextCountries,
        }
      : {
          ...DEFAULT_FREE_ACCESS_WINDOW,
          allowedCountries: nextCountries,
        };

  return updateSystemConfig({ freeAccessWindow });
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
    monthlySubscription: patch.monthlySubscription
      ? {
          ...(current.monthlySubscription ?? DEFAULT_CONFIG.monthlySubscription!),
          ...patch.monthlySubscription,
        }
      : current.monthlySubscription,
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
    const grossTokens = isActive ? Math.round(totalTokens * (pct / 100)) : 0;
    const grossAudCents = isActive ? Math.round(totalGrossAudCents * (pct / 100)) : 0;
    const grossUsdCents = isActive ? Math.round(totalGrossUsdCents * (pct / 100)) : 0;

    const claimedTokens = Math.round(Number(p.claimedTokens || 0));
    const claimedAudCents = Math.round(Number(p.claimedAudCents || 0));
    const claimedUsdCents = Math.round(Number(p.claimedUsdCents || 0));

    const ownedTokens = Math.max(0, grossTokens - claimedTokens);
    const ownedAudCents = Math.max(0, grossAudCents - claimedAudCents);
    const ownedUsdCents = Math.max(0, grossUsdCents - claimedUsdCents);
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

/**
 * Safely resets the redistributive ledger to 0 by archiving all records from
 * `stripe_purchases` into `archived_stripe_purchases` (with audit metadata)
 * and deleting them from `stripe_purchases`.
 * Recomputes and returns the fresh, zeroed-out RedistributiveLedgerSummary.
 */
export async function resetRedistributiveLedger(callerUid?: string): Promise<{
  deletedCount: number;
  ledger: RedistributiveLedgerSummary;
  recentPurchases: StripePurchaseRecord[];
}> {
  const purchasesSnap = await db.collection(PURCHASES_COL).get();
  const deletedCount = purchasesSnap.size;

  if (!purchasesSnap.empty) {
    const archivedAt = new Date().toISOString();
    const docs = purchasesSnap.docs;
    const CHUNK_SIZE = 200; // 2 ops per doc (set + delete) = 400 ops <= 500 max per batch
    for (let i = 0; i < docs.length; i += CHUNK_SIZE) {
      const chunk = docs.slice(i, i + CHUNK_SIZE);
      const batch = db.batch();
      for (const doc of chunk) {
        const data = doc.data();
        const archiveRef = db.collection("archived_stripe_purchases").doc(doc.id);
        batch.set(archiveRef, {
          ...data,
          archivedAt,
          archivedBy: callerUid || "admin",
        });
        batch.delete(doc.ref);
      }
      await batch.commit();
    }
  }

  const current = await getSystemConfig();
  if (current.equityPartners?.length) {
    const resetPartners = current.equityPartners.map((p) => ({
      ...p,
      claimedTokens: 0,
      claimedAudCents: 0,
      claimedUsdCents: 0,
    }));
    await updateSystemConfig({ equityPartners: resetPartners });
  }

  const [ledger, recentPurchases] = await Promise.all([
    getRedistributiveLedger(),
    getStripePurchases(50),
  ]);

  return { deletedCount, ledger, recentPurchases };
}

/**
 * Resets an individual Owner / Partner's accumulated tokens to 0 in the Redistribution Ledger
 * and also resets their user wallet tokenBalance to 0 (if a user account exists with their email).
 */
export async function resetPartnerTokens(params: {
  partnerId: string;
  resetByEmail: string;
  callerUid?: string;
}): Promise<{
  equityPartners: EquityPartner[];
  clearedTokens: number;
  partnerEmail: string;
}> {
  const current = await getSystemConfig();
  const partners = current.equityPartners || [];
  const partnerIndex = partners.findIndex((p) => p.partnerId === params.partnerId);

  if (partnerIndex === -1) {
    throw new Error(`Equity partner "${params.partnerId}" not found.`);
  }

  const targetPartner = partners[partnerIndex];
  const purchasesSnap = await db.collection(PURCHASES_COL).get();

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

  const pct = Number(targetPartner.percentage) || 0;
  const grossTokens = targetPartner.status === "active" ? Math.round(totalTokens * (pct / 100)) : 0;
  const grossAudCents = targetPartner.status === "active" ? Math.round(totalGrossAudCents * (pct / 100)) : 0;
  const grossUsdCents = targetPartner.status === "active" ? Math.round(totalGrossUsdCents * (pct / 100)) : 0;

  const prevClaimedTokens = Math.round(Number(targetPartner.claimedTokens || 0));
  const clearedTokens = Math.max(0, grossTokens - prevClaimedTokens);

  const updatedPartner: EquityPartner = {
    ...targetPartner,
    claimedTokens: grossTokens,
    claimedAudCents: grossAudCents,
    claimedUsdCents: grossUsdCents,
    lastResetAt: new Date().toISOString(),
    lastResetBy: params.resetByEmail,
  };

  const updatedPartners = [...partners];
  updatedPartners[partnerIndex] = updatedPartner;

  await updateSystemConfig({ equityPartners: updatedPartners });

  // If partner has a user wallet account, also reset their tokenBalance to 0
  try {
    await resetTokensForUser({
      recipientEmail: targetPartner.email,
      note: `Owner Redistribution cleared to 0 by Admin (${params.resetByEmail})`,
      resetByEmail: params.resetByEmail,
    });
  } catch {
    // Non-fatal if no user wallet registered under this email yet
  }

  return {
    equityPartners: updatedPartners,
    clearedTokens,
    partnerEmail: targetPartner.email,
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

const LINK_URL_PATTERN = /(?:https?:\/\/|ftp:\/\/|www\.|data:|\[[^\]]+\]\(\s*(?:https?:\/\/|ftp:\/\/|www\.)[^)]+\))/i;

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
  requestType?: "general" | "customize_request" | "customize_reply";
  customizeRequestId?: string;
}): Promise<AdminMessage> {
  const cleanSubject = params.subject.trim().slice(0, 150);
  const cleanBody = params.body.trim().slice(0, 10000);
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
    ...(params.requestType ? { requestType: params.requestType } : {}),
    ...(params.customizeRequestId ? { customizeRequestId: params.customizeRequestId } : {}),
    createdAt: now.toISOString(),
    retentionUntil: retentionDate.toISOString(),
  };

  await db.collection(MESSAGES_COL).doc(messageId).set(message);

  if (params.customizeRequestId) {
    try {
      await db.collection(CUSTOMIZE_COL).doc(params.customizeRequestId).set(
        {
          status: message.direction === "admin_to_user" ? "completed" : "pending",
          ...(message.direction === "admin_to_user" ? { staffCompletedMessageId: messageId } : {}),
          updatedAt: now.toISOString(),
        },
        { merge: true }
      );
    } catch {
      // Non-fatal if customize request doc does not exist yet
    }
  }
  return message;
}

/** Allows Superadmin to message anyone. Stored for 7 years in compliance archive. Plain text only, no upload links. */
export async function sendSuperadminMessage(params: {
  superadminUid: string;
  superadminEmail: string;
  recipientEmail: string;
  subject: string;
  body: string;
  requestType?: "general" | "customize_request" | "customize_reply";
  customizeRequestId?: string;
}): Promise<AdminMessage> {
  const cleanEmail = params.recipientEmail.toLowerCase().trim();
  const cleanSubject = params.subject.trim().slice(0, 150);
  const cleanBody = params.body.trim().slice(0, 10000);

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
    } else {
      const authUser = await adminAuth.getUserByEmail(cleanEmail);
      if (authUser?.uid) {
        recipientUid = authUser.uid;
      }
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
    ...(recipientUid ? { recipientUid } : {}),
    direction: "admin_to_user",
    subject: cleanSubject,
    body: cleanBody,
    status: "unread",
    ...(params.requestType ? { requestType: params.requestType } : {}),
    ...(params.customizeRequestId ? { customizeRequestId: params.customizeRequestId } : {}),
    createdAt: now.toISOString(),
    retentionUntil: retentionDate.toISOString(),
  };

  await db.collection(MESSAGES_COL).doc(messageId).set(message);

  if (params.customizeRequestId) {
    try {
      await db.collection(CUSTOMIZE_COL).doc(params.customizeRequestId).set(
        {
          status: message.direction === "admin_to_user" ? "completed" : "pending",
          ...(message.direction === "admin_to_user" ? { staffCompletedMessageId: messageId } : {}),
          updatedAt: now.toISOString(),
        },
        { merge: true }
      );
    } catch {
      // Non-fatal if customize request doc does not exist yet
    }
  }
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

/** Permanently deletes an admin message from the Firestore database. */
export async function deleteAdminMessage(messageId: string): Promise<void> {
  if (!messageId.trim()) {
    throw new Error("Message ID is required.");
  }
  await db.collection(MESSAGES_COL).doc(messageId.trim()).delete();
}

// ============================================================================
// PROFESSIONAL CUSTOMIZE SERVICE (ROUTED TO SUPERADMIN & MAIN ADMIN)
// ============================================================================

/**
 * Converts URLs/domains and strips HTML/markdown links so plain-text statutory messages
 * preserve all brand/domain context while passing `assertPlainTextNoLinks` (LINK_URL_PATTERN).
 */
export function sanitizeForPlainTextArchive(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, " ")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
    .replace(/https?:\/\//gi, "")
    .replace(/ftp:\/\//gi, "")
    .replace(/\bwww\./gi, "www [dot] ")
    .replace(/\bdata:/gi, "data - ")
    .replace(/([a-z0-9-]+)\.([a-z]{2,5})\b/gi, "$1 [dot] $2")
    .replace(/\s+\n/g, "\n")
    .trim();
}

/**
 * Records a paid Customize Request in `customize_requests/{requestId}`, dispatches the full
 * structured brief to SuperAdmin and Main Admin in `admin_messages`, and sends an immediate
 * customized confirmation reply to the customer's message panel.
 */
export async function submitCustomizeRequest(params: {
  uid: string;
  userEmail: string;
  tokensCharged: number;
  input: CustomizeRequestInput;
}): Promise<{
  request: CustomizeRequestDoc;
  adminMessage: AdminMessage;
  customerConfirmationMessage: AdminMessage;
}> {
  const now = new Date().toISOString();
  const requestId = `cust_${Date.now()}_${randomBytes(4).toString("hex")}`;
  const cleanEmail = params.userEmail.toLowerCase().trim();

  // Select the closest Ad Agent to the customer's geolocation (or customer's chosen Ad Agent)
  const closest = await findClosestAdAgent(
    params.input.customerLocation,
    params.input.selectedAgentId,
  );
  const assignedAgent = closest.agent;
  const assignedAgentLocation = formatAgentLocationLabel(assignedAgent.location);
  const customerLocationLabel = params.input.customerLocation
    ? formatAgentLocationLabel(params.input.customerLocation)
    : "Default Geolocation";

  const landingSummary = (params.input.landingPageUrls?.length
    ? params.input.landingPageUrls
    : [params.input.destinationUrl]
  )
    .map((u, idx) => `  ${idx + 1}. ${sanitizeForPlainTextArchive(u)}`)
    .join("\n");

  const painPointsSummary = params.input.corePainPoints
    .map((p, idx) => `  ${idx + 1}. ${sanitizeForPlainTextArchive(p)}`)
    .join("\n");

  const staffBriefRaw = [
    `CUSTOMIZE SERVICE BRIEF (${requestId})`,
    `Customer: ${sanitizeForPlainTextArchive(cleanEmail)} | Fee Paid: ${params.tokensCharged} Tokens`,
    `Customer Geolocation: ${sanitizeForPlainTextArchive(customerLocationLabel)}`,
    `Assigned Closest Ad Agent: ${sanitizeForPlainTextArchive(assignedAgent.name)} (${sanitizeForPlainTextArchive(assignedAgent.email)} | Phone: ${sanitizeForPlainTextArchive(assignedAgent.phone)} | Location: ${sanitizeForPlainTextArchive(assignedAgentLocation)} | Distance: ${closest.distanceKm} km)`,
    `Brand Name: ${sanitizeForPlainTextArchive(params.input.brandName)}`,
    `Tone of Voice: ${params.input.toneOfVoice}${params.input.version ? ` | Version/Tag: ${sanitizeForPlainTextArchive(params.input.version)}` : ""}`,
    ``,
    `PRODUCT OR SERVICE:`,
    sanitizeForPlainTextArchive(params.input.productServiceDescription),
    ``,
    `TARGET CUSTOMER AVATAR:`,
    sanitizeForPlainTextArchive(params.input.targetAudienceAvatar),
    ``,
    `CORE PAIN POINTS:`,
    painPointsSummary,
    ``,
    `UNIQUE MECHANISM OR OFFER:`,
    sanitizeForPlainTextArchive(params.input.uniqueMechanismOrOffer),
    ``,
    `LANDING PAGES:`,
    landingSummary,
    ``,
    `EXTRA DETAILS & DESCRIPTIONS TO THINK ABOUT:`,
    sanitizeForPlainTextArchive(params.input.extraDetailsAndNotes),
  ].join("\n");

  const staffSubject = sanitizeForPlainTextArchive(
    `[CUSTOMIZE REQUEST] ${params.input.brandName} (${params.tokensCharged} Tokens) - Agent: ${assignedAgent.name}`
  ).slice(0, 150);

  const staffBody = staffBriefRaw.slice(0, 9800);

  const adminMessage = await createAdminMessage({
    uid: params.uid,
    senderEmail: cleanEmail,
    subject: staffSubject,
    body: staffBody,
    requestType: "customize_request",
    customizeRequestId: requestId,
  });

  // Also notify the assigned Ad Agent in their Message Panel if they have a distinct email
  if (assignedAgent.email && assignedAgent.email !== cleanEmail) {
    try {
      await sendSuperadminMessage({
        superadminUid: "system_customize_concierge",
        superadminEmail: "support@aifoundation.net.au",
        recipientEmail: assignedAgent.email,
        subject: staffSubject,
        body: staffBody,
        requestType: "customize_request",
        customizeRequestId: requestId,
      });
    } catch {
      // ignore if agent notification fails
    }
  }

  // Immediate customized reply message to the customer telling them the closest Ad Agent assigned to handle their customization
  const customerSubject = sanitizeForPlainTextArchive(
    `Customize Request Received: ${params.input.brandName} — Assigned Ad Agent: ${assignedAgent.name}`
  ).slice(0, 150);

  const customerReplyRaw = [
    `Hello from the AdRadarHQ Professional Strategy Team,`,
    ``,
    `We have received your Customize request for "${sanitizeForPlainTextArchive(params.input.brandName)}" (${params.tokensCharged} tokens).`,
    ``,
    `YOUR ASSIGNED CLOSEST AD AGENT:`,
    `Based on your geolocation (${sanitizeForPlainTextArchive(customerLocationLabel)}), we have selected our closest Ad Agent to handle your customization:`,
    `- Ad Agent Name: ${sanitizeForPlainTextArchive(assignedAgent.name)}`,
    `- Ad Agent Phone: ${sanitizeForPlainTextArchive(assignedAgent.phone)}`,
    `- Ad Agent Location: ${sanitizeForPlainTextArchive(assignedAgentLocation)} (${closest.distanceKm} km from your location)`,
    ``,
    `SUMMARY OF YOUR BRIEF IN QUEUE:`,
    `- Brand & Tone: ${sanitizeForPlainTextArchive(params.input.brandName)} (${params.input.toneOfVoice})`,
    `- Core Offer / Mechanism: ${sanitizeForPlainTextArchive(params.input.uniqueMechanismOrOffer.slice(0, 220))}`,
    `- Extra Details Noted: "${sanitizeForPlainTextArchive(params.input.extraDetailsAndNotes.slice(0, 260))}"`,
    ``,
    `WHAT HAPPENS NEXT:`,
    `Your assigned Ad Agent (${sanitizeForPlainTextArchive(assignedAgent.name)}) is reviewing your product positioning, buyer avatar, pain points, and extra notes to craft your customized brand & ad strategy package. As soon as your bespoke work is ready, it will be delivered right here in your Message Panel.`,
  ].join("\n");

  const customerConfirmationMessage = await sendSuperadminMessage({
    superadminUid: "system_customize_concierge",
    superadminEmail: "support@aifoundation.net.au",
    recipientEmail: cleanEmail,
    subject: customerSubject,
    body: customerReplyRaw.slice(0, 9800),
    requestType: "customize_reply",
  });

  const requestDoc: CustomizeRequestDoc = {
    ...params.input,
    requestId,
    uid: params.uid,
    userEmail: cleanEmail,
    tokensCharged: Math.round(params.tokensCharged),
    status: "pending",
    adminMessageId: adminMessage.messageId,
    customerReplyMessageId: customerConfirmationMessage.messageId,
    assignedAgentId: assignedAgent.agentId,
    ...(assignedAgent.uid ? { assignedAgentUid: assignedAgent.uid } : {}),
    assignedAgentName: assignedAgent.name,
    assignedAgentEmail: assignedAgent.email,
    assignedAgentPhone: assignedAgent.phone,
    assignedAgentLocation,
    assignedDistanceKm: closest.distanceKm,
    createdAt: now,
    updatedAt: now,
  };

  await db.collection(CUSTOMIZE_COL).doc(requestId).set(requestDoc);

  return {
    request: requestDoc,
    adminMessage,
    customerConfirmationMessage,
  };
}

/** Fetches Customize requests submitted by a specific customer. */
export async function getUserCustomizeRequests(uid: string, limit = 30): Promise<CustomizeRequestDoc[]> {
  try {
    const snap = await db.collection(CUSTOMIZE_COL).where("uid", "==", uid).limit(limit).get();
    if (snap.empty) return [];
    return snap.docs
      .map((d) => d.data() as CustomizeRequestDoc)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch (err) {
    console.warn("[admin] failed to fetch user customize requests", err);
    return [];
  }
}

/** Fetches a single Customize request by ID (for staff AI reply generation). */
export async function getCustomizeRequestById(requestId: string): Promise<CustomizeRequestDoc | null> {
  try {
    const snap = await db.collection(CUSTOMIZE_COL).doc(requestId).get();
    return snap.exists ? (snap.data() as CustomizeRequestDoc) : null;
  } catch {
    return null;
  }
}

// ============================================================================
// MASTER ORDER LEDGER (ALL TRANSACTIONS, SEARCHES, STRIPE PURCHASES & REFUNDS)
// & SUPERADMIN GIFT TOKENS
// ============================================================================

/**
 * Fetches the Master Order Ledger combining `token_transactions` (all searches, remixes,
 * top-ups, gifts, and refunds) and `stripe_purchases`, enriched with customer email and refund status.
 */
export async function getMasterOrderLedger(limit = 150): Promise<TokenTransactionDoc[]> {
  try {
    const [txSnap, purchasesSnap, usersSnap] = await Promise.all([
      db.collection("token_transactions").orderBy("createdAt", "desc").limit(limit).get(),
      db.collection(PURCHASES_COL).orderBy("createdAt", "desc").limit(50).get(),
      db.collection("users").limit(200).get(),
    ]);

    const uidToEmail = new Map<string, string>();
    const healPromises: Promise<unknown>[] = [];
    for (const uDoc of usersSnap.docs) {
      const uData = uDoc.data();
      if (typeof uData.email === "string" && uData.email) {
        uidToEmail.set(uDoc.id, uData.email.toLowerCase());
      }
      const rawBal = Number(uData.tokenBalance ?? 0);
      if (!Number.isFinite(rawBal) || rawBal < 0) {
        healPromises.push(
          uDoc.ref
            .update({
              tokenBalance: 0,
              updatedAt: new Date().toISOString(),
            })
            .catch(() => undefined),
        );
      }
    }

    const txMap = new Map<string, TokenTransactionDoc>();
    const refundedOrigIds = new Set<string>();

    for (const doc of txSnap.docs) {
      const data = doc.data() as TokenTransactionDoc;
      if (data.type === "REFUND" && data.referenceId) {
        refundedOrigIds.add(data.referenceId);
      }
      const rawBalAfter = Number(data.balanceAfter ?? 0);
      if (!Number.isFinite(rawBalAfter) || rawBalAfter < 0) {
        healPromises.push(
          doc.ref
            .update({
              balanceAfter: 0,
            })
            .catch(() => undefined),
        );
      }
      txMap.set(data.txId || doc.id, {
        ...data,
        txId: data.txId || doc.id,
        email: data.email || uidToEmail.get(data.uid) || undefined,
        balanceAfter: Math.max(0, Math.round(Number.isFinite(rawBalAfter) ? rawBalAfter : 0)),
      });
    }

    if (healPromises.length > 0) {
      await Promise.all(healPromises);
    }

    // Ensure any simulated or direct Stripe purchase records also appear in the Master Order Ledger
    for (const pDoc of purchasesSnap.docs) {
      const p = pDoc.data() as StripePurchaseRecord;
      if (!txMap.has(p.purchaseId)) {
        txMap.set(p.purchaseId, {
          txId: p.purchaseId,
          uid: p.uid,
          email: p.email || uidToEmail.get(p.uid) || undefined,
          type: "TOPUP",
          delta: Math.round(p.tokens),
          balanceAfter: Math.round(p.tokens),
          referenceId: `Stripe ${p.packId} ($${Math.round(p.amountCents / 100)} ${p.currency.toUpperCase()})`,
          createdAt: p.createdAt,
        });
      }
    }

    const rows = Array.from(txMap.values()).map((tx) => ({
      ...tx,
      balanceAfter: Math.max(0, Math.round(Number(tx.balanceAfter ?? 0))),
      refunded: tx.refunded || refundedOrigIds.has(tx.txId),
      refundTxId: tx.refundTxId || (refundedOrigIds.has(tx.txId) ? `${tx.txId}_refund` : undefined),
    }));

    return rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, limit);
  } catch (err) {
    console.warn("[admin] failed to fetch master order ledger", err);
    return [];
  }
}

/**
 * SuperAdmin Add Tokens: adds integer tokens at no charge ($0) to a user's wallet
 * and logs an immutable `GIFT` transaction in `token_transactions`.
 */
export async function giftTokensToUser(params: {
  recipientEmail: string;
  tokens: number;
  note?: string;
  giftedByEmail: string;
}): Promise<{
  txId: string;
  uid: string;
  email: string;
  tokens: number;
  balanceAfter: number;
}> {
  const cleanEmail = params.recipientEmail.trim().toLowerCase();
  const cleanTokens = Math.max(1, Math.round(params.tokens));

  let targetUid: string | null = null;
  try {
    const authUser = await adminAuth.getUserByEmail(cleanEmail);
    targetUid = authUser.uid;
  } catch {
    // Check Firestore users collection if not found via Auth lookup
    const snap = await db.collection("users").where("email", "==", cleanEmail).limit(1).get();
    if (!snap.empty) {
      targetUid = snap.docs[0].id;
    }
  }

  if (!targetUid) {
    throw new Error(`No registered account found for "${cleanEmail}". Ask the user to sign in once first.`);
  }

  const txId = `gift_${Date.now()}_${randomBytes(4).toString("hex")}`;
  const refNote = params.note?.trim()
    ? `Tokens added by Super Admin (${params.giftedByEmail}): ${params.note.trim()}`
    : `Tokens added by Super Admin (${params.giftedByEmail}) — No Charge`;

  const res = await creditTokens({
    uid: targetUid,
    email: cleanEmail,
    amount: cleanTokens,
    referenceId: refNote,
    txId,
    txType: "GIFT",
  });

  return {
    txId: res.txId,
    uid: targetUid,
    email: cleanEmail,
    tokens: cleanTokens,
    balanceAfter: Math.max(0, res.balanceAfter),
  };
}

/**
 * SuperAdmin Remove Tokens: removes integer tokens from a user's wallet.
 * Hard Rule: Nobody can have negative tokens. If the user's balance is 0 or less than
 * the requested removal amount, the removal is rejected so balance never goes below 0.
 */
export async function deductTokensFromUser(params: {
  recipientEmail: string;
  tokens: number;
  note?: string;
  deductedByEmail: string;
}): Promise<{
  txId: string;
  uid: string;
  email: string;
  deductedTokens: number;
  balanceAfter: number;
}> {
  const cleanEmail = params.recipientEmail.trim().toLowerCase();
  const cleanTokens = Math.max(1, Math.round(params.tokens));

  let targetUid: string | null = null;
  try {
    const authUser = await adminAuth.getUserByEmail(cleanEmail);
    targetUid = authUser.uid;
  } catch {
    const snap = await db.collection("users").where("email", "==", cleanEmail).limit(1).get();
    if (!snap.empty) {
      targetUid = snap.docs[0].id;
    }
  }

  if (!targetUid) {
    throw new Error(`No registered account found for "${cleanEmail}".`);
  }

  const userRef = db.collection("users").doc(targetUid);
  const txId = `deduct_${Date.now()}_${randomBytes(4).toString("hex")}`;
  const txRef = db.collection("token_transactions").doc(txId);

  return db.runTransaction(async (t) => {
    const userSnap = await t.get(userRef);
    if (!userSnap.exists) {
      throw new Error(`User wallet not initialized for "${cleanEmail}".`);
    }
    const currentBalance = Math.max(0, Math.round(Number(userSnap.get("tokenBalance") ?? 0)));
    if (currentBalance <= 0) {
      throw new Error(
        `Account "${cleanEmail}" has 0 tokens. Nobody can have negative tokens — all users at 0 tokens must buy more tokens.`
      );
    }
    if (cleanTokens > currentBalance) {
      throw new Error(
        `Cannot remove ${cleanTokens} tokens from "${cleanEmail}" because their current balance is ${currentBalance} tokens. Nobody can have negative tokens (minimum balance is 0).`
      );
    }
    const actualDeduct = cleanTokens;
    const balanceAfter = Math.max(0, currentBalance - actualDeduct);
    const now = new Date().toISOString();

    const refNote = params.note?.trim()
      ? `Tokens removed by Super Admin (${params.deductedByEmail}): ${params.note.trim()}`
      : `Tokens removed by Super Admin (${params.deductedByEmail})`;

    t.update(userRef, { tokenBalance: balanceAfter, updatedAt: now });
    t.create(txRef, {
      txId,
      uid: targetUid!,
      email: cleanEmail,
      type: "ADMIN_DEDUCT",
      delta: -actualDeduct,
      balanceAfter,
      referenceId: refNote,
      createdAt: now,
    });

    return {
      txId,
      uid: targetUid!,
      email: cleanEmail,
      deductedTokens: actualDeduct,
      balanceAfter,
    };
  });
}

/**
 * SuperAdmin & Main Admin Reset Tokens: resets a user's token balance directly to 0
 * and logs an immutable `ADMIN_RESET` transaction in `token_transactions`.
 */
export async function resetTokensForUser(params: {
  recipientEmail: string;
  note?: string;
  resetByEmail: string;
}): Promise<{
  txId: string;
  uid: string;
  email: string;
  clearedTokens: number;
  balanceAfter: number;
}> {
  const cleanEmail = params.recipientEmail.trim().toLowerCase();

  let targetUid: string | null = null;
  try {
    const authUser = await adminAuth.getUserByEmail(cleanEmail);
    targetUid = authUser.uid;
  } catch {
    const snap = await db.collection("users").where("email", "==", cleanEmail).limit(1).get();
    if (!snap.empty) {
      targetUid = snap.docs[0].id;
    }
  }

  if (!targetUid) {
    throw new Error(`No registered account found for "${cleanEmail}".`);
  }

  const userRef = db.collection("users").doc(targetUid);
  const txId = `reset_${Date.now()}_${randomBytes(4).toString("hex")}`;
  const txRef = db.collection("token_transactions").doc(txId);

  return db.runTransaction(async (t) => {
    const userSnap = await t.get(userRef);
    if (!userSnap.exists) {
      throw new Error(`User wallet not initialized for "${cleanEmail}".`);
    }
    const currentBalance = Math.max(0, Math.round(Number(userSnap.get("tokenBalance") ?? 0)));
    const now = new Date().toISOString();

    const refNote = params.note?.trim()
      ? `Token balance reset to 0 by Admin (${params.resetByEmail}): ${params.note.trim()}`
      : `Token balance reset to 0 by Admin (${params.resetByEmail})`;

    t.update(userRef, { tokenBalance: 0, updatedAt: now });
    t.create(txRef, {
      txId,
      uid: targetUid!,
      email: cleanEmail,
      type: "ADMIN_RESET",
      delta: -currentBalance,
      balanceAfter: 0,
      referenceId: refNote,
      createdAt: now,
    });

    return {
      txId,
      uid: targetUid!,
      email: cleanEmail,
      clearedTokens: currentBalance,
      balanceAfter: 0,
    };
  });
}
