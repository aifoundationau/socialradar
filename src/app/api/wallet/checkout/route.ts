import { NextResponse } from "next/server";
import { verifyRequest } from "@/lib/firebase-admin";
import { ensureUserDoc, buildTxId } from "@/lib/token-ledger";
import { errorResponse, readJson, requireIdempotencyKey } from "@/lib/api";
import { CheckoutRequestSchema } from "@/lib/contracts";
import {
  DEFAULT_AUD_CENTS_PER_TOKEN,
  TOKEN_PACKS,
  audToUsdCents,
  buildTokenPack,
  type TokenPack,
} from "@/lib/pricing";
import { getSystemConfig } from "@/lib/admin";
import { buildCheckoutParams, getStripe } from "@/lib/stripe";

/** Returns the active public pricing configuration (AUD base rate, service token amounts, and packs). */
export async function GET(req: Request) {
  try {
    // Touch request headers so Next.js treats this route as dynamic on-demand
    void req.headers.get("accept");
    const config = await getSystemConfig();
    return NextResponse.json({
      audCentsPerToken: config.audCentsPerToken ?? DEFAULT_AUD_CENTS_PER_TOKEN,
      serviceCosts: config.serviceCosts,
      tokenPacks: config.tokenPacks,
      isTokenSystemEnabled: config.isTokenSystemEnabled,
      isAudEnabled: config.isAudEnabled,
      isUsdEnabled: config.isUsdEnabled,
    });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Starts a Stripe Checkout Session for a token pack (settled in AUD). Body: `{ packId, customTokens? }`. Returns `{ url }`. */
export async function POST(req: Request) {
  try {
    const caller = await verifyRequest(req);
    const key = requireIdempotencyKey(req);
    const { packId, customTokens } = CheckoutRequestSchema.parse(await readJson(req));
    const [user, config] = await Promise.all([
      ensureUserDoc(caller.uid, caller.email),
      getSystemConfig(),
    ]);

    const audCentsPerToken = config.audCentsPerToken ?? DEFAULT_AUD_CENTS_PER_TOKEN;

    let pack: TokenPack;
    if (packId === "PACK_CUSTOM") {
      const tokens = customTokens!;
      pack = buildTokenPack(packId, tokens, audCentsPerToken);
    } else {
      // Check if SuperAdmin customized this specific pack in config.tokenPacks
      const adminPack = config.tokenPacks?.find((p) => p.id === packId && p.enabled);
      if (adminPack) {
        const tokens = Math.max(1, Math.round(adminPack.tokens));
        // If SuperAdmin customized audCentsPerToken or the pack's priceCents, compute AUD price
        const priceCents =
          audCentsPerToken !== DEFAULT_AUD_CENTS_PER_TOKEN
            ? Math.round(tokens * audCentsPerToken)
            : Math.max(100, Math.round(adminPack.priceCents));
        pack = {
          id: packId,
          tokens,
          priceCents,
          priceUsdCents: audToUsdCents(priceCents),
        };
      } else {
        const tokens = TOKEN_PACKS[packId].tokens;
        pack = buildTokenPack(packId, tokens, audCentsPerToken);
      }
    }

    const session = await getStripe().checkout.sessions.create(
      buildCheckoutParams({
        uid: caller.uid,
        email: caller.email,
        stripeCustomerId: user.stripeCustomerId,
        pack,
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
