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
    "manage_ledger",
    "flush_cache",
    "manage_messages",
    "manage_users",
    "search_radar",
    "ai_remix",
    "manage_brands",
  ],
  moderator: [
    "view_analytics",
    "flush_cache",
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

  const userRecord = await adminAuth.getUserByEmail(normEmail);
  const tier = targetRole === "agency" || targetRole === "admin" ? "agency" : "supporter";

  const newClaims = {
    role: targetRole,
    tier,
    isSuperAdmin: false,
    admin: targetRole === "admin",
    superadmin: false,
  };

  await adminAuth.setCustomUserClaims(userRecord.uid, newClaims);

  // Keep users/{uid} in sync
  try {
    await db.collection("users").doc(userRecord.uid).update({
      role: targetRole,
      tier,
      updatedAt: new Date().toISOString(),
      roleUpdatedBy: updatedBy,
    });
  } catch {
    // If doc does not exist yet, it will be initialized on their next login via /api/me
  }

  return {
    uid: userRecord.uid,
    email: normEmail,
    role: targetRole,
    tier,
  };
}

/** Lists registered users for the RBAC management table. */
export async function getRbacUsersList(limitCount = 100): Promise<RbacUserItem[]> {
  try {
    const listResult = await adminAuth.listUsers(limitCount);
    return listResult.users.map((u) => {
      const email = (u.email || "").toLowerCase().trim();
      const isSuper = isDatabaseAdmin(u.customClaims, email);
      const rawRole = (u.customClaims?.role as RbacRole) || (isSuper ? "superadmin" : "supporter");
      const role: RbacRole = isSuper ? "superadmin" : (RBAC_ROLES_LIST.includes(rawRole) ? rawRole : "supporter");
      const tier = (u.customClaims?.tier as string) || (isSuper ? "agency" : "supporter");

      return {
        uid: u.uid,
        email,
        displayName: u.displayName || undefined,
        photoUrl: u.photoURL || undefined,
        role,
        tier,
        createdAt: u.metadata.creationTime || new Date().toISOString(),
        isPermanentSuperAdmin: isSuper,
      };
    });
  } catch (err) {
    console.error("[rbac] failed to list users for rbac", err);
    return [];
  }
}
