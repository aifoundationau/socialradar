import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { creditTokens } from "@/lib/token-ledger";
import { recordStripePurchase } from "@/lib/admin";
import { db } from "@/lib/firebase-admin";
import { jsonError } from "@/lib/api";
import { TopupMetadataSchema } from "@/lib/contracts";
import { fulfillCheckoutSession, getStripe } from "@/lib/stripe";

type SubscriptionStatus = "active" | "past_due" | "canceled";

/** Stripe subscription status -> the app's subscriptionStatus. */
function toSubscriptionStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
  if (status === "active" || status === "trialing") return "active";
  if (status === "canceled" || status === "incomplete_expired") return "canceled";
  return "past_due"; // past_due, unpaid, incomplete, paused
}

async function setSubscriptionStatus(uid: string, subscriptionStatus: SubscriptionStatus) {
  await db
    .collection("users")
    .doc(uid)
    .set({ subscriptionStatus, updatedAt: new Date().toISOString() }, { merge: true });
}

/**
 * Credits token packs and Monthly Search Subscriptions from:
 * - `checkout.session.completed` (card payments & initial subscription checkout)
 * - `checkout.session.async_payment_succeeded` (delayed payment methods)
 * - `invoice.paid` (`subscription_cycle` renewals for recurring monthly 1,000-search allocations)
 * - `invoice.payment_failed` (a failed renewal marks the subscription past_due)
 * - `customer.subscription.updated` / `customer.subscription.deleted` (keeps the status in sync)
 * The Stripe webhook endpoint must be subscribed to all of these events.
 *
 * The Checkout Session id (or Invoice id for recurring renewals) is the ledger `txId`,
 * so Stripe's retries and duplicate deliveries never double-credit.
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

  try {
    if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded"
    ) {
      const session = event.data.object as Stripe.Checkout.Session;
      const result = await fulfillCheckoutSession(session);
      return NextResponse.json({
        received: true,
        credited: result.credited,
        balanceAfter: result.balanceAfter,
      });
    }

    if (event.type === "invoice.paid") {
      const invoice = event.data.object as Stripe.Invoice;
      // Initial subscription invoice is already fulfilled by checkout.session.completed (`cs_...`).
      // Only credit on recurring monthly renewals (`subscription_cycle`).
      if (invoice.billing_reason !== "subscription_cycle") {
        return NextResponse.json({ received: true, credited: false });
      }

      const subDetails = invoice.parent?.subscription_details;
      const rawMeta = subDetails?.metadata ?? invoice.metadata ?? {};
      const meta = TopupMetadataSchema.safeParse(rawMeta);
      if (!meta.success) {
        return NextResponse.json({ received: true, credited: false });
      }

      const stripeCustomerId =
        typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
      const subId =
        typeof subDetails?.subscription === "string"
          ? subDetails.subscription
          : subDetails?.subscription?.id;
      const amountCents = invoice.amount_paid ?? 0;
      const audDollars = Math.round(amountCents / 100);
      const buyerCountry = (
        invoice.customer_address?.country ||
        meta.data.buyerCountry ||
        "AU"
      ).toUpperCase();
      const totalExcludingTax = invoice.total_excluding_tax ?? invoice.subtotal_excluding_tax ?? null;
      const taxCents = totalExcludingTax !== null ? Math.max(0, invoice.total - totalExcludingTax) : 0;
      const taxApplied = taxCents > 0;
      const renewalTaxLabel = taxApplied ? "+ 10% GST" : `No Tax · ${buyerCountry}`;

      const result = await creditTokens({
        uid: meta.data.uid,
        email: invoice.customer_email ?? undefined,
        amount: meta.data.tokens,
        referenceId: `Stripe Monthly Subscription Renewal (${meta.data.tokens.toLocaleString("en-AU")} searches · $${audDollars} AUD ${renewalTaxLabel}) [${invoice.id}]`,
        txId: invoice.id,
        stripeCustomerId,
        subscription: {
          status: "active",
          stripeSubscriptionId: subId,
          packId: meta.data.packId,
          tokensPerMonth: meta.data.tokens,
          priceAudCents: amountCents,
        },
      });

      await recordStripePurchase({
        purchaseId: invoice.id,
        uid: meta.data.uid,
        email: invoice.customer_email ?? undefined,
        packId: meta.data.packId,
        tokens: meta.data.tokens,
        amountCents,
        currency: invoice.currency ?? "aud",
        createdAt: new Date().toISOString(),
      });

      return NextResponse.json({
        received: true,
        credited: !result.replayed,
        balanceAfter: result.balanceAfter,
      });
    }

    if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object as Stripe.Invoice;
      const subDetails = invoice.parent?.subscription_details;
      const uid = subDetails?.metadata?.uid;
      if (subDetails && uid) {
        await setSubscriptionStatus(uid, "past_due");
      }
      return NextResponse.json({ received: true });
    }

    if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
      const subscription = event.data.object as Stripe.Subscription;
      const uid = subscription.metadata?.uid;
      if (uid) {
        await setSubscriptionStatus(
          uid,
          event.type === "customer.subscription.deleted" ? "canceled" : toSubscriptionStatus(subscription.status),
        );
      }
      return NextResponse.json({ received: true });
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("[stripe-webhook] credit failed; Stripe will retry", event.id, err);
    return jsonError("INTERNAL", "Ledger write failed", 500);
  }
}
