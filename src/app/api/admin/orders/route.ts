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

export async function POST(req: Request) {
  try {
    const body = (await readJson(req)) as Record<string, unknown>;
    const action = String(body.action || "");

    if (action === "REFUND_ORDER") {
      await verifyRequest(req, { requireRole: "admin" });
      const parsed = AdminRefundOrderRequestSchema.parse({ txId: body.txId });
      const refundResult = await refundTokens(parsed.txId);
      const orders = await getMasterOrderLedger(150);
      return NextResponse.json({
        success: true,
        refundResult,
        orders,
      });
    }

    if (action === "GIFT_TOKENS") {
      const caller = await verifyRequest(req, { requireRole: "admin" });
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
        creditedTokens: giftResult.tokens,
        balanceAfter: giftResult.balanceAfter,
        giftResult,
        orders,
      });
    }

    if (action === "DEDUCT_TOKENS") {
      const caller = await verifyRequest(req, { requireRole: "admin" });
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
      const caller = await verifyRequest(req, { requireRole: "admin" });
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
        balanceAfter: 0,
        resetResult,
        orders,
      });
    }

    return NextResponse.json(
      { error: { code: "INVALID_INPUT", message: "Unsupported order ledger action" } },
      { status: 400 }
    );
  } catch (err) {
    return errorResponse(err);
  }
}

