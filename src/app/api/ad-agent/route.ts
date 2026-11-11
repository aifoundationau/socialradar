import { NextResponse } from "next/server";
import { db, verifyRequest, type VerifiedCaller } from "@/lib/firebase-admin";
import { ApiError, errorResponse, readJson } from "@/lib/api";
import {
  DEFAULT_SUPERADMIN_LOCATION,
  activateAdAgentInLedger,
  deleteAdAgent,
  formatAgentLocationLabel,
  getAdAgentDistributionLedger,
  getAdAgents,
  getAssignedCustomizeRequests,
  registerOrUpdateAdAgent,
  resetAdAgentRedistributionToZero,
  superAdminUpsertAdAgent,
  toggleAdAgentStatus,
  updateAdAgentBankDetails,
  updateAdAgentRedistributionPercent,
} from "@/lib/ad-agents";
import { getCustomizeRequestById, getSystemConfig, sendSuperadminMessage } from "@/lib/admin";
import {
  RegisterAdAgentRequestSchema,
  SuperAdminActivateAdAgentRequestSchema,
  SuperAdminAddAdAgentRequestSchema,
  SuperAdminRemoveAdAgentFromActiveRequestSchema,
  SuperAdminUpdateAdAgentBankDetailsRequestSchema,
  SuperAdminUpdateAdAgentPercentRequestSchema,
  ToggleOwnAdAgentStatusRequestSchema,
  type AdAgentDistributionItem,
  type AdAgentDistributionPricingMeta,
  type AdAgentProfile,
  type CustomizeRequestDoc,
} from "@/lib/contracts";

interface Viewer {
  uid: string;
  email: string;
  isSuper: boolean;
  isMainAdmin: boolean;
}

function viewerOf(caller: VerifiedCaller): Viewer {
  return {
    uid: caller.uid,
    email: caller.email.toLowerCase().trim(),
    // verifyRequest only sets isSuperAdmin for the database admin account.
    isSuper: caller.claims.isSuperAdmin === true,
    isMainAdmin: caller.claims.role === "admin",
  };
}

/** Bank / PayID details stay with Super Admin; an Ad Agent only sees their own ledger row. */
function visibleLedger(ledger: AdAgentDistributionItem[], viewer: Viewer): AdAgentDistributionItem[] {
  if (viewer.isSuper) return ledger;
  if (viewer.isMainAdmin) return ledger.map((row) => ({ ...row, bankOrPayIdDetails: "" }));
  return ledger.filter(
    (row) => row.email.toLowerCase() === viewer.email || (!!row.uid && row.uid === viewer.uid),
  );
}

function buildPricingMeta(config: Awaited<ReturnType<typeof getSystemConfig>>): AdAgentDistributionPricingMeta {
  return {
    audCentsPerToken: Math.max(1, Math.round(Number(config.audCentsPerToken || 100))),
    customizeServiceTokens: Math.max(0, Math.round(Number(config.serviceCosts?.customizeService ?? 55))),
    isTokenSystemEnabled: config.isTokenSystemEnabled !== false,
    isAudEnabled: config.isAudEnabled !== false,
    isUsdEnabled: config.isUsdEnabled !== false,
  };
}

async function ledgerFor(viewer: Viewer) {
  const config = await getSystemConfig();
  const pricingMeta = buildPricingMeta(config);
  const ledger = visibleLedger(
    await getAdAgentDistributionLedger(
      pricingMeta.audCentsPerToken,
      pricingMeta.customizeServiceTokens,
    ),
    viewer,
  );
  return { adAgentLedger: ledger, ledger, pricingMeta };
}

/** Every agent's full profile (bank details included) is returned to Super Admin only. */
async function profilesFor(viewer: Viewer, agents?: AdAgentProfile[]) {
  return viewer.isSuper ? { allAgentProfiles: agents ?? (await getAdAgents()) } : {};
}

function findOwnProfile(agents: AdAgentProfile[], viewer: Viewer): AdAgentProfile | undefined {
  return (
    agents.find(
      (a) => a.email.toLowerCase() === viewer.email || (!!a.uid && a.uid === viewer.uid),
    ) || (viewer.isSuper ? agents.find((a) => a.isSuperAdminBuiltIn) : undefined)
  );
}

function isAssignedTo(r: CustomizeRequestDoc, viewer: Viewer, ownAgentId?: string): boolean {
  return (
    (!!r.assignedAgentEmail && r.assignedAgentEmail.toLowerCase() === viewer.email) ||
    (!!r.assignedAgentUid && r.assignedAgentUid === viewer.uid) ||
    (!!ownAgentId && r.assignedAgentId === ownAgentId)
  );
}

/**
 * True when Super Admin has approved this account as an Ad Agent. Checks the token claims, then the
 * server-written users doc (clients can't write it), which is current even while the token is stale.
 */
async function isApprovedAdAgent(caller: VerifiedCaller): Promise<boolean> {
  const claimRoles = new Set<string>([caller.claims.role, ...(caller.claims.roles ?? [])]);
  if (claimRoles.has("ad_agent")) return true;
  const snap = await db.collection("users").doc(caller.uid).get();
  const roles = snap.get("roles");
  return (
    snap.get("role") === "ad_agent" ||
    (Array.isArray(roles) && roles.includes("ad_agent")) ||
    snap.get("isAdAgent") === true
  );
}

export async function GET(req: Request) {
  try {
    const caller = await verifyRequest(req);
    const viewer = viewerOf(caller);
    // Only Super Admin may look up somebody else's Ad Agent profile.
    const requestedEmail = (new URL(req.url).searchParams.get("email") || "").toLowerCase().trim();
    const lookupEmail = viewer.isSuper && requestedEmail ? requestedEmail : "";

    const isAdmin = viewer.isSuper || viewer.isMainAdmin;
    const [config, agents] = await Promise.all([getSystemConfig(), getAdAgents()]);
    const pricingMeta = buildPricingMeta(config);

    let ownProfile = findOwnProfile(agents, viewer);
    if (!ownProfile && !isAdmin && viewer.email && (await isApprovedAdAgent(caller))) {
      const now = new Date().toISOString();
      const cleanUid = caller.uid.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 16) || "agent";
      ownProfile = {
        agentId: `agent_rbac_${cleanUid}`,
        uid: caller.uid,
        name: viewer.email.split("@")[0] || "Ad Agent",
        phone: "Not specified",
        email: viewer.email,
        location: DEFAULT_SUPERADMIN_LOCATION,
        bankOrPayIdDetails: "",
        redistributionPercentage: 30,
        status: "inactive",
        inActiveLedger: false,
        isSuperAdminBuiltIn: false,
        createdAt: now,
        updatedAt: now,
      };
    }

    const myAgentProfile = lookupEmail
      ? agents.find((a) => a.email.toLowerCase() === lookupEmail) || null
      : ownProfile || null;

    // Admins see every request and the whole ledger (one read of each collection). An Ad Agent only
    // needs their own requests and ledger row, fetched with indexed queries.
    const assignedRequests = isAdmin
      ? (await db.collection("customize_requests").get()).docs.map((d) => d.data() as CustomizeRequestDoc)
      : await getAssignedCustomizeRequests({ email: viewer.email, uid: viewer.uid, agentId: ownProfile?.agentId });
    assignedRequests.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const ledgerAgents = isAdmin ? agents : ownProfile ? [ownProfile] : [];
    const fullLedger = ledgerAgents.length
      ? await getAdAgentDistributionLedger(
          pricingMeta.audCentsPerToken,
          pricingMeta.customizeServiceTokens,
          { agents: ledgerAgents, requests: assignedRequests, partial: !isAdmin },
        )
      : [];

    const publicAgents = agents
      .filter((a) => a.status === "active" && a.inActiveLedger !== false)
      .map((a) => ({
        agentId: a.agentId,
        name: a.name,
        ...(viewer.isSuper || viewer.isMainAdmin ? { email: a.email } : {}),
        phone: a.phone,
        locationLabel: formatAgentLocationLabel(a.location),
        latitude: a.location.latitude,
        longitude: a.location.longitude,
        isSuperAdminBuiltIn: a.isSuperAdminBuiltIn || false,
      }));

    const ledger = visibleLedger(fullLedger, viewer);
    return NextResponse.json({
      myAgentProfile,
      ...(await profilesFor(viewer, agents)),
      assignedRequests,
      adAgentLedger: ledger,
      ledger,
      pricingMeta,
      agents: publicAgents,
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const caller = await verifyRequest(req);
    const viewer = viewerOf(caller);
    const body = (await readJson(req)) as Record<string, unknown>;
    const action = String(body.action || "REGISTER_AD_AGENT");

    // 1. Ad Agent / Main Admin / Super Admin registration or profile update
    if (action === "REGISTER_AD_AGENT") {
      const parsed = RegisterAdAgentRequestSchema.parse({
        email: body.email ? String(body.email).trim().toLowerCase() : undefined,
        name: body.name,
        phone: body.phone,
        location: body.location,
        bankOrPayIdDetails:
          body.bankOrPayIdDetails !== undefined ? String(body.bankOrPayIdDetails) : undefined,
        status: body.status === "inactive" || body.status === "active" ? body.status : undefined,
      });

      const targetEmail = (parsed.email || viewer.email).trim().toLowerCase();
      if (targetEmail !== viewer.email && !viewer.isSuper) {
        throw new ApiError("FORBIDDEN", "You can only register or update your own Ad Agent profile.", 403);
      }
      if (!viewer.isSuper && !viewer.isMainAdmin && !(await isApprovedAdAgent(caller))) {
        throw new ApiError(
          "FORBIDDEN",
          "Your account needs to be approved as an Ad Agent by Super Admin before you can register.",
          403,
        );
      }

      const { agent, assignedRole, isNewRegistration } = await registerOrUpdateAdAgent({
        uid: caller.uid,
        callerEmail: viewer.email,
        email: targetEmail,
        currentRole: caller.claims.role,
        name: parsed.name,
        phone: parsed.phone,
        location: parsed.location,
        bankOrPayIdDetails: parsed.bankOrPayIdDetails,
        status: parsed.status,
      });

      return NextResponse.json({
        success: true,
        agent,
        assignedRole,
        isNewRegistration,
        ...(await profilesFor(viewer)),
        ...(await ledgerFor(viewer)),
      });
    }

    // 1b. Ad Agent toggling their own availability (ON = "active", OFF = "inactive")
    if (action === "AGENT_TOGGLE_OWN_STATUS") {
      const parsed = ToggleOwnAdAgentStatusRequestSchema.parse({
        email: body.email ? String(body.email).trim().toLowerCase() : undefined,
        status: body.status,
      });
      const targetEmail = (parsed.email || viewer.email).trim().toLowerCase();
      if (targetEmail !== viewer.email && !viewer.isSuper) {
        throw new ApiError("FORBIDDEN", "You can only change your own Ad Agent status.", 403);
      }
      const agents = await getAdAgents();
      const myAgent = agents.find((a) => a.email.toLowerCase() === targetEmail);
      if (!myAgent) {
        throw new ApiError(
          "NOT_FOUND",
          "Please save your Ad Agent profile first before toggling your Ad Agent status.",
          404,
        );
      }
      if (!viewer.isSuper && myAgent.inActiveLedger === false && parsed.status === "active") {
        throw new ApiError(
          "FORBIDDEN",
          "Your Ad Agent record is saved on file. Super Admin will activate your profile in the Ad Agent panel when required.",
          403,
        );
      }

      await toggleAdAgentStatus(myAgent.agentId, parsed.status);
      const updatedAgent = {
        ...myAgent,
        status: parsed.status,
        updatedAt: new Date().toISOString(),
      };

      return NextResponse.json({
        success: true,
        agent: updatedAgent,
        ...(await profilesFor(viewer)),
        ...(await ledgerFor(viewer)),
      });
    }

    // 2. Ad Agent / Admin sending the completed Customize strategy back to the customer
    if (action === "SEND_AGENT_CUSTOMIZE_REPLY") {
      const requestId = String(body.customizeRequestId || "").trim();
      const recipientEmail = String(body.recipientEmail || "").trim().toLowerCase();
      const subject = String(body.subject || "").trim();
      const replyBody = String(body.body || "").trim();

      if (!recipientEmail || !subject || !replyBody) {
        throw new ApiError("INVALID_INPUT", "Recipient email, subject, and reply body are required.", 400);
      }

      const requestDoc = requestId ? await getCustomizeRequestById(requestId) : null;
      if (requestId && !requestDoc) {
        throw new ApiError("NOT_FOUND", "That Customize request no longer exists.", 404);
      }

      if (!viewer.isSuper && !viewer.isMainAdmin) {
        if (!(await isApprovedAdAgent(caller))) {
          throw new ApiError("FORBIDDEN", "Only registered Ad Agents or Admins can send Customize replies.", 403);
        }
        if (!requestDoc) {
          throw new ApiError("INVALID_INPUT", "customizeRequestId is required.", 400);
        }
        const ownProfile = findOwnProfile(await getAdAgents(), viewer);
        if (!isAssignedTo(requestDoc, viewer, ownProfile?.agentId)) {
          throw new ApiError("FORBIDDEN", "This Customize request is assigned to a different Ad Agent.", 403);
        }
        if (recipientEmail !== requestDoc.userEmail.toLowerCase().trim()) {
          throw new ApiError(
            "FORBIDDEN",
            "Customize replies can only be sent to the customer who placed the request.",
            403,
          );
        }
      }

      const message = await sendSuperadminMessage({
        superadminUid: caller.uid,
        superadminEmail: viewer.email,
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

    // 3. Super Admin exclusive actions for the Ad Agent Distribution Ledger
    if (!viewer.isSuper) {
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
      return NextResponse.json({
        success: true,
        agent,
        ...(await profilesFor(viewer)),
        ...(await ledgerFor(viewer)),
      });
    }

    if (action === "SUPERADMIN_ACTIVATE_AGENT") {
      const parsed = SuperAdminActivateAdAgentRequestSchema.parse({
        agentId: String(body.agentId || "").trim(),
        email: body.email ? String(body.email).trim().toLowerCase() : undefined,
        name: body.name ? String(body.name).trim() : undefined,
      });
      const agent = await activateAdAgentInLedger(parsed);
      return NextResponse.json({
        success: true,
        agent,
        ...(await profilesFor(viewer)),
        ...(await ledgerFor(viewer)),
      });
    }

    if (action === "SUPERADMIN_UPDATE_BANK_DETAILS") {
      const parsed = SuperAdminUpdateAdAgentBankDetailsRequestSchema.parse({
        agentId: body.agentId,
        bankOrPayIdDetails: String(body.bankOrPayIdDetails ?? ""),
      });
      await updateAdAgentBankDetails(parsed.agentId, parsed.bankOrPayIdDetails);
      return NextResponse.json({
        success: true,
        ...(await profilesFor(viewer)),
        ...(await ledgerFor(viewer)),
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
      return NextResponse.json({
        success: true,
        ...(await profilesFor(viewer)),
        ...(await ledgerFor(viewer)),
      });
    }

    if (action === "SUPERADMIN_TOGGLE_STATUS") {
      const agentId = String(body.agentId || "").trim();
      const status = body.status === "inactive" ? "inactive" : "active";
      if (!agentId) {
        throw new ApiError("INVALID_INPUT", "agentId is required.", 400);
      }
      await toggleAdAgentStatus(agentId, status);
      return NextResponse.json({
        success: true,
        ...(await profilesFor(viewer)),
        ...(await ledgerFor(viewer)),
      });
    }

    if (action === "SUPERADMIN_RESET_AGENT_ZERO") {
      const agentId = String(body.agentId || "").trim();
      if (!agentId) {
        throw new ApiError("INVALID_INPUT", "agentId is required.", 400);
      }
      await resetAdAgentRedistributionToZero(agentId, viewer.email);
      return NextResponse.json({
        success: true,
        ...(await profilesFor(viewer)),
        ...(await ledgerFor(viewer)),
      });
    }

    if (action === "SUPERADMIN_DELETE_AGENT") {
      const parsed = SuperAdminRemoveAdAgentFromActiveRequestSchema.parse({
        agentId: String(body.agentId || "").trim(),
        email: body.email ? String(body.email).trim().toLowerCase() : undefined,
      });
      await deleteAdAgent(parsed.agentId, parsed.email);
      return NextResponse.json({
        success: true,
        ...(await profilesFor(viewer)),
        ...(await ledgerFor(viewer)),
      });
    }

    throw new ApiError("INVALID_INPUT", `Unknown Ad Agent action: ${action}`, 400);
  } catch (err) {
    return errorResponse(err);
  }
}
