import { NextResponse } from "next/server";
import { errorResponse, readJson } from "@/lib/api";
import { getBrandForTxtDownload } from "@/lib/brands";
import { getBrandTextAttachment } from "@/lib/brand-text-file";
import { BrandTxtDownloadRequestSchema } from "@/lib/contracts";
import { getSystemConfig } from "@/lib/admin";
import { withTokenGate } from "@/lib/token-ledger";
import { isChargingEnabled } from "@/lib/pricing";

export async function POST(req: Request) {
  let input;
  try {
    input = BrandTxtDownloadRequestSchema.parse(await readJson(req));
  } catch (err) {
    return errorResponse(err);
  }

  const config = await getSystemConfig();
  const cost = isChargingEnabled(config)
    ? Math.max(0, Math.round(config.serviceCosts?.brandTxtDownload ?? 1))
    : 0;

  return withTokenGate(
    req,
    "BRAND_TXT_DOWNLOAD",
    input.brandId,
    async ({ caller, balanceAfter }) => {
      const brand = await getBrandForTxtDownload(
        caller.uid,
        input.brandId,
        input.isGlobalSource,
      );
      const attachment = getBrandTextAttachment(brand);
      return NextResponse.json({
        brandId: brand.brandId,
        brandName: brand.brandName,
        fileName: attachment.fileName,
        savedDate: attachment.savedDate,
        content: attachment.content,
        balanceAfter,
      });
    },
    cost,
  );
}

