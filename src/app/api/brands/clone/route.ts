import { NextResponse } from "next/server";
import { verifyRequest } from "@/lib/firebase-admin";
import { errorResponse, readJson } from "@/lib/api";
import { cloneGlobalBrand } from "@/lib/brands";
import { BrandCloneRequestSchema } from "@/lib/contracts";

export async function POST(req: Request) {
  try {
    const caller = await verifyRequest(req);
    const { globalBrandId } = BrandCloneRequestSchema.parse(await readJson(req));
    const brand = await cloneGlobalBrand(caller, globalBrandId);
    return NextResponse.json({ brand }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
