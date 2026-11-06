import { NextResponse } from "next/server";
import { verifyRequest } from "@/lib/firebase-admin";
import { errorResponse, readJson } from "@/lib/api";
import {
  deductTokensFromUser,
  getMasterOrderLedger,
  giftTokensToUser,
  resetTokensForUser,
} from "@/lib/admin";
import {
  AdminDeductTokensRequestSchema,
  AdminGiftTokensRequestSchema,
  AdminRefundOrderRequestSchema,
  AdminResetTokensRequestSchema,
} from "@/lib/contracts";
import { refundTokens } from "@/lib/token-ledger";

export async function GET(req: Request) {
  try {
    await verifyRequest(req, { requireRole: "admin" });
    const orders = await getMasterOrderLedger(150);
    return NextResponse.json({ orders });
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * Super Admin ONLY token ledger actions:
 * - ADD_TOKENS / GIFT_TOKENS: Add tokens to a customer wallet
 * - REMOVE_TOKENS / DEDUCT_TOKENS: Remove (minus) tokens from a customer wallet
 * - RESET_TOKENS: Reset a customer wallet token balance to 0
 * - REFUND_ORDER: Refund tokens on a deduction order back to the customer wallet
 */
export async function POST(req: Request) {
  try {
    const caller = await verifyRequest(req, { requireRole: "superadmin" });
    const body = (await readJson(req)) as Record<string, unknown>;
    const action = String(body.action || "");

    if (action === "REFUND_ORDER") {
      const parsed = AdminRefundOrderRequestSchema.parse({ txId: body.txId });
      const refundResult = await refundTokens(parsed.txId);
      const orders = await getMasterOrderLedger(150);
      const refundEntry = orders.find((o) => o.txId === refundResult.txId);
      const origEntry = orders.find((o) => o.txId === parsed.txId);
      const refundedTokens = refundEntry
        ? Math.abs(refundEntry.delta)
        : origEntry
          ? Math.abs(origEntry.delta)
          : 0;
      return NextResponse.json({
        success: true,
        refundedTokens,
        newBalance: refundResult.balanceAfter,
        refundResult,
        orders,
      });
    }

    if (action === "GIFT_TOKENS" || action === "ADD_TOKENS") {
      const parsed = AdminGiftTokensRequestSchema.parse({
        recipientEmail: body.recipientEmail || body.targetEmail,
        tokens: Number(body.tokens),
        note: body.note ? String(body.note) : undefined,
      });
      const giftResult = await giftTokensToUser({
        recipientEmail: parsed.recipientEmail,
        tokens: parsed.tokens,
        note: parsed.note,
        giftedByEmail: caller.email,
      });
      const orders = await getMasterOrderLedger(150);
      return NextResponse.json({
        success: true,
        tokens: giftResult.tokens,
        newBalance: giftResult.balanceAfter,
        creditedTokens: giftResult.tokens,
        balanceAfter: giftResult.balanceAfter,
        giftResult,
        orders,
      });
    }

    if (action === "DEDUCT_TOKENS" || action === "REMOVE_TOKENS") {
      const parsed = AdminDeductTokensRequestSchema.parse({
        recipientEmail: body.recipientEmail || body.targetEmail,
        tokens: Number(body.tokens),
        note: body.note ? String(body.note) : undefined,
      });
      const deductResult = await deductTokensFromUser({
        recipientEmail: parsed.recipientEmail,
        tokens: parsed.tokens,
        note: parsed.note,
        deductedByEmail: caller.email,
      });
      const orders = await getMasterOrderLedger(150);
      return NextResponse.json({
        success: true,
        deductedTokens: deductResult.deductedTokens,
        balanceAfter: deductResult.balanceAfter,
        deductResult,
        orders,
      });
    }

    if (action === "RESET_TOKENS") {
      const parsed = AdminResetTokensRequestSchema.parse({
        recipientEmail: body.recipientEmail || body.targetEmail,
        note: body.note ? String(body.note) : undefined,
      });
      const resetResult = await resetTokensForUser({
        recipientEmail: parsed.recipientEmail,
        note: parsed.note,
        resetByEmail: caller.email,
      });
      const orders = await getMasterOrderLedger(150);
      return NextResponse.json({
        success: true,
        clearedTokens: resetResult.clearedTokens,
        balanceAfter: resetResult.balanceAfter,
        resetResult,
        orders,
      });
    }

    return NextResponse.json(
      {
        error: {
          code: "INVALID_INPUT",
          message: "Super Admin can only add tokens, minus tokens, reset tokens to 0, or refund tokens.",
        },
      },
      { status: 400 }
    );
  } catch (err) {
    return errorResponse(err);
  }
}

