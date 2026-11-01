import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { db, verifyRequest, type VerifiedCaller } from "./firebase-admin";
import type { TokenTransactionDoc, TokenTxType, UserDoc } from "./contracts";
import { ApiError, errorResponse, jsonError, requireIdempotencyKey } from "./api";
import { ACTION_COSTS, type ChargeableAction } from "./pricing";

export { ACTION_COSTS, type ChargeableAction };

const usersCol = () => db.collection("users");
const txCol = () => db.collection("token_transactions");

const toInt = (n: number) => Math.round(n);

export class InsufficientTokensError extends ApiError {
  constructor(public readonly balance: number, public readonly required: number) {
    super("INSUFFICIENT_TOKENS", `Insufficient tokens: ${balance} available, ${required} required`, 402);
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

/** Ensures `users/{uid}` exists (balance 0) and returns it. Safe to call repeatedly. */
export async function ensureUserDoc(uid: string, email: string): Promise<UserDoc> {
  const ref = usersCol().doc(uid);
  return db.runTransaction(async (t) => {
    const snap = await t.get(ref);
    if (snap.exists) return snap.data() as UserDoc;
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
 * Pre-flight atomic deduction. Verifies balance >= cost, decrements, and writes an
 * immutable ledger record in the same transaction. Idempotent on txId.
 */
export async function deductTokens(params: {
  uid: string;
  cost: number;
  type: Exclude<TokenTxType, "TOPUP" | "REFUND">;
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
      return { txId: params.txId, balanceAfter: prev.balanceAfter, replayed: true };
    }

    const balance = toInt(userSnap.exists ? Number(userSnap.get("tokenBalance") ?? 0) : 0);
    if (balance < cost) throw new InsufficientTokensError(balance, cost);

    const balanceAfter = toInt(balance - cost);
    const now = new Date().toISOString();
    t.update(userRef, { tokenBalance: FieldValue.increment(-cost), updatedAt: now });
    const record: TokenTransactionDoc = {
      txId: params.txId,
      uid: params.uid,
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
    if (!origSnap.exists) throw new Error(`Original transaction ${originalTxId} not found`);
    const orig = origSnap.data() as TokenTransactionDoc;
    if (refundSnap.exists) {
      return { txId: refundId, balanceAfter: (refundSnap.data() as TokenTransactionDoc).balanceAfter, replayed: true };
    }
    if (orig.delta >= 0 || orig.type === "REFUND" || orig.type === "TOPUP") {
      throw new Error("Only deductions can be refunded");
    }

    const userRef = usersCol().doc(orig.uid);
    const userSnap = await t.get(userRef);
    const amount = toInt(Math.abs(orig.delta));
    const balanceAfter = toInt(Number(userSnap.get("tokenBalance") ?? 0) + amount);
    const now = new Date().toISOString();

    t.update(userRef, { tokenBalance: FieldValue.increment(amount), updatedAt: now });
    t.create(refundRef, {
      txId: refundId,
      uid: orig.uid,
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
 * Credits a top-up (Stripe). txId should be the Stripe Checkout Session id so
 * webhook retries never double-credit. Creates the user doc if missing.
 */
export async function creditTokens(params: {
  uid: string;
  email?: string;
  amount: number;
  referenceId: string;
  txId: string;
  stripeCustomerId?: string;
}): Promise<LedgerResult> {
  const amount = toInt(params.amount);
  if (!Number.isInteger(amount) || amount <= 0) throw new Error("amount must be a positive integer");

  const userRef = usersCol().doc(params.uid);
  const txRef = txCol().doc(params.txId);

  return db.runTransaction(async (t) => {
    const [txSnap, userSnap] = await Promise.all([t.get(txRef), t.get(userRef)]);
    if (txSnap.exists) {
      return { txId: params.txId, balanceAfter: (txSnap.data() as TokenTransactionDoc).balanceAfter, replayed: true };
    }
    const now = new Date().toISOString();
    const balanceAfter = toInt(Number(userSnap.exists ? userSnap.get("tokenBalance") ?? 0 : 0) + amount);
    const customer = params.stripeCustomerId && /^cus_[A-Za-z0-9]+$/.test(params.stripeCustomerId) ? params.stripeCustomerId : undefined;

    if (userSnap.exists) {
      t.update(userRef, {
        tokenBalance: FieldValue.increment(amount),
        updatedAt: now,
        ...(customer ? { stripeCustomerId: customer } : {}),
      });
    } else {
      t.set(userRef, {
        uid: params.uid,
        email: (params.email ?? "").toLowerCase(),
        tokenBalance: amount,
        activeBrandId: "",
        stripeCustomerId: customer ?? "",
        updatedAt: now,
      });
    }
    t.create(txRef, {
      txId: params.txId,
      uid: params.uid,
      type: "TOPUP",
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
  /**
   * True if this idempotency key was already charged. Handlers MUST then return
   * the previously persisted result for `txId` (or 409) instead of redoing paid work.
   */
  replayed: boolean;
}

/**
 * The three-step gate every paid API route uses:
 * 1. verify session & claims  2. atomic pre-flight deduction  3. auto-refund on failure.
 * Actions whose cost is 0 skip steps 2 and 3.
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
    const key = requireIdempotencyKey(req);
    const ref = typeof referenceId === "function" ? referenceId(caller) : referenceId;

    // Superadmin Token Exemption: Superadmin pays 0 tokens for any action on the platform
    const isSuperadmin = caller.claims.role === "admin";
    const rawCost = customCost !== undefined ? customCost : ACTION_COSTS[action];
    const effectiveCost = isSuperadmin ? 0 : rawCost;

    if (effectiveCost === 0) {
      // Free action or superadmin exemption: nothing to charge, refund or replay.
      const balance = toInt(Number((await usersCol().doc(caller.uid).get()).get("tokenBalance") ?? 0));
      return await handler({ caller, txId: buildTxId(caller.uid, key), balanceAfter: balance, replayed: false });
    }

    charged = await deductTokens({
      uid: caller.uid,
      cost: effectiveCost,
      type: action,
      referenceId: ref,
      txId: buildTxId(caller.uid, key),
    });

    return await handler({ caller, ...charged });
  } catch (err) {
    // Refund only fresh charges; client errors from the handler (4xx ApiError other than upstream) are also refunded
    // because no paid work was delivered.
    if (charged && !charged.replayed) {
      try {
        await refundTokens(charged.txId);
        // Only say "refunded" when it actually happened (free actions never charge).
        if (err instanceof ApiError) return jsonError(err.code, `${err.message} Your tokens were refunded.`, err.status);
      } catch (refundErr) {
        console.error("[token-ledger] REFUND FAILED — manual reconciliation required", charged.txId, refundErr);
      }
    }
    return errorResponse(err);
  }
}
