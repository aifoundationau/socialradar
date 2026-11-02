import { NextResponse } from "next/server";
import { verifyRequest } from "@/lib/firebase-admin";
import { errorResponse, readJson } from "@/lib/api";
import {
  getSystemConfig,
  getUserCustomizeRequests,
  getUserMessages,
  submitCustomizeRequest,
} from "@/lib/admin";
import { CustomizeRequestInputSchema } from "@/lib/contracts";
import { withTokenGate } from "@/lib/token-ledger";

export async function GET(req: Request) {
  try {
    const caller = await verifyRequest(req);
    const [config, requests, messages] = await Promise.all([
      getSystemConfig(),
      getUserCustomizeRequests(caller.uid, 30),
      getUserMessages(caller.email, caller.uid, 50),
    ]);

    const costTokens = config.isTokenSystemEnabled
      ? Math.max(0, Math.round(config.serviceCosts?.customizeService ?? 45))
      : 0;

    return NextResponse.json({
      requests,
      messages,
      costTokens,
      audCentsPerToken: config.audCentsPerToken ?? 100,
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const body = await readJson(req);
    const input = CustomizeRequestInputSchema.parse(body);
    const config = await getSystemConfig();
    const costTokens = config.isTokenSystemEnabled
      ? Math.max(0, Math.round(config.serviceCosts?.customizeService ?? 45))
      : 0;

    return await withTokenGate(
      req,
      "CUSTOMIZE_SERVICE",
      `customize:${input.brandName.slice(0, 80)}`,
      async ({ caller, balanceAfter }) => {
        const result = await submitCustomizeRequest({
          uid: caller.uid,
          userEmail: caller.email,
          tokensCharged: costTokens,
          input,
        });

        const [requests, messages] = await Promise.all([
          getUserCustomizeRequests(caller.uid, 30),
          getUserMessages(caller.email, caller.uid, 50),
        ]);

        return NextResponse.json({
          success: true,
          request: result.request,
          adminMessage: result.adminMessage,
          customerConfirmationMessage: result.customerConfirmationMessage,
          requests,
          messages,
          balanceAfter,
        });
      },
      costTokens
    );
  } catch (err) {
    return errorResponse(err);
  }
}

