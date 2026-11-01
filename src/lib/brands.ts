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
const globalBrandsCol = db.collection("global_brands");

/** Same idempotency key → same brandId, so a retried create never duplicates. */
const brandIdFromKey = (uid: string, key: string) =>
  createHash("sha256").update(`${uid}:${key}`).digest("hex").slice(0, 24);

const notFound = (brandId: string) => new ApiError("NOT_FOUND", `Brand ${brandId} not found`, 404);

/**
 * Creates a brand under `users/{uid}/brands`. The first brand becomes the active one.
 * If `isGlobal` is true, syncs to `global_brands/{brandId}` for community discovery.
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
  const now = new Date().toISOString();

  return db.runTransaction(async (t) => {
    const [existing, userSnap, count] = await Promise.all([t.get(ref), t.get(userRef(caller.uid)), t.get(col.count())]);
    if (existing.exists) return { brand: existing.data() as BrandProfile, replayed: true };
    if (count.data().count >= MAX_BRANDS_PER_USER) {
      throw new ApiError("INVALID_INPUT", `You can keep up to ${MAX_BRANDS_PER_USER} brands`, 409);
    }

    const landingPageUrls =
      input.landingPageUrls && input.landingPageUrls.length > 0 ? input.landingPageUrls : [input.destinationUrl];
    const destinationUrl = input.destinationUrl || landingPageUrls[0];
    const isGlobal = Boolean(input.isGlobal);

    const brand: BrandProfile = {
      brandId: ref.id,
      ...input,
      destinationUrl,
      landingPageUrls,
      isGlobal,
      authorUid: caller.uid,
      authorEmail: caller.email,
      createdAt: input.createdAt || now,
      updatedAt: now,
    };

    t.create(ref, brand);

    if (isGlobal) {
      t.set(globalBrandsCol.doc(brand.brandId), brand);
    }

    if (!userSnap.get("activeBrandId")) {
      t.update(userRef(caller.uid), { activeBrandId: ref.id, updatedAt: now });
    }
    return { brand, replayed: false };
  });
}

/** Full replace of an existing brand (PUT semantics). Syncs or deletes from global_brands accordingly. */
export async function updateBrand(
  uid: string,
  brand: BrandProfile,
  callerEmail?: string,
): Promise<BrandProfile> {
  const ref = brandsCol(uid).doc(brand.brandId);
  const landingPageUrls =
    brand.landingPageUrls && brand.landingPageUrls.length > 0 ? brand.landingPageUrls : [brand.destinationUrl];
  const destinationUrl = brand.destinationUrl || landingPageUrls[0];
  const now = new Date().toISOString();
  const isGlobal = Boolean(brand.isGlobal);

  const normalizedBrand: BrandProfile = {
    ...brand,
    destinationUrl,
    landingPageUrls,
    isGlobal,
    authorUid: brand.authorUid || uid,
    authorEmail: brand.authorEmail || callerEmail,
    updatedAt: now,
  };

  await db.runTransaction(async (t) => {
    if (!(await t.get(ref)).exists) throw notFound(brand.brandId);
    t.set(ref, normalizedBrand);

    const globalDocRef = globalBrandsCol.doc(brand.brandId);
    if (isGlobal) {
      t.set(globalDocRef, normalizedBrand);
    } else {
      t.delete(globalDocRef);
    }
  });

  return normalizedBrand;
}

/** Deletes a brand and clears it from `activeBrandId` if it was selected. Also removes from global_brands. */
export async function deleteBrand(uid: string, brandId: string): Promise<void> {
  const ref = brandsCol(uid).doc(brandId);
  const globalRef = globalBrandsCol.doc(brandId);

  await db.runTransaction(async (t) => {
    const [brandSnap, userSnap] = await Promise.all([t.get(ref), t.get(userRef(uid))]);
    if (!brandSnap.exists) throw notFound(brandId);
    t.delete(ref);
    t.delete(globalRef);
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

/** Duplicates an existing personal brand card to create a new version. */
export async function duplicateBrand(
  caller: { uid: string; email: string },
  brandId: string,
  versionName?: string,
): Promise<BrandProfile> {
  const source = await getBrand(caller.uid, brandId);
  if (!source) throw notFound(brandId);

  const duplicateName = versionName?.trim() || `${source.brandName} (Copy)`;
  const { brandId: _oldId, ...rest } = source;
  const input: Omit<BrandProfile, "brandId"> = {
    ...rest,
    brandName: duplicateName,
    isGlobal: false, // Duplicates are personal by default
    clonedFromBrandId: brandId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const { brand } = await createBrand(caller, input);
  return brand;
}

/** Searches and lists community brands published in `global_brands`. */
export async function searchGlobalBrands(options: {
  query?: string;
  tone?: string;
  limit?: number;
}): Promise<BrandProfile[]> {
  const maxLimit = Math.min(options.limit ?? 50, 100);
  let qRef: FirebaseFirestore.Query = globalBrandsCol;
  if (options.tone) {
    qRef = qRef.where("toneOfVoice", "==", options.tone);
  }
  const snap = await qRef.limit(maxLimit * 2).get();
  let list = snap.docs.map((d) => d.data() as BrandProfile);

  if (options.query && options.query.trim()) {
    const term = options.query.trim().toLowerCase();
    list = list.filter(
      (b) =>
        b.brandName.toLowerCase().includes(term) ||
        b.productServiceDescription.toLowerCase().includes(term) ||
        b.targetAudienceAvatar.toLowerCase().includes(term) ||
        b.uniqueMechanismOrOffer.toLowerCase().includes(term) ||
        b.corePainPoints.some((p) => p.toLowerCase().includes(term)),
    );
  }

  return list.slice(0, maxLimit);
}

/** Copies a community brand from `global_brands` into the caller's personal account. */
export async function cloneGlobalBrand(
  caller: { uid: string; email: string },
  globalBrandId: string,
): Promise<BrandProfile> {
  const globalSnap = await globalBrandsCol.doc(globalBrandId).get();
  if (!globalSnap.exists) {
    throw new ApiError("NOT_FOUND", `Global brand ${globalBrandId} not found`, 404);
  }
  const source = globalSnap.data() as BrandProfile;
  const { brandId: _oldId, ...rest } = source;

  const input: Omit<BrandProfile, "brandId"> = {
    ...rest,
    brandName: `${source.brandName} (My Copy)`,
    isGlobal: false, // Cloned copies are personal by default
    clonedFromBrandId: globalBrandId,
    authorUid: caller.uid,
    authorEmail: caller.email,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const { brand } = await createBrand(caller, input);
  return brand;
}

/** Selects the brand used by Radar and Studio. `""` clears the selection. */
export async function setActiveBrand(caller: { uid: string; email: string }, brandId: string): Promise<void> {
  await ensureUserDoc(caller.uid, caller.email);
  await db.runTransaction(async (t) => {
    if (brandId && !(await t.get(brandsCol(caller.uid).doc(brandId))).exists) throw notFound(brandId);
    t.update(userRef(caller.uid), { activeBrandId: brandId, updatedAt: new Date().toISOString() });
  });
}
