import { NextResponse } from "next/server";
import { verifyRequest } from "@/lib/firebase-admin";
import { ApiError, errorResponse, readJson } from "@/lib/api";
import { ConfirmCheckoutSessionRequestSchema } from "@/lib/contracts";
import { fulfillCheckoutSession, getStripe } from "@/lib/stripe";

/**
 * Verifies a completed Stripe Checkout Session directly with Stripe and idempotently
 * distributes tokens (and starts the monthly subscription if `mode === "subscription"`).
 * Ensures instant token fulfillment in local/sandbox environments even before webhooks arrive.
 */
export async function POST(req: Request) {
  try {
    const caller = await verifyRequest(req);
    const { sessionId } = ConfirmCheckoutSessionRequestSchema.parse(await readJson(req));

    const session = await getStripe().checkout.sessions.retrieve(sessionId);
    const sessionUid = session.client_reference_id || session.metadata?.uid;

    if (sessionUid !== caller.uid) {
      throw new ApiError("FORBIDDEN", "This Checkout Session belongs to a different account.", 403);
    }

    const result = await fulfillCheckoutSession(session);
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}

