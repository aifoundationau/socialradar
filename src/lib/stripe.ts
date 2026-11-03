import "server-only";
import Stripe from "stripe";
import type { z } from "zod";
import { TopupMetadataSchema, type TokenPackId } from "./contracts";
import { TOKEN_PACK_CURRENCY, type TokenPack } from "./pricing";
import { creditTokens } from "./token-ledger";
import { recordStripePurchase } from "./admin";

let client: Stripe | null = null;
let cachedAuGstTaxRateId: string | null = null;

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
 * Ensures the active 10% inclusive Australian GST TaxRate (`txr_1UXpYQI8bClhBF4PcV9rhBuy`,
 * `inclusive: true`, `percentage: 10`, `country: "AU"`, `display_name: "GST"`) is resolved and cached.
 * Used by `sub_1UXpfSI8bClhBF4PwMByBJqe` and all Token Pack / Subscription checkouts so Stripe
 * always calculates and records the exact 10% GST on the Checkout session and Tax Invoice.
 */
export async function ensureAuGstTaxRateId(): Promise<string> {
  if (cachedAuGstTaxRateId) return cachedAuGstTaxRateId;
  const stripe = getStripe();
  const existing = await stripe.taxRates.list({ active: true, limit: 50 });
  const found = existing.data.find(
    (tr) =>
      tr.inclusive === true &&
      tr.percentage === 10 &&
      tr.country === "AU" &&
      tr.display_name === "GST"
  );
  if (found) {
    cachedAuGstTaxRateId = found.id;
    return found.id;
  }

  const created = await stripe.taxRates.create({
    display_name: "GST",
    description: "Australian Goods and Services Tax (10% GST Included)",
    jurisdiction: "AU",
    country: "AU",
    percentage: 10,
    inclusive: true,
    active: true,
  });
  cachedAuGstTaxRateId = created.id;
  return created.id;
}

/**
 * Hosted Checkout for either:
 * 1. One-off Token Packs (`mode: "payment"`, `invoice_creation: { enabled: true }`) — e.g. 10 Tokens for $10 AUD, 20 Tokens for $20 AUD, etc.
 * 2. Monthly Search Subscription (`mode: "subscription"`, `pack.id === "SUB_MONTHLY_1000"`) — 1,000 monthly searches for $500 AUD/mo.
 *
 * Uses inline `price_data` + `product_data` (no pre-created Stripe products required, allowing instant SuperAdmin modifications)
 * settled strictly in AUD (`currency: "aud"`) with the 10% inclusive Australian GST TaxRate (`tax_rates: [gstTaxRateId]`)
 * matching `sub_1UXpfSI8bClhBF4PwMByBJqe`.
 */
export function buildCheckoutParams(opts: {
  uid: string;
  email: string;
  stripeCustomerId: string;
  pack: TokenPack;
  appUrl: string;
  subscriptionName?: string;
  gstTaxRateId?: string;
}): Stripe.Checkout.SessionCreateParams {
  const { uid, email, stripeCustomerId, pack, appUrl, subscriptionName, gstTaxRateId } = opts;
  const isSubscription = pack.id === "SUB_MONTHLY_1000";
  const metadata: Record<keyof z.output<typeof TopupMetadataSchema>, string> = {
    uid,
    packId: pack.id,
    tokens: String(pack.tokens),
  };

  const audDollars = Math.round(pack.priceCents / 100);
  const gstCents = Math.round(pack.priceCents - pack.priceCents / 1.1);
  const exGstCents = pack.priceCents - gstCents;
  const gstFormatted = (gstCents / 100).toFixed(2);
  const exGstFormatted = (exGstCents / 100).toFixed(2);
  const tokensFormatted = pack.tokens.toLocaleString("en-AU");

  if (isSubscription) {
    return {
      mode: "subscription",
      client_reference_id: uid,
      metadata,
      subscription_data: { metadata },
      ...(stripeCustomerId
        ? { customer: stripeCustomerId }
        : email
          ? { customer_email: email }
          : {}),
      line_items: [
        {
          quantity: 1,
          ...(gstTaxRateId ? { tax_rates: [gstTaxRateId] } : {}),
          price_data: {
            currency: TOKEN_PACK_CURRENCY,
            tax_behavior: "inclusive",
            unit_amount: pack.priceCents,
            recurring: {
              interval: "month",
            },
            product_data: {
              name: subscriptionName || "Monthly Search Subscription",
              description: `Allocate ${tokensFormatted} Searches / Month — $${audDollars.toLocaleString("en-AU")} AUD / mo (Ex-GST: $${exGstFormatted} AUD + 10% GST: $${gstFormatted} AUD)`,
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
    invoice_creation: { enabled: true },
    client_reference_id: uid,
    metadata,
    payment_intent_data: { metadata },
    ...(stripeCustomerId
      ? { customer: stripeCustomerId }
      : { customer_creation: "always", ...(email ? { customer_email: email } : {}) }),
    line_items: [
      {
        quantity: 1,
        ...(gstTaxRateId ? { tax_rates: [gstTaxRateId] } : {}),
        price_data: {
          currency: TOKEN_PACK_CURRENCY,
          tax_behavior: "inclusive",
          unit_amount: pack.priceCents,
          product_data: {
            name: `${tokensFormatted} Ad Radar Tokens`,
            description: `${tokensFormatted} Ad Radar tokens — $${audDollars.toLocaleString("en-AU")} AUD (Ex-GST: $${exGstFormatted} AUD + 10% GST: $${gstFormatted} AUD)`,
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
  const taxCents = session.total_details?.amount_tax ?? Math.round(amountCents - amountCents / 1.1);
  const exGstCents = amountCents - taxCents;
  const audDollars = Math.round(amountCents / 100);
  const gstDollarsStr = (taxCents / 100).toFixed(2);
  const referenceId = isSubscription
    ? `Stripe Monthly Subscription (${meta.data.tokens.toLocaleString("en-AU")} searches · $${audDollars} AUD inc. $${gstDollarsStr} GST) [${session.id}]`
    : `Stripe Token Pack (${meta.data.tokens.toLocaleString("en-AU")} tokens · $${audDollars} AUD inc. $${gstDollarsStr} GST) [${session.id}]`;

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
  };
}

