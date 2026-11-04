import "server-only";
import Stripe from "stripe";
import type { z } from "zod";
import { TopupMetadataSchema, type TokenPackId } from "./contracts";
import { TOKEN_PACK_CURRENCY, type TokenPack } from "./pricing";
import { creditTokens } from "./token-ledger";
import { recordStripePurchase } from "./admin";

let client: Stripe | null = null;

/** Lazily created so routes that never touch Stripe don't require its key. */
export function getStripe(): Stripe {
  if (!client) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
    client = new Stripe(key);
  }
  return client;
}

/**
 * Hosted Checkout for either:
 * 1. One-off Token Packs (`mode: "payment"`, `invoice_creation: { enabled: true }`, `automatic_tax: { enabled: true }`)
 * 2. Monthly Search Subscription (`mode: "subscription"`, `automatic_tax: { enabled: true }`)
 *
 * Built with native automatic Stripe Tax (`automatic_tax: { enabled: true }` + `tax_behavior: "exclusive"`):
 * - Stripe Checkout automatically detects the buyer's country on the hosted checkout page.
 * - Australia (AU): adds 10% GST on top of the base AUD price.
 * - Outside Australia: $0 tax added.
 * - Zero manual tax_rates (txr_...) or ensureAuGstTaxRateId logic — Stripe Tax handles everything natively.
 */
export function buildCheckoutParams(opts: {
  uid: string;
  email: string;
  stripeCustomerId?: string;
  pack: TokenPack;
  appUrl: string;
  subscriptionName?: string;
  buyerCountry?: string;
}): Stripe.Checkout.SessionCreateParams {
  const {
    uid,
    email,
    stripeCustomerId,
    pack,
    appUrl,
    subscriptionName,
    buyerCountry = "AU",
  } = opts;
  const isSubscription = pack.id === "SUB_MONTHLY_1000";
  const tokensFormatted = pack.tokens.toLocaleString("en-AU");
  const priceFormatted = (pack.priceCents / 100).toFixed(2);

  const metadata: Record<string, string> = {
    uid,
    packId: pack.id,
    tokens: String(pack.tokens),
    buyerCountry,
  };

  if (isSubscription) {
    return {
      mode: "subscription",
      client_reference_id: uid,
      metadata,
      subscription_data: {
        metadata,
      },
      automatic_tax: { enabled: true },
      ...(email ? { customer_email: email } : {}),
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: TOKEN_PACK_CURRENCY,
            tax_behavior: "exclusive",
            unit_amount: pack.priceCents,
            recurring: {
              interval: "month",
            },
            product_data: {
              name: subscriptionName || "Monthly Search Subscription",
              description: `Allocate ${tokensFormatted} Searches / Month ($${priceFormatted} AUD / mo)`,
            },
          },
        },
      ],
      success_url: `${appUrl}/wallet?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/wallet?checkout=cancelled`,
    };
  }

  return {
    mode: "payment",
    invoice_creation: {
      enabled: true,
      invoice_data: {
        metadata,
      },
    },
    automatic_tax: { enabled: true },
    client_reference_id: uid,
    metadata,
    payment_intent_data: {
      description: `${tokensFormatted} Ad Radar Tokens ($${priceFormatted} AUD)`,
      metadata,
    },
    customer_creation: "always",
    ...(email ? { customer_email: email } : {}),
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: TOKEN_PACK_CURRENCY,
          tax_behavior: "exclusive",
          unit_amount: pack.priceCents,
          product_data: {
            name: `${tokensFormatted} Ad Radar Tokens`,
            description: `${tokensFormatted} Ad Radar tokens ($${priceFormatted} AUD)`,
          },
        },
      },
    ],
    success_url: `${appUrl}/wallet?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/wallet?checkout=cancelled`,
  };
}

export interface CheckoutFulfillmentResult {
  fulfilled: boolean;
  credited: boolean;
  balanceAfter?: number;
  tokens?: number;
  packId?: TokenPackId;
  isSubscription?: boolean;
  amountCents?: number;
  taxCents?: number;
  exGstCents?: number;
  buyerCountry?: string;
  taxApplied?: boolean;
  reason?: string;
}

/**
 * Idempotently fulfills a paid Stripe Checkout Session (both one-off Token Packs and Monthly Subscriptions).
 * Safe to invoke from both the browser return verification (`/api/wallet/confirm`) and the Stripe webhook (`/api/webhooks/stripe`)
 * because `txId` is locked to `session.id`.
 */
export async function fulfillCheckoutSession(
  session: Stripe.Checkout.Session
): Promise<CheckoutFulfillmentResult> {
  if (
    (session.mode !== "payment" && session.mode !== "subscription") ||
    session.payment_status !== "paid"
  ) {
    return { fulfilled: false, credited: false, reason: "Session not yet paid" };
  }

  const meta = TopupMetadataSchema.safeParse(session.metadata ?? {});
  if (!meta.success || meta.data.uid !== session.client_reference_id) {
    console.error("[stripe] paid session with unusable metadata — reconcile manually", session.id);
    return { fulfilled: false, credited: false, reason: "Invalid session metadata" };
  }

  const isSubscription = session.mode === "subscription" || meta.data.packId === "SUB_MONTHLY_1000";
  const stripeCustomerId =
    typeof session.customer === "string" ? session.customer : session.customer?.id;
  const stripeSubscriptionId =
    typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
  const amountCents = session.amount_total ?? 0;
  const taxCents = session.total_details?.amount_tax ?? 0;
  const exGstCents = session.amount_subtotal ?? (amountCents - taxCents);
  const buyerCountry = (session.customer_details?.address?.country || meta.data.buyerCountry || "AU").toUpperCase();
  const taxApplied = taxCents > 0;
  const exGstDollarsStr = (exGstCents / 100).toFixed(2);
  const gstDollarsStr = (taxCents / 100).toFixed(2);
  const totalDollarsStr = (amountCents / 100).toFixed(2);
  const taxNote = taxApplied
    ? `$${exGstDollarsStr} + $${gstDollarsStr} GST = $${totalDollarsStr} AUD`
    : `$${totalDollarsStr} AUD (No Tax · ${buyerCountry})`;
  const referenceId = isSubscription
    ? `Stripe Monthly Subscription (${meta.data.tokens.toLocaleString("en-AU")} searches · ${taxNote}) [${session.id}]`
    : `Stripe Token Pack (${meta.data.tokens.toLocaleString("en-AU")} tokens · ${taxNote}) [${session.id}]`;

  const result = await creditTokens({
    uid: meta.data.uid,
    email: session.customer_details?.email ?? undefined,
    amount: meta.data.tokens,
    referenceId,
    txId: session.id,
    stripeCustomerId,
    ...(isSubscription
      ? {
          subscription: {
            status: "active",
            stripeSubscriptionId,
            packId: meta.data.packId,
            tokensPerMonth: meta.data.tokens,
            priceAudCents: amountCents,
            startedAt: new Date().toISOString(),
          },
        }
      : {}),
  });

  await recordStripePurchase({
    purchaseId: session.id,
    uid: meta.data.uid,
    email: session.customer_details?.email ?? undefined,
    packId: meta.data.packId,
    tokens: meta.data.tokens,
    amountCents,
    currency: session.currency ?? "aud",
    createdAt: new Date().toISOString(),
  });

  return {
    fulfilled: true,
    credited: !result.replayed,
    balanceAfter: result.balanceAfter,
    tokens: meta.data.tokens,
    packId: meta.data.packId,
    isSubscription,
    amountCents,
    taxCents,
    exGstCents,
    buyerCountry,
    taxApplied,
  };
}

