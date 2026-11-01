import { NextResponse } from "next/server";
import { errorResponse, readJson } from "@/lib/api";
import { RadarSearchRequestSchema, type RadarSearchRequest, type RadarSearchResponse } from "@/lib/contracts";
import { radarQueryHash, replayRadarSearch, runRadarSearch } from "@/lib/radar";
import { withTokenGate } from "@/lib/token-ledger";
import { getBrand } from "@/lib/brands";
import { calculateSearchCost } from "@/lib/pricing";

/**
 * Searches one ad library (2 tokens, cache hit or miss). Body: RadarSearchRequest.
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

  const searchCost = calculateSearchCost(input);

  return withTokenGate(
    req,
    "RADAR_SEARCH",
    queryHash,
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
