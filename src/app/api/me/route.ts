import { NextResponse } from "next/server";
import { db, verifyRequest } from "@/lib/firebase-admin";
import { ensureUserDoc } from "@/lib/token-ledger";
import { errorResponse } from "@/lib/api";
import type { BrandProfile } from "@/lib/contracts";

/**
 * Bootstraps `users/{uid}` on sign-in and returns the profile, brands and the caller's Ad Radar roles
 * (Database Admin = Super Admin; every other role is whatever Super Admin recorded on users/{uid}).
 * Custom claims on the Firebase Auth account are never written: that account is shared with other apps.
 */
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

    return NextResponse.json({ user, brands, claims: caller.claims });
  } catch (err) {
    return errorResponse(err);
  }
}
