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

const DEFAULT_CLAIMS: CustomClaims = { role: "user", tier: "starter" };

export interface VerifiedCaller {
  uid: string;
  email: string;
  claims: CustomClaims;
  token: DecodedIdToken;
}

export class AuthError extends Error {
  constructor(
    public readonly code: "UNAUTHENTICATED" | "FORBIDDEN",
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

/**
 * Step 1 of the gate: verify the Bearer ID token (revocation checked) and
 * resolve custom claims. Missing/invalid claims fall back to the least-privileged default.
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
  } catch {
    throw new AuthError("UNAUTHENTICATED", "Invalid or expired session");
  }

  const parsed = CustomClaimsSchema.safeParse({ role: token.role, tier: token.tier });
  const claims = parsed.success ? parsed.data : DEFAULT_CLAIMS;

  if (opts.requireRole === "admin" && claims.role !== "admin") {
    throw new AuthError("FORBIDDEN", "Admin role required");
  }

  return { uid: token.uid, email: (token.email ?? "").toLowerCase(), claims, token };
}

/** Admin-only helper to assign RBAC claims (used by scripts / admin routes). */
export async function setUserClaims(uid: string, claims: CustomClaims) {
  await adminAuth.setCustomUserClaims(uid, CustomClaimsSchema.parse(claims));
}
