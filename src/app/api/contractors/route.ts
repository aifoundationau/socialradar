import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { db, verifyRequest, type VerifiedCaller } from "@/lib/firebase-admin";
import { ApiError, errorResponse, readJson } from "@/lib/api";
import {
  AdAgentContractorSchema,
  ContractorPatchSchema,
  CreateContractorRequestSchema,
  type AdAgentContractor,
} from "@/lib/contracts";

const CONTRACTORS_COL = "ad_agent_contractors";
const MAX_CONTRACTORS_PER_AGENT = 50;
const RATE_WINDOW_MS = 60_000;
const MAX_MUTATIONS_PER_WINDOW = 15;
const contractorRateBuckets = new Map<string, number[]>();

function checkContractorRateLimit(uid: string): void {
  const now = Date.now();
  const recent = (contractorRateBuckets.get(uid) ?? []).filter((ts) => now - ts < RATE_WINDOW_MS);
  if (recent.length >= MAX_MUTATIONS_PER_WINDOW) {
    contractorRateBuckets.set(uid, recent);
    throw new ApiError("RATE_LIMITED", "Too many contractor updates. Please wait a moment and try again.", 429);
  }
  recent.push(now);
  if (contractorRateBuckets.size > 2000) contractorRateBuckets.clear();
  contractorRateBuckets.set(uid, recent);
}

/**
 * Only Super Admin, Main Admins, or approved Ad Agents (by claims, users/{uid}, or ad_agents profile)
 * may read or mutate contractor records.
 */
async function requireAdAgentOrAdmin(caller: VerifiedCaller): Promise<void> {
  if (caller.claims.isSuperAdmin === true || caller.claims.role === "admin") return;
  const claimRoles = new Set<string>([caller.claims.role, ...(caller.claims.roles ?? [])]);
  if (claimRoles.has("ad_agent")) return;

  const cleanEmail = caller.email.toLowerCase().trim();
  const [userSnap, agentByUid, agentByEmail] = await Promise.all([
    db.collection("users").doc(caller.uid).get(),
    db.collection("ad_agents").where("uid", "==", caller.uid).limit(1).get(),
    cleanEmail ? db.collection("ad_agents").where("email", "==", cleanEmail).limit(1).get() : Promise.resolve(null),
  ]);
  const roles = userSnap.get("roles");
  const isAgentOnUserDoc =
    userSnap.get("role") === "ad_agent" ||
    (Array.isArray(roles) && roles.includes("ad_agent")) ||
    userSnap.get("isAdAgent") === true;
  if (isAgentOnUserDoc || !agentByUid.empty || (agentByEmail && !agentByEmail.empty)) {
    return;
  }

  throw new ApiError("FORBIDDEN", "Only approved Ad Agents or Admins can manage contractors.", 403);
}

async function fetchContractorsForCaller(callerUid: string, callerEmail: string, isSuper: boolean): Promise<AdAgentContractor[]> {
  if (isSuper) {
    const snap = await db.collection(CONTRACTORS_COL).get();
    const all = snap.docs.map((d) => d.data() as AdAgentContractor);
    return all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  const cleanEmail = callerEmail.toLowerCase().trim();
  const [byUid, byEmail] = await Promise.all([
    db.collection(CONTRACTORS_COL).where("agentUid", "==", callerUid).get(),
    cleanEmail ? db.collection(CONTRACTORS_COL).where("agentEmail", "==", cleanEmail).get() : Promise.resolve(null),
  ]);
  const deduped = new Map<string, AdAgentContractor>();
  for (const doc of byUid.docs) {
    const d = doc.data() as AdAgentContractor;
    deduped.set(d.contractorId || doc.id, d);
  }
  if (byEmail) {
    for (const doc of byEmail.docs) {
      const d = doc.data() as AdAgentContractor;
      deduped.set(d.contractorId || doc.id, d);
    }
  }
  return Array.from(deduped.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export async function GET(req: Request) {
  try {
    const caller = await verifyRequest(req);
    await requireAdAgentOrAdmin(caller);
    const isSuper = caller.claims.role === "superadmin" || caller.claims.isSuperAdmin === true;
    const url = new URL(req.url);
    const requestedEmail = url.searchParams.get("email")?.toLowerCase().trim();

    let contractors = await fetchContractorsForCaller(caller.uid, caller.email, isSuper);
    if (requestedEmail && isSuper) {
      contractors = contractors.filter(
        (c) => c.agentEmail && c.agentEmail.toLowerCase().trim() === requestedEmail
      );
    }

    return NextResponse.json({ success: true, contractors });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const caller = await verifyRequest(req);
    await requireAdAgentOrAdmin(caller);
    checkContractorRateLimit(caller.uid);
    const body = (await readJson(req)) as Record<string, unknown>;
    const action = String(body.action || "CREATE_CONTRACTOR");
    const isSuper = caller.claims.role === "superadmin" || caller.claims.isSuperAdmin === true;

    if (action === "CREATE_CONTRACTOR") {
      if (!isSuper) {
        const existingForAgent = await fetchContractorsForCaller(caller.uid, caller.email, false);
        if (existingForAgent.length >= MAX_CONTRACTORS_PER_AGENT) {
          throw new ApiError(
            "INVALID_INPUT",
            `You can save up to ${MAX_CONTRACTORS_PER_AGENT} contractors.`,
            409
          );
        }
      }
      const { action: _action, ...restBody } = body;
      void _action;
      const parsed = CreateContractorRequestSchema.parse(body.contractor || restBody);
      const contractorId = `contractor_${randomBytes(8).toString("hex")}`;
      const now = new Date().toISOString();

      const newContractor: AdAgentContractor = {
        contractorId,
        agentUid: caller.uid,
        agentEmail: caller.email.toLowerCase().trim(),
        name: parsed.name,
        location: parsed.location,
        email: parsed.email.toLowerCase().trim(),
        phone: parsed.phone,
        expertise: parsed.expertise,
        payIdPaymentDetails: parsed.payIdPaymentDetails || "",
        averageRates: parsed.averageRates || "",
        notes: parsed.notes || "",
        createdAt: now,
        updatedAt: now,
      };

      AdAgentContractorSchema.parse(newContractor);
      await db.collection(CONTRACTORS_COL).doc(contractorId).set(newContractor);

      const contractors = await fetchContractorsForCaller(caller.uid, caller.email, isSuper);
      return NextResponse.json({ success: true, contractor: newContractor, contractors });
    }

    if (action === "UPDATE_CONTRACTOR") {
      const contractorId = String(body.contractorId || "");
      if (!contractorId) throw new ApiError("INVALID_INPUT", "contractorId is required", 400);

      const docRef = db.collection(CONTRACTORS_COL).doc(contractorId);
      const snap = await docRef.get();
      if (!snap.exists) throw new ApiError("NOT_FOUND", "Contractor not found", 404);

      const existing = snap.data() as AdAgentContractor;
      if (!isSuper && existing.agentUid !== caller.uid && existing.agentEmail !== caller.email.toLowerCase().trim()) {
        throw new ApiError("FORBIDDEN", "You do not have permission to update this contractor", 403);
      }

      // No defaults: fields the client didn't send keep their stored values.
      const patch = ContractorPatchSchema.parse(body.patch || {});
      const now = new Date().toISOString();

      const updated: AdAgentContractor = {
        ...existing,
        ...patch,
        updatedAt: now,
      };

      AdAgentContractorSchema.parse(updated);
      await docRef.set(updated, { merge: true });

      const contractors = await fetchContractorsForCaller(caller.uid, caller.email, isSuper);
      return NextResponse.json({ success: true, contractor: updated, contractors });
    }

    if (action === "DELETE_CONTRACTOR") {
      const contractorId = String(body.contractorId || "");
      if (!contractorId) throw new ApiError("INVALID_INPUT", "contractorId is required", 400);

      const docRef = db.collection(CONTRACTORS_COL).doc(contractorId);
      const snap = await docRef.get();
      if (!snap.exists) throw new ApiError("NOT_FOUND", "Contractor not found", 404);

      const existing = snap.data() as AdAgentContractor;
      if (!isSuper && existing.agentUid !== caller.uid && existing.agentEmail !== caller.email.toLowerCase().trim()) {
        throw new ApiError("FORBIDDEN", "You do not have permission to delete this contractor", 403);
      }

      await docRef.delete();
      const contractors = await fetchContractorsForCaller(caller.uid, caller.email, isSuper);
      return NextResponse.json({ success: true, contractors });
    }

    throw new ApiError("INVALID_INPUT", `Unknown action: ${action}`, 400);
  } catch (err) {
    return errorResponse(err);
  }
}

