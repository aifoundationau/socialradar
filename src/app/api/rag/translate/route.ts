import { NextResponse } from "next/server";
import { ApiError, errorResponse, readJson } from "@/lib/api";
import { verifyRequest } from "@/lib/firebase-admin";
import { GoogleTranslateRequestSchema } from "@/lib/contracts";
import { resolveCallerRbacContext } from "@/lib/rbac";
import {
  batchTranslateFaqsWithGoogle,
  isSupportedRagLanguage,
  translateWithGoogleTranslator,
} from "@/lib/rag-engine";

/**
 * Two modes:
 * - `items` (FAQ modal, open to signed-out visitors): translates the site's own FAQs, looked up by
 *   faqId on the server. Any question/answer text sent by the client is ignored.
 * - `text` / `question` (RAG Studio): open to any authenticated registered user with
 *   `submit_rag_translations` permission; returns an auto-translation draft that must be human-edited
 *   before storing in the RAG corpus.
 */
export async function POST(req: Request) {
  try {
    const parsed = GoogleTranslateRequestSchema.parse(await readJson(req));
    if (!isSupportedRagLanguage(parsed.targetLang)) {
      throw new ApiError("INVALID_INPUT", `Unsupported language: ${parsed.targetLang}`, 400);
    }

    if (parsed.items && parsed.items.length > 0) {
      const batchResult = await batchTranslateFaqsWithGoogle({
        faqIds: parsed.items.map((item) => item.faqId),
        targetLang: parsed.targetLang,
      });
      return NextResponse.json({
        success: true,
        ...batchResult,
      });
    }

    const caller = await verifyRequest(req);
    const ctx = await resolveCallerRbacContext(caller);
    if (!ctx.canSubmitRagTranslations) {
      throw new ApiError(
        "FORBIDDEN",
        "Your role does not currently have the Create RAG Translations permission.",
        403,
      );
    }
    if (!parsed.text?.trim()) {
      throw new ApiError("INVALID_INPUT", "text is required", 400);
    }

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
