import { NextResponse } from "next/server";
import { db } from "@/lib/firebase-admin";
import { ApiError, errorResponse, readJson } from "@/lib/api";
import { getSystemConfig } from "@/lib/admin";
import { CustomizeAiAssistInputSchema, type CustomizeAiAssistResponse } from "@/lib/contracts";
import { withTokenGate } from "@/lib/token-ledger";
import { generateCustomizeBriefWithAi } from "@/lib/customize-brief-ai-assistant";

const DRAFTS_COL = "customize_ai_drafts";

export async function POST(req: Request) {
  try {
    const body = await readJson(req);
    const input = CustomizeAiAssistInputSchema.parse(body);
    const config = await getSystemConfig();
    const aiFeeTokens = Math.max(0, Math.round(config.serviceCosts?.customizeAiAssistant ?? 1));

    return await withTokenGate(
      req,
      "CUSTOMIZE_AI_ASSISTANT",
      `customize_ai:${input.brandNameHint.slice(0, 80)}`,
      async ({ caller, txId, replayed, balanceAfter, cost }) => {
        const draftRef = db.collection(DRAFTS_COL).doc(txId);
        if (replayed) {
          const existing = await draftRef.get();
          const savedBrief = existing.exists
            ? (existing.data()?.brief as CustomizeAiAssistResponse | undefined)
            : undefined;
          if (savedBrief) {
            return NextResponse.json({
              success: true,
              brief: savedBrief,
              replayed: true,
              tokensCharged: cost,
              balanceAfter,
            });
          }
          throw new ApiError(
            "INVALID_INPUT",
            "This AI Assistant request is already being processed. Please try again in a moment.",
            409,
          );
        }

        const brief = await generateCustomizeBriefWithAi(input);
        await draftRef.set({
          txId,
          uid: caller.uid,
          brief,
          createdAt: new Date().toISOString(),
        });

        return NextResponse.json({
          success: true,
          brief,
          replayed: false,
          tokensCharged: cost,
          balanceAfter,
        });
      },
      aiFeeTokens,
    );
  } catch (err) {
    return errorResponse(err);
  }
}
