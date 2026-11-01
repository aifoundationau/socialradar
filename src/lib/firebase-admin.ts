import "server-only";
import { cert, getApps, initializeApp, applicationDefault, type App } from "firebase-admin/app";
import { getAuth, type DecodedIdToken } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { CustomClaimsSchema, type CustomClaims } from "./contracts";

/** Named Firestore database (nam5, Standard, native). */
export const FIRESTORE_DATABASE_ID = process.env.FIRESTORE_DATABASE_ID || "ad-radar";

/**
 * Credential resolution order (no hardcoded secrets):
 * 1. FIREBASE_SERVICE_ACCOUNT_BASE64 — base64 of the service-account JSON (recommended on Vercel)
 * 2. FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY
 * 3. Application Default Credentials (local `gcloud auth application-default login`, GCP runtimes)
 */
function createAdminApp(): App {
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (b64) {
    const json = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
    return initializeApp({ credential: cert(json), projectId: json.project_id });
  }
  const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = process.env;
  if (FIREBASE_PROJECT_ID && FIREBASE_CLIENT_EMAIL && FIREBASE_PRIVATE_KEY) {
    return initializeApp({
      credential: cert({
        projectId: FIREBASE_PROJECT_ID,
        clientEmail: FIREBASE_CLIENT_EMAIL,
        privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
      }),
      projectId: FIREBASE_PROJECT_ID,
    });
  }
  return initializeApp({ credential: applicationDefault(), projectId: FIREBASE_PROJECT_ID });
}

const adminApp: App = getApps()[0] ?? createAdminApp();

export const adminAuth = getAuth(adminApp);
export const db = getFirestore(adminApp, FIRESTORE_DATABASE_ID);

export const DEFAULT_CLAIMS: CustomClaims = {
  role: "supporter",
  tier: "supporter",
  isSuperAdmin: false,
  admin: false,
  superadmin: false,
};

const envAdmins = (process.env.FIREBASE_DATABASE_ADMIN_EMAIL || process.env.NEXT_PUBLIC_DATABASE_ADMIN_EMAIL || "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

/**
 * List of authorized database administrator emails.
 * The superadmin should ONLY be the firebase database admin email. Everyone else starts at supporter level.
 */
export const DATABASE_ADMIN_EMAILS = new Set([
  "davidrobertson.info@gmail.com",
  "support@aifoundation.net.au",
  ...envAdmins,
]);

/**
 * Strictly checks whether an email belongs to the Firebase database admin.
 * Only the database admin email is granted superadmin authority.
 */
export function isDatabaseAdmin(
  token?: DecodedIdToken | Record<string, unknown> | null,
  email?: string | null,
): boolean {
  const normEmail = (email || (token as DecodedIdToken)?.email || "").toLowerCase().trim();
  if (!normEmail) return false;
  return DATABASE_ADMIN_EMAILS.has(normEmail);
}

export interface VerifiedCaller {
  uid: string;
  email: string;
  claims: CustomClaims;
  token: DecodedIdToken;
}

export class AuthError extends Error {
  constructor(
    public readonly code: "UNAUTHENTICATED" | "FORBIDDEN" | "UPSTREAM_FAILURE",
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

/** verifyIdToken codes that mean the caller's token is bad, not that the server failed to check it. */
const TOKEN_REJECTED_CODES = new Set([
  "auth/argument-error",
  "auth/invalid-id-token",
  "auth/id-token-expired",
  "auth/id-token-revoked",
  "auth/user-disabled",
  "auth/user-not-found",
]);

/**
 * Step 1 of the gate: verify the Bearer ID token (revocation checked) and
 * resolve custom claims.
 * The only superadmin is the person who is the admin of the Firebase database.
 * Everyone else starts off as 'Supporters'.
 */
export async function verifyRequest(
  req: Request,
  opts: { requireRole?: CustomClaims["role"] } = {},
): Promise<VerifiedCaller> {
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+([A-Za-z0-9._-]+)$/.exec(header);
  if (!match) throw new AuthError("UNAUTHENTICATED", "Missing or malformed Authorization header");

  let token: DecodedIdToken;
  try {
    token = await adminAuth.verifyIdToken(match[1], true);
  } catch (err) {
    const code = (err as { code?: unknown }).code;
    if (typeof code === "string" && TOKEN_REJECTED_CODES.has(code)) {
      throw new AuthError("UNAUTHENTICATED", "Invalid or expired session");
    }
    // The token may be fine: the server couldn't check it (expired ADC, network failure).
    console.error("[auth] could not verify ID token", err);
    const credentialHint =
      process.env.NODE_ENV !== "production" && /invalid-credential/.test(String(code))
        ? " Server credentials need refreshing: run `gcloud auth application-default login`, then restart the dev server."
        : "";
    throw new AuthError("UPSTREAM_FAILURE", `Couldn't verify your session right now.${credentialHint}`);
  }

  const isSuper = isDatabaseAdmin(token, token.email);
  let claims: CustomClaims;
  if (isSuper) {
    claims = {
      role: "superadmin",
      tier: "agency",
      isSuperAdmin: true,
      admin: true,
      superadmin: true,
    };
  } else {
    claims = {
      role: "supporter",
      tier: "supporter",
      isSuperAdmin: false,
      admin: false,
      superadmin: false,
    };
  }

  if (opts.requireRole && (opts.requireRole === "admin" || opts.requireRole === "superadmin")) {
    if (!isSuper) {
      throw new AuthError("FORBIDDEN", "Super admin role required");
    }
  }

  return { uid: token.uid, email: (token.email ?? "").toLowerCase(), claims, token };
}

/** Admin-only helper to assign RBAC claims (used by scripts / admin routes). */
export async function setUserClaims(uid: string, claims: Partial<CustomClaims> & { role: CustomClaims["role"]; tier: CustomClaims["tier"] }) {
  await adminAuth.setCustomUserClaims(uid, CustomClaimsSchema.parse(claims));
}
