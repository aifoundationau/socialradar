import { NextResponse, connection } from "next/server";
import { errorResponse } from "@/lib/api";
import { getFaqs } from "@/lib/faqs";

export async function GET() {
  // Request-time only: without this, `next build` prerenders the route and reads (and can seed) the live
  // FAQ document from the build machine. Kept outside the try: during prerendering connection() rejects
  // on purpose to stop the render, and that must not be turned into an error response.
  await connection();
  try {
    const faqs = await getFaqs(false);
    return NextResponse.json({ faqs });
  } catch (err) {
    return errorResponse(err);
  }
}
