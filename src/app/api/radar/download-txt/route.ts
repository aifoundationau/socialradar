import { NextResponse } from "next/server";
import { db } from "@/lib/firebase-admin";
import { ApiError, errorResponse, readJson } from "@/lib/api";
import {
  NormalizedAdSchema,
  RemixDocSchema,
  SearchMixDownloadRequestSchema,
  type RemixDoc,
  type SearchMixDownloadRequest,
} from "@/lib/contracts";
import {
  buildSearchMixTextFileContent,
  formatSearchMixDate,
  getSearchMixFileName,
} from "@/lib/searchmix-text-file";
import { withTokenGate } from "@/lib/token-ledger";
import { getSystemConfig } from "@/lib/admin";
import { isChargingEnabled } from "@/lib/pricing";

export async function POST(req: Request) {
  let input: SearchMixDownloadRequest;
  try {
    input = SearchMixDownloadRequestSchema.parse(await readJson(req));
  } catch (err) {
    return errorResponse(err);
  }

  const config = await getSystemConfig();
  const cost = isChargingEnabled(config)
    ? Math.max(0, Math.round(config.serviceCosts?.searchMixDownload ?? 1))
    : 0;

  return withTokenGate(
    req,
    "SEARCHMIX_DOWNLOAD",
    input.adId,
    async ({ caller, balanceAfter }) => {
      const adSnap = await db.collection("normalized_ads").doc(input.adId).get();
      const rawAd = adSnap.exists ? adSnap.data() : input.adSnapshot;
      if (!rawAd) {
        throw new ApiError(
          "NOT_FOUND",
          "That search postcard is no longer available. Please run the search again.",
          404
        );
      }

      const ad = NormalizedAdSchema.parse(rawAd);

      // Best-effort check if the caller also has a saved AI remix for this ad
      let remix: RemixDoc | null = null;
      try {
        const remixSnap = await db
          .collection("remixes")
          .where("uid", "==", caller.uid)
          .where("sourceAdId", "==", input.adId)
          .limit(1)
          .get();
        if (!remixSnap.empty) {
          const parsedRemix = RemixDocSchema.safeParse(remixSnap.docs[0].data());
          if (parsedRemix.success) remix = parsedRemix.data;
        }
      } catch {
        // Ignore optional remix lookup error
      }

      const dateIso = new Date().toISOString();
      const savedDate = formatSearchMixDate(dateIso);
      const fileName = getSearchMixFileName(ad, {
        searchQuery: input.query,
        dateIso,
      });
      const content = buildSearchMixTextFileContent(ad, {
        searchQuery: input.query,
        dateIso,
        rank: input.rank,
        remix,
      });

      return NextResponse.json({
        adId: ad.adId,
        fileName,
        savedDate,
        content,
        balanceAfter,
      });
    },
    cost
  );
}

