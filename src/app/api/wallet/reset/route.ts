import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { errorResponse, readJson } from "@/lib/api";
import { db, verifyRequest } from "@/lib/firebase-admin";
import { WalletSelfResetRequestSchema } from "@/lib/contracts";

export async function POST(req: Request) {
  try {
    const caller = await verifyRequest(req);
    const body = await readJson(req);
    WalletSelfResetRequestSchema.parse(body);

    const userRef = db.collection("users").doc(caller.uid);
    const txId = `self_reset_${Date.now()}_${randomBytes(4).toString("hex")}`;
    const txRef = db.collection("token_transactions").doc(txId);

    const result = await db.runTransaction(async (t) => {
      const userSnap = await t.get(userRef);
      const currentBalance = userSnap.exists
        ? Math.max(0, Math.round(Number(userSnap.get("tokenBalance") ?? 0)))
        : 0;
      const now = new Date().toISOString();

      t.set(
        userRef,
        {
          tokenBalance: 0,
          updatedAt: now,
        },
        { merge: true }
      );

      t.create(txRef, {
        txId,
        uid: caller.uid,
        email: (caller.email || "").toLowerCase(),
        type: "ADMIN_RESET",
        delta: -currentBalance,
        balanceAfter: 0,
        referenceId:
          "Self-initiated token refresh to 0 (unused tokens permanently forfeited)",
        createdAt: now,
      });

      return {
        txId,
        clearedTokens: currentBalance,
        balanceAfter: 0,
      };
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
