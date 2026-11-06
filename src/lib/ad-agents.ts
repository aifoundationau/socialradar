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
  email: string;
  currentRole: RbacRole | string;
  name: string;
  phone: string;
  location: AdAgentLocation;
}): Promise<{ agent: AdAgentProfile; assignedRole: RbacRole }> {
  const cleanEmail = params.email.trim().toLowerCase();
  const now = new Date().toISOString();
  const isSuper = isDatabaseAdmin(null, cleanEmail) || params.currentRole === "superadmin";
  const isMainAdmin = params.currentRole === "admin";

  // Check if an Ad Agent record already exists for this email or uid
  const existingAgents = await getAdAgents();
  const existing = existingAgents.find(
    (a) => a.email.toLowerCase() === cleanEmail || (a.uid && a.uid === params.uid),
  );

  const agentId = existing?.agentId || `agent_${params.uid.slice(0, 16)}_${randomBytes(3).toString("hex")}`;
  const cleanLocation: AdAgentLocation = {
    suburb: params.location.suburb.trim() || "Sydney",
    state: params.location.state.trim() || "NSW",
    country: (params.location.country || "AU").trim().toUpperCase(),
    latitude: Number(params.location.latitude),
    longitude: Number(params.location.longitude),
    label: formatAgentLocationLabel(params.location),
  };

  const nextAgent: AdAgentProfile = {
    agentId,
    uid: params.uid,
    name: params.name.trim(),
    phone: params.phone.trim(),
    email: cleanEmail,
    location: cleanLocation,
    redistributionPercentage: existing
      ? normalizeRedistributionPercent(existing.redistributionPercentage)
      : 30,
    status: "active",
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

  // Determine resulting RBAC role:
  // Super Admin stays superadmin; Main Admin stays admin; everyone else becomes ad_agent
  const assignedRole: RbacRole = isSuper ? "superadmin" : isMainAdmin ? "admin" : "ad_agent";

  if (!isSuper && !isMainAdmin) {
    try {
      await adminAuth.setCustomUserClaims(params.uid, {
        role: "ad_agent",
        tier: "supporter",
        isSuperAdmin: false,
        admin: false,
        superadmin: false,
      });
    } catch (err) {
      console.warn("[ad-agents] setCustomUserClaims failed", err);
    }
  }

  try {
    await db
      .collection("users")
      .doc(params.uid)
      .set(
        {
          role: assignedRole,
          isAdAgent: true,
          adAgentId: agentId,
          updatedAt: now,
        },
        { merge: true },
      );
  } catch {
    // ignore if user doc update fails
  }

  return { agent: nextAgent, assignedRole };
}

/**
 * Super Admin adds or updates an Ad Agent directly in the Ad Agent Distribution Ledger
 * under Owner Redistribution Breakdown (by email, name, and redistribution percentage dropdown).
 */
export async function superAdminUpsertAdAgent(params: {
  name: string;
  email: string;
  phone?: string;
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
 * Finds the closest active Ad Agent to the customer's geolocation using Haversine great-circle distance.
 */
export async function findClosestAdAgent(
  customerLocation?: Partial<AdAgentLocation> | null,
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
): Promise<AdAgentDistributionItem[]> {
  const [agents, customizeSnap] = await Promise.all([
    getAdAgents(),
    db.collection(CUSTOMIZE_REQUESTS_COL).get(),
  ]);

  const requests: CustomizeRequestDoc[] = customizeSnap.docs.map(
    (d) => d.data() as CustomizeRequestDoc,
  );

  const builtInSuper = agents.find((a) => a.isSuperAdminBuiltIn) || agents[0];

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
    const totalCustomizationsTokens = matchedRequests.reduce(
      (sum, r) => sum + Math.max(0, Math.round(Number(r.tokensCharged ?? 0))),
      0,
    );
    const totalCustomizationsAudCents = totalCustomizationsTokens * audCentsPerToken;
    const totalCustomizationsUsdCents = Math.round(totalCustomizationsAudCents * 0.65);

    const pct = normalizeRedistributionPercent(agent.redistributionPercentage);

    const grossRedistTokens = Math.round(totalCustomizationsTokens * (pct / 100));
    const grossRedistAudCents = Math.round(totalCustomizationsAudCents * (pct / 100));
    const grossRedistUsdCents = Math.round(totalCustomizationsUsdCents * (pct / 100));

    const claimedTokens = Math.max(0, Math.round(Number(agent.claimedTokens || 0)));
    const claimedAudCents = Math.max(0, Math.round(Number(agent.claimedAudCents || 0)));
    const claimedUsdCents = Math.max(0, Math.round(Number(agent.claimedUsdCents || 0)));

    return {
      agentId: agent.agentId,
      uid: agent.uid,
      name: agent.name,
      phone: agent.phone,
      email: agent.email,
      locationLabel: formatAgentLocationLabel(agent.location),
      latitude: agent.location.latitude,
      longitude: agent.location.longitude,
      status: agent.status,
      isSuperAdminBuiltIn: agent.isSuperAdminBuiltIn,
      customizationsCount,
      totalCustomizationsTokens,
      totalCustomizationsAudCents,
      totalCustomizationsUsdCents,
      redistributionPercentage: pct,
      redistributionTokens: Math.max(0, grossRedistTokens - claimedTokens),
      redistributionAudCents: Math.max(0, grossRedistAudCents - claimedAudCents),
      redistributionUsdCents: Math.max(0, grossRedistUsdCents - claimedUsdCents),
      lastResetAt: agent.lastResetAt,
    };
  });
}
