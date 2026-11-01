import "server-only";
import { createHash } from "node:crypto";
import { db } from "./firebase-admin";
import { ensureUserDoc } from "./token-ledger";
import { ApiError } from "./api";
import type { BrandProfile } from "./contracts";

/** Abuse cap, not a plan limit. */
export const MAX_BRANDS_PER_USER = 25;

const userRef = (uid: string) => db.collection("users").doc(uid);
const brandsCol = (uid: string) => userRef(uid).collection("brands");

/** Same idempotency key → same brandId, so a retried create never duplicates. */
const brandIdFromKey = (uid: string, key: string) =>
  createHash("sha256").update(`${uid}:${key}`).digest("hex").slice(0, 24);

const notFound = (brandId: string) => new ApiError("NOT_FOUND", `Brand ${brandId} not found`, 404);

/**
 * Creates a brand under `users/{uid}/brands`. The first brand becomes the active one.
 * Replays with the same idempotency key return the brand created by the first call.
 */
export async function createBrand(
  caller: { uid: string; email: string },
  input: Omit<BrandProfile, "brandId">,
  idempotencyKey?: string,
): Promise<{ brand: BrandProfile; replayed: boolean }> {
  await ensureUserDoc(caller.uid, caller.email);
  const col = brandsCol(caller.uid);
  const ref = idempotencyKey ? col.doc(brandIdFromKey(caller.uid, idempotencyKey)) : col.doc();

  return db.runTransaction(async (t) => {
    const [existing, userSnap, count] = await Promise.all([t.get(ref), t.get(userRef(caller.uid)), t.get(col.count())]);
    if (existing.exists) return { brand: existing.data() as BrandProfile, replayed: true };
    if (count.data().count >= MAX_BRANDS_PER_USER) {
      throw new ApiError("INVALID_INPUT", `You can keep up to ${MAX_BRANDS_PER_USER} brands`, 409);
    }

    const landingPageUrls =
      input.landingPageUrls && input.landingPageUrls.length > 0 ? input.landingPageUrls : [input.destinationUrl];
    const destinationUrl = input.destinationUrl || landingPageUrls[0];
    const brand: BrandProfile = { brandId: ref.id, ...input, destinationUrl, landingPageUrls };
    t.create(ref, brand);
    if (!userSnap.get("activeBrandId")) {
      t.update(userRef(caller.uid), { activeBrandId: ref.id, updatedAt: new Date().toISOString() });
    }
    return { brand, replayed: false };
  });
}

/** Full replace of an existing brand (PUT semantics). */
export async function updateBrand(uid: string, brand: BrandProfile): Promise<BrandProfile> {
  const ref = brandsCol(uid).doc(brand.brandId);
  const landingPageUrls =
    brand.landingPageUrls && brand.landingPageUrls.length > 0 ? brand.landingPageUrls : [brand.destinationUrl];
  const destinationUrl = brand.destinationUrl || landingPageUrls[0];
  const normalizedBrand: BrandProfile = { ...brand, destinationUrl, landingPageUrls };
  await db.runTransaction(async (t) => {
    if (!(await t.get(ref)).exists) throw notFound(brand.brandId);
    t.set(ref, normalizedBrand);
  });
  return normalizedBrand;
}

/** Deletes a brand and clears it from `activeBrandId` if it was selected. */
export async function deleteBrand(uid: string, brandId: string): Promise<void> {
  const ref = brandsCol(uid).doc(brandId);
  await db.runTransaction(async (t) => {
    const [brandSnap, userSnap] = await Promise.all([t.get(ref), t.get(userRef(uid))]);
    if (!brandSnap.exists) throw notFound(brandId);
    t.delete(ref);
    if (userSnap.get("activeBrandId") === brandId) {
      t.update(userRef(uid), { activeBrandId: "", updatedAt: new Date().toISOString() });
    }
  });
}

/** Fetches a single brand profile by ID for a user. */
export async function getBrand(uid: string, brandId: string): Promise<BrandProfile | null> {
  if (!brandId) return null;
  const snap = await brandsCol(uid).doc(brandId).get();
  return snap.exists ? (snap.data() as BrandProfile) : null;
}

/** Selects the brand used by Radar and Studio. `""` clears the selection. */
export async function setActiveBrand(caller: { uid: string; email: string }, brandId: string): Promise<void> {
  await ensureUserDoc(caller.uid, caller.email);
  await db.runTransaction(async (t) => {
    if (brandId && !(await t.get(brandsCol(caller.uid).doc(brandId))).exists) throw notFound(brandId);
    t.update(userRef(caller.uid), { activeBrandId: brandId, updatedAt: new Date().toISOString() });
  });
}
