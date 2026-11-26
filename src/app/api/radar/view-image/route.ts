import { NextResponse } from "next/server";
import { errorResponse, readJson } from "@/lib/api";
import { getSystemConfig } from "@/lib/admin";
import { SearchImageViewRequestSchema, type SearchImageViewRequest } from "@/lib/contracts";
import { isAdAgentPricingRole, resolveServiceCostsForRole } from "@/lib/pricing";
import { withTokenGate } from "@/lib/token-ledger";

/** Token-gated unlock to download & view a search result's creative image/video preview. */
export async function POST(req: Request) {
  let input: SearchImageViewRequest;
  try {
    input = SearchImageViewRequestSchema.parse(await readJson(req));
  } catch (err) {
    return errorResponse(err);
  }

  const config = await getSystemConfig();
  const resolveCost = (caller: { claims: Parameters<typeof isAdAgentPricingRole>[0] }) => {
    const costs = resolveServiceCostsForRole(config, isAdAgentPricingRole(caller.claims));
    return Math.max(0, Math.round(costs.searchImageView ?? 1));
  };

  const advertiserPart = input.advertiserName?.trim()
    ? `${input.advertiserName.trim()} (${input.adId})`
    : input.adId;
  const queryPart = input.query?.trim() ? ` [${input.query.trim()}]` : "";
  const referenceId = `Search Image View: ${advertiserPart}${queryPart}`;

  return withTokenGate(
    req,
    "SEARCH_IMAGE_VIEW",
    referenceId,
    async ({ balanceAfter }) =>
      NextResponse.json({
        adId: input.adId,
        unlocked: true,
        balanceAfter,
      }),
    resolveCost,
  );
}
