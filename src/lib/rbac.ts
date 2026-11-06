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
  tier: string;
  createdAt: string;
  isPermanentSuperAdmin: boolean;
  tokenBalance?: number;
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

/** Assigns a role to a registered user by email address. */
export async function assignUserRole(
  email: string,
  targetRole: Exclude<RbacRole, "superadmin">,
  updatedBy: string,
): Promise<{ uid: string; email: string; role: RbacRole; tier: string }> {
  const normEmail = email.trim().toLowerCase();

  if (isDatabaseAdmin(null, normEmail)) {
    throw new Error("Cannot modify permanent database superadmin account");
  }

  const tier = targetRole === "agency" || targetRole === "admin" ? "agency" : "supporter";
  const newClaims = {
    role: targetRole,
    tier,
    isSuperAdmin: false,
    admin: targetRole === "admin",
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

  // Keep users/{uid} in sync
  try {
    await db
      .collection("users")
      .doc(uid)
      .set(
        {
          email: normEmail,
          role: targetRole,
          tier,
          updatedAt: new Date().toISOString(),
          roleUpdatedBy: updatedBy,
        },
        { merge: true },
      );
  } catch {
    // Non-blocking fallback
  }

  return {
    uid,
    email: normEmail,
    role: targetRole,
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
      if (data.email) {
        const cleanEmail = String(data.email).toLowerCase().trim();
        balanceMap.set(cleanEmail, bal);
        if (data.role && RBAC_ROLES_LIST.includes(data.role as RbacRole)) {
          firestoreRoleMap.set(cleanEmail, data.role as RbacRole);
        }
      }
      if (data.role && RBAC_ROLES_LIST.includes(data.role as RbacRole)) {
        firestoreRoleMap.set(doc.id, data.role as RbacRole);
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
      const docRole = firestoreRoleMap.get(u.uid) || firestoreRoleMap.get(email);
      const rawRole = claimRole || docRole || (isSuper ? "superadmin" : "supporter");
      const role: RbacRole = isSuper ? "superadmin" : (RBAC_ROLES_LIST.includes(rawRole) ? rawRole : "supporter");
      const tier =
        (u.customClaims?.tier as string) ||
        (role === "agency" || role === "admin" || isSuper ? "agency" : "supporter");
      const tokenBalance = balanceMap.get(u.uid) ?? balanceMap.get(email) ?? 0;

      return {
        uid: u.uid,
        email,
        displayName: u.displayName || undefined,
        photoUrl: u.photoURL || undefined,
        role,
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
      const role: RbacRole = isSuper ? "superadmin" : (RBAC_ROLES_LIST.includes(rawRole) ? rawRole : "supporter");
      const tier = role === "agency" || role === "admin" || isSuper ? "agency" : "supporter";
      const tokenBalance = balanceMap.get(doc.id) ?? balanceMap.get(email) ?? 0;
      combined.push({
        uid: doc.id,
        email,
        displayName: typeof data.displayName === "string" ? data.displayName : undefined,
        role,
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
