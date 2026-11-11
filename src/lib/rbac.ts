import "server-only";
import { adminAuth, db, isDatabaseAdminEmail, type VerifiedCaller } from "./firebase-admin";
import { ApiError } from "./api";
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

const PERMISSION_LABELS: Record<RbacPermission, string> = {
  view_analytics: "View Analytics",
  manage_config: "System Config",
  manage_ledger: "Redistributive Ledger",
  flush_cache: "Flush Cache",
  manage_messages: "Manage Messages",
  manage_rbac: "Manage RBAC",
  manage_users: "Manage Users",
  search_radar: "Search AdRadarHQ",
  ai_remix: "AI Remix Studio",
  manage_brands: "Manage Brands",
};

/**
 * The permissions the caller holds: everything for Super Admin, otherwise the union of what each of
 * the caller's roles has ticked in the Role Permissions matrix (system_config/rbac). A caller whose
 * roles aren't in the matrix (e.g. a legacy "user" role) gets the Supporter permissions.
 *
 * The matrix only narrows access: admin endpoints still require the admin role as well, so ticking
 * e.g. "Manage Messages" for Ad Agents never opens the admin inbox to them.
 */
export async function getCallerPermissions(caller: VerifiedCaller): Promise<Set<RbacPermission>> {
  if (caller.claims.isSuperAdmin === true) return new Set(RBAC_PERMISSIONS_LIST);
  const { matrix } = await getRbacConfig();
  const granted = new Set<RbacPermission>();
  let knownRole = false;
  for (const role of new Set<string>([caller.claims.role, ...(caller.claims.roles ?? [])])) {
    if (role === "superadmin") continue;
    const list = matrix[role as RbacRole];
    if (!Array.isArray(list)) continue;
    knownRole = true;
    for (const p of list) if (RBAC_PERMISSIONS_LIST.includes(p)) granted.add(p);
  }
  if (!knownRole) {
    for (const p of matrix.supporter ?? []) if (RBAC_PERMISSIONS_LIST.includes(p)) granted.add(p);
  }
  return granted;
}

/** Throws FORBIDDEN unless `permissions` contains `permission`. */
export function assertPermission(permissions: Set<RbacPermission>, permission: RbacPermission): void {
  if (!permissions.has(permission)) {
    throw new ApiError(
      "FORBIDDEN",
      `Your role doesn't have the "${PERMISSION_LABELS[permission]}" permission. Super Admin can turn it on under Role Permissions.`,
      403,
    );
  }
}

/** Throws FORBIDDEN unless the caller holds `permission` (Super Admin always does). */
export async function requirePermission(caller: VerifiedCaller, permission: RbacPermission): Promise<void> {
  assertPermission(await getCallerPermissions(caller), permission);
}

/** Updates permissions for a specific role in the matrix. */
export async function updateRolePermissions(
  role: RbacRole,
  permissions: RbacPermission[],
  updatedBy: string,
): Promise<RbacMatrix> {
  if (role === "superadmin") {
    throw new ApiError("FORBIDDEN", "Superadmin permissions are permanently locked and cannot be modified", 403);
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

  if (isDatabaseAdminEmail(normEmail)) {
    throw new ApiError("FORBIDDEN", "Cannot modify permanent database superadmin account", 403);
  }

  const allowMainAdmin = options?.allowMainAdmin !== false;
  const inputArray = Array.isArray(targetRoleOrRoles) ? targetRoleOrRoles : [targetRoleOrRoles];
  if (!allowMainAdmin && inputArray.includes("admin")) {
    throw new ApiError(
      "FORBIDDEN",
      "Main Admin cannot make people Main Admin. Main Admin can only approve: Supporter, Ad Agent, Agency, Moderator.",
      403,
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
  let authUid: string | null = null;
  let previousRoles: RbacRole[] = [];
  try {
    const userRecord = await adminAuth.getUserByEmail(normEmail);
    uid = userRecord.uid;
    authUid = userRecord.uid;
    previousRoles = normalizeUserRoles(userRecord.customClaims?.roles, userRecord.customClaims?.role, false);
  } catch {
    // User might exist in Firestore users collection before Firebase Auth sync
    const snap = await db.collection("users").where("email", "==", normEmail).limit(1).get();
    if (!snap.empty) {
      uid = snap.docs[0].id;
    } else {
      throw new ApiError("NOT_FOUND", `No registered user found with email ${normEmail}`, 404);
    }
  }

  if (authUid) {
    await adminAuth.setCustomUserClaims(authUid, newClaims);
    // A removed role must stop working now, not when the user's ID token next refreshes (up to an hour):
    // revoking makes verifyRequest (which checks revocation) reject the old token, so they sign in again.
    if (previousRoles.some((r) => r !== "supporter" && !roles.includes(r))) {
      await adminAuth.revokeRefreshTokens(authUid);
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

  // If the user is granted the "ad_agent" role, ensure their Ad Agent record exists in `ad_agents`
  // so they are always available in the Ad Agent panel records and can be activated one-by-one when required.
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
              status: "inactive",
              inActiveLedger: false,
              isSuperAdminBuiltIn: false,
              createdAt: now,
              updatedAt: now,
            },
            { merge: true },
          );
      } else {
        const existingDoc = existingAgentSnap.docs[0];
        const existingData = existingDoc.data() || {};
        await existingDoc.ref.set(
          {
            ...(existingData.uid ? {} : { uid }),
            ...(existingData.name ? {} : { name: userDisplayName || normEmail.split("@")[0] || "Ad Agent" }),
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

/** Deletes a registered user account from Firebase Authentication and Firestore `users` directory. */
export async function deleteRegisteredUser(
  params: { uid: string; email?: string },
  caller: { uid: string; email: string; allowDeleteAdmin?: boolean },
): Promise<{ deletedUid: string; deletedEmail: string }> {
  const rawUid = params.uid.trim();
  let normEmail = (params.email || "").trim().toLowerCase();

  let authUid: string | null = null;
  let targetRoles: RbacRole[] = [];

  if (!rawUid.startsWith("email:")) {
    try {
      const authRecord = await adminAuth.getUser(rawUid);
      authUid = authRecord.uid;
      if (authRecord.email) {
        normEmail = authRecord.email.trim().toLowerCase();
      }
      targetRoles = normalizeUserRoles(authRecord.customClaims?.roles, authRecord.customClaims?.role, false);
    } catch {
      // May only exist in Firestore `users`
    }
  }

  if (!authUid && normEmail) {
    try {
      const authByEmail = await adminAuth.getUserByEmail(normEmail);
      authUid = authByEmail.uid;
      targetRoles = normalizeUserRoles(authByEmail.customClaims?.roles, authByEmail.customClaims?.role, false);
    } catch {
      // Not in Firebase Auth
    }
  }

  const userDocSnap = await db.collection("users").doc(rawUid).get();
  if (userDocSnap.exists) {
    const docData = userDocSnap.data() || {};
    if (!normEmail && typeof docData.email === "string") {
      normEmail = docData.email.trim().toLowerCase();
    }
    if (targetRoles.length === 0) {
      targetRoles = normalizeUserRoles(docData.roles, docData.role, false);
    }
  }

  if (!authUid && !userDocSnap.exists && !normEmail) {
    throw new ApiError("NOT_FOUND", "User account not found", 404);
  }

  if (normEmail && isDatabaseAdminEmail(normEmail)) {
    throw new ApiError("FORBIDDEN", "Cannot delete permanent database Super Admin account", 403);
  }

  const callerEmailNorm = (caller.email || "").trim().toLowerCase();
  if (
    rawUid === caller.uid ||
    (authUid && authUid === caller.uid) ||
    (normEmail && callerEmailNorm && normEmail === callerEmailNorm)
  ) {
    throw new ApiError("FORBIDDEN", "You cannot delete your own currently signed-in account", 403);
  }

  if (!caller.allowDeleteAdmin && (targetRoles.includes("admin") || targetRoles.includes("superadmin"))) {
    throw new ApiError("FORBIDDEN", "Main Admin cannot delete Super Admin or Main Admin accounts", 403);
  }

  if (authUid) {
    await adminAuth.revokeRefreshTokens(authUid).catch(() => undefined);
    await adminAuth.deleteUser(authUid).catch((err: { code?: string }) => {
      if (err?.code !== "auth/user-not-found") {
        throw err;
      }
    });
  }

  const docIdsToDelete = new Set<string>([rawUid]);
  if (authUid) docIdsToDelete.add(authUid);
  if (normEmail) {
    docIdsToDelete.add(`email:${normEmail}`);
    const byEmailSnap = await db.collection("users").where("email", "==", normEmail).get();
    byEmailSnap.forEach((d) => docIdsToDelete.add(d.id));
  }

  const batch = db.batch();
  for (const id of docIdsToDelete) {
    batch.delete(db.collection("users").doc(id));
  }

  const targetUids = Array.from(new Set([rawUid, ...(authUid ? [authUid] : [])]));
  for (const tUid of targetUids) {
    const brandsSnap = await db.collection("brands").where("uid", "==", tUid).limit(100).get();
    brandsSnap.forEach((bDoc) => batch.delete(bDoc.ref));
  }

  if (normEmail) {
    const agentSnap = await db.collection("ad_agents").where("email", "==", normEmail).get();
    const now = new Date().toISOString();
    agentSnap.forEach((aDoc) => {
      if (aDoc.data()?.isSuperAdminBuiltIn !== true) {
        batch.set(
          aDoc.ref,
          {
            inActiveLedger: false,
            status: "inactive",
            updatedAt: now,
          },
          { merge: true },
        );
      }
    });
  }

  await batch.commit();

  return {
    deletedUid: authUid || rawUid,
    deletedEmail: normEmail || rawUid,
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
      const isSuper = isDatabaseAdminEmail(email);
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
      const isSuper = isDatabaseAdminEmail(email);
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
