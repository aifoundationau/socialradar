import { NextResponse } from "next/server";
import { isDatabaseAdmin, verifyRequest } from "@/lib/firebase-admin";
import { ApiError, errorResponse, readJson } from "@/lib/api";
import { getCustomizeRequestById } from "@/lib/admin";
import { getAdAgents } from "@/lib/ad-agents";
import { AiCustomizeReplyDraftRequestSchema } from "@/lib/contracts";
import { generateCustomizeStaffReply } from "@/lib/customize-ai";

export async function POST(req: Request) {
  try {
    const caller = await verifyRequest(req);
    const cleanEmail = caller.email.toLowerCase().trim();
    const isAdminOrAgent =
      isDatabaseAdmin(caller.token, cleanEmail) ||
      caller.claims.role === "superadmin" ||
      caller.claims.role === "admin" ||
      caller.claims.role === "ad_agent";

    if (!isAdminOrAgent) {
      const agents = await getAdAgents();
      const isRegisteredAgent = agents.some(
        (a) => a.email.toLowerCase() === cleanEmail || a.uid === caller.uid,
      );
      if (!isRegisteredAgent) {
        throw new ApiError("FORBIDDEN", "Only Ad Agents or Admins can generate AI Customize strategy replies.", 403);
      }
    }
    const body = await readJson(req);
    const parsed = AiCustomizeReplyDraftRequestSchema.parse(body);

    const customizeDoc = parsed.customizeRequestId
      ? await getCustomizeRequestById(parsed.customizeRequestId)
      : null;

    const draft = await generateCustomizeStaffReply({
      customerEmail: parsed.customerEmail,
      subject: parsed.subject,
      customerBriefText: parsed.customerBriefText,
      staffNotes: parsed.staffNotes,
      customizeDoc,
    });

    return NextResponse.json({
      success: true,
      draft,
    });
  } catch (err) {
    return errorResponse(err);
  }
}

