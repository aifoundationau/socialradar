import { NextResponse } from "next/server";
import { verifyRequest } from "@/lib/firebase-admin";
import { errorResponse } from "@/lib/api";
import { searchGlobalBrands } from "@/lib/brands";
import { GlobalBrandSearchQuerySchema } from "@/lib/contracts";

export async function GET(req: Request) {
  try {
    await verifyRequest(req);
    const { searchParams } = new URL(req.url);
    const parsed = GlobalBrandSearchQuerySchema.parse({
      q: searchParams.get("q") ?? undefined,
      tone: searchParams.get("tone") ?? undefined,
      limit: searchParams.get("limit") ? parseInt(searchParams.get("limit")!, 10) : 50,
    });
    const brands = await searchGlobalBrands({
      query: parsed.q,
      tone: parsed.tone,
      limit: parsed.limit,
    });
    return NextResponse.json({ brands });
  } catch (err) {
    return errorResponse(err);
  }
}
