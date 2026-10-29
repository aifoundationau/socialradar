import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { creditTokens } from "@/lib/token-ledger";
import { jsonError } from "@/lib/api";
import { TopupMetadataSchema } from "@/lib/contracts";
import { getStripe } from "@/lib/stripe";

/**
 * Credits token packs from `checkout.session.completed` (card payments) and
 * `checkout.session.async_payment_succeeded` (delayed methods). The Checkout Session id is
 * the ledger txId, so Stripe's retries and duplicate deliveries never double-credit.
 * Non-2xx responses make Stripe retry, so only ledger failures return 500.
 */
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[stripe-webhook] STRIPE_WEBHOOK_SECRET is not set");
    return jsonError("INTERNAL", "Webhook not configured", 500);
  }
  const signature = req.headers.get("stripe-signature");
  if (!signature) return jsonError("INVALID_INPUT", "Missing Stripe-Signature header", 400);

  let event: Stripe.Event;
  try {
    event = await getStripe().webhooks.constructEventAsync(await req.text(), signature, secret);
  } catch {
    return jsonError("INVALID_INPUT", "Invalid webhook signature", 400);
  }

  if (event.type !== "checkout.session.completed" && event.type !== "checkout.session.async_payment_succeeded") {
    return NextResponse.json({ received: true });
  }
  const session = event.data.object;
  if (session.mode !== "payment" || session.payment_status !== "paid") {
    // Async methods complete unpaid first; async_payment_succeeded follows when funds clear.
    return NextResponse.json({ received: true, credited: false });
  }

  const meta = TopupMetadataSchema.safeParse(session.metadata ?? {});
  if (!meta.success || meta.data.uid !== session.client_reference_id) {
    // Not one of ours (or tampered). Retrying won't fix it, so acknowledge and flag it.
    console.error("[stripe-webhook] paid session with unusable metadata — reconcile manually", session.id);
    return NextResponse.json({ received: true, credited: false });
  }

  try {
    const result = await creditTokens({
      uid: meta.data.uid,
      email: session.customer_details?.email ?? undefined,
      amount: meta.data.tokens,
      referenceId: session.id,
      txId: session.id,
      stripeCustomerId: typeof session.customer === "string" ? session.customer : session.customer?.id,
    });
    return NextResponse.json({ received: true, credited: !result.replayed, balanceAfter: result.balanceAfter });
  } catch (err) {
    console.error("[stripe-webhook] credit failed; Stripe will retry", session.id, err);
    return jsonError("INTERNAL", "Ledger write failed", 500);
  }
}
