import "server-only";
import { db, verifyRequest, type VerifiedCaller } from "./firebase-admin";
import type { ErrorCode, FreeAccessWindow, RbacPermission, TokenTransactionDoc, TokenTxType, UserDoc } from "./contracts";
import { ApiError, errorResponse, jsonError, requireIdempotencyKey } from "./api";
import {
  ACTION_COSTS,
  ALL_COUNTRIES_CODE,
  isChargingEnabled,
  isFreeAccessWindowActive,
  isMonthlySubscriber,
  normalizeAllowedCountries,
  type ChargeableAction,
} from "./pricing";
import { requirePermission } from "./rbac";
import { resolveRequestCountry } from "./request-geo";

export { ACTION_COSTS, type ChargeableAction };

/** The Role Permissions entry each paid action needs (Customize is a purchase open to every role). */
const ACTION_PERMISSIONS: Partial<Record<ChargeableAction, RbacPermission>> = {
  RADAR_SEARCH: "search_radar",
  AI_REMIX: "ai_remix",
  REGENERATE_VARIATIONS: "ai_remix",
  BRAND_CLONE: "manage_brands",
  BRAND_TXT_DOWNLOAD: "manage_brands",
  SEARCHMIX_DOWNLOAD: "search_radar",
  DECONSTRUCT_DOWNLOAD: "ai_remix",
};

const usersCol = () => db.collection("users");
const txCol = () => db.collection("token_transactions");
const sysConfigDoc = () => db.doc("system_config/global");

const toInt = (n: number) => Math.round(n);

export class InsufficientTokensError extends ApiError {
  constructor(public readonly balance: number, public readonly required: number) {
    const safeBalance = Math.max(0, Math.round(balance));
    super(
      "INSUFFICIENT_TOKENS",
      safeBalance <= 0
        ? `Your token balance is 0 (${required} required). Nobody can have negative tokens — please buy more tokens to continue.`
        : `Insufficient tokens: ${safeBalance} available, ${required} required. Nobody can have negative tokens — please buy more tokens to continue.`,
      402
    );
  }
}

/** Thrown by upstream wrappers (SearchApi.io, Gemini) to trigger an auto-refund. */
export class UpstreamError extends ApiError {
  constructor(message: string, public readonly upstreamStatus = 502) {
    super("UPSTREAM_FAILURE", message, 502);
  }
}

export interface LedgerResult {
  txId: string;
  balanceAfter: number;
  /** True when this txId already existed — no balance change was made. */
  replayed: boolean;
}

/** Deterministic, per-user txId from a client idempotency key. */
export const buildTxId = (uid: string, key: string) => `${uid}_${key}`;

/** Ensures `users/{uid}` exists (balance >= 0, never negative) and returns it. Safe to call repeatedly. */
export async function ensureUserDoc(uid: string, email: string): Promise<UserDoc> {
  const ref = usersCol().doc(uid);
  return db.runTransaction(async (t) => {
    const snap = await t.get(ref);
    if (snap.exists) {
      const existing = snap.data() as UserDoc;
      const rawBal = Number(existing.tokenBalance ?? 0);
      if (!Number.isFinite(rawBal) || rawBal < 0) {
        const now = new Date().toISOString();
        t.update(ref, { tokenBalance: 0, updatedAt: now });
        return { ...existing, tokenBalance: 0, updatedAt: now };
      }
      return { ...existing, tokenBalance: Math.max(0, toInt(rawBal)) };
    }
    const doc: UserDoc = {
      uid,
      email: email.toLowerCase(),
      tokenBalance: 0,
      activeBrandId: "",
      stripeCustomerId: "",
      updatedAt: new Date().toISOString(),
    };
    t.set(ref, doc);
    return doc;
  });
}

/**
 * Pre-flight atomic deduction. Hard rule: nobody can ever have negative tokens.
 * Verifies balance > 0 and balance >= cost, decrements to an explicit non-negative integer,
 * and writes an immutable ledger record in the same transaction. Idempotent on txId.
 */
export async function deductTokens(params: {
  uid: string;
  email?: string;
  cost: number;
  type: Exclude<TokenTxType, "TOPUP" | "GIFT" | "REFUND">;
  referenceId: string;
  txId: string;
}): Promise<LedgerResult> {
  const cost = toInt(params.cost);
  if (!Number.isInteger(cost) || cost <= 0) throw new Error("cost must be a positive integer");

  const userRef = usersCol().doc(params.uid);
  const txRef = txCol().doc(params.txId);

  return db.runTransaction(async (t) => {
    const [txSnap, userSnap] = await Promise.all([t.get(txRef), t.get(userRef)]);
    if (txSnap.exists) {
      const prev = txSnap.data() as TokenTransactionDoc;
      // A key only replays the identical charge, so e.g. "<key>_refund" can't pass as an earlier deduction
      // and one paid key can't be reused for a different query.
      if (prev.uid !== params.uid || prev.type !== params.type || prev.referenceId !== params.referenceId.slice(0, 256)) {
        throw new ApiError("FORBIDDEN", "Idempotency key conflict", 409);
      }
      if ((await t.get(txCol().doc(`${params.txId}_refund`))).exists) {
        throw new ApiError("FORBIDDEN", "That request was refunded. Send it again with a new idempotency key.", 409);
      }
      return { txId: params.txId, balanceAfter: Math.max(0, toInt(prev.balanceAfter)), replayed: true };
    }

    const balance = Math.max(0, toInt(userSnap.exists ? Number(userSnap.get("tokenBalance") ?? 0) : 0));
    if (balance <= 0 || balance < cost) throw new InsufficientTokensError(balance, cost);

    const balanceAfter = Math.max(0, toInt(balance - cost));
    const now = new Date().toISOString();
    t.update(userRef, { tokenBalance: balanceAfter, updatedAt: now });
    const record: TokenTransactionDoc = {
      txId: params.txId,
      uid: params.uid,
      ...(params.email ? { email: params.email.toLowerCase() } : {}),
      type: params.type,
      delta: -cost,
      balanceAfter,
      referenceId: params.referenceId.slice(0, 256),
      createdAt: now,
    };
    t.create(txRef, record);
    return { txId: params.txId, balanceAfter, replayed: false };
  });
}

/**
 * Compensating transaction. Refunds exactly the original deduction once
 * (refund txId = `${originalTxId}_refund`, so repeated calls are no-ops).
 */
export async function refundTokens(originalTxId: string): Promise<LedgerResult> {
  const origRef = txCol().doc(originalTxId);
  const refundId = `${originalTxId}_refund`;
  const refundRef = txCol().doc(refundId);

  return db.runTransaction(async (t) => {
    const [origSnap, refundSnap] = await Promise.all([t.get(origRef), t.get(refundRef)]);
    if (!origSnap.exists) throw new ApiError("NOT_FOUND", `Original transaction ${originalTxId} not found`, 404);
    const orig = origSnap.data() as TokenTransactionDoc;
    if (refundSnap.exists) {
      return {
        txId: refundId,
        balanceAfter: Math.max(0, toInt((refundSnap.data() as TokenTransactionDoc).balanceAfter)),
        replayed: true,
      };
    }
    if (orig.delta >= 0 || orig.type === "REFUND" || orig.type === "TOPUP" || orig.type === "GIFT") {
      throw new ApiError("INVALID_INPUT", "Only deductions can be refunded", 400);
    }

    const userRef = usersCol().doc(orig.uid);
    const userSnap = await t.get(userRef);
    const amount = toInt(Math.abs(orig.delta));
    const currentBalance = Math.max(0, toInt(Number(userSnap.get("tokenBalance") ?? 0)));
    const balanceAfter = Math.max(0, toInt(currentBalance + amount));
    const now = new Date().toISOString();

    t.update(userRef, { tokenBalance: balanceAfter, updatedAt: now });
    t.update(origRef, { refunded: true, refundTxId: refundId });
    t.create(refundRef, {
      txId: refundId,
      uid: orig.uid,
      ...(orig.email ? { email: orig.email } : {}),
      type: "REFUND",
      delta: amount,
      balanceAfter,
      referenceId: originalTxId,
      createdAt: now,
    } satisfies TokenTransactionDoc);
    return { txId: refundId, balanceAfter, replayed: false };
  });
}

/**
 * Credits a top-up (Stripe) or Super Admin token addition. txId should be the Stripe Checkout Session id so
 * webhook retries never double-credit. Creates the user doc if missing.
 */
export async function creditTokens(params: {
  uid: string;
  email?: string;
  amount: number;
  referenceId: string;
  txId: string;
  stripeCustomerId?: string;
  txType?: "TOPUP" | "GIFT";
  subscription?: {
    status: "active" | "canceled" | "past_due";
    stripeSubscriptionId?: string;
    packId?: string;
    tokensPerMonth?: number;
    priceAudCents?: number;
    startedAt?: string;
  };
}): Promise<LedgerResult> {
  const amount = toInt(params.amount);
  if (!Number.isInteger(amount) || amount <= 0) throw new Error("amount must be a positive integer");

  const userRef = usersCol().doc(params.uid);
  const txRef = txCol().doc(params.txId);

  return db.runTransaction(async (t) => {
    const [txSnap, userSnap] = await Promise.all([t.get(txRef), t.get(userRef)]);
    if (txSnap.exists) {
      return {
        txId: params.txId,
        balanceAfter: Math.max(0, toInt((txSnap.data() as TokenTransactionDoc).balanceAfter)),
        replayed: true,
      };
    }
    const now = new Date().toISOString();
    const currentBalance = Math.max(0, toInt(Number(userSnap.exists ? userSnap.get("tokenBalance") ?? 0 : 0)));
    const balanceAfter = Math.max(0, toInt(currentBalance + amount));
    const customer = params.stripeCustomerId && /^cus_[A-Za-z0-9]+$/.test(params.stripeCustomerId) ? params.stripeCustomerId : undefined;
    const subFields = params.subscription
      ? {
          subscriptionStatus: params.subscription.status,
          ...(params.subscription.stripeSubscriptionId ? { stripeSubscriptionId: params.subscription.stripeSubscriptionId } : {}),
          ...(params.subscription.packId ? { subscriptionPackId: params.subscription.packId } : {}),
          ...(typeof params.subscription.tokensPerMonth === "number"
            ? { subscriptionTokensPerMonth: toInt(params.subscription.tokensPerMonth) }
            : {}),
          ...(typeof params.subscription.priceAudCents === "number"
            ? { subscriptionPriceAudCents: toInt(params.subscription.priceAudCents) }
            : {}),
          subscriptionStartedAt: params.subscription.startedAt ?? now,
        }
      : {};

    if (userSnap.exists) {
      t.update(userRef, {
        tokenBalance: balanceAfter,
        updatedAt: now,
        ...(customer ? { stripeCustomerId: customer } : {}),
        ...subFields,
      });
    } else {
      t.set(userRef, {
        uid: params.uid,
        email: (params.email ?? "").toLowerCase(),
        tokenBalance: balanceAfter,
        activeBrandId: "",
        stripeCustomerId: customer ?? "",
        updatedAt: now,
        ...subFields,
      });
    }
    t.create(txRef, {
      txId: params.txId,
      uid: params.uid,
      ...(params.email ? { email: params.email.toLowerCase() } : {}),
      type: params.txType ?? "TOPUP",
      delta: amount,
      balanceAfter,
      referenceId: params.referenceId.slice(0, 256),
      createdAt: now,
    } satisfies TokenTransactionDoc);
    return { txId: params.txId, balanceAfter, replayed: false };
  });
}

export interface GateContext {
  caller: VerifiedCaller;
  txId: string;
  balanceAfter: number;
  /** Tokens charged for this call (0 when the action is free for this caller right now). */
  cost: number;
  /**
   * True if this idempotency key was already charged. Handlers MUST then return
   * the previously persisted result for `txId` (or 409) instead of redoing paid work.
   */
  replayed: boolean;
}

/**
 * The three-step gate every paid API route uses:
 * 1. verify session & claims  2. atomic pre-flight deduction  3. auto-refund on failure.
 * Hard Rule: Nobody can have negative tokens. If an account is 0 (or < effectiveCost),
 * ALL users (including admins/superadmins) must buy more tokens.
 */
export async function withTokenGate(
  req: Request,
  action: ChargeableAction,
  referenceId: string | ((caller: VerifiedCaller) => string),
  handler: (ctx: GateContext) => Promise<Response>,
  customCost?: number,
): Promise<Response> {
  let charged: LedgerResult | null = null;
  try {
    const caller = await verifyRequest(req);
    // Checked before anything is charged, so a blocked role is never billed.
    const permission = ACTION_PERMISSIONS[action];
    if (permission) await requirePermission(caller, permission);
    const key = requireIdempotencyKey(req);
    const ref = typeof referenceId === "function" ? referenceId(caller) : referenceId;

    const rawCost = customCost !== undefined ? customCost : ACTION_COSTS[action];
    let effectiveCost = Math.max(0, toInt(rawCost));

    if (effectiveCost > 0) {
      const [sysSnap, userSnap] = await Promise.all([
        sysConfigDoc().get().catch(() => null),
        usersCol().doc(caller.uid).get().catch(() => null),
      ]);
      const userData = userSnap?.exists ? (userSnap.data() as Partial<UserDoc>) : null;
      const sys = sysSnap?.exists ? sysSnap.data() : null;
      if (sys) {
        // The country only matters for a subscriber during a free window limited to some countries. It is
        // worked out on the server (edge header or IP lookup), never taken from a browser-supplied header.
        const freeWindow = sys.freeAccessWindow as Partial<FreeAccessWindow> | undefined;
        const countryMatters =
          isFreeAccessWindowActive(freeWindow) &&
          isMonthlySubscriber(userData, caller.claims.isSuperAdmin) &&
          !normalizeAllowedCountries(freeWindow?.allowedCountries).includes(ALL_COUNTRIES_CODE);
        const userCountry = countryMatters ? (await resolveRequestCountry(req)) || "AU" : "AU";
        if (!isChargingEnabled(sys, Date.now(), userData, caller.claims.isSuperAdmin, userCountry)) {
          effectiveCost = 0;
        }
      }
    }

    if (effectiveCost === 0) {
      const balance = Math.max(0, toInt(Number((await usersCol().doc(caller.uid).get()).get("tokenBalance") ?? 0)));
      const txId = buildTxId(caller.uid, key);
      const res = await handler({ caller, txId, balanceAfter: balance, replayed: false, cost: 0 });
      try {
        await txCol().doc(txId).set(
          {
            txId,
            uid: caller.uid,
            email: caller.email.toLowerCase(),
            type: action,
            delta: 0,
            balanceAfter: balance,
            referenceId: ref.slice(0, 256),
            createdAt: new Date().toISOString(),
          } satisfies TokenTransactionDoc,
          { merge: true }
        );
      } catch {
        // Non-fatal if logging 0-token order fails
      }
      return res;
    }

    charged = await deductTokens({
      uid: caller.uid,
      email: caller.email,
      cost: effectiveCost,
      type: action,
      referenceId: ref,
      txId: buildTxId(caller.uid, key),
    });

    return await handler({ caller, ...charged, cost: effectiveCost });
  } catch (err) {
    // Refund only fresh charges; client errors from the handler (4xx ApiError other than upstream) are also refunded
    // because no paid work was delivered.
    if (charged && !charged.replayed) {
      let refunded = false;
      try {
        await refundTokens(charged.txId);
        refunded = true;
      } catch (refundErr) {
        console.error("[token-ledger] REFUND FAILED — manual reconciliation required", charged.txId, refundErr);
      }
      // Only say "refunded" when it actually happened (free actions never charge). Unexpected errors keep
      // errorResponse's safe code/message, plus the refund note.
      if (refunded) {
        const base = errorResponse(err);
        const payload = (await base.json().catch(() => null)) as { error?: { code: ErrorCode; message: string } } | null;
        return jsonError(
          payload?.error?.code ?? "INTERNAL",
          `${payload?.error?.message ?? "Something went wrong."} Your tokens were refunded.`,
          base.status,
        );
      }
    }
    return errorResponse(err);
  }
}
