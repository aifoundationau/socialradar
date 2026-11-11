import { NextResponse } from "next/server";
import { db } from "@/lib/firebase-admin";
import { ApiError, errorResponse, readJson } from "@/lib/api";
import {
  DeconstructDownloadRequestSchema,
  NormalizedAdSchema,
  RemixDocSchema,
  type DeconstructDownloadRequest,
  type NormalizedAd,
} from "@/lib/contracts";
import {
  buildDeconstructTextFileContent,
  getDeconstructFileName,
} from "@/lib/deconstruct-text-file";
import { withTokenGate } from "@/lib/token-ledger";
import { getSystemConfig } from "@/lib/admin";
import { isChargingEnabled } from "@/lib/pricing";

export async function POST(req: Request) {
  let input: DeconstructDownloadRequest;
  try {
    input = DeconstructDownloadRequestSchema.parse(await readJson(req));
  } catch (err) {
    return errorResponse(err);
  }

  const config = await getSystemConfig();
  const cost = isChargingEnabled(config)
    ? Math.max(0, Math.round(config.serviceCosts?.deconstructDownload ?? 0))
    : 0;

  return withTokenGate(
    req,
    "DECONSTRUCT_DOWNLOAD",
    input.remixId,
    async ({ caller, balanceAfter }) => {
      const remixSnap = await db.collection("remixes").doc(input.remixId).get();
      const rawRemix = remixSnap.exists ? remixSnap.data() : input.remixSnapshot;
      if (!rawRemix) {
        throw new ApiError(
          "NOT_FOUND",
          "That Deconstructed Anatomy blueprint is no longer available. Please generate the remix again.",
          404
        );
      }

      const remix = RemixDocSchema.parse(rawRemix);
      if (remixSnap.exists && remix.uid && remix.uid !== caller.uid) {
        throw new ApiError("FORBIDDEN", "You can only download your own remix blueprints.", 403);
      }

      let resolvedBrandName = input.brandName?.trim() || "";
      if (!resolvedBrandName && remix.brandId) {
        try {
          const brandSnap = await db
            .collection("users")
            .doc(caller.uid)
            .collection("brands")
            .doc(remix.brandId)
            .get();
          if (brandSnap.exists) {
            const bData = brandSnap.data() as { brandName?: string } | undefined;
            if (bData?.brandName) resolvedBrandName = bData.brandName;
          }
        } catch {
          // Ignore optional brand lookup error
        }
      }

      let sourceAd: Partial<NormalizedAd> | null = input.adSnapshot ?? null;
      if (!sourceAd && remix.sourceAdId) {
        try {
          const adSnap = await db.collection("normalized_ads").doc(remix.sourceAdId).get();
          if (adSnap.exists) {
            const parsedAd = NormalizedAdSchema.safeParse(adSnap.data());
            if (parsedAd.success) sourceAd = parsedAd.data;
          }
        } catch {
          // Ignore optional ad lookup error
        }
      }

      const fileName = getDeconstructFileName(resolvedBrandName || "brand");
      const content = buildDeconstructTextFileContent({
        remix,
        brandName: resolvedBrandName || "Your Brand",
        ad: sourceAd,
      });

      return NextResponse.json({
        remixId: remix.remixId,
        fileName,
        content,
        balanceAfter,
      });
    },
    cost
  );
}

