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
 * Ensures the active 10% EXCLUSIVE Australian GST TaxRate (`txr_1UWRnsI8bClhBF4PWROuyTyt`,
 * `inclusive: false`, `percentage: 10`, `jurisdiction: "AU"`, `display_name: "GST"`) is resolved and cached.
 * Used ONLY for Australia (`AU`) and New Zealand (`NZ`) geolocated purchases so 10% GST is added on top
 * of the Admin Panel price (`Price + 10% GST`).
 * For all non-AU/NZ geolocated purchases, no TaxRate is attached and no tax is recorded or added.
 */
export async function ensureAuGstTaxRateId(): Promise<string> {
  if (cachedAuGstTaxRateId) return cachedAuGstTaxRateId;
  const stripe = getStripe();
  const existing = await stripe.taxRates.list({ limit: 50 });
  const found = existing.data.find(
    (tr) =>
      tr.inclusive === false &&
      tr.percentage === 10 &&
      (tr.jurisdiction === "AU" || tr.country === "AU") &&
      tr.display_name === "GST"
  );
  if (found) {
    if (!found.active) {
      await stripe.taxRates.update(found.id, { active: true });
    }
    cachedAuGstTaxRateId = found.id;
    return found.id;
  }

  const created = await stripe.taxRates.create({
    display_name: "GST",
    description: "Australian Goods and Services Tax",
    jurisdiction: "AU",
    country: "AU",
    percentage: 10,
    inclusive: false,
    active: true,
  });
  cachedAuGstTaxRateId = created.id;
  return created.id;
}

/**
 * Hosted Checkout for either:
 * 1. One-off Token Packs (`mode: "payment"`, `invoice_creation: { enabled: true }`) — Price + 10% GST for AU/NZ (e.g. $50 + $5 GST = $55 AUD), or Price with No Tax for non-AU/NZ.
 * 2. Monthly Search Subscription (`mode: "subscription"`, `pack.id === "SUB_MONTHLY_1000"`) — Price + 10% GST for AU/NZ (e.g. $700/mo + $70 GST = $770 AUD/mo), or Price with No Tax for non-AU/NZ.
 */
export function buildCheckoutParams(opts: {
  uid: string;
  email: string;
  stripeCustomerId: string;
  pack: TokenPack;
  appUrl: string;
  subscriptionName?: string;
  buyerCountry?: string;
  gstTaxRateId?: string;
}): Stripe.Checkout.SessionCreateParams {
  const {
    uid,
    email,
    stripeCustomerId,
    pack,
    appUrl,
    subscriptionName,
    buyerCountry = "AU",
    gstTaxRateId,
  } = opts;
  const isSubscription = pack.id === "SUB_MONTHLY_1000";
  const normalizedCountry = buyerCountry.toUpperCase().trim() || "AU";
  const isAuNz = normalizedCountry === "AU" || normalizedCountry === "NZ";
  const applyGst = isAuNz && Boolean(gstTaxRateId);

  const exGstCents = pack.priceCents;
  const gstCents = applyGst ? Math.round(exGstCents * 0.1) : 0;
  const totalCents = exGstCents + gstCents;
  const exGstFormatted = (exGstCents / 100).toFixed(2);
  const gstFormatted = (gstCents / 100).toFixed(2);
  const totalFormatted = (totalCents / 100).toFixed(2);
  const tokensFormatted = pack.tokens.toLocaleString("en-AU");

  const metadata: Record<string, string> = {
    uid,
    packId: pack.id,
    tokens: String(pack.tokens),
    buyerCountry: normalizedCountry,
    taxApplied: applyGst ? "true" : "false",
    priceExGstAud: `$${exGstFormatted} AUD`,
    gstTaxAud: `$${gstFormatted} AUD`,
    totalIncGstAud: `$${totalFormatted} AUD`,
    taxType: applyGst ? "Australian GST 10% (Exclusive)" : `No Tax (${normalizedCountry} — Non-AU/NZ)`,
  };

  if (isSubscription) {
    return {
      mode: "subscription",
      client_reference_id: uid,
      metadata,
      subscription_data: {
        metadata,
      },
      ...(stripeCustomerId
        ? { customer: stripeCustomerId }
        : email
          ? { customer_email: email }
          : {}),
      line_items: [
        {
          quantity: 1,
          ...(applyGst && gstTaxRateId ? { tax_rates: [gstTaxRateId] } : {}),
          price_data: {
            currency: TOKEN_PACK_CURRENCY,
            tax_behavior: "exclusive",
            unit_amount: pack.priceCents,
            recurring: {
              interval: "month",
            },
            product_data: {
              name: subscriptionName || "Monthly Search Subscription",
              description: applyGst
                ? `Allocate ${tokensFormatted} Searches / Month — $${exGstFormatted} AUD + $${gstFormatted} AUD (10% GST) = $${totalFormatted} AUD / mo`
                : `Allocate ${tokensFormatted} Searches / Month — $${exGstFormatted} AUD / mo (No Tax · ${normalizedCountry})`,
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
        description: applyGst
          ? `Tax Invoice — ${tokensFormatted} Ad Radar Tokens ($${exGstFormatted} AUD + $${gstFormatted} AUD 10% GST = $${totalFormatted} AUD)`
          : `Invoice — ${tokensFormatted} Ad Radar Tokens ($${exGstFormatted} AUD · No Tax · ${normalizedCountry})`,
        custom_fields: applyGst
          ? [
              { name: "Price (Ex-GST)", value: `$${exGstFormatted} AUD` },
              { name: "GST (10%)", value: `$${gstFormatted} AUD` },
            ]
          : [{ name: "Tax", value: `No Tax (${normalizedCountry})` }],
        metadata,
      },
    },
    client_reference_id: uid,
    metadata,
    payment_intent_data: {
      description: applyGst
        ? `${tokensFormatted} Ad Radar Tokens — $${exGstFormatted} AUD + $${gstFormatted} AUD 10% GST = $${totalFormatted} AUD`
        : `${tokensFormatted} Ad Radar Tokens — $${exGstFormatted} AUD (No Tax · ${normalizedCountry})`,
      metadata,
    },
    ...(stripeCustomerId
      ? { customer: stripeCustomerId }
      : { customer_creation: "always", ...(email ? { customer_email: email } : {}) }),
    line_items: [
      {
        quantity: 1,
        ...(applyGst && gstTaxRateId ? { tax_rates: [gstTaxRateId] } : {}),
        price_data: {
          currency: TOKEN_PACK_CURRENCY,
          tax_behavior: "exclusive",
          unit_amount: pack.priceCents,
          product_data: {
            name: `${tokensFormatted} Ad Radar Tokens`,
            description: applyGst
              ? `${tokensFormatted} Ad Radar tokens ($${exGstFormatted} AUD + $${gstFormatted} AUD 10% GST = $${totalFormatted} AUD)`
              : `${tokensFormatted} Ad Radar tokens ($${exGstFormatted} AUD · No Tax · ${normalizedCountry})`,
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
  const buyerCountry = (meta.data.buyerCountry || "AU").toUpperCase();
  const isAuNz = buyerCountry === "AU" || buyerCountry === "NZ";
  const taxApplied = meta.data.taxApplied === "false" ? false : isAuNz;

  const taxCents = taxApplied
    ? session.total_details?.amount_tax ?? (amountCents - (session.amount_subtotal ?? Math.round(amountCents / 1.1)))
    : 0;
  const exGstCents = taxApplied ? session.amount_subtotal ?? (amountCents - taxCents) : amountCents;
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

