import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { db, verifyRequest } from "@/lib/firebase-admin";
import { ApiError, errorResponse, readJson } from "@/lib/api";
import {
  AdAgentContractorSchema,
  ContractorPatchSchema,
  CreateContractorRequestSchema,
  type AdAgentContractor,
} from "@/lib/contracts";

const CONTRACTORS_COL = "ad_agent_contractors";

async function fetchContractorsForCaller(callerUid: string, callerEmail: string, isSuper: boolean): Promise<AdAgentContractor[]> {
  const snap = await db.collection(CONTRACTORS_COL).get();
  const all = snap.docs.map((d) => d.data() as AdAgentContractor);

  // If superadmin, return all or caller's; for standard ad agents, return those matching agentUid or agentEmail
  if (isSuper) {
    return all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  const cleanEmail = callerEmail.toLowerCase().trim();
  return all
    .filter(
      (c) =>
        c.agentUid === callerUid ||
        (c.agentEmail && c.agentEmail.toLowerCase().trim() === cleanEmail)
    )
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function GET(req: Request) {
  try {
    const caller = await verifyRequest(req);
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
    const body = (await readJson(req)) as Record<string, unknown>;
    const action = String(body.action || "CREATE_CONTRACTOR");
    const isSuper = caller.claims.role === "superadmin" || caller.claims.isSuperAdmin === true;

    if (action === "CREATE_CONTRACTOR") {
      const parsed = CreateContractorRequestSchema.parse(body.contractor || body);
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

