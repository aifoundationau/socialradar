import "server-only";
import Stripe from "stripe";
import type { z } from "zod";
import type { TopupMetadataSchema } from "./contracts";
import { TOKEN_PACK_CURRENCY, type TokenPack } from "./pricing";

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
 * Hosted Checkout for a one-off token pack. Line items come from the server-side
 * pack table; the webhook credits `metadata.tokens` to `metadata.uid`.
 */
export function buildCheckoutParams(opts: {
  uid: string;
  email: string;
  stripeCustomerId: string;
  pack: TokenPack;
  appUrl: string;
}): Stripe.Checkout.SessionCreateParams {
  const { uid, email, stripeCustomerId, pack, appUrl } = opts;
  const metadata: Record<keyof z.output<typeof TopupMetadataSchema>, string> = {
    uid,
    packId: pack.id,
    tokens: String(pack.tokens),
  };

  return {
    mode: "payment",
    client_reference_id: uid,
    metadata,
    payment_intent_data: { metadata },
    ...(stripeCustomerId
      ? { customer: stripeCustomerId }
      : { customer_creation: "always", ...(email ? { customer_email: email } : {}) }),
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: TOKEN_PACK_CURRENCY,
          unit_amount: pack.priceCents,
          product_data: { name: `${pack.tokens.toLocaleString("en-AU")} Ad Radar tokens` },
        },
      },
    ],
    success_url: `${appUrl}/wallet?checkout=success`,
    cancel_url: `${appUrl}/wallet?checkout=cancelled`,
  };
}
