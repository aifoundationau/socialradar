import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { getFaqs } from "@/lib/faqs";

export async function GET() {
  try {
    const faqs = await getFaqs(false);
    return NextResponse.json({ faqs });
  } catch (err) {
    return errorResponse(err);
  }
}


