import { NextResponse } from "next/server";
import { verifyRequest } from "@/lib/firebase-admin";
import { errorResponse, optionalIdempotencyKey, readJson } from "@/lib/api";
import { createBrand, deleteBrand, setActiveBrand, updateBrand } from "@/lib/brands";
import {
  ActiveBrandRequestSchema,
  BrandDeleteRequestSchema,
  BrandProfileInputSchema,
  BrandProfileSchema,
} from "@/lib/contracts";

// Reads go through the client's owner-scoped Firestore listener; this route only mutates.
// Handles BrandProfileInputSchema with landingPageUrls and destinationUrl.

/** Create a brand. Body: Brand Profile without `brandId`. */
export async function POST(req: Request) {
  try {
    const caller = await verifyRequest(req);
    const key = optionalIdempotencyKey(req);
    const input = BrandProfileInputSchema.parse(await readJson(req));
    const { brand, replayed } = await createBrand(caller, input, key);
    return NextResponse.json({ brand }, { status: replayed ? 200 : 201 });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Replace a brand. Body: full Brand Profile. */
export async function PUT(req: Request) {
  try {
    const caller = await verifyRequest(req);
    const brand = await updateBrand(caller.uid, BrandProfileSchema.parse(await readJson(req)));
    return NextResponse.json({ brand });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Delete a brand. Body: `{ brandId }`. */
export async function DELETE(req: Request) {
  try {
    const caller = await verifyRequest(req);
    const { brandId } = BrandDeleteRequestSchema.parse(await readJson(req));
    await deleteBrand(caller.uid, brandId);
    return NextResponse.json({ deleted: brandId });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Select the active brand. Body: `{ activeBrandId }` (`""` clears it). */
export async function PATCH(req: Request) {
  try {
    const caller = await verifyRequest(req);
    const { activeBrandId } = ActiveBrandRequestSchema.parse(await readJson(req));
    await setActiveBrand(caller, activeBrandId);
    return NextResponse.json({ activeBrandId });
  } catch (err) {
    return errorResponse(err);
  }
}
