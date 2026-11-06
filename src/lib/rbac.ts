import "server-only";
import { adminAuth, db, isDatabaseAdmin } from "./firebase-admin";
import {
  RBAC_PERMISSIONS_LIST,
  RBAC_ROLES_LIST,
  type RbacMatrix,
  type RbacPermission,
  type RbacRole,
} from "./contracts";

const RBAC_DOC_PATH = "system_config/rbac";

export const DEFAULT_RBAC_MATRIX: RbacMatrix = {
  superadmin: [...RBAC_PERMISSIONS_LIST],
  admin: [
    "view_analytics",
    "manage_config",
    "manage_messages",
    "search_radar",
    "ai_remix",
    "manage_brands",
  ],
  ad_agent: [
    "manage_messages",
    "search_radar",
    "ai_remix",
    "manage_brands",
  ],
  moderator: [
    "view_analytics",
    "manage_messages",
    "search_radar",
    "ai_remix",
  ],
  agency: [
    "search_radar",
    "ai_remix",
    "manage_brands",
  ],
  supporter: [
    "search_radar",
    "ai_remix",
    "manage_brands",
  ],
};

export interface RbacSystemConfig {
  matrix: RbacMatrix;
  updatedAt: string;
  updatedBy: string;
}

export interface RbacUserItem {
  uid: string;
  email: string;
  displayName?: string;
  photoUrl?: string;
  role: RbacRole;
  roles: RbacRole[];
  tier: string;
  createdAt: string;
  isPermanentSuperAdmin: boolean;
  tokenBalance?: number;
}

const ROLE_PRIORITY: RbacRole[] = [
  "superadmin",
  "admin",
  "ad_agent",
  "moderator",
  "agency",
  "supporter",
];

export function normalizeUserRoles(
  rawRoles?: unknown,
  fallbackRole?: unknown,
  isSuper = false,
): RbacRole[] {
  const set = new Set<RbacRole>();
  if (isSuper) {
    set.add("superadmin");
    set.add("admin");
    set.add("ad_agent");
    set.add("supporter");
  }
  if (Array.isArray(rawRoles)) {
    for (const r of rawRoles) {
      if (typeof r === "string" && RBAC_ROLES_LIST.includes(r as RbacRole)) {
        if (!isSuper && r === "superadmin") continue;
        set.add(r as RbacRole);
      }
    }
  }
  if (typeof fallbackRole === "string" && RBAC_ROLES_LIST.includes(fallbackRole as RbacRole)) {
    if (isSuper || fallbackRole !== "superadmin") {
      set.add(fallbackRole as RbacRole);
    }
  }
  if (set.size === 0) {
    set.add(isSuper ? "superadmin" : "supporter");
  }
  return ROLE_PRIORITY.filter((r) => set.has(r));
}

/** Fetches RBAC config from Firestore or bootstraps defaults. */
export async function getRbacConfig(): Promise<RbacSystemConfig> {
  try {
    const snap = await db.doc(RBAC_DOC_PATH).get();
    if (!snap.exists) {
      const initial: RbacSystemConfig = {
        matrix: DEFAULT_RBAC_MATRIX,
        updatedAt: new Date().toISOString(),
        updatedBy: "system:bootstrap",
      };
      await db.doc(RBAC_DOC_PATH).set(initial);
      return initial;
    }
    const data = snap.data() || {};
    const rawMatrix = (data.matrix || {}) as Partial<RbacMatrix>;

    // Merge with defaults to ensure all roles exist and superadmin has all permissions
    const mergedMatrix: RbacMatrix = {
      ...DEFAULT_RBAC_MATRIX,
      ...rawMatrix,
      superadmin: [...RBAC_PERMISSIONS_LIST], // Superadmin always retains all permissions
    };

    return {
      matrix: mergedMatrix,
      updatedAt: data.updatedAt || new Date().toISOString(),
      updatedBy: data.updatedBy || "system",
    };
  } catch (err) {
    console.warn("[rbac] failed to fetch rbac config, using default", err);
    return {
      matrix: DEFAULT_RBAC_MATRIX,
      updatedAt: new Date().toISOString(),
      updatedBy: "system:fallback",
    };
  }
}

/** Updates permissions for a specific role in the matrix. */
export async function updateRolePermissions(
  role: RbacRole,
  permissions: RbacPermission[],
  updatedBy: string,
): Promise<RbacMatrix> {
  if (role === "superadmin") {
    throw new Error("Superadmin permissions are permanently locked and cannot be modified");
  }

  const current = await getRbacConfig();
  const validPermissions = Array.from(new Set(permissions)).filter((p) =>
    RBAC_PERMISSIONS_LIST.includes(p)
  );

  const updatedMatrix: RbacMatrix = {
    ...current.matrix,
    [role]: validPermissions,
    superadmin: [...RBAC_PERMISSIONS_LIST],
  };

  const nextDoc: RbacSystemConfig = {
    matrix: updatedMatrix,
    updatedAt: new Date().toISOString(),
    updatedBy,
  };

  await db.doc(RBAC_DOC_PATH).set(nextDoc);
  return updatedMatrix;
}

/** Assigns one or multiple RBAC roles to a registered user by email address. */
export async function assignUserRole(
  email: string,
  targetRoleOrRoles: Exclude<RbacRole, "superadmin"> | Exclude<RbacRole, "superadmin">[],
  updatedBy: string,
  options?: { allowMainAdmin?: boolean },
): Promise<{ uid: string; email: string; role: RbacRole; roles: RbacRole[]; tier: string }> {
  const normEmail = email.trim().toLowerCase();

  if (isDatabaseAdmin(null, normEmail)) {
    throw new Error("Cannot modify permanent database superadmin account");
  }

  const allowMainAdmin = options?.allowMainAdmin !== false;
  const inputArray = Array.isArray(targetRoleOrRoles) ? targetRoleOrRoles : [targetRoleOrRoles];
  if (!allowMainAdmin && inputArray.includes("admin")) {
    throw new Error(
      "Main Admin cannot make people Main Admin. Main Admin can only approve: Supporter, Ad Agent, Agency, Moderator."
    );
  }
  const filteredInputs = allowMainAdmin
    ? inputArray
    : inputArray.filter((r) => r !== "admin");
  const roles = normalizeUserRoles(filteredInputs, filteredInputs[0] ?? "supporter", false);
  const primaryRole = roles[0] || "supporter";
  const tier = roles.includes("agency") || roles.includes("admin") ? "agency" : "supporter";

  const newClaims = {
    role: primaryRole,
    roles,
    tier,
    isSuperAdmin: false,
    admin: roles.includes("admin"),
    ad_agent: roles.includes("ad_agent"),
    superadmin: false,
  };

  let uid = `email:${normEmail}`;
  try {
    const userRecord = await adminAuth.getUserByEmail(normEmail);
    uid = userRecord.uid;
    await adminAuth.setCustomUserClaims(userRecord.uid, newClaims);
  } catch {
    // User might exist in Firestore users collection before Firebase Auth sync
    const snap = await db.collection("users").where("email", "==", normEmail).limit(1).get();
    if (!snap.empty) {
      uid = snap.docs[0].id;
    } else {
      throw new Error(`No registered user found with email ${normEmail}`);
    }
  }

  // Keep users/{uid} in sync with both `role` (primary) and `roles` (all assigned roles)
  const now = new Date().toISOString();
  let userDisplayName = "";
  try {
    const existingUserSnap = await db.collection("users").doc(uid).get();
    if (existingUserSnap.exists) {
      userDisplayName = String(existingUserSnap.data()?.displayName || "").trim();
    }
    await db
      .collection("users")
      .doc(uid)
      .set(
        {
          email: normEmail,
          role: primaryRole,
          roles,
          tier,
          isAdAgent: roles.includes("ad_agent"),
          updatedAt: now,
          roleUpdatedBy: updatedBy,
        },
        { merge: true },
      );
  } catch {
    // Non-blocking fallback
  }

  // If the user is granted the "ad_agent" role, ensure they appear in `ad_agents` for the Ad Agent Distribution Ledger
  if (roles.includes("ad_agent")) {
    try {
      const existingAgentSnap = await db
        .collection("ad_agents")
        .where("email", "==", normEmail)
        .limit(1)
        .get();
      if (existingAgentSnap.empty) {
        const cleanUid = uid.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 16) || "user";
        const agentId = `agent_rbac_${cleanUid}`;
        await db
          .collection("ad_agents")
          .doc(agentId)
          .set(
            {
              agentId,
              uid,
              name: userDisplayName || normEmail.split("@")[0] || "Ad Agent",
              phone: "Not specified",
              email: normEmail,
              location: {
                suburb: "Sydney",
                state: "NSW",
                country: "AU",
                latitude: -33.8688,
                longitude: 151.2093,
                label: "Sydney, NSW, AU",
              },
              bankOrPayIdDetails: "",
              redistributionPercentage: 30,
              status: "active",
              isSuperAdminBuiltIn: false,
              createdAt: now,
              updatedAt: now,
            },
            { merge: true },
          );
      }
    } catch {
      // Non-blocking fallback
    }
  }

  return {
    uid,
    email: normEmail,
    role: primaryRole,
    roles,
    tier,
  };
}

/** Lists registered users for the RBAC management table. */
export async function getRbacUsersList(limitCount = 100): Promise<RbacUserItem[]> {
  try {
    const [listResult, usersSnap] = await Promise.all([
      adminAuth.listUsers(limitCount),
      db.collection("users").get(),
    ]);

    const balanceMap = new Map<string, number>();
    const firestoreRoleMap = new Map<string, RbacRole>();
    const firestoreRolesMap = new Map<string, RbacRole[]>();
    const healPromises: Promise<unknown>[] = [];
    usersSnap.forEach((doc) => {
      const data = doc.data();
      const rawBal = Number(data.tokenBalance ?? 0);
      if (!Number.isFinite(rawBal) || rawBal < 0) {
        healPromises.push(
          doc.ref.update({
            tokenBalance: 0,
            updatedAt: new Date().toISOString(),
          }).catch(() => undefined),
        );
      }
      const bal = Math.max(0, Math.round(Number.isFinite(rawBal) ? rawBal : 0));
      balanceMap.set(doc.id, bal);
      const docRoles = Array.isArray(data.roles)
        ? (data.roles.filter((r: unknown) => typeof r === "string" && RBAC_ROLES_LIST.includes(r as RbacRole)) as RbacRole[])
        : undefined;
      if (data.email) {
        const cleanEmail = String(data.email).toLowerCase().trim();
        balanceMap.set(cleanEmail, bal);
        if (data.role && RBAC_ROLES_LIST.includes(data.role as RbacRole)) {
          firestoreRoleMap.set(cleanEmail, data.role as RbacRole);
        }
        if (docRoles && docRoles.length > 0) {
          firestoreRolesMap.set(cleanEmail, docRoles);
        }
      }
      if (data.role && RBAC_ROLES_LIST.includes(data.role as RbacRole)) {
        firestoreRoleMap.set(doc.id, data.role as RbacRole);
      }
      if (docRoles && docRoles.length > 0) {
        firestoreRolesMap.set(doc.id, docRoles);
      }
    });
    if (healPromises.length > 0) {
      await Promise.all(healPromises);
    }

    const seenEmails = new Set<string>();
    const combined: RbacUserItem[] = listResult.users.map((u) => {
      const email = (u.email || "").toLowerCase().trim();
      if (email) seenEmails.add(email);
      const isSuper = isDatabaseAdmin(u.customClaims, email);
      const claimRole = u.customClaims?.role as RbacRole | undefined;
      const claimRoles = u.customClaims?.roles as RbacRole[] | undefined;
      const docRole = firestoreRoleMap.get(u.uid) || firestoreRoleMap.get(email);
      const docRoles = firestoreRolesMap.get(u.uid) || firestoreRolesMap.get(email);
      const rawRole = claimRole || docRole || (isSuper ? "superadmin" : "supporter");
      const roles = normalizeUserRoles(docRoles || claimRoles, rawRole, isSuper);
      const role: RbacRole = isSuper ? "superadmin" : roles[0] || "supporter";
      const tier =
        (u.customClaims?.tier as string) ||
        (roles.includes("agency") || roles.includes("admin") || isSuper ? "agency" : "supporter");
      const tokenBalance = balanceMap.get(u.uid) ?? balanceMap.get(email) ?? 0;

      return {
        uid: u.uid,
        email,
        displayName: u.displayName || undefined,
        photoUrl: u.photoURL || undefined,
        role,
        roles,
        tier,
        createdAt: u.metadata.creationTime || new Date().toISOString(),
        isPermanentSuperAdmin: isSuper,
        tokenBalance,
      };
    });

    // Also include any Firestore user documents not yet in listResult.users
    usersSnap.forEach((doc) => {
      const data = doc.data();
      const email = String(data.email || "").toLowerCase().trim();
      if (!email || seenEmails.has(email)) return;
      seenEmails.add(email);
      const isSuper = isDatabaseAdmin(null, email);
      const rawRole = (data.role as RbacRole) || (isSuper ? "superadmin" : "supporter");
      const roles = normalizeUserRoles(data.roles, rawRole, isSuper);
      const role: RbacRole = isSuper ? "superadmin" : roles[0] || "supporter";
      const tier = roles.includes("agency") || roles.includes("admin") || isSuper ? "agency" : "supporter";
      const tokenBalance = balanceMap.get(doc.id) ?? balanceMap.get(email) ?? 0;
      combined.push({
        uid: doc.id,
        email,
        displayName: typeof data.displayName === "string" ? data.displayName : undefined,
        role,
        roles,
        tier,
        createdAt: typeof data.createdAt === "string" ? data.createdAt : new Date().toISOString(),
        isPermanentSuperAdmin: isSuper,
        tokenBalance,
      });
    });

    return combined;
  } catch (err) {
    console.error("[rbac] failed to list users for rbac", err);
    return [];
  }
}
