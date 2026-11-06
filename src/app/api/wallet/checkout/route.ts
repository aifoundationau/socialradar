import { NextResponse } from "next/server";
import { verifyRequest } from "@/lib/firebase-admin";
import { ensureUserDoc, buildTxId } from "@/lib/token-ledger";
import { ApiError, errorResponse, readJson, requireIdempotencyKey } from "@/lib/api";
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
    return NextResponse.json(
      {
        audCentsPerToken: config.audCentsPerToken ?? DEFAULT_AUD_CENTS_PER_TOKEN,
        serviceCosts: config.serviceCosts,
        tokenPacks: config.tokenPacks,
        monthlySubscription: config.monthlySubscription,
        isTokenSystemEnabled: config.isTokenSystemEnabled,
        isAudEnabled: config.isAudEnabled,
        isUsdEnabled: config.isUsdEnabled,
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (err) {
    return errorResponse(err);
  }
}

/** Starts a Stripe Checkout Session for a token pack or monthly subscription (settled in AUD; Price + 10% exclusive GST for Australia only, no tax for New Zealand and international buyers). Body: `{ packId, customTokens?, buyerCountry? }`. Returns `{ url }`. */
export async function POST(req: Request) {
  try {
    const body = CheckoutRequestSchema.parse(await readJson(req));
    const { packId, customTokens } = body;
    const headerCountry = (
      req.headers.get("x-vercel-ip-country") ||
      req.headers.get("cf-ipcountry") ||
      req.headers.get("x-country-code") ||
      ""
    )
      .toUpperCase()
      .trim();
    const buyerCountry = (body.buyerCountry || headerCountry || "AU").toUpperCase().trim();

    // Monthly Search Subscription is a SuperAdmin and MainAdmin function only
    const caller = await verifyRequest(req, packId === "SUB_MONTHLY_1000" ? { requireRole: "admin" } : undefined);
    const key = requireIdempotencyKey(req);
    const [user, config] = await Promise.all([
      ensureUserDoc(caller.uid, caller.email),
      getSystemConfig(),
    ]);

    const audCentsPerToken = config.audCentsPerToken ?? DEFAULT_AUD_CENTS_PER_TOKEN;

    let pack: TokenPack;
    if (packId === "SUB_MONTHLY_1000") {
      const sub = config.monthlySubscription ?? {
        priceAud: 500,
        searchesPerMonth: 1000,
        name: "Monthly Search Subscription",
      };
      const tokens = Math.max(1, Math.round(sub.searchesPerMonth ?? 1000));
      const priceCents = Math.max(100, Math.round((sub.priceAud ?? 500) * 100));
      pack = {
        id: "SUB_MONTHLY_1000",
        name: sub.name || "Monthly Search Subscription",
        tokens,
        priceCents,
        priceUsdCents: audToUsdCents(priceCents),
      };
    } else if (packId === "PACK_CUSTOM") {
      const tokens = customTokens!;
      pack = buildTokenPack(packId, tokens, audCentsPerToken);
    } else {
      // Check if SuperAdmin configured or created this pack in config.tokenPacks
      const adminPack = config.tokenPacks?.find((p) => p.id === packId && p.enabled !== false);
      if (adminPack) {
        const tokens = Math.max(1, Math.round(adminPack.tokens));
        const hasCustomPackPrice =
          typeof adminPack.priceCents === "number" &&
          adminPack.priceCents >= 100 &&
          adminPack.priceCents !== tokens * DEFAULT_AUD_CENTS_PER_TOKEN;
        const priceCents = hasCustomPackPrice
          ? Math.max(100, Math.round(adminPack.priceCents))
          : audCentsPerToken !== DEFAULT_AUD_CENTS_PER_TOKEN
            ? Math.round(tokens * audCentsPerToken)
            : Math.max(100, Math.round(adminPack.priceCents));
        pack = {
          id: packId,
          name: adminPack.name,
          tokens,
          priceCents,
          priceUsdCents: audToUsdCents(priceCents),
        };
      } else if (packId in TOKEN_PACKS) {
        const fallback = TOKEN_PACKS[packId as keyof typeof TOKEN_PACKS];
        pack = buildTokenPack(packId, fallback.tokens, audCentsPerToken, undefined, undefined, fallback.name);
      } else {
        throw new ApiError("NOT_FOUND", `Token pack ${packId} not found`, 404);
      }
    }

    const appUrl = new URL(req.url).origin || process.env.APP_URL || "http://localhost:3000";
    const stripe = getStripe();
    const baseIdempotencyKey = buildTxId(caller.uid, `${key}_${buyerCountry}_ex`);

    let session;
    try {
      session = await stripe.checkout.sessions.create(
        buildCheckoutParams({
          uid: caller.uid,
          email: caller.email,
          stripeCustomerId: user.stripeCustomerId,
          pack,
          appUrl,
          subscriptionName: config.monthlySubscription?.name,
          buyerCountry,
        }),
        { idempotencyKey: baseIdempotencyKey },
      );
    } catch (stripeErr) {
      const msg = stripeErr instanceof Error ? stripeErr.message : String(stripeErr);
      if (user.stripeCustomerId && /No such customer/i.test(msg)) {
        session = await stripe.checkout.sessions.create(
          buildCheckoutParams({
            uid: caller.uid,
            email: caller.email,
            stripeCustomerId: "",
            pack,
            appUrl,
            subscriptionName: config.monthlySubscription?.name,
            buyerCountry,
          }),
          { idempotencyKey: `${baseIdempotencyKey}_freshcus` },
        );
      } else {
        throw stripeErr;
      }
    }

    if (!session.url) throw new Error(`Checkout Session ${session.id} has no URL`);
    return NextResponse.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    return errorResponse(err);
  }
}
