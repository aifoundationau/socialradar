import { NextResponse } from "next/server";
import { errorResponse, readJson } from "@/lib/api";
import { cloneGlobalBrand } from "@/lib/brands";
import { BrandCloneRequestSchema } from "@/lib/contracts";
import { getSystemConfig } from "@/lib/admin";
import { withTokenGate } from "@/lib/token-ledger";

export async function POST(req: Request) {
  let input;
  try {
    input = BrandCloneRequestSchema.parse(await readJson(req));
  } catch (err) {
    return errorResponse(err);
  }

  const config = await getSystemConfig();
  const cost = config.isTokenSystemEnabled
    ? Math.max(0, Math.round(config.serviceCosts?.brandClone ?? 5))
    : 0;

  return withTokenGate(
    req,
    "BRAND_CLONE",
    input.globalBrandId,
    async ({ caller, balanceAfter }) => {
      const brand = await cloneGlobalBrand(caller, input.globalBrandId);
      return NextResponse.json({ brand, balanceAfter }, { status: 201 });
    },
    cost,
  );
}
