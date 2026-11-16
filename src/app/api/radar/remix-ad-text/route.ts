import { NextResponse } from "next/server";
import { db } from "@/lib/firebase-admin";
import { ApiError, errorResponse, readJson } from "@/lib/api";
import {
  BrandProfileSchema,
  BuildRemixedAdTextRequestSchema,
  NormalizedAdSchema,
  RemixedAdTextDocSchema,
  RemixDocSchema,
  type BuildRemixedAdTextRequest,
  type BuildRemixedAdTextResponse,
  type RemixDoc,
} from "@/lib/contracts";
import { assertRemixConfigured, generateRemixedAdTexts } from "@/lib/gemini";
import { enrichGoogleAd, needsGoogleDetails } from "@/lib/radar";
import { withTokenGate } from "@/lib/token-ledger";
import { getSystemConfig } from "@/lib/admin";
import { isChargingEnabled } from "@/lib/pricing";

/**
 * Generates 4 platform-tailored social media ad text descriptions (TikTok, Facebook, Instagram & Google Ads),
 * each strictly <= 150 words, from the active Brand Profile + current modeling ad (+ optional deconstruction).
 * Uses the SuperAdmin-configured `serviceCosts.buildRemixedAdText` token amount (default 1 token).
 * Results persist in `remixed_ad_texts/{txId}` so idempotent retries return cached output with zero extra charge.
 */
export async function POST(req: Request) {
  let input: BuildRemixedAdTextRequest;
  try {
    input = BuildRemixedAdTextRequestSchema.parse(await readJson(req));
  } catch (err) {
    return errorResponse(err);
  }

  const config = await getSystemConfig();
  const configuredCost = config.serviceCosts?.buildRemixedAdText ?? 1;
  const cost = isChargingEnabled(config) ? Math.max(0, Math.round(configuredCost)) : 0;

  return withTokenGate(
    req,
    "BUILD_REMIXED_AD_TEXT",
    input.adId,
    async ({ caller, txId, replayed, balanceAfter }) => {
      const ref = db.collection("remixed_ad_texts").doc(txId);
      if (replayed) {
        const snap = await ref.get();
        if (!snap.exists) {
          throw new ApiError("INVALID_INPUT", "That ad text build didn't finish. Please try again.", 409);
        }
        return NextResponse.json({
          remixedAdText: RemixedAdTextDocSchema.parse(snap.data()),
          balanceAfter,
        } satisfies BuildRemixedAdTextResponse);
      }

      const [adSnap, brandSnap, remixSnap] = await Promise.all([
        db.collection("normalized_ads").doc(input.adId).get(),
        db.collection("users").doc(caller.uid).collection("brands").doc(input.brandId).get(),
        input.remixId ? db.collection("remixes").doc(input.remixId).get() : Promise.resolve(null),
      ]);

      if (!adSnap.exists) {
        throw new ApiError("NOT_FOUND", "That ad is no longer available. Run the search again.", 404);
      }
      if (!brandSnap.exists) {
        throw new ApiError("NOT_FOUND", `Brand ${input.brandId} not found`, 404);
      }

      assertRemixConfigured();
      let ad = NormalizedAdSchema.parse(adSnap.data());
      if (needsGoogleDetails(ad)) {
        ad = await enrichGoogleAd(ad);
        await adSnap.ref.set(ad);
      }

      const brand = BrandProfileSchema.parse(brandSnap.data());
      let deconstruction: RemixDoc["deconstruction"] | null = null;
      if (remixSnap?.exists) {
        const parsedRemix = RemixDocSchema.safeParse(remixSnap.data());
        if (parsedRemix.success && parsedRemix.data.uid === caller.uid) {
          deconstruction = parsedRemix.data.deconstruction;
        }
      }

      const items = await generateRemixedAdTexts(ad, brand, deconstruction);
      const remixedAdText = RemixedAdTextDocSchema.parse({
        remixedAdTextId: txId,
        uid: caller.uid,
        sourceAdId: input.adId,
        brandId: input.brandId,
        brandName: brand.brandName,
        sourceAdvertiser: ad.advertiserName || "Selected Ad",
        items,
        createdAt: new Date().toISOString(),
      });

      await ref.set(remixedAdText);
      return NextResponse.json({ remixedAdText, ad, balanceAfter } satisfies BuildRemixedAdTextResponse);
    },
    cost,
  );
}
