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

    // Sync Auth custom claims if missing or misaligned, while preserving assigned multi-roles
    const isSuper = isDatabaseAdmin(caller.token, caller.email);
    if (isSuper) {
      if (caller.token.role !== "superadmin" || caller.token.tier !== "agency") {
        await setUserClaims(caller.uid, {
          role: "superadmin",
          roles: ["superadmin", "admin", "ad_agent", "supporter"],
          tier: "agency",
          isSuperAdmin: true,
          admin: true,
          superadmin: true,
        });
      }
    } else if (!caller.token.role) {
      const docRole = user.role && user.role !== "superadmin" ? user.role : "supporter";
      const docRoles =
        Array.isArray(user.roles) && user.roles.length > 0
          ? user.roles.filter((r) => r !== "superadmin")
          : [docRole];
      const expectedTier =
        docRoles.includes("agency") || docRoles.includes("admin") ? "agency" : "supporter";
      await setUserClaims(caller.uid, {
        role: docRole,
        roles: docRoles,
        tier: expectedTier,
        isSuperAdmin: false,
        admin: docRoles.includes("admin"),
        superadmin: false,
      });
    }

    return NextResponse.json({ user, brands, claims: caller.claims });
  } catch (err) {
    return errorResponse(err);
  }
}
