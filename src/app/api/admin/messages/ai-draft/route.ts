import { NextResponse } from "next/server";
import { verifyRequest } from "@/lib/firebase-admin";
import { ApiError, errorResponse, readJson } from "@/lib/api";
import { getCustomizeRequestById } from "@/lib/admin";
import { getAdAgents } from "@/lib/ad-agents";
import { AiCustomizeReplyDraftRequestSchema } from "@/lib/contracts";
import { generateCustomizeStaffReply } from "@/lib/customize-ai";
import { requirePermission } from "@/lib/rbac";

/**
 * Drafts a Customize strategy reply with Gemini.
 * - Super Admin, and Main Admins with "Manage Messages": any request (or a free-form brief).
 * - Ad Agents: only a Customize request assigned to them; its stored brief is what gets drafted from.
 */
export async function POST(req: Request) {
  try {
    const caller = await verifyRequest(req);
    const email = caller.email.toLowerCase().trim();
    const isSuper = caller.claims.isSuperAdmin === true;
    const isMainAdmin = caller.claims.role === "admin";
    const parsed = AiCustomizeReplyDraftRequestSchema.parse(await readJson(req));

    const customizeDoc = parsed.customizeRequestId
      ? await getCustomizeRequestById(parsed.customizeRequestId)
      : null;
    if (parsed.customizeRequestId && !customizeDoc) {
      throw new ApiError("NOT_FOUND", "That Customize request no longer exists.", 404);
    }

    if (isMainAdmin && !isSuper) {
      await requirePermission(caller, "manage_messages");
    } else if (!isSuper) {
      const roles = new Set<string>([caller.claims.role, ...(caller.claims.roles ?? [])]);
      const ownProfile = (await getAdAgents()).find(
        (a) => a.email.toLowerCase() === email || (!!a.uid && a.uid === caller.uid),
      );
      if (!ownProfile && !roles.has("ad_agent")) {
        throw new ApiError("FORBIDDEN", "Only Ad Agents or Admins can generate AI Customize strategy replies.", 403);
      }
      if (!customizeDoc) {
        throw new ApiError("INVALID_INPUT", "customizeRequestId is required.", 400);
      }
      const assignedToCaller =
        customizeDoc.assignedAgentEmail?.toLowerCase().trim() === email ||
        customizeDoc.assignedAgentUid === caller.uid ||
        (!!ownProfile && customizeDoc.assignedAgentId === ownProfile.agentId);
      if (!assignedToCaller) {
        throw new ApiError("FORBIDDEN", "This Customize request is assigned to a different Ad Agent.", 403);
      }
    }

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
