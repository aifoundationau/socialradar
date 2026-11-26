import { NextResponse } from "next/server";
import { errorResponse, readJson } from "@/lib/api";
import { RadarSearchRequestSchema, type RadarSearchRequest, type RadarSearchResponse } from "@/lib/contracts";
import { radarQueryHash, replayRadarSearch, runRadarSearch } from "@/lib/radar";
import { withTokenGate } from "@/lib/token-ledger";
import { getBrand } from "@/lib/brands";
import {
  calculateSearchCost,
  isAdAgentPricingRole,
  isChargingEnabled,
  resolveServiceCostsForRole,
} from "@/lib/pricing";
import { getSystemConfig } from "@/lib/admin";
import { dispatchCompletedSearchLeadToAdAgents } from "@/lib/ad-agents";
import { resolveRequestCountry } from "@/lib/request-geo";

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
  const resolveSearchCost = (caller: { claims: Parameters<typeof isAdAgentPricingRole>[0] }) => {
    const isAdAgent = isAdAgentPricingRole(caller.claims);
    return isChargingEnabled(config)
      ? calculateSearchCost(input, resolveServiceCostsForRole(config, isAdAgent), isAdAgent)
      : 0;
  };

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
    async ({ caller, txId, cost, replayed, balanceAfter }) => {
      let brand = null;
      if (caller && input.brandId) {
        brand = await getBrand(caller.uid, input.brandId);
      }
      const result = replayed
        ? await replayRadarSearch(input, queryHash)
        : await runRadarSearch(input, queryHash, brand);

      if (!replayed) {
        try {
          const detectedCountry = await resolveRequestCountry(req).catch(() => "");
          await dispatchCompletedSearchLeadToAdAgents({
            txId,
            customerUid: caller.uid,
            customerEmail: caller.email,
            customerRole: caller.claims.role,
            customerCountry: detectedCountry || input.country,
            search: input,
            resultsCount: result.ads.length,
            tokensCharged: cost,
            brand,
          });
        } catch (dispatchErr) {
          console.warn("[radar] non-fatal search lead dispatch error:", dispatchErr);
        }
      }

      return NextResponse.json({ ...result, balanceAfter } satisfies RadarSearchResponse);
    },
    resolveSearchCost,
  );
}
