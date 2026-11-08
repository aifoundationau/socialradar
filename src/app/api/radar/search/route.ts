import { NextResponse } from "next/server";
import { errorResponse, readJson } from "@/lib/api";
import { RadarSearchRequestSchema, type RadarSearchRequest, type RadarSearchResponse } from "@/lib/contracts";
import { radarQueryHash, replayRadarSearch, runRadarSearch } from "@/lib/radar";
import { withTokenGate } from "@/lib/token-ledger";
import { getBrand } from "@/lib/brands";
import { calculateSearchCost, isChargingEnabled } from "@/lib/pricing";
import { getSystemConfig } from "@/lib/admin";

/**
 * Searches one ad library using SuperAdmin-configurable token costs. Body: RadarSearchRequest.
 * Requires `x-idempotency-key`; the input is validated before anything is charged.
 */
export async function POST(req: Request) {
  let input: RadarSearchRequest;
  try {
    input = RadarSearchRequestSchema.parse(await readJson(req));
  } catch (err) {
    return errorResponse(err);
  }
  const queryHash = radarQueryHash(input);

  const config = await getSystemConfig();
  const searchCost = isChargingEnabled(config)
    ? calculateSearchCost(input, config.serviceCosts)
    : 0;

  // Also the idempotency reference: it must include every option that changes the price or the results,
  // so a replayed key can't fetch a differently filtered (e.g. surcharged) search for free.
  const searchOptions = [
    input.country,
    input.mediaType !== "ALL" ? input.mediaType.toLowerCase() : null,
    input.provenWinnersOnly ? "28+d" : null,
    input.extendedLongevity ? "60+d" : null,
    input.eliteWinnersOnly ? "top 90%+" : null,
  ].filter(Boolean);
  const searchLabel = `${input.platform} Search: "${input.query}" (${searchOptions.join(", ")})${
    input.brandId ? ` [brand ${input.brandId}]` : ""
  }`;

  return withTokenGate(
    req,
    "RADAR_SEARCH",
    searchLabel,
    async ({ caller, replayed, balanceAfter }) => {
      let brand = null;
      if (caller && input.brandId) {
        brand = await getBrand(caller.uid, input.brandId);
      }
      const result = replayed
        ? await replayRadarSearch(input, queryHash)
        : await runRadarSearch(input, queryHash, brand);
      return NextResponse.json({ ...result, balanceAfter } satisfies RadarSearchResponse);
    },
    searchCost,
  );
}
