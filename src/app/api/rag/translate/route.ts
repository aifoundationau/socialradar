import { NextResponse } from "next/server";
import { errorResponse, readJson } from "@/lib/api";
import { GoogleTranslateRequestSchema } from "@/lib/contracts";
import { translateWithGoogleTranslator } from "@/lib/rag-engine";

export async function POST(req: Request) {
  try {
    const body = await readJson(req);
    const parsed = GoogleTranslateRequestSchema.parse(body);

    const translation = await translateWithGoogleTranslator({
      text: parsed.text,
      question: parsed.question,
      sourceLang: parsed.sourceLang,
      targetLang: parsed.targetLang,
    });

    return NextResponse.json({
      success: true,
      ...translation,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
