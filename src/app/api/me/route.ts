import { NextResponse } from "next/server";
import { db, isDatabaseAdmin, setUserClaims, verifyRequest } from "@/lib/firebase-admin";
import { ensureUserDoc } from "@/lib/token-ledger";
import { errorResponse } from "@/lib/api";
import type { BrandProfile } from "@/lib/contracts";

/** Bootstraps `users/{uid}` on sign-in and syncs role claims (Database Admin = Superadmin, everyone else = Supporters). */
export async function POST(req: Request) {
  try {
    const caller = await verifyRequest(req);
    const [user, brandsSnap] = await Promise.all([
      ensureUserDoc(caller.uid, caller.email),
      db.collection("users").doc(caller.uid).collection("brands").get(),
    ]);

    const brands = brandsSnap.docs
      .map((d) => d.data() as BrandProfile)
      .sort((a, b) => a.brandName.localeCompare(b.brandName));

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

    return NextResponse.json({ user, brands, claims: caller.claims });
  } catch (err) {
    return errorResponse(err);
  }
}
