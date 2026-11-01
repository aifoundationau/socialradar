import { NextResponse } from "next/server";
import { verifyRequest } from "@/lib/firebase-admin";
import { errorResponse } from "@/lib/api";
import { getFaqs } from "@/lib/faqs";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await verifyRequest(req);
    const faqs = await getFaqs(false);
    return NextResponse.json({ faqs });
  } catch (err) {
    return errorResponse(err);
  }
}

