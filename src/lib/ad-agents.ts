import "server-only";
import { randomBytes } from "node:crypto";
import { adminAuth, db, isDatabaseAdminEmail } from "./firebase-admin";
import { normalizeUserRoles } from "./rbac";
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
      agents.push({
        ...d,
        agentId: d.agentId || doc.id,
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
        phone: "+61 2 8000 0000",
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
        phone: "+61 2 8000 0000",
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
  const isSuper = isDatabaseAdminEmail(cleanEmail);
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

  // If this user exists in Firebase Auth and is a supporter, grant them ad_agent role
  if (matchedUid && !isDatabaseAdminEmail(cleanEmail)) {
    try {
      const authUser = await adminAuth.getUser(matchedUid);
      const claims = (authUser.customClaims ?? {}) as Record<string, unknown>;
      const currentRole = (claims.role as string) || "supporter";
      if (currentRole !== "superadmin" && currentRole !== "admin") {
        // Add ad_agent while keeping any other roles already assigned (e.g. agency, moderator), and write
        // the same roles to the token claims and users/{uid} so the client sees them in sync.
        const roles = normalizeUserRoles(
          [...(Array.isArray(claims.roles) ? claims.roles : []), "ad_agent"],
          currentRole,
          false,
        );
        const tier = roles.includes("agency") || roles.includes("admin") ? "agency" : "supporter";
        await adminAuth.setCustomUserClaims(matchedUid, {
          role: roles[0],
          roles,
          tier,
          isSuperAdmin: false,
          admin: roles.includes("admin"),
          ad_agent: true,
          superadmin: false,
        });
        await db.collection("users").doc(matchedUid).set(
          {
            role: roles[0],
            roles,
            tier,
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

