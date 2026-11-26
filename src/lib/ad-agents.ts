import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { ApiError } from "./api";
import { adminAuth, db, isDatabaseAdminEmail } from "./firebase-admin";
import { normalizeUserRoles } from "./rbac";
import { audToUsdCents, netAudCentsAfterStripeFee } from "./pricing";
import {
  AD_AGENT_REDISTRIBUTION_PERCENTS,
  AdAgentSearchLeadDocSchema,
  type AdAgentDistributionItem,
  type AdAgentDistributionPricingMeta,
  type AdAgentLocation,
  type AdAgentProfile,
  type AdAgentRedistributionPercent,
  type AdAgentSearchLeadDoc,
  type BrandProfile,
  type CustomizeRequestDoc,
  type RadarSearchRequest,
  type RbacRole,
} from "./contracts";

const AD_AGENTS_COL = "ad_agents";
const CUSTOMIZE_REQUESTS_COL = "customize_requests";
const SEARCH_LEADS_COL = "ad_agent_search_leads";

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
    // Users holding the ad_agent role are found with indexed equality queries instead of reading every
    // user document (and listing Auth users) on each call. Every path that grants the role writes it to
    // users/{uid}, so these three queries cover them all.
    const usersCol = db.collection("users");
    const [snap, ...roleSnaps] = await Promise.all([
      db.collection(AD_AGENTS_COL).get(),
      usersCol.where("role", "==", "ad_agent").get().catch(() => null),
      usersCol.where("roles", "array-contains", "ad_agent").get().catch(() => null),
      usersCol.where("isAdAgent", "==", true).get().catch(() => null),
    ]);
    const agents: AdAgentProfile[] = [];
    const seenEmails = new Set<string>();
    const PLACEHOLDER_AGENT_PHONE = "+61 2 8000 0000";
    const sanitizeAgentPhone = (phone?: string) =>
      !phone || !phone.trim() || phone.trim() === PLACEHOLDER_AGENT_PHONE ? "Not specified" : phone.trim();
    const sortedDocs = [...snap.docs].sort((a, b) => {
      const aData = a.data() as Partial<AdAgentProfile>;
      const bData = b.data() as Partial<AdAgentProfile>;
      const aHasBank = Boolean(aData.bankOrPayIdDetails && aData.bankOrPayIdDetails.trim());
      const bHasBank = Boolean(bData.bankOrPayIdDetails && bData.bankOrPayIdDetails.trim());
      if (aHasBank !== bHasBank) return aHasBank ? -1 : 1;
      const aIsRbacSeed = a.id.startsWith("agent_rbac_");
      const bIsRbacSeed = b.id.startsWith("agent_rbac_");
      if (aIsRbacSeed !== bIsRbacSeed) return aIsRbacSeed ? 1 : -1;
      return String(bData.updatedAt || "").localeCompare(String(aData.updatedAt || ""));
    });

    for (const doc of sortedDocs) {
      const d = doc.data() as AdAgentProfile;
      const cleanEmail = (d.email || "").toLowerCase().trim();
      if (cleanEmail && seenEmails.has(cleanEmail)) continue;
      if (cleanEmail) seenEmails.add(cleanEmail);
      if (d.phone === PLACEHOLDER_AGENT_PHONE) {
        void doc.ref.update({ phone: "Not specified" }).catch(() => undefined);
      }
      agents.push({
        ...d,
        agentId: d.agentId || doc.id,
        phone: sanitizeAgentPhone(d.phone),
        email: cleanEmail,
        inActiveLedger: d.inActiveLedger !== false,
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

    // Ensure every user approved with the RBAC role of "ad_agent" is stored in `ad_agents` records
    // so they can be activated one-by-one from the Ad Agent Distribution Ledger panel when required.
    const now = new Date().toISOString();
    const roleAgentCandidates = new Map<string, { uid: string; email: string; name: string }>();

    for (const roleSnap of roleSnaps) {
      roleSnap?.forEach((doc) => {
        const u = doc.data() || {};
        const email = String(u.email || "").toLowerCase().trim();
        if (!email || roleAgentCandidates.has(email)) return;
        roleAgentCandidates.set(email, {
          uid: doc.id,
          email,
          name: String(u.displayName || email.split("@")[0] || "Ad Agent").trim(),
        });
      });
    }

    const syncPromises: Promise<unknown>[] = [];
    for (const [email, candidate] of roleAgentCandidates.entries()) {
      if (seenEmails.has(email)) continue;
      seenEmails.add(email);
      const isSuperEmail = isDatabaseAdminEmail(email);
      const cleanUid = candidate.uid.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 16) || randomBytes(4).toString("hex");
      const newRoleAgent: AdAgentProfile = {
        agentId: `agent_rbac_${cleanUid}`,
        uid: candidate.uid,
        name: candidate.name,
        phone: "Not specified",
        email,
        location: DEFAULT_SUPERADMIN_LOCATION,
        bankOrPayIdDetails: "",
        redistributionPercentage: 30,
        status: isSuperEmail ? "active" : "inactive",
        inActiveLedger: isSuperEmail,
        isSuperAdminBuiltIn: isSuperEmail,
        createdAt: now,
        updatedAt: now,
      };
      agents.push(newRoleAgent);
      syncPromises.push(
        db
          .collection(AD_AGENTS_COL)
          .doc(newRoleAgent.agentId)
          .set(newRoleAgent, { merge: true })
          .catch(() => undefined),
      );
    }
    if (syncPromises.length > 0) {
      await Promise.all(syncPromises);
    }

    // Ensure Super Admin built-in Ad Agent record exists (no registration required)
    const superEmail = "support@aifoundation.net.au";
    const hasSuperAgent = agents.some(
      (a) => a.email === superEmail || a.email === "davidrobertson.info@gmail.com" || a.isSuperAdminBuiltIn,
    );

    if (!hasSuperAgent) {
      const now = new Date().toISOString();
      const builtInSuperAgent: AdAgentProfile = {
        agentId: "agent_superadmin_default",
        name: "Super Admin (AdRadarHQ Lead Strategist)",
        phone: "Not specified",
        email: superEmail,
        location: DEFAULT_SUPERADMIN_LOCATION,
        redistributionPercentage: 30,
        status: "active",
        inActiveLedger: true,
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
        phone: "Not specified",
        email: "support@aifoundation.net.au",
        location: DEFAULT_SUPERADMIN_LOCATION,
        redistributionPercentage: 30,
        status: "active",
        inActiveLedger: true,
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
  name: string;
  phone: string;
  location: AdAgentLocation;
  bankOrPayIdDetails?: string;
  status?: "active" | "inactive";
}): Promise<{ agent: AdAgentProfile; assignedRole: RbacRole; isNewRegistration: boolean }> {
  const cleanEmail = params.email.trim().toLowerCase();
  const cleanCallerEmail = (params.callerEmail || params.email).trim().toLowerCase();
  const now = new Date().toISOString();
  const isSuper = isDatabaseAdminEmail(cleanEmail);
  const isSameAsCaller = cleanEmail === cleanCallerEmail;

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

  const resolvedInActiveLedger: boolean = existing
    ? existing.inActiveLedger !== false
    : isSuper;

  const resolvedStatus: "active" | "inactive" = !resolvedInActiveLedger
    ? "inactive"
    : params.status === "inactive" || params.status === "active"
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
    inActiveLedger: resolvedInActiveLedger,
    isSuperAdminBuiltIn: isSuper || existing?.isSuperAdminBuiltIn || false,
    ...(typeof existing?.claimedCustomizationsTokens === "number"
      ? { claimedCustomizationsTokens: existing.claimedCustomizationsTokens }
      : {}),
    ...(typeof existing?.claimedTokens === "number" ? { claimedTokens: existing.claimedTokens } : {}),
    ...(typeof existing?.claimedAudCents === "number" ? { claimedAudCents: existing.claimedAudCents } : {}),
    ...(typeof existing?.claimedUsdCents === "number" ? { claimedUsdCents: existing.claimedUsdCents } : {}),
    ...(existing?.lastResetAt ? { lastResetAt: existing.lastResetAt } : {}),
    ...(existing?.lastResetBy ? { lastResetBy: existing.lastResetBy } : {}),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  await db.collection(AD_AGENTS_COL).doc(agentId).set(nextAgent, { merge: true });

  // Preserve the roles Super Admin has recorded on users/{uid} while ensuring "ad_agent" is included.
  // Registering never grants Main Admin: "admin" is kept only if it's already on the record.
  let existingUserRoles: RbacRole[] = [];
  let existingTier = "supporter";
  if (targetUid) {
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
  }

  const roleSet = new Set<RbacRole>(existingUserRoles);
  if (isSuper) {
    roleSet.add("superadmin");
    roleSet.add("admin");
    roleSet.add("ad_agent");
    roleSet.add("supporter");
  } else if (roleSet.has("admin")) {
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

  // users/{uid} is the only record of Ad Radar roles (claims on the shared Auth account aren't written), so
  // this write must succeed for the Ad Agent role to take effect.
  if (targetUid) {
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
    status: existing?.inActiveLedger === false ? "active" : existing?.status || "active",
    inActiveLedger: true,
    isSuperAdminBuiltIn: isDatabaseAdminEmail(cleanEmail) || existing?.isSuperAdminBuiltIn || false,
    ...(typeof existing?.claimedCustomizationsTokens === "number"
      ? { claimedCustomizationsTokens: existing.claimedCustomizationsTokens }
      : {}),
    ...(typeof existing?.claimedTokens === "number" ? { claimedTokens: existing.claimedTokens } : {}),
    ...(typeof existing?.claimedAudCents === "number" ? { claimedAudCents: existing.claimedAudCents } : {}),
    ...(typeof existing?.claimedUsdCents === "number" ? { claimedUsdCents: existing.claimedUsdCents } : {}),
    ...(existing?.lastResetAt ? { lastResetAt: existing.lastResetAt } : {}),
    ...(existing?.lastResetBy ? { lastResetBy: existing.lastResetBy } : {}),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  await db.collection(AD_AGENTS_COL).doc(agentId).set(nextAgent, { merge: true });

  // If this user has an account, add the ad_agent role to their users/{uid} record (the only record of Ad Radar
  // roles), keeping any roles Super Admin already gave them (e.g. admin, agency, moderator).
  if (matchedUid && !isDatabaseAdminEmail(cleanEmail)) {
    const userRef = db.collection("users").doc(matchedUid);
    const userSnap = await userRef.get();
    const roles = normalizeUserRoles(
      [...(Array.isArray(userSnap.get("roles")) ? userSnap.get("roles") : []), "ad_agent"],
      userSnap.get("role"),
      false,
    );
    const tier = roles.includes("agency") || roles.includes("admin") ? "agency" : "supporter";
    await userRef.set(
      {
        email: cleanEmail,
        role: roles[0],
        roles,
        tier,
        isAdAgent: true,
        adAgentId: agentId,
        updatedAt: now,
      },
      { merge: true },
    );
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
  // lastResetAt is deliberately left alone: clearing it would make every customization that was already
  // paid out count as unpaid again.
  await db.collection(AD_AGENTS_COL).doc(agentId).set(
    {
      redistributionPercentage: pct,
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
 * Activates a saved/approved Ad Agent record one-by-one into the active
 * `Ad Agent & Customizations Value` distribution ledger list, preserving all saved records.
 */
export async function activateAdAgentInLedger(params: {
  agentId: string;
  email?: string;
  name?: string;
}): Promise<AdAgentProfile> {
  const cleanEmail = (params.email || "").trim().toLowerCase();
  const now = new Date().toISOString();
  const agents = await getAdAgents();
  const matched =
    agents.find((a) => a.agentId === params.agentId) ||
    (cleanEmail ? agents.find((a) => a.email.toLowerCase() === cleanEmail) : undefined);

  if (!matched) {
    if (cleanEmail) {
      return superAdminUpsertAdAgent({
        name: params.name?.trim() || cleanEmail.split("@")[0] || "Ad Agent",
        email: cleanEmail,
        redistributionPercentage: 30,
      });
    }
    throw new Error(`Ad Agent record "${params.agentId}" not found.`);
  }

  const targetEmail = matched.email.toLowerCase().trim();
  const patch = {
    inActiveLedger: true,
    status: "active" as const,
    updatedAt: now,
  };

  await db.collection(AD_AGENTS_COL).doc(matched.agentId).set(patch, { merge: true });

  if (targetEmail) {
    const dupSnap = await db.collection(AD_AGENTS_COL).where("email", "==", targetEmail).get();
    await Promise.all(
      dupSnap.docs
        .filter((d) => d.id !== matched.agentId)
        .map((d) => d.ref.set(patch, { merge: true })),
    );
  }

  return {
    ...matched,
    inActiveLedger: true,
    status: "active",
    updatedAt: now,
  };
}

/**
 * Removes an Ad Agent one-by-one from the active `Ad Agent & Customizations Value` list
 * (after Super Admin Confirm Delete) while keeping ALL of their saved records permanently
 * in `ad_agents` so they can be re-activated back into the active list whenever required.
 */
export async function deleteAdAgent(agentId: string, email?: string): Promise<void> {
  const cleanEmail = (email || "").trim().toLowerCase();
  const now = new Date().toISOString();
  const agents = await getAdAgents();
  const matched =
    agents.find((a) => a.agentId === agentId) ||
    (cleanEmail ? agents.find((a) => a.email.toLowerCase() === cleanEmail) : undefined);

  const targetAgentId = matched?.agentId || agentId;
  const targetEmail = (matched?.email || cleanEmail).toLowerCase().trim();

  const deactivatePatch = {
    ...(matched ? matched : {}),
    agentId: targetAgentId,
    inActiveLedger: false,
    status: "inactive" as const,
    updatedAt: now,
  };

  await db.collection(AD_AGENTS_COL).doc(targetAgentId).set(deactivatePatch, { merge: true });

  if (targetEmail) {
    const sameEmailSnap = await db
      .collection(AD_AGENTS_COL)
      .where("email", "==", targetEmail)
      .get();
    await Promise.all(
      sameEmailSnap.docs
        .filter((d) => d.id !== targetAgentId)
        .map((d) =>
          d.ref.set(
            {
              inActiveLedger: false,
              status: "inactive",
              updatedAt: now,
            },
            { merge: true },
          ),
        ),
    );
  }
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
  const netAudCents = netAudCentsAfterStripeFee(
    item.totalCustomizationsAudCents,
    item.customizationsCount,
  );
  const grossRedistTokens = Math.round(item.totalCustomizationsTokens * (pct / 100));
  const grossRedistAudCents = Math.round(netAudCents * (pct / 100));
  const grossRedistUsdCents = audToUsdCents(grossRedistAudCents);

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
  const activeAgents = agents.filter((a) => a.status === "active" && a.inActiveLedger !== false);
  const fallbackAgent = agents.find((a) => a.isSuperAdminBuiltIn) || agents[0];
  const pool = activeAgents.length > 0 ? activeAgents : [fallbackAgent];

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
 * Customize requests assigned to one Ad Agent (by email, uid or agentId), fetched with indexed equality
 * queries instead of reading the whole collection.
 */
export async function getAssignedCustomizeRequests(agent: {
  email: string;
  uid?: string;
  agentId?: string;
}): Promise<CustomizeRequestDoc[]> {
  const col = db.collection(CUSTOMIZE_REQUESTS_COL);
  const queries = [col.where("assignedAgentEmail", "==", agent.email.toLowerCase().trim())];
  if (agent.uid) queries.push(col.where("assignedAgentUid", "==", agent.uid));
  if (agent.agentId) queries.push(col.where("assignedAgentId", "==", agent.agentId));
  const snaps = await Promise.all(queries.map((q) => q.get()));
  const byId = new Map<string, CustomizeRequestDoc>();
  for (const snap of snaps) for (const doc of snap.docs) byId.set(doc.id, doc.data() as CustomizeRequestDoc);
  return Array.from(byId.values());
}

/**
 * Computes the complete Ad Agent Distribution Ledger for display under Owner Redistribution Breakdown.
 * Calculates the total value of all Customizations each Ad Agent has done and their redistribution amount
 * based on the Super Admin's selected dropdown percentage (10%, 20%, 30%, 40%, 50%, 60%, 70%).
 *
 * Pass `scope` with already-loaded agents and requests to avoid reading them again; `partial: true`
 * means the agents are a subset (e.g. one agent's own row), so unassigned requests aren't credited.
 */
export async function getAdAgentDistributionLedger(
  audCentsPerToken = 100,
  customizeServiceTokens = 55,
  scope?: { agents: AdAgentProfile[]; requests: CustomizeRequestDoc[]; partial?: boolean },
): Promise<AdAgentDistributionItem[]> {
  const [agents, requests] = scope
    ? [scope.agents, scope.requests]
    : await Promise.all([
        getAdAgents(),
        db
          .collection(CUSTOMIZE_REQUESTS_COL)
          .get()
          .then((snap) => snap.docs.map((d) => d.data() as CustomizeRequestDoc)),
      ]);

  const builtInSuper = scope?.partial
    ? agents.find((a) => a.isSuperAdminBuiltIn)
    : agents.find((a) => a.isSuperAdminBuiltIn) || agents[0];
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

    // Each customization is worth what the customer actually paid for it (tokensCharged: 0 during a free
    // window). Only requests saved before that field existed fall back to the current Customize price.
    const tokensOf = (r: CustomizeRequestDoc) => {
      const charged = Number(r.tokensCharged);
      return Number.isFinite(charged) ? Math.max(0, Math.round(charged)) : unitTokens;
    };

    const customizationsCount = matchedRequests.length;
    const totalCustomizationsTokens = matchedRequests.reduce((sum, r) => sum + tokensOf(r), 0);
    const totalCustomizationsAudCents = totalCustomizationsTokens * audCentsPerToken;
    const totalCustomizationsUsdCents = Math.round(totalCustomizationsAudCents * 0.65);

    const pct = normalizeRedistributionPercent(agent.redistributionPercentage);

    // Only customizations created after the last payout reset (`lastResetAt`) are still owed.
    // An agent with no (new) customizations is owed nothing.
    const unpaidRequests = agent.lastResetAt
      ? matchedRequests.filter((r) => r.createdAt > agent.lastResetAt!)
      : matchedRequests;
    const unpaidCustomizationsTokens = unpaidRequests.reduce((sum, r) => sum + tokensOf(r), 0);
    const unpaidCustomizationsAudCents = unpaidCustomizationsTokens * audCentsPerToken;
    // Share Ad Agent customizations revenue after deducting Stripe processing fees (1.75% + $0.30 AUD per order).
    const unpaidNetAudCents = netAudCentsAfterStripeFee(unpaidCustomizationsAudCents, unpaidRequests.length);

    const redistributionTokens = Math.max(0, Math.round(unpaidCustomizationsTokens * (pct / 100)));
    const redistributionAudCents = Math.max(0, Math.round(unpaidNetAudCents * (pct / 100)));
    const redistributionUsdCents = audToUsdCents(redistributionAudCents);

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
      inActiveLedger: agent.inActiveLedger !== false,
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

// ============================================================================
// COMPLETED SEARCH LEAD NOTIFICATIONS & FIRST-TO-RESPOND CLAIM SYSTEM
// ============================================================================

export function maskCustomerEmail(email: string): string {
  const clean = (email || "").trim().toLowerCase();
  const [local, domain] = clean.split("@");
  if (!local || !domain) return "Customer Account";
  const prefix = local.slice(0, Math.min(2, local.length));
  return `${prefix}***@${domain}`;
}

export function isLeadClaimedByViewer(
  lead: Pick<AdAgentSearchLeadDoc, "status" | "claimedByAgentEmail" | "claimedByAgentUid" | "claimedByAgentId">,
  viewer: { uid: string; email: string; isSuper: boolean; agentId?: string },
): boolean {
  if (viewer.isSuper) return true;
  if (lead.status !== "claimed") return false;
  const cleanEmail = viewer.email.trim().toLowerCase();
  return Boolean(
    (lead.claimedByAgentUid && lead.claimedByAgentUid === viewer.uid) ||
      (lead.claimedByAgentEmail && lead.claimedByAgentEmail.trim().toLowerCase() === cleanEmail) ||
      (viewer.agentId && lead.claimedByAgentId && lead.claimedByAgentId === viewer.agentId),
  );
}

/**
 * First-to-Respond Privacy Gate:
 * Unclaimed leads hide full customer email/UID and brand details. Once claimed, only the first
 * responding Ad Agent (and Super Admin) sees full customer details; all other agents see masked status.
 */
export function redactSearchLeadForViewer(
  lead: AdAgentSearchLeadDoc,
  viewer: { uid: string; email: string; isSuper: boolean; agentId?: string },
): AdAgentSearchLeadDoc {
  if (isLeadClaimedByViewer(lead, viewer)) {
    return lead;
  }
  return {
    ...lead,
    customerUid: "",
    customerEmail: "hidden-until-claimed@adradarhq.com",
    brandSummary: "",
  };
}

/**
 * Dispatches a completed Radar search lead to active Ad Agents (for Australia, sends to Australian Ad Agents).
 * Full customer contact details stay hidden until the first Ad Agent responds and claims the lead.
 */
export async function dispatchCompletedSearchLeadToAdAgents(params: {
  txId: string;
  customerUid: string;
  customerEmail: string;
  customerRole: string;
  customerCountry: string;
  search: RadarSearchRequest;
  resultsCount: number;
  tokensCharged: number;
  brand?: BrandProfile | null;
}): Promise<AdAgentSearchLeadDoc> {
  const leadId = `lead_${createHash("sha256").update(params.txId).digest("hex").slice(0, 24)}`;
  const ref = db.collection(SEARCH_LEADS_COL).doc(leadId);
  const existingSnap = await ref.get();
  if (existingSnap.exists) {
    return existingSnap.data() as AdAgentSearchLeadDoc;
  }

  const now = new Date().toISOString();
  const cleanCustomerEmail = params.customerEmail.trim().toLowerCase();
  const customerMask = maskCustomerEmail(cleanCustomerEmail);
  const targetMarket = (params.search.country || params.customerCountry || "AU").toUpperCase();
  const customerCountry = (params.customerCountry || targetMarket || "AU").toUpperCase();

  const allAgents = await getAdAgents();
  const activeAgents = allAgents.filter((a) => a.status === "active" && a.inActiveLedger !== false);

  // For Australia searches/customers, target active Australian Ad Agents specifically
  const isAustraliaTarget = targetMarket === "AU" || customerCountry === "AU";
  let targetAgents = isAustraliaTarget
    ? activeAgents.filter((a) => (a.location?.country || "AU").toUpperCase() === "AU")
    : activeAgents.filter((a) => (a.location?.country || "").toUpperCase() === targetMarket);

  if (targetAgents.length === 0) {
    targetAgents = activeAgents;
  }

  const notifiedAgentEmails = Array.from(
    new Set(targetAgents.map((a) => a.email.trim().toLowerCase()).filter(Boolean)),
  );

  const brandSummary = params.brand
    ? [
        `Product/Service: ${params.brand.productServiceDescription}`,
        `Target Audience: ${params.brand.targetAudienceAvatar}`,
        `Offer/Mechanism: ${params.brand.uniqueMechanismOrOffer}`,
      ].join(" | ")
    : "";

  const lead = AdAgentSearchLeadDocSchema.parse({
    leadId,
    txId: params.txId,
    customerUid: params.customerUid,
    customerEmail: cleanCustomerEmail,
    customerMask,
    customerRole: params.customerRole || "supporter",
    customerCountry,
    platform: params.search.platform,
    query: params.search.query,
    searchCountry: targetMarket,
    mediaType: params.search.mediaType,
    provenWinnersOnly: params.search.provenWinnersOnly,
    extendedLongevity: params.search.extendedLongevity,
    eliteWinnersOnly: params.search.eliteWinnersOnly,
    resultsCount: Math.max(0, Math.round(params.resultsCount)),
    tokensCharged: Math.max(0, Math.round(params.tokensCharged)),
    brandId: params.brand?.brandId || params.search.brandId || "",
    brandName: params.brand?.brandName || "",
    brandSummary: brandSummary.slice(0, 1500),
    status: "open",
    notifiedAgentEmails,
    createdAt: now,
    updatedAt: now,
  });

  await ref.set(lead);

  if (notifiedAgentEmails.length > 0) {
    const { sendSuperadminMessage, sanitizeForPlainTextArchive } = await import("./admin");
    const subject = sanitizeForPlainTextArchive(
      `[SEARCH LEAD - ${lead.searchCountry}] ${lead.platform}: "${lead.query}" (${lead.resultsCount} ads) - First to Respond Claims`,
    ).slice(0, 150);

    const body = sanitizeForPlainTextArchive(
      [
        `COMPLETED AD SEARCH ALERT (${lead.leadId})`,
        ``,
        `A customer in ${lead.customerCountry} (${lead.customerMask}, Role: ${lead.customerRole}) just completed a live Ad Radar search:`,
        `- Platform:       ${lead.platform}`,
        `- Search Query:   "${lead.query}"`,
        `- Target Market:  ${lead.searchCountry}`,
        `- Ads Returned:   ${lead.resultsCount}`,
        lead.brandName ? `- Brand Context:  ${lead.brandName}` : `- Brand Context:  General Market Search`,
        ``,
        `FIRST-TO-RESPOND RULE:`,
        `Customer contact details stay private until claimed. Open your Ad Agent Panel -> Orders & Leads tab and click "Respond First & Claim Customer Details" on ${lead.leadId}.`,
        `The FIRST Ad Agent to respond receives the customer's email and full brand details so you can message them directly about Customizations.`,
      ].join("\n"),
    ).slice(0, 9800);

    await Promise.allSettled(
      notifiedAgentEmails.map((agentEmail) =>
        sendSuperadminMessage({
          superadminUid: "system_search_lead_dispatch",
          superadminEmail: "support@aifoundation.net.au",
          recipientEmail: agentEmail,
          subject,
          body,
          requestType: "search_lead_alert",
          searchLeadId: lead.leadId,
        }),
      ),
    );
  }

  return lead;
}

/** Lists recent completed search leads, redacting unclaimed or rival-claimed customer details. */
export async function getSearchLeadsForViewer(
  viewer: { uid: string; email: string; isSuper: boolean; agentId?: string },
  limit = 40,
): Promise<AdAgentSearchLeadDoc[]> {
  try {
    const snap = await db
      .collection(SEARCH_LEADS_COL)
      .orderBy("createdAt", "desc")
      .limit(limit)
      .get();
    return snap.docs.flatMap((doc) => {
      const parsed = AdAgentSearchLeadDocSchema.safeParse(doc.data());
      return parsed.success ? [redactSearchLeadForViewer(parsed.data, viewer)] : [];
    });
  } catch (err) {
    console.warn("[ad-agents] failed to list search leads", err);
    return [];
  }
}

/**
 * Atomically claims an open search lead for the first Ad Agent to respond.
 * Returns the full unredacted customer details to that Ad Agent; rejects subsequent agents with 409.
 */
export async function claimSearchLeadForAdAgent(params: {
  leadId: string;
  agent: AdAgentProfile;
  callerUid: string;
  callerEmail: string;
  outreachMessage?: string;
}): Promise<AdAgentSearchLeadDoc> {
  const ref = db.collection(SEARCH_LEADS_COL).doc(params.leadId.trim());
  const cleanEmail = params.callerEmail.trim().toLowerCase();
  const now = new Date().toISOString();

  const claimedLead = await db.runTransaction(async (t) => {
    const snap = await t.get(ref);
    if (!snap.exists) {
      throw new ApiError("NOT_FOUND", "Search lead not found.", 404);
    }
    const existing = AdAgentSearchLeadDocSchema.parse(snap.data());
    if (existing.status === "claimed") {
      const alreadyClaimedByCaller =
        (existing.claimedByAgentUid && existing.claimedByAgentUid === params.callerUid) ||
        (existing.claimedByAgentEmail && existing.claimedByAgentEmail.toLowerCase() === cleanEmail) ||
        (existing.claimedByAgentId && existing.claimedByAgentId === params.agent.agentId);
      if (alreadyClaimedByCaller) {
        return existing;
      }
      throw new ApiError(
        "INVALID_INPUT",
        `Another Ad Agent (${existing.claimedByAgentName || "Ad Agent"}) responded first and claimed this customer lead.`,
        409,
      );
    }

    const updated: AdAgentSearchLeadDoc = {
      ...existing,
      status: "claimed",
      claimedByAgentId: params.agent.agentId,
      claimedByAgentUid: params.callerUid,
      claimedByAgentName: params.agent.name,
      claimedByAgentEmail: params.agent.email.trim().toLowerCase(),
      claimedByAgentPhone: params.agent.phone,
      claimedAt: now,
      updatedAt: now,
    };
    t.set(ref, updated);
    return updated;
  });

  const { sendSuperadminMessage, sanitizeForPlainTextArchive } = await import("./admin");

  // Send the claiming Ad Agent a Message Panel copy with complete unlocked customer details
  const claimSubject = sanitizeForPlainTextArchive(
    `[LEAD CLAIMED] Customer Details for "${claimedLead.query}" (${claimedLead.platform})`,
  ).slice(0, 150);
  const claimBody = sanitizeForPlainTextArchive(
    [
      `YOU RESPONDED FIRST — CUSTOMER DETAILS UNLOCKED (${claimedLead.leadId})`,
      ``,
      `Customer Email:   ${claimedLead.customerEmail}`,
      `Customer Role:    ${claimedLead.customerRole}`,
      `Customer Country: ${claimedLead.customerCountry}`,
      `Completed Search: ${claimedLead.platform} — "${claimedLead.query}" (${claimedLead.resultsCount} ads in ${claimedLead.searchCountry})`,
      claimedLead.brandName ? `Brand Name:       ${claimedLead.brandName}` : null,
      claimedLead.brandSummary ? `Brand Context:    ${claimedLead.brandSummary}` : null,
      ``,
      `NEXT STEP:`,
      `You can message ${claimedLead.customerEmail} directly from your Ad Agent Panel to offer bespoke ad strategy, video creative hooks, or brand customization services.`,
    ]
      .filter((line): line is string => line !== null)
      .join("\n"),
  ).slice(0, 9800);

  await sendSuperadminMessage({
    superadminUid: "system_search_lead_dispatch",
    superadminEmail: "support@aifoundation.net.au",
    recipientEmail: cleanEmail,
    subject: claimSubject,
    body: claimBody,
    requestType: "search_lead_claim",
    searchLeadId: claimedLead.leadId,
  }).catch(() => undefined);

  if (params.outreachMessage && params.outreachMessage.trim()) {
    await sendSearchLeadOutreachToCustomer({
      leadId: claimedLead.leadId,
      agent: params.agent,
      callerUid: params.callerUid,
      callerEmail: cleanEmail,
      isSuper: false,
      subject: `Customizations & Ad Strategy Help for "${claimedLead.query}"`,
      body: params.outreachMessage.trim(),
    });
  }

  return claimedLead;
}

/** Sends a direct customization message from the claiming Ad Agent to the customer's Message Panel. */
export async function sendSearchLeadOutreachToCustomer(params: {
  leadId: string;
  agent: AdAgentProfile;
  callerUid: string;
  callerEmail: string;
  isSuper: boolean;
  subject: string;
  body: string;
}) {
  const ref = db.collection(SEARCH_LEADS_COL).doc(params.leadId.trim());
  const snap = await ref.get();
  if (!snap.exists) {
    throw new ApiError("NOT_FOUND", "Search lead not found.", 404);
  }
  const lead = AdAgentSearchLeadDocSchema.parse(snap.data());
  if (lead.status !== "claimed") {
    throw new ApiError("FORBIDDEN", "Respond and claim this lead first to unlock customer messaging.", 403);
  }

  const cleanEmail = params.callerEmail.trim().toLowerCase();
  const isOwner =
    params.isSuper ||
    (lead.claimedByAgentUid && lead.claimedByAgentUid === params.callerUid) ||
    (lead.claimedByAgentEmail && lead.claimedByAgentEmail.toLowerCase() === cleanEmail) ||
    (lead.claimedByAgentId && lead.claimedByAgentId === params.agent.agentId);

  if (!isOwner) {
    throw new ApiError("FORBIDDEN", "Another Ad Agent claimed this customer lead.", 403);
  }

  const { sendSuperadminMessage, sanitizeForPlainTextArchive } = await import("./admin");
  const msg = await sendSuperadminMessage({
    superadminUid: params.callerUid,
    superadminEmail: cleanEmail,
    recipientEmail: lead.customerEmail,
    subject: sanitizeForPlainTextArchive(params.subject).slice(0, 150),
    body: sanitizeForPlainTextArchive(params.body).slice(0, 9800),
    requestType: "search_lead_outreach",
    searchLeadId: lead.leadId,
  });

  await ref.update({
    initialOutreachMessageId: msg.messageId,
    updatedAt: new Date().toISOString(),
  });

  return msg;
}

