import "server-only";
import type { UserRecord } from "firebase-admin/auth";
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

const LEGACY_PRE_SEEDED_PERMISSIONS: readonly RbacPermission[] = [
  "view_analytics",
  "manage_config",
  "manage_ledger",
  "flush_cache",
  "manage_messages",
  "manage_rbac",
  "manage_users",
  "search_radar",
  "ai_remix",
  "manage_brands",
];

export const DEFAULT_RBAC_MATRIX: RbacMatrix = {
  superadmin: [...RBAC_PERMISSIONS_LIST],
  admin: [
    "view_analytics",
    "manage_config",
    "manage_messages",
    "search_radar",
    "ai_remix",
    "manage_brands",
    "submit_rag_translations",
    "approve_rag_translations",
  ],
  ad_agent: [
    "manage_messages",
    "search_radar",
    "ai_remix",
    "manage_brands",
    "submit_rag_translations",
    "approve_rag_translations",
  ],
  moderator: [
    "view_analytics",
    "manage_messages",
    "search_radar",
    "ai_remix",
    "submit_rag_translations",
  ],
  agency: [
    "search_radar",
    "ai_remix",
    "manage_brands",
    "submit_rag_translations",
  ],
  supporter: [
    "search_radar",
    "ai_remix",
    "manage_brands",
    "submit_rag_translations",
  ],
};

export interface RbacSystemConfig {
  matrix: RbacMatrix;
  seededPermissions?: string[];
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
        seededPermissions: [...RBAC_PERMISSIONS_LIST],
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

    // One-time additive seed for newly added RBAC capabilities onto existing Firestore matrices
    const alreadySeeded = new Set<string>(
      Array.isArray(data.seededPermissions)
        ? (data.seededPermissions as string[])
        : LEGACY_PRE_SEEDED_PERMISSIONS,
    );
    const unseeded = RBAC_PERMISSIONS_LIST.filter((p) => !alreadySeeded.has(p));
    if (unseeded.length > 0) {
      for (const r of RBAC_ROLES_LIST) {
        if (r === "superadmin") continue;
        const currentForRole = Array.isArray(mergedMatrix[r]) ? mergedMatrix[r] : [];
        const nextSet = new Set<RbacPermission>(currentForRole);
        for (const p of unseeded) {
          if (DEFAULT_RBAC_MATRIX[r].includes(p)) {
            nextSet.add(p);
          }
        }
        mergedMatrix[r] = Array.from(nextSet);
      }
      const seededDoc: RbacSystemConfig = {
        matrix: mergedMatrix,
        seededPermissions: [...RBAC_PERMISSIONS_LIST],
        updatedAt: data.updatedAt || new Date().toISOString(),
        updatedBy: data.updatedBy || "system:seed-permissions",
      };
      await db.doc(RBAC_DOC_PATH).set(seededDoc, { merge: true }).catch(() => undefined);
      return seededDoc;
    }

    return {
      matrix: mergedMatrix,
      seededPermissions: Array.isArray(data.seededPermissions)
        ? (data.seededPermissions as string[])
        : [...RBAC_PERMISSIONS_LIST],
      updatedAt: data.updatedAt || new Date().toISOString(),
      updatedBy: data.updatedBy || "system",
    };
  } catch (err) {
    console.warn("[rbac] failed to fetch rbac config, using default", err);
    return {
      matrix: DEFAULT_RBAC_MATRIX,
      seededPermissions: [...RBAC_PERMISSIONS_LIST],
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
  submit_rag_translations: "Create RAG Translations",
  approve_rag_translations: "Approve RAG Translations",
};

export interface CallerRbacContext {
  isSuper: boolean;
  primaryRole: RbacRole;
  roles: RbacRole[];
  permissions: Set<RbacPermission>;
  canSubmitRagTranslations: boolean;
  canApproveRagTranslations: boolean;
  canPublishFaq: boolean;
  canSyncCorpus: boolean;
}

/**
 * Resolves live roles and effective RBAC permissions for an authenticated caller.
 * Combines Firebase custom claims with live Firestore user roles so multi-role assignments
 * (such as Main Admin or Ad Agent) take effect immediately without waiting for token refresh.
 * Only verified permanent database Super Admins may pass `actingRole` to preview other roles.
 */
export async function resolveCallerRbacContext(
  caller: VerifiedCaller,
  actingRole?: string,
): Promise<CallerRbacContext> {
  const { matrix } = await getRbacConfig();
  const isTrueSuper = caller.claims.isSuperAdmin === true;

  if (isTrueSuper) {
    if (
      actingRole &&
      actingRole !== "superadmin" &&
      RBAC_ROLES_LIST.includes(actingRole as RbacRole)
    ) {
      const simRole = actingRole as RbacRole;
      const perms = new Set<RbacPermission>(
        (matrix[simRole] ?? []).filter((p) => RBAC_PERMISSIONS_LIST.includes(p)),
      );
      return {
        isSuper: false,
        primaryRole: simRole,
        roles: [simRole],
        permissions: perms,
        canSubmitRagTranslations: perms.has("submit_rag_translations"),
        canApproveRagTranslations:
          (simRole === "admin" || simRole === "ad_agent") &&
          perms.has("approve_rag_translations"),
        canPublishFaq: simRole === "admin" && perms.has("manage_config"),
        canSyncCorpus:
          simRole === "admin" &&
          (perms.has("manage_config") || perms.has("approve_rag_translations")),
      };
    }

    return {
      isSuper: true,
      primaryRole: "superadmin",
      roles: ["superadmin", "admin", "ad_agent", "supporter"],
      permissions: new Set(RBAC_PERMISSIONS_LIST),
      canSubmitRagTranslations: true,
      canApproveRagTranslations: true,
      canPublishFaq: true,
      canSyncCorpus: true,
    };
  }

  // Non-superadmin: strictly ignore actingRole and merge claims + Firestore user doc roles
  const userSnap = await db.collection("users").doc(caller.uid).get().catch(() => null);
  const userData = userSnap?.exists ? userSnap.data() : undefined;
  const docRoles = Array.isArray(userData?.roles) ? userData.roles : [];
  const claimRoles = Array.isArray(caller.claims.roles) ? caller.claims.roles : [];
  const combinedRoles = normalizeUserRoles(
    [...claimRoles, ...docRoles, caller.claims.role, userData?.role],
    caller.claims.role || userData?.role || "supporter",
    false,
  );
  const primaryRole = combinedRoles[0] || "supporter";
  const perms = new Set<RbacPermission>();
  let knownRole = false;
  for (const r of combinedRoles) {
    const list = matrix[r];
    if (!Array.isArray(list)) continue;
    knownRole = true;
    for (const p of list) {
      if (RBAC_PERMISSIONS_LIST.includes(p)) perms.add(p);
    }
  }
  if (!knownRole) {
    for (const p of matrix.supporter ?? []) {
      if (RBAC_PERMISSIONS_LIST.includes(p)) perms.add(p);
    }
  }

  return {
    isSuper: false,
    primaryRole,
    roles: combinedRoles,
    permissions: perms,
    canSubmitRagTranslations: perms.has("submit_rag_translations"),
    canApproveRagTranslations:
      combinedRoles.some((r) => r === "admin" || r === "ad_agent") &&
      perms.has("approve_rag_translations"),
    canPublishFaq:
      combinedRoles.includes("admin") && perms.has("manage_config"),
    canSyncCorpus:
      combinedRoles.includes("admin") &&
      (perms.has("manage_config") || perms.has("approve_rag_translations")),
  };
}

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
    seededPermissions: [...RBAC_PERMISSIONS_LIST],
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

  // Only Super Admin may grant or remove Main Admin; the caller must say so explicitly.
  const allowMainAdmin = options?.allowMainAdmin === true;
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

  let uid: string;
  try {
    uid = (await adminAuth.getUserByEmail(normEmail)).uid;
  } catch {
    // User might exist in Firestore users collection before Firebase Auth sync
    const snap = await db.collection("users").where("email", "==", normEmail).limit(1).get();
    if (snap.empty) {
      throw new ApiError("NOT_FOUND", `No registered user found with email ${normEmail}`, 404);
    }
    uid = snap.docs[0].id;
  }

  // users/{uid} in this database is the only record of a person's Ad Radar roles: verifyRequest and the
  // Firestore rules read it on every request, so a change (including a removed role) applies immediately.
  // Custom claims on the Firebase Auth account are deliberately left alone, because that account is shared
  // with the other apps in the Firebase project.
  const now = new Date().toISOString();
  const existingUserSnap = await db.collection("users").doc(uid).get();
  const existingRoles = normalizeUserRoles(existingUserSnap.get("roles"), existingUserSnap.get("role"), false);
  if (!allowMainAdmin && existingRoles.includes("admin")) {
    throw new ApiError("FORBIDDEN", "Only Super Admin can change a Main Admin's roles.", 403);
  }
  const userDisplayName = existingUserSnap.exists
    ? String(existingUserSnap.data()?.displayName || "").trim()
    : "";
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

/**
 * Removes a user from Ad Radar: their users/{uid} record with everything under it (brands, Library purchases),
 * the community copies of their brands in global_brands, and their place in the Ad Agent routing list. Their
 * public remixes and remixed ad texts stop being offered in the Library (buyers keep what they bought).
 *
 * Their Firebase Auth account is deliberately left alone: it's shared with the other apps in the Firebase
 * project, so deleting it or revoking its sessions would remove them from those apps too. If they sign in to
 * Ad Radar again they start over as a new Supporter. token_transactions, stripe_purchases, admin_messages and
 * customize_requests are kept for the 7-year statutory retention period.
 */
export async function deleteRegisteredUser(
  params: { uid: string; email?: string },
  caller: { uid: string; email: string; allowDeleteAdmin?: boolean },
): Promise<{ deletedUid: string; deletedEmail: string }> {
  const rawUid = params.uid.trim();
  let normEmail = (params.email || "").trim().toLowerCase();

  // Read-only Auth lookups, used only to find which users/{uid} records and email belong to this person.
  let authUid: string | null = null;
  if (!rawUid.startsWith("email:")) {
    try {
      const authRecord = await adminAuth.getUser(rawUid);
      authUid = authRecord.uid;
      if (authRecord.email) {
        normEmail = authRecord.email.trim().toLowerCase();
      }
    } catch {
      // May only exist in Firestore `users`
    }
  }
  if (!authUid && normEmail) {
    try {
      authUid = (await adminAuth.getUserByEmail(normEmail)).uid;
    } catch {
      // Not in Firebase Auth
    }
  }

  // The person's Ad Radar records: by uid, by Auth uid, and any other record with the same email.
  const recordSnaps = [await db.collection("users").doc(rawUid).get()];
  if (authUid && authUid !== rawUid) recordSnaps.push(await db.collection("users").doc(authUid).get());
  for (const snap of recordSnaps) {
    const docEmail = snap.get("email");
    if (!normEmail && typeof docEmail === "string") normEmail = docEmail.trim().toLowerCase();
  }
  if (normEmail) {
    const byEmailSnap = await db.collection("users").where("email", "==", normEmail).get();
    recordSnaps.push(...byEmailSnap.docs);
  }
  const records = new Map(recordSnaps.filter((s) => s.exists).map((s) => [s.id, s]));
  if (records.size === 0) {
    throw new ApiError("NOT_FOUND", "This person has no Ad Radar account.", 404);
  }

  // Roles come from those records (where Super Admin appoints Main Admins), never from Auth claims.
  const roleCandidates: unknown[] = [];
  for (const snap of records.values()) {
    const docRoles: unknown = snap.get("roles");
    if (Array.isArray(docRoles)) roleCandidates.push(...docRoles);
    roleCandidates.push(snap.get("role"));
  }
  const targetRoles: RbacRole[] = normalizeUserRoles(roleCandidates, undefined, false);

  if (normEmail && isDatabaseAdminEmail(normEmail)) {
    throw new ApiError("FORBIDDEN", "Cannot delete permanent database Super Admin account", 403);
  }

  const callerEmailNorm = (caller.email || "").trim().toLowerCase();
  if (
    records.has(caller.uid) ||
    (authUid && authUid === caller.uid) ||
    (normEmail && callerEmailNorm && normEmail === callerEmailNorm)
  ) {
    throw new ApiError("FORBIDDEN", "You cannot delete your own currently signed-in account", 403);
  }

  if (!caller.allowDeleteAdmin && (targetRoles.includes("admin") || targetRoles.includes("superadmin"))) {
    throw new ApiError("FORBIDDEN", "Main Admin cannot delete Super Admin or Main Admin accounts", 403);
  }

  // Community copies of their brands (found by author while the brands still exist) and Ad Agent routing.
  const ownerUids = [...records.keys()].filter((id) => !id.startsWith("email:"));
  const [globalCopySnaps, agentSnap] = await Promise.all([
    Promise.all(ownerUids.map((uid) => db.collection("global_brands").where("authorUid", "==", uid).get())),
    normEmail ? db.collection("ad_agents").where("email", "==", normEmail).get() : Promise.resolve(null),
  ]);
  const batch = db.batch();
  for (const snap of globalCopySnaps) snap.forEach((d) => batch.delete(d.ref));
  const now = new Date().toISOString();
  agentSnap?.forEach((aDoc) => {
    if (aDoc.data()?.isSuperAdminBuiltIn !== true) {
      batch.set(aDoc.ref, { inActiveLedger: false, status: "inactive", updatedAt: now }, { merge: true });
    }
  });
  await batch.commit();

  // Their public remixes and remixed ad texts stop being offered in the Library.
  const publishedSnaps = await Promise.all(
    ownerUids.flatMap((uid) => [
      db.collection("remixes").where("uid", "==", uid).where("isPublic", "==", true).get(),
      db.collection("remixed_ad_texts").where("uid", "==", uid).where("isPublic", "==", true).get(),
    ]),
  );
  const publishedRefs = publishedSnaps.flatMap((s) => s.docs.map((d) => d.ref));
  for (let i = 0; i < publishedRefs.length; i += 400) {
    const unpublish = db.batch();
    for (const ref of publishedRefs.slice(i, i + 400)) unpublish.update(ref, { isPublic: false });
    await unpublish.commit();
  }

  // Their users/{uid} records with all subcollections (brands, library_purchases). Firestore doesn't delete a
  // document's subcollections with it, hence recursiveDelete.
  for (const ref of [...records.values()].map((s) => s.ref)) {
    await db.recursiveDelete(ref);
  }

  return {
    deletedUid: authUid || rawUid,
    deletedEmail: normEmail || rawUid,
  };
}

/**
 * Lists Ad Radar's users for the RBAC table: everyone with a users/{uid} record in this database (they've signed
 * in to Ad Radar, or been given a role or tokens here). People who only use the other apps in the shared Firebase
 * project never appear. Names, photos and sign-up dates are looked up in Auth for these users only.
 */
export async function getRbacUsersList(): Promise<RbacUserItem[]> {
  try {
    const [usersSnap, adAgentsSnap] = await Promise.all([
      db.collection("users").get(),
      db.collection("ad_agents").get().catch(() => null),
    ]);

    // Auth details for Ad Radar's users only (getUsers takes up to 100 uids per call). Best effort: a failed
    // lookup just means no photo or Auth name for those rows.
    const authUsers = new Map<string, UserRecord>();
    const uids = usersSnap.docs.map((d) => d.id).filter((id) => !id.startsWith("email:"));
    for (let i = 0; i < uids.length; i += 100) {
      const { users } = await adminAuth
        .getUsers(uids.slice(i, i + 100).map((uid) => ({ uid })))
        .catch((err) => {
          console.warn("[rbac] couldn't look up Auth details for some users", err);
          return { users: [] as UserRecord[] };
        });
      for (const u of users) authUsers.set(u.uid, u);
    }

    const agentNames = new Map<string, string>();
    adAgentsSnap?.forEach((doc) => {
      const data = doc.data();
      const agentName = typeof data.name === "string" ? data.name.trim() : "";
      if (!agentName || agentName === "Ad Agent") return;
      agentNames.set(doc.id, agentName);
      if (typeof data.uid === "string" && data.uid.trim()) {
        agentNames.set(data.uid.trim(), agentName);
      }
      if (typeof data.email === "string" && data.email.trim()) {
        agentNames.set(data.email.toLowerCase().trim(), agentName);
      }
    });

    // Records backed by an Auth account come first, so if two records share an email the real account is shown.
    const docs = [...usersSnap.docs].sort((a, b) => Number(authUsers.has(b.id)) - Number(authUsers.has(a.id)));
    const seenEmails = new Set<string>();
    const healPromises: Promise<unknown>[] = [];
    const list: RbacUserItem[] = [];
    for (const doc of docs) {
      const data = doc.data();
      const auth = authUsers.get(doc.id);
      const email = String(data.email || auth?.email || "").toLowerCase().trim();
      if (email && seenEmails.has(email)) continue;
      if (email) seenEmails.add(email);

      const rawBal = Number(data.tokenBalance ?? 0);
      if (!Number.isFinite(rawBal) || rawBal < 0) {
        healPromises.push(
          doc.ref.update({ tokenBalance: 0, updatedAt: new Date().toISOString() }).catch(() => undefined),
        );
      }
      const isSuper = isDatabaseAdminEmail(email);
      // The roles Ad Radar acts on: this users/{uid} record. Claims on the shared Auth account are ignored.
      const roles = normalizeUserRoles(data.roles, data.role || (isSuper ? "superadmin" : "supporter"), isSuper);
      const docName =
        (typeof data.displayName === "string" ? data.displayName.trim() : "") ||
        (typeof data.name === "string" ? data.name.trim() : "");

      list.push({
        uid: doc.id,
        email,
        displayName:
          auth?.displayName?.trim() || docName || agentNames.get(doc.id) || agentNames.get(email) || undefined,
        photoUrl: auth?.photoURL || undefined,
        role: isSuper ? "superadmin" : roles[0] || "supporter",
        roles,
        tier: roles.includes("agency") || roles.includes("admin") || isSuper ? "agency" : "supporter",
        createdAt:
          auth?.metadata.creationTime ||
          (typeof data.createdAt === "string" ? data.createdAt : new Date().toISOString()),
        isPermanentSuperAdmin: isSuper,
        tokenBalance: Math.max(0, Math.round(Number.isFinite(rawBal) ? rawBal : 0)),
      });
    }
    if (healPromises.length > 0) {
      await Promise.all(healPromises);
    }

    return list;
  } catch (err) {
    console.error("[rbac] failed to list users for rbac", err);
    return [];
  }
}
