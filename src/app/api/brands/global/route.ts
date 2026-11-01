import { NextResponse } from "next/server";
import { verifyRequest } from "@/lib/firebase-admin";
import { errorResponse } from "@/lib/api";
import { searchGlobalBrands } from "@/lib/brands";
import { GlobalBrandSearchQuerySchema } from "@/lib/contracts";
import { getSystemConfig } from "@/lib/admin";

export async function GET(req: Request) {
  try {
    await verifyRequest(req);
    const { searchParams } = new URL(req.url);
    const parsed = GlobalBrandSearchQuerySchema.parse({
      q: searchParams.get("q") ?? undefined,
      tone: searchParams.get("tone") ?? undefined,
      limit: searchParams.get("limit") ? parseInt(searchParams.get("limit")!, 10) : 50,
    });

    const [brands, config] = await Promise.all([
      searchGlobalBrands({
        query: parsed.q,
        tone: parsed.tone,
        limit: parsed.limit,
      }),
      getSystemConfig(),
    ]);

    const brandCloneFee = config.isTokenSystemEnabled
      ? Math.max(0, Math.round(config.serviceCosts?.brandClone ?? 1))
      : 0;

    return NextResponse.json({
      brands,
      brandCloneFee,
      audCentsPerToken: config.audCentsPerToken ?? 100,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
