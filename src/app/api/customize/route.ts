import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { db, verifyRequest } from "@/lib/firebase-admin";
import { ApiError, errorResponse, readJson } from "@/lib/api";
import {
  getCustomizeRequestById,
  getSystemConfig,
  getUserCustomizeRequests,
  getUserMessages,
  submitCustomizeRequest,
} from "@/lib/admin";
import { formatAgentLocationLabel, getAdAgents } from "@/lib/ad-agents";
import { CustomizeRequestInputSchema, type UserDoc } from "@/lib/contracts";
import { withTokenGate } from "@/lib/token-ledger";
import { isChargingEnabled } from "@/lib/pricing";

export async function GET(req: Request) {
  try {
    const caller = await verifyRequest(req);
    const [config, requests, messages, agents, userSnap] = await Promise.all([
      getSystemConfig(),
      getUserCustomizeRequests(caller.uid, 30),
      getUserMessages(caller.email, caller.uid, 50),
      getAdAgents(),
      db.collection("users").doc(caller.uid).get().catch(() => null),
    ]);

    const userData = userSnap?.exists ? (userSnap.data() as Partial<UserDoc>) : null;
    const costTokens = isChargingEnabled(config, Date.now(), userData, caller.claims.isSuperAdmin)
      ? Math.max(0, Math.round(config.serviceCosts?.customizeService ?? 55))
      : 0;

    const activeAgents = agents
      .filter((a) => a.status === "active")
      .map((a) => ({
        agentId: a.agentId,
        name: a.name,
        phone: a.phone,
        locationLabel: formatAgentLocationLabel(a.location),
        latitude: a.location.latitude,
        longitude: a.location.longitude,
        isSuperAdminBuiltIn: a.isSuperAdminBuiltIn || false,
      }));

    return NextResponse.json({
      requests,
      messages,
      costTokens,
      audCentsPerToken: config.audCentsPerToken ?? 100,
      agents: activeAgents,
    });
  } catch (err) {
    return errorResponse(err);
  }
}

/** One Customize request per paid transaction: a replayed idempotency key maps to the same id. */
const customizeRequestIdFor = (txId: string) =>
  `cust_${createHash("sha256").update(txId).digest("hex").slice(0, 24)}`;

export async function POST(req: Request) {
  try {
    const body = await readJson(req);
    const input = CustomizeRequestInputSchema.parse(body);
    const config = await getSystemConfig();
    const costTokens = isChargingEnabled(config)
      ? Math.max(0, Math.round(config.serviceCosts?.customizeService ?? 55))
      : 0;

    return await withTokenGate(
      req,
      "CUSTOMIZE_SERVICE",
      `customize:${input.brandName.slice(0, 80)}`,
      async ({ caller, txId, replayed, balanceAfter, cost }) => {
        const requestId = customizeRequestIdFor(txId);
        const existing = await getCustomizeRequestById(requestId);

        if (existing) {
          // Same idempotency key again: return the original request, never create (and route) another.
          const [requests, messages] = await Promise.all([
            getUserCustomizeRequests(caller.uid, 30),
            getUserMessages(caller.email, caller.uid, 50),
          ]);
          return NextResponse.json({ success: true, request: existing, replayed: true, requests, messages, balanceAfter });
        }
        if (replayed) {
          throw new ApiError("INVALID_INPUT", "This request is already being processed. Refresh in a moment to see it.", 409);
        }

        const result = await submitCustomizeRequest({
          uid: caller.uid,
          userEmail: caller.email,
          // What the token gate actually charged (0 during a free-access window), not the list price.
          tokensCharged: cost,
          input,
          requestId,
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

