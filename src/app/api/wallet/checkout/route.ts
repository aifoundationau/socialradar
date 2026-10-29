import { NextResponse } from "next/server";
import { verifyRequest } from "@/lib/firebase-admin";
import { ensureUserDoc, buildTxId } from "@/lib/token-ledger";
import { errorResponse, readJson, requireIdempotencyKey } from "@/lib/api";
import { CheckoutRequestSchema } from "@/lib/contracts";
import { TOKEN_PACKS } from "@/lib/pricing";
import { buildCheckoutParams, getStripe } from "@/lib/stripe";

/** Starts a Stripe Checkout Session for a token pack. Body: `{ packId }`. Returns `{ url }`. */
export async function POST(req: Request) {
  try {
    const caller = await verifyRequest(req);
    const key = requireIdempotencyKey(req);
    const { packId } = CheckoutRequestSchema.parse(await readJson(req));
    const user = await ensureUserDoc(caller.uid, caller.email);

    const session = await getStripe().checkout.sessions.create(
      buildCheckoutParams({
        uid: caller.uid,
        email: caller.email,
        stripeCustomerId: user.stripeCustomerId,
        pack: TOKEN_PACKS[packId],
        appUrl: process.env.APP_URL || new URL(req.url).origin,
      }),
      // A double-clicked "Buy" reuses the same session instead of opening two.
      { idempotencyKey: buildTxId(caller.uid, key) },
    );
    if (!session.url) throw new Error(`Checkout Session ${session.id} has no URL`);
    return NextResponse.json({ url: session.url });
  } catch (err) {
    return errorResponse(err);
  }
}
