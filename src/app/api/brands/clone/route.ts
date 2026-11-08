import { NextResponse } from "next/server";
import { errorResponse, readJson } from "@/lib/api";
import { cloneGlobalBrand } from "@/lib/brands";
import { BrandCloneRequestSchema } from "@/lib/contracts";
import { getSystemConfig } from "@/lib/admin";
import { withTokenGate } from "@/lib/token-ledger";
import { isChargingEnabled } from "@/lib/pricing";

export async function POST(req: Request) {
  let input;
  try {
    input = BrandCloneRequestSchema.parse(await readJson(req));
  } catch (err) {
    return errorResponse(err);
  }

  const config = await getSystemConfig();
  const cost = isChargingEnabled(config)
    ? Math.max(0, Math.round(config.serviceCosts?.brandClone ?? 1))
    : 0;

  return withTokenGate(
    req,
    "BRAND_CLONE",
    input.globalBrandId,
    async ({ caller, txId, balanceAfter }) => {
      // The paid transaction id is the brand's idempotency key: a replayed request returns the same copy.
      const { brand, replayed } = await cloneGlobalBrand(caller, input.globalBrandId, txId);
      return NextResponse.json({ brand, balanceAfter }, { status: replayed ? 200 : 201 });
    },
    cost,
  );
}
