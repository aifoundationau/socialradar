import { NextResponse } from "next/server";
import { verifyRequest } from "@/lib/firebase-admin";
import { ensureUserDoc } from "@/lib/token-ledger";
import { errorResponse } from "@/lib/api";

/** Bootstraps `users/{uid}` on sign-in so the client's read-only listener has a doc to watch. */
export async function POST(req: Request) {
  try {
    const caller = await verifyRequest(req);
    const user = await ensureUserDoc(caller.uid, caller.email);
    return NextResponse.json({ user, claims: caller.claims });
  } catch (err) {
    return errorResponse(err);
  }
}
