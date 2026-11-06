import { NextResponse } from "next/server";
import { verifyRequest } from "@/lib/firebase-admin";
import { errorResponse } from "@/lib/api";
import { searchGlobalBrands } from "@/lib/brands";
import { GlobalBrandSearchQuerySchema } from "@/lib/contracts";
import { getSystemConfig } from "@/lib/admin";
import { isChargingEnabled } from "@/lib/pricing";

async function handleGlobalBrands(req: Request) {
  try {
    await verifyRequest(req);
    const { searchParams } = new URL(req.url);
    let bodyParams: Record<string, unknown> = {};
    if (req.method === "POST") {
      bodyParams = (await req.json().catch(() => ({}))) ?? {};
    }

    const rawQ = searchParams.get("q") ?? (typeof bodyParams.q === "string" ? bodyParams.q : undefined);
    const rawTone = searchParams.get("tone") ?? (typeof bodyParams.tone === "string" ? bodyParams.tone : undefined);
    const rawLimit = searchParams.get("limit")
      ? parseInt(searchParams.get("limit")!, 10)
      : typeof bodyParams.limit === "number"
        ? bodyParams.limit
        : 50;

    const parsed = GlobalBrandSearchQuerySchema.parse({
      q: rawQ || undefined,
      tone: rawTone && rawTone !== "ALL" ? rawTone : undefined,
      limit: Number.isFinite(rawLimit) ? rawLimit : 50,
    });

    const [brands, config] = await Promise.all([
      searchGlobalBrands({
        query: parsed.q,
        tone: parsed.tone,
        limit: parsed.limit,
      }),
      getSystemConfig(),
    ]);

    const brandCloneFee = isChargingEnabled(config)
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

export async function GET(req: Request) {
  return handleGlobalBrands(req);
}

export async function POST(req: Request) {
  return handleGlobalBrands(req);
}
