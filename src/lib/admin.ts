import "server-only";
import { randomBytes } from "crypto";
import { adminAuth, db, setUserClaims } from "./firebase-admin";
import {
  type AdminMessage,
  type CustomizeRequestDoc,
  type CustomizeRequestInput,
  type EquityPartner,
  type PartnerDistribution,
  type RedistributiveLedgerSummary,
  type StripePurchaseRecord,
  type SystemConfig,
  type TokenPackId,
  type TokenTransactionDoc,
} from "./contracts";
import { TOKEN_PACKS } from "./pricing";
import { creditTokens } from "./token-ledger";

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
      monthlySubscription: {
        ...DEFAULT_CONFIG.monthlySubscription!,
        ...(data.monthlySubscription || {}),
      },
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
  requestType?: "general" | "customize_request" | "customize_reply";
  customizeRequestId?: string;
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
    `[CUSTOMIZE REQUEST] ${params.input.brandName} (${params.tokensCharged} Tokens)`
  ).slice(0, 150);

  const staffBody = staffBriefRaw.slice(0, 1980);

  const adminMessage = await createAdminMessage({
    uid: params.uid,
    senderEmail: cleanEmail,
    subject: staffSubject,
    body: staffBody,
    requestType: "customize_request",
    customizeRequestId: requestId,
  });

  // Immediate customized reply message to the customer acknowledging their specific request
  const customerSubject = sanitizeForPlainTextArchive(
    `Customize Request Received: ${params.input.brandName} (Ref ${requestId.slice(-6)})`
  ).slice(0, 150);

  const customerReplyRaw = [
    `Hello from the Social Radar Professional Strategy Team,`,
    ``,
    `We have received your Customize request for "${sanitizeForPlainTextArchive(params.input.brandName)}" (${params.tokensCharged} tokens) and routed your brief directly to our Super Admin and Main Admin creative strategists.`,
    ``,
    `SUMMARY OF YOUR BRIEF IN QUEUE:`,
    `- Brand & Tone: ${sanitizeForPlainTextArchive(params.input.brandName)} (${params.input.toneOfVoice})`,
    `- Core Offer / Mechanism: ${sanitizeForPlainTextArchive(params.input.uniqueMechanismOrOffer.slice(0, 220))}`,
    `- Extra Details Noted: "${sanitizeForPlainTextArchive(params.input.extraDetailsAndNotes.slice(0, 260))}"`,
    ``,
    `WHAT HAPPENS NEXT:`,
    `Our strategists are reviewing your product positioning, buyer avatar, pain points, and extra notes to craft your customized brand & ad strategy package. As soon as your bespoke work is ready, we will deliver the full customized reply right here in your My Messages panel.`,
  ].join("\n");

  const customerConfirmationMessage = await sendSuperadminMessage({
    superadminUid: "system_customize_concierge",
    superadminEmail: "support@aifoundation.net.au",
    recipientEmail: cleanEmail,
    subject: customerSubject,
    body: customerReplyRaw.slice(0, 1980),
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
    for (const uDoc of usersSnap.docs) {
      const uData = uDoc.data();
      if (typeof uData.email === "string" && uData.email) {
        uidToEmail.set(uDoc.id, uData.email.toLowerCase());
      }
    }

    const txMap = new Map<string, TokenTransactionDoc>();
    const refundedOrigIds = new Set<string>();

    for (const doc of txSnap.docs) {
      const data = doc.data() as TokenTransactionDoc;
      if (data.type === "REFUND" && data.referenceId) {
        refundedOrigIds.add(data.referenceId);
      }
      txMap.set(data.txId || doc.id, {
        ...data,
        txId: data.txId || doc.id,
        email: data.email || uidToEmail.get(data.uid) || undefined,
      });
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
 * SuperAdmin Gift Tokens: adds integer tokens at no charge ($0) to a user's wallet
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
    ? `Gift from Super Admin (${params.giftedByEmail}): ${params.note.trim()}`
    : `Gift from Super Admin (${params.giftedByEmail}) — No Charge`;

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
    balanceAfter: res.balanceAfter,
  };
}
