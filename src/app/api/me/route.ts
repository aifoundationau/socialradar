import { NextResponse } from "next/server";
import { isDatabaseAdmin, setUserClaims, verifyRequest } from "@/lib/firebase-admin";
import { ensureUserDoc } from "@/lib/token-ledger";
import { errorResponse } from "@/lib/api";

/** Bootstraps `users/{uid}` on sign-in and syncs role claims (Database Admin = Superadmin, everyone else = Supporters). */
export async function POST(req: Request) {
  try {
    const caller = await verifyRequest(req);
    const user = await ensureUserDoc(caller.uid, caller.email);

    // Sync Auth custom claims if missing or misaligned
    const isSuper = isDatabaseAdmin(caller.token, caller.email);
    const expectedRole = isSuper ? "superadmin" : "supporter";
    const expectedTier = isSuper ? "agency" : "supporter";
    if (caller.token.role !== expectedRole || caller.token.tier !== expectedTier) {
      await setUserClaims(caller.uid, {
        role: expectedRole,
        tier: expectedTier,
        isSuperAdmin: isSuper,
        admin: isSuper,
        superadmin: isSuper,
      });
    }

    return NextResponse.json({ user, claims: caller.claims });
  } catch (err) {
    return errorResponse(err);
  }
}
