import { NextResponse } from "next/server";
import { db } from "@/lib/firebase-admin";
import { ApiError, errorResponse, readJson } from "@/lib/api";
import {
  BrandProfileSchema,
  NormalizedAdSchema,
  RemixDocSchema,
  RemixRequestSchema,
  type RemixRequest,
  type RemixResponse,
} from "@/lib/contracts";
import { assertRemixConfigured, generateRemix } from "@/lib/gemini";
import { enrichGoogleAd, needsGoogleDetails } from "@/lib/radar";
import { withTokenGate } from "@/lib/token-ledger";
import { getSystemConfig } from "@/lib/admin";

/**
 * Deconstructs a searched ad and writes 3 variations for one of the caller's brands.
 * Uses the SuperAdmin-configured `serviceCosts.aiRemix` token amount.
 * Body: `{ adId, brandId }`. The ad is read from `normalized_ads`, never taken from the client.
 * The result is stored at `remixes/{txId}`, so a replayed key returns it without charging again.
 */
export async function POST(req: Request) {
  let input: RemixRequest;
  try {
    input = RemixRequestSchema.parse(await readJson(req));
  } catch (err) {
    return errorResponse(err);
  }

  const config = await getSystemConfig();
  const remixCost = config.isTokenSystemEnabled
    ? Math.max(0, Math.round(config.serviceCosts?.aiRemix ?? 0))
    : 0;

  return withTokenGate(
    req,
    "AI_REMIX",
    input.adId,
    async ({ caller, txId, replayed, balanceAfter }) => {
      const ref = db.collection("remixes").doc(txId);
      if (replayed) {
        const snap = await ref.get();
        if (!snap.exists) throw new ApiError("INVALID_INPUT", "That remix didn't finish. Please try again.", 409);
        return NextResponse.json({ remix: RemixDocSchema.parse(snap.data()), balanceAfter } satisfies RemixResponse);
      }

      const [adSnap, brandSnap] = await Promise.all([
        db.collection("normalized_ads").doc(input.adId).get(),
        db.collection("users").doc(caller.uid).collection("brands").doc(input.brandId).get(),
      ]);
      if (!adSnap.exists) throw new ApiError("NOT_FOUND", "That ad is no longer available. Run the search again.", 404);
      if (!brandSnap.exists) throw new ApiError("NOT_FOUND", `Brand ${input.brandId} not found`, 404);

      assertRemixConfigured();
      let ad = NormalizedAdSchema.parse(adSnap.data());
      if (needsGoogleDetails(ad)) {
        ad = await enrichGoogleAd(ad);
        await adSnap.ref.set(ad);
      }
      const blueprint = await generateRemix(ad, BrandProfileSchema.parse(brandSnap.data()));
      const remix = RemixDocSchema.parse({
        remixId: txId,
        uid: caller.uid,
        sourceAdId: input.adId,
        brandId: input.brandId,
        ...blueprint,
      });
      await ref.set(remix);
      return NextResponse.json({ remix, ad, balanceAfter } satisfies RemixResponse);
    },
    remixCost,
  );
}
