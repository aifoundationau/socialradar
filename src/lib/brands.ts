import "server-only";
import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "./firebase-admin";
import { ensureUserDoc } from "./token-ledger";
import { ApiError } from "./api";
import type { BrandProfile } from "./contracts";
import { buildBrandTextFileContent, getBrandTextFileName } from "./brand-text-file";

/** Abuse cap, not a plan limit. */
export const MAX_BRANDS_PER_USER = 25;

const userRef = (uid: string) => db.collection("users").doc(uid);
const brandsCol = (uid: string) => userRef(uid).collection("brands");
const globalBrandsCol = db.collection("global_brands");

/** Same idempotency key → same brandId, so a retried create never duplicates. */
const brandIdFromKey = (uid: string, key: string) =>
  createHash("sha256").update(`${uid}:${key}`).digest("hex").slice(0, 24);

const notFound = (brandId: string) => new ApiError("NOT_FOUND", `Brand ${brandId} not found`, 404);

/** Attaches the generated `<Brand Name> - <Date>.txt` file name and content to a BrandProfile. */
function withBrandTextAttachment(brand: BrandProfile): BrandProfile {
  return {
    ...brand,
    brandTextFileName: getBrandTextFileName(brand),
    brandTextFileContent: buildBrandTextFileContent(brand),
  };
}

/** The community (global_brands) copy of a brand: every signed-in user can read it, so no author email. */
function communityCopy(brand: BrandProfile): BrandProfile {
  const copy = { ...brand };
  delete copy.authorEmail;
  return withBrandTextAttachment(copy);
}

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

    const brand = withBrandTextAttachment({
      brandId: ref.id,
      ...input,
      destinationUrl,
      landingPageUrls,
      isGlobal,
      authorUid: caller.uid,
      authorEmail: caller.email,
      createdAt: input.createdAt || now,
      updatedAt: now,
    });

    t.create(ref, brand);

    if (isGlobal) {
      t.set(globalBrandsCol.doc(brand.brandId), communityCopy(brand));
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

  let saved!: BrandProfile;
  await db.runTransaction(async (t) => {
    const existingSnap = await t.get(ref);
    if (!existingSnap.exists) throw notFound(brand.brandId);
    const existing = existingSnap.data() as Partial<BrandProfile>;

    // Authorship and creation time come from the stored brand, never from the request body.
    const authorEmail = existing.authorEmail || callerEmail || brand.authorEmail;
    saved = withBrandTextAttachment({
      ...brand,
      destinationUrl,
      landingPageUrls,
      isGlobal,
      authorUid: existing.authorUid || uid,
      ...(authorEmail ? { authorEmail } : {}),
      createdAt: existing.createdAt || brand.createdAt || now,
      updatedAt: now,
    });
    t.set(ref, saved);

    const globalDocRef = globalBrandsCol.doc(brand.brandId);
    if (isGlobal) {
      t.set(globalDocRef, communityCopy(saved));
    } else {
      t.delete(globalDocRef);
    }
  });

  return saved;
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

/**
 * Fetches a brand profile by ID from the user's personal brands or from `global_brands`
 * for generating/downloading the attached `<Brand Name> - <Date>.txt` file.
 */
export async function getBrandForTxtDownload(
  uid: string,
  brandId: string,
  isGlobalSource?: boolean,
): Promise<BrandProfile> {
  if (!brandId) throw notFound(brandId);
  if (!isGlobalSource) {
    const personal = await getBrand(uid, brandId);
    if (personal) return withBrandTextAttachment(personal);
  }
  const globalSnap = await globalBrandsCol.doc(brandId).get();
  if (globalSnap.exists) {
    return communityCopy(globalSnap.data() as BrandProfile);
  }
  if (isGlobalSource) {
    const personalFallback = await getBrand(uid, brandId);
    if (personalFallback) return withBrandTextAttachment(personalFallback);
  }
  throw notFound(brandId);
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
  const rest: Omit<BrandProfile, "brandId"> & { brandId?: string } = { ...source };
  delete rest.brandId;
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

/** Searches and lists community brands published in `global_brands` (and syncs any `isGlobal: true` user brands). */
export async function searchGlobalBrands(options: {
  query?: string;
  tone?: string;
  limit?: number;
}): Promise<BrandProfile[]> {
  const maxLimit = Math.min(options.limit ?? 50, 100);
  const globalSnap = await globalBrandsCol.limit(maxLimit * 2).get();
  const byId = new Map<string, BrandProfile>();

  const emailCleanups: Promise<unknown>[] = [];
  for (const docSnap of globalSnap.docs) {
    const data = docSnap.data() as BrandProfile;
    if (data && data.brandId) {
      byId.set(data.brandId, { ...communityCopy(data), isGlobal: true });
      // One-time cleanup of copies saved before author emails were kept out of global_brands.
      if (data.authorEmail) emailCleanups.push(docSnap.ref.update({ authorEmail: FieldValue.delete() }));
    }
  }
  if (emailCleanups.length > 0) {
    await Promise.allSettled(emailCleanups);
  }

  // Also pick up brands marked `isGlobal: true` that never synced to global_brands (created before the sync
  // existed), with one collection-group query instead of opening every user's brands subcollection. It needs
  // the collection-group index on brands.isGlobal in firestore.indexes.json; until that is deployed the query
  // fails and only global_brands is returned.
  try {
    const legacySnap = await db
      .collectionGroup("brands")
      .where("isGlobal", "==", true)
      .limit(maxLimit * 2)
      .get();
    const missingSyncs: Promise<unknown>[] = [];
    for (const bDoc of legacySnap.docs) {
      const bData = bDoc.data() as BrandProfile;
      const ownerUid = bDoc.ref.parent.parent?.id;
      if (!bData || !ownerUid) continue;
      const normalized: BrandProfile = {
        ...bData,
        brandId: bData.brandId || bDoc.id,
        isGlobal: true,
        authorUid: bData.authorUid || ownerUid,
      };
      if (!byId.has(normalized.brandId)) {
        const shared = communityCopy(normalized);
        byId.set(normalized.brandId, shared);
        missingSyncs.push(globalBrandsCol.doc(normalized.brandId).set(shared, { merge: true }));
      }
    }
    if (missingSyncs.length > 0) {
      await Promise.allSettled(missingSyncs);
    }
  } catch {
    // Index not deployed yet, or the query failed: global_brands alone is still returned.
  }

  let list = Array.from(byId.values());

  if (options.tone && options.tone !== "ALL") {
    list = list.filter((b) => b.toneOfVoice === options.tone);
  }

  if (options.query && options.query.trim()) {
    const term = options.query.trim().toLowerCase();
    list = list.filter(
      (b) =>
        (b.brandName ?? "").toLowerCase().includes(term) ||
        (b.productServiceDescription ?? "").toLowerCase().includes(term) ||
        (b.targetAudienceAvatar ?? "").toLowerCase().includes(term) ||
        (b.uniqueMechanismOrOffer ?? "").toLowerCase().includes(term) ||
        (b.corePainPoints ?? []).some((p) => p.toLowerCase().includes(term)),
    );
  }

  list.sort((a, b) => (b.updatedAt ?? b.createdAt ?? "").localeCompare(a.updatedAt ?? a.createdAt ?? ""));

  return list.slice(0, maxLimit);
}

/**
 * Copies a community brand from `global_brands` into the caller's personal account. With an
 * idempotency key, a repeat call returns the copy made the first time instead of making another.
 */
export async function cloneGlobalBrand(
  caller: { uid: string; email: string },
  globalBrandId: string,
  idempotencyKey?: string,
): Promise<{ brand: BrandProfile; replayed: boolean }> {
  const globalSnap = await globalBrandsCol.doc(globalBrandId).get();
  if (!globalSnap.exists) {
    throw new ApiError("NOT_FOUND", `Global brand ${globalBrandId} not found`, 404);
  }
  const source = globalSnap.data() as BrandProfile;
  const rest: Omit<BrandProfile, "brandId"> & { brandId?: string } = { ...source };
  delete rest.brandId;

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

  return createBrand(caller, input, idempotencyKey);
}

/** Selects the brand used by Radar and Studio. `""` clears the selection. */
export async function setActiveBrand(caller: { uid: string; email: string }, brandId: string): Promise<void> {
  await ensureUserDoc(caller.uid, caller.email);
  await db.runTransaction(async (t) => {
    if (brandId && !(await t.get(brandsCol(caller.uid).doc(brandId))).exists) throw notFound(brandId);
    t.update(userRef(caller.uid), { activeBrandId: brandId, updatedAt: new Date().toISOString() });
  });
}
