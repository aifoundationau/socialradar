import { NextResponse } from "next/server";
import { db, isDatabaseAdmin, verifyRequest } from "@/lib/firebase-admin";
import { ApiError, errorResponse, readJson } from "@/lib/api";
import {
  deleteAdAgent,
  formatAgentLocationLabel,
  getAdAgentDistributionLedger,
  getAdAgents,
  registerOrUpdateAdAgent,
  resetAdAgentRedistributionToZero,
  superAdminUpsertAdAgent,
  toggleAdAgentStatus,
  updateAdAgentBankDetails,
  updateAdAgentRedistributionPercent,
} from "@/lib/ad-agents";
import { getSystemConfig, sendSuperadminMessage } from "@/lib/admin";
import {
  RegisterAdAgentRequestSchema,
  SuperAdminAddAdAgentRequestSchema,
  SuperAdminUpdateAdAgentBankDetailsRequestSchema,
  SuperAdminUpdateAdAgentPercentRequestSchema,
  type CustomizeRequestDoc,
} from "@/lib/contracts";

export async function GET(req: Request) {
  try {
    const caller = await verifyRequest(req);
    const config = await getSystemConfig();
    const [agents, adAgentLedger, customizeSnap] = await Promise.all([
      getAdAgents(),
      getAdAgentDistributionLedger(config.audCentsPerToken || 100),
      db.collection("customize_requests").get(),
    ]);

    const cleanEmail = caller.email.toLowerCase().trim();
    const isSuper = isDatabaseAdmin(caller.token, cleanEmail) || caller.claims.role === "superadmin";
    const isMainAdmin = caller.claims.role === "admin";

    const myAgentProfile =
      agents.find(
        (a) =>
          a.email.toLowerCase() === cleanEmail ||
          (a.uid && a.uid === caller.uid) ||
          (isSuper && a.isSuperAdminBuiltIn),
      ) || null;

    const allRequests = customizeSnap.docs
      .map((d) => d.data() as CustomizeRequestDoc)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const assignedRequests =
      isSuper || isMainAdmin
        ? allRequests
        : allRequests.filter(
            (r) =>
              (r.assignedAgentEmail && r.assignedAgentEmail.toLowerCase() === cleanEmail) ||
              (r.assignedAgentUid && r.assignedAgentUid === caller.uid) ||
              (myAgentProfile && r.assignedAgentId === myAgentProfile.agentId),
          );

    const publicAgents = agents
      .filter((a) => a.status === "active")
      .map((a) => ({
        agentId: a.agentId,
        name: a.name,
        email: a.email,
        phone: a.phone,
        locationLabel: formatAgentLocationLabel(a.location),
        latitude: a.location.latitude,
        longitude: a.location.longitude,
        isSuperAdminBuiltIn: a.isSuperAdminBuiltIn || false,
      }));

    return NextResponse.json({
      myAgentProfile,
      assignedRequests,
      adAgentLedger,
      ledger: adAgentLedger,
      agents: publicAgents,
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const caller = await verifyRequest(req);
    const body = (await readJson(req)) as Record<string, unknown>;
    const action = String(body.action || "REGISTER_AD_AGENT");
    const cleanEmail = caller.email.toLowerCase().trim();
    const isSuper = isDatabaseAdmin(caller.token, cleanEmail) || caller.claims.role === "superadmin";
    const isMainAdmin = caller.claims.role === "admin";

    // 1. User / Main Admin / Super Admin Registration or Geolocation Update
    if (action === "REGISTER_AD_AGENT") {
      const parsed = RegisterAdAgentRequestSchema.parse({
        name: body.name,
        phone: body.phone,
        location: body.location,
        bankOrPayIdDetails: body.bankOrPayIdDetails ? String(body.bankOrPayIdDetails) : undefined,
      });

      const { agent, assignedRole } = await registerOrUpdateAdAgent({
        uid: caller.uid,
        email: cleanEmail,
        currentRole: caller.claims.role,
        name: parsed.name,
        phone: parsed.phone,
        location: parsed.location,
        bankOrPayIdDetails: parsed.bankOrPayIdDetails,
      });

      const config = await getSystemConfig();
      const adAgentLedger = await getAdAgentDistributionLedger(config.audCentsPerToken || 100);

      return NextResponse.json({
        success: true,
        agent,
        assignedRole,
        adAgentLedger,
        ledger: adAgentLedger,
      });
    }

    // 2. Ad Agent / Admin sending completed Customize Strategy back to customer
    if (action === "SEND_AGENT_CUSTOMIZE_REPLY") {
      const requestId = String(body.customizeRequestId || "").trim();
      const recipientEmail = String(body.recipientEmail || "").trim().toLowerCase();
      const subject = String(body.subject || "").trim();
      const replyBody = String(body.body || "").trim();

      if (!recipientEmail || !subject || !replyBody) {
        throw new ApiError("INVALID_INPUT", "Recipient email, subject, and reply body are required.", 400);
      }

      const agents = await getAdAgents();
      const myAgent = agents.find(
        (a) => a.email.toLowerCase() === cleanEmail || a.uid === caller.uid,
      );
      if (!isSuper && !isMainAdmin && !myAgent && caller.claims.role !== "ad_agent") {
        throw new ApiError("FORBIDDEN", "Only registered Ad Agents or Admins can send Customize replies.", 403);
      }

      const message = await sendSuperadminMessage({
        superadminUid: caller.uid,
        superadminEmail: cleanEmail,
        recipientEmail,
        subject,
        body: replyBody,
        requestType: "customize_reply",
        customizeRequestId: requestId || undefined,
      });

      return NextResponse.json({
        success: true,
        message,
      });
    }

    // 3. Super Admin Exclusive Actions for Ad Agent Distribution Ledger
    if (!isSuper) {
      throw new ApiError("FORBIDDEN", "Only Super Admin can manage the Ad Agent Distribution Ledger.", 403);
    }

    if (action === "SUPERADMIN_UPSERT_AGENT") {
      const parsed = SuperAdminAddAdAgentRequestSchema.parse({
        name: body.name,
        email: body.email,
        phone: body.phone ? String(body.phone) : undefined,
        bankOrPayIdDetails:
          body.bankOrPayIdDetails !== undefined ? String(body.bankOrPayIdDetails) : undefined,
        redistributionPercentage: Number(
          body.redistributionPercentage || body.redistributionPercent || 30,
        ),
        location: body.location || undefined,
      });
      const agent = await superAdminUpsertAdAgent(parsed);
      const config = await getSystemConfig();
      const adAgentLedger = await getAdAgentDistributionLedger(config.audCentsPerToken || 100);
      return NextResponse.json({
        success: true,
        agent,
        adAgentLedger,
        ledger: adAgentLedger,
      });
    }

    if (action === "SUPERADMIN_UPDATE_BANK_DETAILS") {
      const parsed = SuperAdminUpdateAdAgentBankDetailsRequestSchema.parse({
        agentId: body.agentId,
        bankOrPayIdDetails: String(body.bankOrPayIdDetails ?? ""),
      });
      await updateAdAgentBankDetails(parsed.agentId, parsed.bankOrPayIdDetails);
      const config = await getSystemConfig();
      const adAgentLedger = await getAdAgentDistributionLedger(config.audCentsPerToken || 100);
      return NextResponse.json({
        success: true,
        adAgentLedger,
        ledger: adAgentLedger,
      });
    }

    if (action === "SUPERADMIN_UPDATE_PERCENT") {
      const parsed = SuperAdminUpdateAdAgentPercentRequestSchema.parse({
        agentId: body.agentId,
        redistributionPercentage: Number(
          body.redistributionPercentage || body.redistributionPercent,
        ),
      });
      await updateAdAgentRedistributionPercent(parsed.agentId, parsed.redistributionPercentage);
      const config = await getSystemConfig();
      const adAgentLedger = await getAdAgentDistributionLedger(config.audCentsPerToken || 100);
      return NextResponse.json({
        success: true,
        adAgentLedger,
        ledger: adAgentLedger,
      });
    }

    if (action === "SUPERADMIN_TOGGLE_STATUS") {
      const agentId = String(body.agentId || "").trim();
      const status = body.status === "inactive" ? "inactive" : "active";
      if (!agentId) {
        throw new ApiError("INVALID_INPUT", "agentId is required.", 400);
      }
      await toggleAdAgentStatus(agentId, status);
      const config = await getSystemConfig();
      const adAgentLedger = await getAdAgentDistributionLedger(config.audCentsPerToken || 100);
      return NextResponse.json({
        success: true,
        adAgentLedger,
        ledger: adAgentLedger,
      });
    }

    if (action === "SUPERADMIN_RESET_AGENT_ZERO") {
      const agentId = String(body.agentId || "").trim();
      if (!agentId) {
        throw new ApiError("INVALID_INPUT", "agentId is required.", 400);
      }
      await resetAdAgentRedistributionToZero(agentId, cleanEmail);
      const config = await getSystemConfig();
      const adAgentLedger = await getAdAgentDistributionLedger(config.audCentsPerToken || 100);
      return NextResponse.json({
        success: true,
        adAgentLedger,
        ledger: adAgentLedger,
      });
    }

    if (action === "SUPERADMIN_DELETE_AGENT") {
      const agentId = String(body.agentId || "").trim();
      if (!agentId) {
        throw new ApiError("INVALID_INPUT", "agentId is required.", 400);
      }
      await deleteAdAgent(agentId);
      const config = await getSystemConfig();
      const adAgentLedger = await getAdAgentDistributionLedger(config.audCentsPerToken || 100);
      return NextResponse.json({
        success: true,
        adAgentLedger,
        ledger: adAgentLedger,
      });
    }

    throw new ApiError("INVALID_INPUT", `Unknown Ad Agent action: ${action}`, 400);
  } catch (err) {
    return errorResponse(err);
  }
}
