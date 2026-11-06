import "server-only";
import { randomBytes } from "node:crypto";
import { adminAuth, db, isDatabaseAdmin } from "./firebase-admin";
import {
  AD_AGENT_REDISTRIBUTION_PERCENTS,
  type AdAgentDistributionItem,
  type AdAgentLocation,
  type AdAgentProfile,
  type AdAgentRedistributionPercent,
  type CustomizeRequestDoc,
  type RbacRole,
} from "./contracts";

const AD_AGENTS_COL = "ad_agents";
const CUSTOMIZE_REQUESTS_COL = "customize_requests";

export const DEFAULT_SUPERADMIN_LOCATION: AdAgentLocation = {
  suburb: "Sydney",
  state: "NSW",
  country: "AU",
  latitude: -33.8688,
  longitude: 151.2093,
  label: "Sydney, NSW, AU",
};

/**
 * Great-circle Haversine distance in kilometers between two (latitude, longitude) coordinates.
 */
export function haversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371; // Earth mean radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

export function normalizeRedistributionPercent(raw: unknown): AdAgentRedistributionPercent {
  const n = Math.round(Number(raw) || 30);
  if ((AD_AGENT_REDISTRIBUTION_PERCENTS as readonly number[]).includes(n)) {
    return n as AdAgentRedistributionPercent;
  }
  return 30;
}

export function formatAgentLocationLabel(loc?: Partial<AdAgentLocation> | null): string {
  if (!loc) return "Sydney, NSW, AU";
  const parts = [loc.suburb, loc.state, loc.country].map((s) => (s || "").trim()).filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : loc.label || "Sydney, NSW, AU";
}

/**
 * Ensures the Super Admin is always present in `ad_agents` without requiring registration.
 * "Super Admin can also be an Ad Agent - no registration required."
 */
export async function getAdAgents(): Promise<AdAgentProfile[]> {
  try {
    const snap = await db.collection(AD_AGENTS_COL).get();
    const agents: AdAgentProfile[] = [];
    for (const doc of snap.docs) {
      const d = doc.data() as AdAgentProfile;
      agents.push({
        ...d,
        agentId: d.agentId || doc.id,
        email: (d.email || "").toLowerCase().trim(),
        redistributionPercentage: normalizeRedistributionPercent(d.redistributionPercentage),
        location: {
          suburb: d.location?.suburb || "Sydney",
          state: d.location?.state || "NSW",
          country: (d.location?.country || "AU").toUpperCase(),
          latitude: Number.isFinite(Number(d.location?.latitude)) ? Number(d.location.latitude) : -33.8688,
          longitude: Number.isFinite(Number(d.location?.longitude)) ? Number(d.location.longitude) : 151.2093,
          label: formatAgentLocationLabel(d.location),
        },
      });
    }

    // Ensure Super Admin built-in Ad Agent exists (no registration required)
    const superEmail = "support@aifoundation.net.au";
    const hasSuperAgent = agents.some(
      (a) => a.email === superEmail || a.email === "davidrobertson.info@gmail.com" || a.isSuperAdminBuiltIn,
    );

    if (!hasSuperAgent) {
      const now = new Date().toISOString();
      const builtInSuperAgent: AdAgentProfile = {
        agentId: "agent_superadmin_default",
        name: "Super Admin (AdRadarHQ Lead Strategist)",
        phone: "+61 2 8000 0000",
        email: superEmail,
        location: DEFAULT_SUPERADMIN_LOCATION,
        redistributionPercentage: 30,
        status: "active",
        isSuperAdminBuiltIn: true,
        createdAt: now,
        updatedAt: now,
      };
      await db.collection(AD_AGENTS_COL).doc(builtInSuperAgent.agentId).set(builtInSuperAgent, { merge: true });
      agents.unshift(builtInSuperAgent);
    }

    return agents.sort((a, b) => {
      if (a.isSuperAdminBuiltIn && !b.isSuperAdminBuiltIn) return -1;
      if (!a.isSuperAdminBuiltIn && b.isSuperAdminBuiltIn) return 1;
      return a.name.localeCompare(b.name);
    });
  } catch (err) {
    console.warn("[ad-agents] failed to load ad_agents, returning built-in superadmin fallback", err);
    const now = new Date().toISOString();
    return [
      {
        agentId: "agent_superadmin_default",
        name: "Super Admin (AdRadarHQ Lead Strategist)",
        phone: "+61 2 8000 0000",
        email: "support@aifoundation.net.au",
        location: DEFAULT_SUPERADMIN_LOCATION,
        redistributionPercentage: 30,
        status: "active",
        isSuperAdminBuiltIn: true,
        createdAt: now,
        updatedAt: now,
      },
    ];
  }
}

/**
 * Registers or updates an Ad Agent from the Ad Agent Registration Panel.
 * - Uses the email the user registered with (`callerEmail`).
 * - Super Admin is already an Ad Agent (no registration required), or can update their location/phone.
 * - Main Admin (`role === "admin"`) can register as an Ad Agent while keeping their `"admin"` role.
 * - Other users (`supporter`, etc.) are promoted to the `"ad_agent"` RBAC role upon registration.
 */
export async function registerOrUpdateAdAgent(params: {
  uid: string;
  callerEmail?: string;
  email: string;
  currentRole: RbacRole | string;
  name: string;
  phone: string;
  location: AdAgentLocation;
  bankOrPayIdDetails?: string;
  status?: "active" | "inactive";
}): Promise<{ agent: AdAgentProfile; assignedRole: RbacRole; isNewRegistration: boolean }> {
  const cleanEmail = params.email.trim().toLowerCase();
  const cleanCallerEmail = (params.callerEmail || params.email).trim().toLowerCase();
  const now = new Date().toISOString();
  const isSuper = isDatabaseAdmin(null, cleanEmail);
  const isSameAsCaller = cleanEmail === cleanCallerEmail;
  const isMainAdmin = isSameAsCaller && params.currentRole === "admin";

  // Check if an Ad Agent record already exists STRICTLY by email
  // Every email gets its own distinct Ad Agent profile and personal details.
  const existingAgents = await getAdAgents();
  const existing = existingAgents.find((a) => a.email.toLowerCase() === cleanEmail);
  const isNewRegistration = !existing;

  // Resolve the uid belonging to cleanEmail so different Ad Agents never share/overwrite uids
  let targetUid: string | undefined = isSameAsCaller ? params.uid : existing?.uid;
  if (!isSameAsCaller && !targetUid) {
    try {
      const userRecord = await adminAuth.getUserByEmail(cleanEmail);
      targetUid = userRecord.uid;
    } catch {
      try {
        const snap = await db.collection("users").where("email", "==", cleanEmail).limit(1).get();
        if (!snap.empty) {
          targetUid = snap.docs[0].id;
        }
      } catch {
        // non-blocking
      }
    }
  }

  const agentId =
    existing?.agentId ||
    `agent_${(targetUid || randomBytes(4).toString("hex")).slice(0, 12)}_${randomBytes(3).toString("hex")}`;
  const cleanLocation: AdAgentLocation = {
    suburb: params.location.suburb.trim() || "Sydney",
    state: params.location.state.trim() || "NSW",
    country: (params.location.country || "AU").trim().toUpperCase(),
    latitude: Number(params.location.latitude),
    longitude: Number(params.location.longitude),
    label: formatAgentLocationLabel(params.location),
  };

  const bankDetails =
    params.bankOrPayIdDetails !== undefined
      ? params.bankOrPayIdDetails.trim()
      : existing?.bankOrPayIdDetails || "";

  const resolvedStatus: "active" | "inactive" =
    params.status === "inactive" || params.status === "active"
      ? params.status
      : existing?.status || "active";

  const nextAgent: AdAgentProfile = {
    agentId,
    ...(targetUid ? { uid: targetUid } : {}),
    name: params.name.trim(),
    phone: params.phone.trim(),
    email: cleanEmail,
    location: cleanLocation,
    ...(bankDetails ? { bankOrPayIdDetails: bankDetails } : { bankOrPayIdDetails: "" }),
    redistributionPercentage: existing
      ? normalizeRedistributionPercent(existing.redistributionPercentage)
      : 30,
    status: resolvedStatus,
    isSuperAdminBuiltIn: isSuper || existing?.isSuperAdminBuiltIn || false,
    ...(typeof existing?.claimedTokens === "number" ? { claimedTokens: existing.claimedTokens } : {}),
    ...(typeof existing?.claimedAudCents === "number" ? { claimedAudCents: existing.claimedAudCents } : {}),
    ...(typeof existing?.claimedUsdCents === "number" ? { claimedUsdCents: existing.claimedUsdCents } : {}),
    ...(existing?.lastResetAt ? { lastResetAt: existing.lastResetAt } : {}),
    ...(existing?.lastResetBy ? { lastResetBy: existing.lastResetBy } : {}),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  await db.collection(AD_AGENTS_COL).doc(agentId).set(nextAgent, { merge: true });

  // Preserve any existing multi-roles assigned by Super Admin while ensuring "ad_agent" is included
  let existingUserRoles: RbacRole[] = [];
  let existingTier = "supporter";
  if (targetUid) {
    try {
      const userSnap = await db.collection("users").doc(targetUid).get();
      if (userSnap.exists) {
        const uData = userSnap.data() || {};
        if (Array.isArray(uData.roles)) {
          existingUserRoles = uData.roles as RbacRole[];
        } else if (typeof uData.role === "string") {
          existingUserRoles = [uData.role as RbacRole];
        }
        if (typeof uData.tier === "string") {
          existingTier = uData.tier;
        }
      }
    } catch {
      // non-blocking
    }
  }

  const roleSet = new Set<RbacRole>(existingUserRoles);
  if (isSuper) {
    roleSet.add("superadmin");
    roleSet.add("admin");
    roleSet.add("ad_agent");
    roleSet.add("supporter");
  } else if (isMainAdmin || roleSet.has("admin")) {
    roleSet.add("admin");
    roleSet.add("ad_agent");
    roleSet.add("supporter");
  } else {
    roleSet.add("ad_agent");
    if (roleSet.size === 1) roleSet.add("supporter");
  }

  const priorityOrder: RbacRole[] = [
    "superadmin",
    "admin",
    "ad_agent",
    "moderator",
    "agency",
    "supporter",
  ];
  const mergedRoles: RbacRole[] = priorityOrder.filter((r) => roleSet.has(r));
  const assignedRole: RbacRole = mergedRoles[0] || "ad_agent";
  const resolvedTier =
    mergedRoles.includes("agency") || mergedRoles.includes("admin") || existingTier === "agency"
      ? "agency"
      : "supporter";

  if (!isSuper && targetUid) {
    try {
      await adminAuth.setCustomUserClaims(targetUid, {
        role: assignedRole,
        roles: mergedRoles,
        tier: resolvedTier,
        isSuperAdmin: false,
        admin: mergedRoles.includes("admin"),
        ad_agent: true,
        superadmin: false,
      });
    } catch (err) {
      console.warn("[ad-agents] setCustomUserClaims failed", err);
    }
  }

  if (targetUid) {
    try {
      await db
        .collection("users")
        .doc(targetUid)
        .set(
          {
            email: cleanEmail,
            displayName: params.name.trim(),
            role: assignedRole,
            roles: mergedRoles,
            tier: resolvedTier,
            isAdAgent: true,
            adAgentId: agentId,
            updatedAt: now,
          },
          { merge: true },
        );
    } catch {
      // ignore if user doc update fails
    }
  }

  return { agent: nextAgent, assignedRole, isNewRegistration };
}

/**
 * Super Admin adds or updates an Ad Agent directly in the Ad Agent Distribution Ledger
 * under Owner Redistribution Breakdown (by email, name, bank/PayID details, and redistribution percentage dropdown).
 */
export async function superAdminUpsertAdAgent(params: {
  name: string;
  email: string;
  phone?: string;
  bankOrPayIdDetails?: string;
  redistributionPercentage: number;
  location?: AdAgentLocation;
}): Promise<AdAgentProfile> {
  const cleanEmail = params.email.trim().toLowerCase();
  const cleanName = params.name.trim() || cleanEmail.split("@")[0] || "Ad Agent";
  const pct = normalizeRedistributionPercent(params.redistributionPercentage);
  const now = new Date().toISOString();

  const existingAgents = await getAdAgents();
  const existing = existingAgents.find((a) => a.email.toLowerCase() === cleanEmail);

  let matchedUid = existing?.uid;
  if (!matchedUid) {
    try {
      const u = await adminAuth.getUserByEmail(cleanEmail);
      matchedUid = u.uid;
    } catch {
      // user may not have signed in yet
    }
  }

  const agentId = existing?.agentId || `agent_${Date.now()}_${randomBytes(3).toString("hex")}`;
  const loc: AdAgentLocation = params.location || existing?.location || DEFAULT_SUPERADMIN_LOCATION;
  const bankDetails =
    params.bankOrPayIdDetails !== undefined
      ? params.bankOrPayIdDetails.trim()
      : existing?.bankOrPayIdDetails || "";

  const nextAgent: AdAgentProfile = {
    agentId,
    ...(matchedUid ? { uid: matchedUid } : {}),
    name: cleanName,
    phone: params.phone?.trim() || existing?.phone || "+61 400 000 000",
    email: cleanEmail,
    location: {
      ...loc,
      label: formatAgentLocationLabel(loc),
    },
    bankOrPayIdDetails: bankDetails,
    redistributionPercentage: pct,
    status: existing?.status || "active",
    isSuperAdminBuiltIn: isDatabaseAdmin(null, cleanEmail) || existing?.isSuperAdminBuiltIn || false,
    ...(typeof existing?.claimedTokens === "number" ? { claimedTokens: existing.claimedTokens } : {}),
    ...(typeof existing?.claimedAudCents === "number" ? { claimedAudCents: existing.claimedAudCents } : {}),
    ...(typeof existing?.claimedUsdCents === "number" ? { claimedUsdCents: existing.claimedUsdCents } : {}),
    ...(existing?.lastResetAt ? { lastResetAt: existing.lastResetAt } : {}),
    ...(existing?.lastResetBy ? { lastResetBy: existing.lastResetBy } : {}),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  await db.collection(AD_AGENTS_COL).doc(agentId).set(nextAgent, { merge: true });

  // If this user exists in Firebase Auth and is a supporter, grant them ad_agent role
  if (matchedUid && !isDatabaseAdmin(null, cleanEmail)) {
    try {
      const authUser = await adminAuth.getUser(matchedUid);
      const currentRole = (authUser.customClaims?.role as string) || "supporter";
      if (currentRole !== "superadmin" && currentRole !== "admin") {
        await adminAuth.setCustomUserClaims(matchedUid, {
          role: "ad_agent",
          tier: "supporter",
          isSuperAdmin: false,
          admin: false,
          superadmin: false,
        });
        await db.collection("users").doc(matchedUid).set(
          {
            role: "ad_agent",
            isAdAgent: true,
            adAgentId: agentId,
            updatedAt: now,
          },
          { merge: true },
        );
      } else {
        await db.collection("users").doc(matchedUid).set(
          {
            isAdAgent: true,
            adAgentId: agentId,
            updatedAt: now,
          },
          { merge: true },
        );
      }
    } catch {
      // ignore
    }
  }

  return nextAgent;
}

/**
 * Super Admin updates an Ad Agent's redistribution percentage dropdown (10%, 20%, 30%, 40%, 50%, 60%, 70%).
 */
export async function updateAdAgentRedistributionPercent(
  agentId: string,
  redistributionPercentage: number,
): Promise<void> {
  const pct = normalizeRedistributionPercent(redistributionPercentage);
  await db.collection(AD_AGENTS_COL).doc(agentId).set(
    {
      redistributionPercentage: pct,
      lastResetAt: "",
      updatedAt: new Date().toISOString(),
    },
    { merge: true },
  );
}

/**
 * Super Admin updates an Ad Agent's Bank Details or PayID Details.
 */
export async function updateAdAgentBankDetails(
  agentId: string,
  bankOrPayIdDetails: string,
): Promise<void> {
  await db.collection(AD_AGENTS_COL).doc(agentId).set(
    {
      bankOrPayIdDetails: bankOrPayIdDetails.trim().slice(0, 500),
      updatedAt: new Date().toISOString(),
    },
    { merge: true },
  );
}

/**
 * Toggles an Ad Agent between active and inactive.
 */
export async function toggleAdAgentStatus(
  agentId: string,
  status: "active" | "inactive",
): Promise<void> {
  await db.collection(AD_AGENTS_COL).doc(agentId).set(
    {
      status,
      updatedAt: new Date().toISOString(),
    },
    { merge: true },
  );
}

/**
 *Deletes an Ad Agent from `ad_agents` (after Super Admin Confirm Delete).
 */
export async function deleteAdAgent(agentId: string): Promise<void> {
  await db.collection(AD_AGENTS_COL).doc(agentId).delete();
}

/**
 * Resets an Ad Agent's accumulated redistribution entitlement to 0.
 */
export async function resetAdAgentRedistributionToZero(
  agentId: string,
  resetByEmail: string,
): Promise<void> {
  const ledger = await getAdAgentDistributionLedger();
  const item = ledger.find((i) => i.agentId === agentId);
  if (!item) return;

  const pct = normalizeRedistributionPercent(item.redistributionPercentage);
  const grossRedistTokens = Math.round(item.totalCustomizationsTokens * (pct / 100));
  const grossRedistAudCents = Math.round(item.totalCustomizationsAudCents * (pct / 100));
  const grossRedistUsdCents = Math.round(item.totalCustomizationsUsdCents * (pct / 100));

  await db.collection(AD_AGENTS_COL).doc(agentId).set(
    {
      claimedCustomizationsTokens: item.totalCustomizationsTokens,
      claimedTokens: grossRedistTokens,
      claimedAudCents: grossRedistAudCents,
      claimedUsdCents: grossRedistUsdCents,
      lastResetAt: new Date().toISOString(),
      lastResetBy: resetByEmail,
      updatedAt: new Date().toISOString(),
    },
    { merge: true },
  );
}

/**
 * Finds the closest active Ad Agent to the customer's geolocation using Haversine great-circle distance,
 * or honors the customer's explicitly chosen `selectedAgentId` when multiple Ad Agents are available.
 */
export async function findClosestAdAgent(
  customerLocation?: Partial<AdAgentLocation> | null,
  selectedAgentId?: string | null,
): Promise<{ agent: AdAgentProfile; distanceKm: number }> {
  const agents = await getAdAgents();
  const activeAgents = agents.filter((a) => a.status === "active");
  const pool = activeAgents.length > 0 ? activeAgents : agents;

  const custLat = Number.isFinite(Number(customerLocation?.latitude))
    ? Number(customerLocation!.latitude)
    : DEFAULT_SUPERADMIN_LOCATION.latitude;
  const custLon = Number.isFinite(Number(customerLocation?.longitude))
    ? Number(customerLocation!.longitude)
    : DEFAULT_SUPERADMIN_LOCATION.longitude;

  if (selectedAgentId) {
    const chosen = pool.find((a) => a.agentId === selectedAgentId);
    if (chosen) {
      const chosenDist = haversineDistanceKm(
        custLat,
        custLon,
        chosen.location.latitude,
        chosen.location.longitude,
      );
      return { agent: chosen, distanceKm: chosenDist };
    }
  }

  let bestAgent = pool[0];
  let bestDist = haversineDistanceKm(
    custLat,
    custLon,
    bestAgent.location.latitude,
    bestAgent.location.longitude,
  );

  for (let i = 1; i < pool.length; i++) {
    const candidate = pool[i];
    const dist = haversineDistanceKm(
      custLat,
      custLon,
      candidate.location.latitude,
      candidate.location.longitude,
    );
    if (dist < bestDist) {
      bestDist = dist;
      bestAgent = candidate;
    }
  }

  return { agent: bestAgent, distanceKm: bestDist };
}

/**
 * Computes the complete Ad Agent Distribution Ledger for display under Owner Redistribution Breakdown.
 * Calculates the total value of all Customizations each Ad Agent has done and their redistribution amount
 * based on the Super Admin's selected dropdown percentage (10%, 20%, 30%, 40%, 50%, 60%, 70%).
 */
export async function getAdAgentDistributionLedger(
  audCentsPerToken = 100,
  customizeServiceTokens = 55,
): Promise<AdAgentDistributionItem[]> {
  const [agents, customizeSnap] = await Promise.all([
    getAdAgents(),
    db.collection(CUSTOMIZE_REQUESTS_COL).get(),
  ]);

  const requests: CustomizeRequestDoc[] = customizeSnap.docs.map(
    (d) => d.data() as CustomizeRequestDoc,
  );

  const builtInSuper = agents.find((a) => a.isSuperAdminBuiltIn) || agents[0];
  const unitTokens = Math.max(0, Math.round(Number(customizeServiceTokens ?? 55)));

  return agents.map((agent) => {
    const agentEmail = agent.email.toLowerCase().trim();
    const matchedRequests = requests.filter((req) => {
      if (req.assignedAgentId && req.assignedAgentId === agent.agentId) return true;
      if (req.assignedAgentEmail && req.assignedAgentEmail.toLowerCase().trim() === agentEmail) {
        return true;
      }
      // Unassigned historical Customize requests default to the built-in Super Admin Ad Agent
      if (
        !req.assignedAgentId &&
        !req.assignedAgentEmail &&
        builtInSuper &&
        agent.agentId === builtInSuper.agentId
      ) {
        return true;
      }
      return false;
    });

    const customizationsCount = matchedRequests.length;
    const effectiveTotalUnits = Math.max(1, customizationsCount);
    const totalCustomizationsTokens = effectiveTotalUnits * unitTokens;
    const totalCustomizationsAudCents = totalCustomizationsTokens * audCentsPerToken;
    const totalCustomizationsUsdCents = Math.round(totalCustomizationsAudCents * 0.65);

    const pct = normalizeRedistributionPercent(agent.redistributionPercentage);

    // If the Ad Agent's redistribution was reset at `lastResetAt`, only Customizations created after `lastResetAt`
    // count toward the current unpaid Redist. Amount. Otherwise use the live Professional Customize Service price.
    const unpaidRequests = agent.lastResetAt
      ? matchedRequests.filter((r) => r.createdAt > agent.lastResetAt!)
      : matchedRequests;
    const isResetWithNoNewOrders = Boolean(agent.lastResetAt) && unpaidRequests.length === 0;
    const unpaidUnits = isResetWithNoNewOrders ? 0 : Math.max(1, unpaidRequests.length);
    const unpaidCustomizationsTokens = unpaidUnits * unitTokens;
    const unpaidCustomizationsAudCents = unpaidCustomizationsTokens * audCentsPerToken;
    const unpaidCustomizationsUsdCents = Math.round(unpaidCustomizationsAudCents * 0.65);

    const redistributionTokens = Math.max(0, Math.round(unpaidCustomizationsTokens * (pct / 100)));
    const redistributionAudCents = Math.max(0, Math.round(unpaidCustomizationsAudCents * (pct / 100)));
    const redistributionUsdCents = Math.max(0, Math.round(unpaidCustomizationsUsdCents * (pct / 100)));

    return {
      agentId: agent.agentId,
      uid: agent.uid,
      name: agent.name,
      phone: agent.phone,
      email: agent.email,
      suburb: agent.location.suburb,
      state: agent.location.state,
      country: agent.location.country,
      locationLabel: formatAgentLocationLabel(agent.location),
      latitude: agent.location.latitude,
      longitude: agent.location.longitude,
      bankOrPayIdDetails: agent.bankOrPayIdDetails || "",
      status: agent.status,
      isSuperAdminBuiltIn: agent.isSuperAdminBuiltIn,
      customizationsCount,
      totalCustomizationsTokens,
      totalCustomizationsAudCents,
      totalCustomizationsUsdCents,
      redistributionPercentage: pct,
      redistributionTokens,
      redistributionAudCents,
      redistributionUsdCents,
      lastResetAt: agent.lastResetAt,
    };
  });
}

