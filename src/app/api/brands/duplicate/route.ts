import { NextResponse } from "next/server";
import { verifyRequest } from "@/lib/firebase-admin";
import { errorResponse, readJson } from "@/lib/api";
import { duplicateBrand } from "@/lib/brands";
import { BrandDuplicateRequestSchema } from "@/lib/contracts";

export async function POST(req: Request) {
  try {
    const caller = await verifyRequest(req);
    const { brandId, versionName } = BrandDuplicateRequestSchema.parse(await readJson(req));
    const brand = await duplicateBrand(caller, brandId, versionName);
    return NextResponse.json({ brand }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
