import "server-only";
import type {
  DocumentData,
  DocumentReference,
  DocumentSnapshot,
  QueryDocumentSnapshot,
} from "firebase-admin/firestore";
import { db } from "./firebase-admin";
import { ApiError } from "./api";
import {
  MediaFilterSchema,
  NormalizedAdSchema,
  PlatformSchema,
  RemixDocSchema,
  RemixedAdTextDocSchema,
  LibraryItemSummarySchema,
  LibraryPurchaseDocSchema,
  sanitizeText,
  type LibraryItemKind,
  type LibraryItemSummary,
  type LibraryListQuery,
  type LibraryPurchaseDoc,
  type LibraryUnlockedDetail,
  type MediaFilter,
  type NormalizedAd,
  type Platform,
  type RemixDoc,
  type RemixedAdTextDoc,
} from "./contracts";
import { buildDeconstructTextFileContent, getDeconstructFileName } from "./deconstruct-text-file";
import { buildSearchMixTextFileContent } from "./searchmix-text-file";

const MAX_SOURCE_SCAN = 80;
/** Most public / own remixes (and, separately, ad texts) listed per request. */
const MAX_LISTED_PER_SOURCE = 200;
const GET_ALL_CHUNK = 100;

interface SearchArchiveDoc {
  query: string;
  platform: Platform;
  country: string;
  mediaType: MediaFilter;
  ads: NormalizedAd[];
  createdAt: string;
}

export interface UnlockedLibraryPayload {
  summary: LibraryItemSummary;
  detail: LibraryUnlockedDetail;
  fileName: string;
  txtContent: string;
}

function toIsoString(candidate: unknown, fallbackIso?: string): string {
  if (typeof candidate === "string") {
    const ms = Date.parse(candidate);
    if (Number.isFinite(ms)) return new Date(ms).toISOString();
  }
  if (fallbackIso) {
    const ms = Date.parse(fallbackIso);
    if (Number.isFinite(ms)) return new Date(ms).toISOString();
  }
  return new Date().toISOString();
}

function safeFileSlug(input: string, fallback = "item"): string {
  const cleaned = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return cleaned || fallback;
}

function parseSearchArchive(
  snap: QueryDocumentSnapshot | FirebaseFirestore.DocumentSnapshot,
): SearchArchiveDoc | null {
  if (!snap.exists) return null;
  const raw = (snap.data() ?? {}) as DocumentData;
  const plat = PlatformSchema.safeParse(raw.platform);
  const query = typeof raw.query === "string" ? sanitizeText(raw.query).slice(0, 100) : "";
  if (!plat.success || !query) return null;

  const ads: NormalizedAd[] = [];
  if (Array.isArray(raw.ads)) {
    for (const item of raw.ads) {
      const parsedAd = NormalizedAdSchema.safeParse(item);
      if (parsedAd.success && parsedAd.data.platform === plat.data) {
        ads.push(parsedAd.data);
      }
    }
  }
  if (ads.length === 0) return null;

  const media = MediaFilterSchema.safeParse(raw.mediaType);
  const country =
    typeof raw.country === "string" && /^[A-Z]{2}$/i.test(raw.country.trim())
      ? raw.country.trim().toUpperCase()
      : "AU";

  return {
    query,
    platform: plat.data,
    country,
    mediaType: media.success ? media.data : "ALL",
    ads,
    createdAt: toIsoString(
      raw.updatedAt ?? raw.createdAt,
      snap.createTime?.toDate().toISOString(),
    ),
  };
}

function buildSearchSummary(
  sourceId: string,
  archive: SearchArchiveDoc,
  purchased: boolean,
): LibraryItemSummary {
  const itemKey = `search_${sourceId}`;
  const advertisers = Array.from(
    new Set(
      archive.ads
        .map((a) => sanitizeText(a.advertiserName || ""))
        .filter(Boolean),
    ),
  ).slice(0, 3);
  const maxDays = Math.max(...archive.ads.map((a) => a.activeDaysCount));
  const bestScore = Math.max(...archive.ads.map((a) => a.winningScore));

  const teaserParts = [
    advertisers.length > 0
      ? `Includes ${advertisers.join(", ")}${archive.ads.length > advertisers.length ? " + more" : ""}`
      : `${archive.ads.length} verified competitor ads`,
    `Top longevity ${maxDays}d · Best score ${bestScore}%`,
  ];

  return LibraryItemSummarySchema.parse({
    itemKey,
    sourceId,
    kind: "PREVIOUS_SEARCH",
    kindLabel: "Previous Search",
    title: `"${archive.query}" — ${archive.platform} Ad Search`,
    subtitle: `${archive.ads.length} saved ${archive.ads.length === 1 ? "ad" : "ads"} · ${archive.country} · ${archive.mediaType}`,
    teaser: sanitizeText(teaserParts.join(" · ")).slice(0, 480),
    platform: archive.platform,
    country: archive.country,
    tags: [
      archive.platform,
      archive.country,
      archive.mediaType !== "ALL" ? archive.mediaType : "All Formats",
      `${archive.ads.length} ads`,
    ],
    metricsLabel: `${archive.ads.length} ads · Top ${maxDays}d live`,
    createdAt: archive.createdAt,
    purchased,
  });
}

function buildRemixSummary(
  sourceId: string,
  remix: RemixDoc,
  opts: {
    brandName: string;
    sourceAdvertiser: string;
    platform?: Platform;
    createdAt: string;
    purchased: boolean;
    isOwn: boolean;
  },
): LibraryItemSummary {
  const itemKey = `remix_${sourceId}`;
  const angles = remix.variations.map((v) => v.angleName).join(" · ");
  const hookSnippet = sanitizeText(remix.deconstruction.hookAnalysis).slice(0, 140);
  const teaser = sanitizeText(
    `${remix.deconstruction.persuasionFramework} framework · Angles: ${angles}${hookSnippet ? ` · Hook: ${hookSnippet}…` : ""}`,
  ).slice(0, 480);

  return LibraryItemSummarySchema.parse({
    itemKey,
    sourceId,
    kind: "REMIX_STUDIO",
    kindLabel: "Remix Studio",
    title: `Remix Blueprint · ${opts.brandName}`,
    subtitle: `Modeled on ${opts.sourceAdvertiser} · 3 Script & Storyboard Variations`,
    teaser,
    ...(opts.platform ? { platform: opts.platform } : {}),
    tags: [
      ...(opts.platform ? [opts.platform] : []),
      remix.deconstruction.persuasionFramework,
      "Deconstruction + 3 Scripts",
    ],
    metricsLabel: `3 Variations · ${remix.deconstruction.pacingStructure.length} beats`,
    createdAt: opts.createdAt,
    purchased: opts.purchased,
    isOwn: opts.isOwn,
    isPublic: remix.isPublic === true,
  });
}

function buildAdTextSummary(
  sourceId: string,
  doc: RemixedAdTextDoc,
  platform: Platform | undefined,
  purchased: boolean,
  isOwn: boolean,
): LibraryItemSummary {
  const itemKey = `adtext_${sourceId}`;
  const breakdown = doc.items.map((x) => `${x.platformLabel} (${x.wordCount}w)`).join(" · ");
  const teaser = sanitizeText(
    `4 social media ad text descriptions ready to publish (${breakdown}). Strict <= 150 words each.`,
  ).slice(0, 480);

  return LibraryItemSummarySchema.parse({
    itemKey,
    sourceId,
    kind: "REMIXED_AD_TEXT",
    kindLabel: "Remixed Ad Text",
    title: `Remixed Ad Text · ${doc.brandName}`,
    subtitle: `Modeled on ${doc.sourceAdvertiser} · TikTok, Facebook, Instagram & Google Ads`,
    teaser,
    ...(platform ? { platform } : {}),
    tags: [
      ...(platform ? [platform] : []),
      "TikTok",
      "Facebook",
      "Instagram",
      "Google Ads",
    ],
    metricsLabel: "4 Platforms · Max 150w each",
    createdAt: doc.createdAt,
    purchased,
    isOwn,
    isPublic: doc.isPublic === true,
  });
}

async function getDocsMap<T>(
  refs: DocumentReference[],
  parse: (data: DocumentData) => T | null,
): Promise<Map<string, T>> {
  const result = new Map<string, T>();
  if (refs.length === 0) return result;
  for (let i = 0; i < refs.length; i += GET_ALL_CHUNK) {
    const chunk = refs.slice(i, i + GET_ALL_CHUNK);
    const snaps = await db.getAll(...chunk);
    for (const snap of snaps) {
      if (!snap.exists) continue;
      const val = parse(snap.data() ?? {});
      if (val !== null) result.set(snap.ref.path, val);
    }
  }
  return result;
}

/**
 * Remixes or remixed ad texts the caller may see in the Library: the ones their creators have made public, the
 * caller's own (public or private), and any the caller has bought (a purchase stays available even if the
 * creator later makes it private).
 */
async function visibleCreations(
  collection: "remixes" | "remixed_ad_texts",
  uid: string,
  purchasedIds: string[],
): Promise<DocumentSnapshot[]> {
  const col = db.collection(collection);
  const [publicSnap, ownSnap] = await Promise.all([
    col.where("isPublic", "==", true).limit(MAX_LISTED_PER_SOURCE).get(),
    col.where("uid", "==", uid).limit(MAX_LISTED_PER_SOURCE).get(),
  ]);
  const byId = new Map<string, DocumentSnapshot>();
  for (const snap of [...publicSnap.docs, ...ownSnap.docs]) byId.set(snap.id, snap);
  const missing = purchasedIds.filter((id) => !byId.has(id));
  for (let i = 0; i < missing.length; i += GET_ALL_CHUNK) {
    const snaps = await db.getAll(...missing.slice(i, i + GET_ALL_CHUNK).map((id) => col.doc(id)));
    for (const snap of snaps) if (snap.exists) byId.set(snap.id, snap);
  }
  return [...byId.values()];
}

/**
 * Lists Library items: Previous Searches (`library_searches` + `radar_cache`: public ad library results), plus
 * Remix Studio blueprints (`remixes`) and Remixed Ad Texts (`remixed_ad_texts`) that their creators have made
 * public, the caller's own, and the caller's purchases. Remixes are private unless their creator makes them
 * public, because they're written from that creator's private brand profile.
 * Strict redaction: unpurchased items expose metadata/teasers only (no full ads, scripts, or copy).
 */
export async function listLibraryItems(uid: string, query: LibraryListQuery) {
  const purchasesSnap = await db.collection("users").doc(uid).collection("library_purchases").get();
  const purchasedSet = new Set(purchasesSnap.docs.map((d) => d.id));
  const purchasedIds = (prefix: "remix" | "adtext") =>
    [...purchasedSet].filter((key) => key.startsWith(`${prefix}_`)).map((key) => key.slice(prefix.length + 1));

  const [searchesSnap, cacheSnap, remixSnaps, adTextSnaps] = await Promise.all([
    db.collection("library_searches").limit(MAX_SOURCE_SCAN).get(),
    db.collection("radar_cache").limit(MAX_SOURCE_SCAN).get(),
    visibleCreations("remixes", uid, purchasedIds("remix")),
    visibleCreations("remixed_ad_texts", uid, purchasedIds("adtext")),
  ]);

  // Parse remixes & ad texts first so we can batch-resolve any referenced ads/brands without N+1 reads.
  const parsedRemixes: Array<{ id: string; doc: RemixDoc; createdAt: string }> = [];
  for (const snap of remixSnaps) {
    const parsed = RemixDocSchema.safeParse(snap.data());
    if (!parsed.success) continue;
    parsedRemixes.push({
      id: snap.id,
      doc: parsed.data,
      createdAt: toIsoString(parsed.data.createdAt, snap.createTime?.toDate().toISOString()),
    });
  }

  const parsedAdTexts: Array<{ id: string; doc: RemixedAdTextDoc }> = [];
  for (const snap of adTextSnaps) {
    const parsed = RemixedAdTextDocSchema.safeParse(snap.data());
    if (!parsed.success) continue;
    parsedAdTexts.push({ id: snap.id, doc: parsed.data });
  }

  const adRefMap = new Map<string, DocumentReference>();
  const brandRefMap = new Map<string, DocumentReference>();

  for (const { doc } of parsedRemixes) {
    if (!doc.platform || !doc.sourceAdvertiser) {
      const ref = db.collection("normalized_ads").doc(doc.sourceAdId);
      adRefMap.set(ref.path, ref);
    }
    if (!doc.brandName) {
      const ref = db.collection("users").doc(doc.uid).collection("brands").doc(doc.brandId);
      brandRefMap.set(ref.path, ref);
    }
  }
  for (const { doc } of parsedAdTexts) {
    const ref = db.collection("normalized_ads").doc(doc.sourceAdId);
    adRefMap.set(ref.path, ref);
  }

  const [adsMap, brandsMap] = await Promise.all([
    getDocsMap(Array.from(adRefMap.values()), (d) => {
      const parsed = NormalizedAdSchema.safeParse(d);
      return parsed.success ? parsed.data : null;
    }),
    getDocsMap(Array.from(brandRefMap.values()), (d) =>
      typeof d.brandName === "string" && d.brandName.trim() ? sanitizeText(d.brandName).slice(0, 100) : null,
    ),
  ]);

  const items: LibraryItemSummary[] = [];

  // 1. Previous Searches: merge `library_searches` + legacy `radar_cache` deduplicated by query signature.
  const seenSearchSignatures = new Set<string>();
  const allSearchDocs = [
    ...searchesSnap.docs.map((s) => ({ snap: s, archive: parseSearchArchive(s) })),
    ...cacheSnap.docs.map((s) => ({ snap: s, archive: parseSearchArchive(s) })),
  ];
  for (const { snap, archive } of allSearchDocs) {
    if (!archive) continue;
    const sig = `${archive.platform}|${archive.query.toLowerCase()}|${archive.country}|${archive.mediaType}`;
    if (seenSearchSignatures.has(sig)) continue;
    seenSearchSignatures.add(sig);
    const key = `search_${snap.id}`;
    items.push(buildSearchSummary(snap.id, archive, purchasedSet.has(key)));
  }

  // 2. Remix Studio blueprints
  for (const { id, doc, createdAt } of parsedRemixes) {
    const ad = adsMap.get(db.collection("normalized_ads").doc(doc.sourceAdId).path);
    const brandName =
      doc.brandName ||
      brandsMap.get(db.collection("users").doc(doc.uid).collection("brands").doc(doc.brandId).path) ||
      "Saved Brand";
    const key = `remix_${id}`;
    items.push(
      buildRemixSummary(id, doc, {
        brandName,
        sourceAdvertiser: doc.sourceAdvertiser || ad?.advertiserName || "Competitor Ad",
        platform: doc.platform ?? ad?.platform,
        createdAt,
        purchased: purchasedSet.has(key),
        isOwn: doc.uid === uid,
      }),
    );
  }

  // 3. Remixed Ad Text (4-platform copy builds)
  for (const { id, doc } of parsedAdTexts) {
    const ad = adsMap.get(db.collection("normalized_ads").doc(doc.sourceAdId).path);
    const key = `adtext_${id}`;
    items.push(buildAdTextSummary(id, doc, ad?.platform, purchasedSet.has(key), doc.uid === uid));
  }

  items.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

  // Filter by search keyword and platform before computing category counts
  const qLower = query.q?.toLowerCase() ?? "";
  const preKindFiltered = items.filter((item) => {
    if (query.platform !== "ALL" && item.platform !== query.platform) return false;
    if (!qLower) return true;
    const haystack = `${item.title} ${item.subtitle} ${item.teaser} ${item.tags.join(" ")}`.toLowerCase();
    return haystack.includes(qLower);
  });

  const counts = {
    total: preKindFiltered.length,
    previousSearch: preKindFiltered.filter((i) => i.kind === "PREVIOUS_SEARCH").length,
    remixStudio: preKindFiltered.filter((i) => i.kind === "REMIX_STUDIO").length,
    remixedAdText: preKindFiltered.filter((i) => i.kind === "REMIXED_AD_TEXT").length,
  };

  const finalItems =
    query.kind === "ALL"
      ? preKindFiltered.slice(0, query.limit)
      : preKindFiltered.filter((i) => i.kind === query.kind).slice(0, query.limit);

  return { items: finalItems, counts };
}

function buildSearchPackTxt(archive: SearchArchiveDoc): string {
  const header = [
    "================================================================================",
    "ADRARARHQ LIBRARY — PREVIOUS AD SEARCH INTELLIGENCE PACK",
    "================================================================================",
    `Search Query:  ${archive.query}`,
    `Platform:      ${archive.platform}`,
    `Country:       ${archive.country}`,
    `Media Filter:  ${archive.mediaType}`,
    `Total Ads:     ${archive.ads.length}`,
    `Saved Date:    ${archive.createdAt.slice(0, 10)}`,
    "================================================================================",
    "",
  ].join("\n");

  const body = archive.ads
    .map((ad, idx) =>
      buildSearchMixTextFileContent(ad, {
        searchQuery: archive.query,
        dateIso: archive.createdAt,
        rank: idx + 1,
      }),
    )
    .join("\n\n");

  return `${header}${body}`;
}

function buildRemixedAdTextFileContent(doc: RemixedAdTextDoc): string {
  const lines = [
    "================================================================================",
    "ADRARARHQ LIBRARY — REMIXED SOCIAL MEDIA AD TEXT (4 PLATFORMS)",
    "================================================================================",
    `Brand Name:        ${doc.brandName}`,
    `Source Advertiser: ${doc.sourceAdvertiser}`,
    `Source Ad ID:      ${doc.sourceAdId}`,
    `Generated Date:    ${doc.createdAt.slice(0, 10)} (${doc.createdAt})`,
    "Max Length Rule:   150 words maximum per platform",
    "================================================================================",
  ];

  for (const item of doc.items) {
    lines.push(
      "",
      `[${item.platformLabel.toUpperCase()}] (${item.wordCount} / 150 words)`,
      "--------------------------------------------------------------------------------",
      `Headline: ${item.headline}`,
      `CTA:      ${item.cta}`,
      "",
      item.adText,
    );
  }

  lines.push(
    "",
    "================================================================================",
    "Copyright (c) 2026 AI Foundation Australia. All rights reserved.",
    "================================================================================",
  );

  return lines.join("\n");
}

function parseItemKey(itemKey: string): { prefix: "search" | "remix" | "adtext"; sourceId: string } {
  const idx = itemKey.indexOf("_");
  if (idx <= 0) throw new ApiError("INVALID_INPUT", "Invalid Library item key", 400);
  const prefix = itemKey.slice(0, idx);
  const sourceId = itemKey.slice(idx + 1);
  if ((prefix !== "search" && prefix !== "remix" && prefix !== "adtext") || !sourceId) {
    throw new ApiError("INVALID_INPUT", "Invalid Library item key", 400);
  }
  return { prefix, sourceId };
}

/** Loads the complete unlocked Library item payload and downloadable `.txt` bundle. */
export async function getUnlockedLibraryItem(
  uid: string,
  itemKey: string,
  purchasedOverride?: boolean,
): Promise<UnlockedLibraryPayload> {
  const { prefix, sourceId } = parseItemKey(itemKey);
  const purchased =
    purchasedOverride !== undefined ? purchasedOverride : await hasPurchasedLibraryItem(uid, itemKey);

  if (prefix === "search") {
    let snap = await db.collection("library_searches").doc(sourceId).get();
    if (!snap.exists) {
      snap = await db.collection("radar_cache").doc(sourceId).get();
    }
    const archive = parseSearchArchive(snap);
    if (!archive) throw new ApiError("NOT_FOUND", "Search archive item not found in Library.", 404);

    return {
      summary: buildSearchSummary(sourceId, archive, purchased),
      detail: {
        kind: "PREVIOUS_SEARCH",
        query: archive.query,
        platform: archive.platform,
        country: archive.country,
        mediaType: archive.mediaType,
        ads: archive.ads,
      },
      fileName: `adradar-search-${safeFileSlug(archive.query)}-${archive.platform.toLowerCase()}.txt`,
      txtContent: buildSearchPackTxt(archive),
    };
  }

  if (prefix === "remix") {
    const snap = await db.collection("remixes").doc(sourceId).get();
    if (!snap.exists) throw new ApiError("NOT_FOUND", "Remix Studio item not found in Library.", 404);
    const parsed = RemixDocSchema.safeParse(snap.data());
    if (!parsed.success) throw new ApiError("NOT_FOUND", "Remix Studio item is unreadable.", 404);
    const remix = parsed.data;

    const [adSnap, brandSnap] = await Promise.all([
      db.collection("normalized_ads").doc(remix.sourceAdId).get(),
      remix.brandName
        ? Promise.resolve(null)
        : db.collection("users").doc(remix.uid).collection("brands").doc(remix.brandId).get(),
    ]);
    const parsedAd = adSnap.exists ? NormalizedAdSchema.safeParse(adSnap.data()) : null;
    const sourceAd = parsedAd?.success ? parsedAd.data : null;
    const brandName =
      remix.brandName ||
      (brandSnap?.exists && typeof brandSnap.get("brandName") === "string"
        ? sanitizeText(brandSnap.get("brandName")).slice(0, 100)
        : "Saved Brand");
    const createdAt = toIsoString(remix.createdAt, snap.createTime?.toDate().toISOString());

    return {
      summary: buildRemixSummary(sourceId, remix, {
        brandName,
        sourceAdvertiser: remix.sourceAdvertiser || sourceAd?.advertiserName || "Competitor Ad",
        platform: remix.platform ?? sourceAd?.platform,
        createdAt,
        purchased,
        isOwn: remix.uid === uid,
      }),
      detail: {
        kind: "REMIX_STUDIO",
        remix,
        brandName,
        sourceAd,
      },
      fileName: getDeconstructFileName(brandName),
      txtContent: buildDeconstructTextFileContent({
        remix,
        brandName,
        ad: sourceAd,
        dateIso: createdAt,
      }),
    };
  }

  const snap = await db.collection("remixed_ad_texts").doc(sourceId).get();
  if (!snap.exists) throw new ApiError("NOT_FOUND", "Remixed Ad Text item not found in Library.", 404);
  const parsed = RemixedAdTextDocSchema.safeParse(snap.data());
  if (!parsed.success) throw new ApiError("NOT_FOUND", "Remixed Ad Text item is unreadable.", 404);
  const remixedAdText = parsed.data;
  const adSnap = await db.collection("normalized_ads").doc(remixedAdText.sourceAdId).get();
  const parsedAd = adSnap.exists ? NormalizedAdSchema.safeParse(adSnap.data()) : null;
  const sourceAd = parsedAd?.success ? parsedAd.data : null;

  return {
    summary: buildAdTextSummary(sourceId, remixedAdText, sourceAd?.platform, purchased, remixedAdText.uid === uid),
    detail: {
      kind: "REMIXED_AD_TEXT",
      remixedAdText,
      sourceAd,
    },
    fileName: `adradar-remixed-ad-text-${safeFileSlug(remixedAdText.brandName)}.txt`,
    txtContent: buildRemixedAdTextFileContent(remixedAdText),
  };
}

const creationsCollection = (prefix: "remix" | "adtext") => (prefix === "remix" ? "remixes" : "remixed_ad_texts");

/**
 * What the caller may do with a Library item. Previous Searches (public ad library results) are always for sale.
 * A remix or remixed ad text is for sale only once its creator has made it public; the creator can always open
 * their own, and a buyer keeps access to what they bought even if it's made private later.
 */
export async function getLibraryItemAccess(
  uid: string,
  itemKey: string,
): Promise<{ purchased: boolean; isOwn: boolean; isPublic: boolean }> {
  const { prefix, sourceId } = parseItemKey(itemKey);
  const purchased = await hasPurchasedLibraryItem(uid, itemKey);
  if (prefix === "search") return { purchased, isOwn: false, isPublic: true };
  const snap = await db.collection(creationsCollection(prefix)).doc(sourceId).get();
  if (!snap.exists) throw new ApiError("NOT_FOUND", "That Library item no longer exists.", 404);
  return { purchased, isOwn: snap.get("uid") === uid, isPublic: snap.get("isPublic") === true };
}

/** The creator makes one of their remixes / remixed ad texts public (offered for sale in the Library) or private. */
export async function setLibraryItemVisibility(uid: string, itemKey: string, isPublic: boolean): Promise<void> {
  const { prefix, sourceId } = parseItemKey(itemKey);
  if (prefix === "search") {
    throw new ApiError("INVALID_INPUT", "Only remixes and remixed ad texts can be made public or private.", 400);
  }
  const ref = db.collection(creationsCollection(prefix)).doc(sourceId);
  await db.runTransaction(async (t) => {
    const snap = await t.get(ref);
    if (!snap.exists) throw new ApiError("NOT_FOUND", "That Library item no longer exists.", 404);
    if (snap.get("uid") !== uid) {
      throw new ApiError("FORBIDDEN", "Only the person who created this can change whether it's public.", 403);
    }
    t.update(ref, isPublic ? { isPublic: true, publishedAt: new Date().toISOString() } : { isPublic: false });
  });
}

export async function hasPurchasedLibraryItem(uid: string, itemKey: string): Promise<boolean> {
  const snap = await db
    .collection("users")
    .doc(uid)
    .collection("library_purchases")
    .doc(itemKey)
    .get();
  return snap.exists;
}

export async function recordLibraryPurchase(params: {
  itemKey: string;
  sourceId: string;
  kind: LibraryItemKind;
  uid: string;
  txId: string;
  tokensPaid: number;
}): Promise<LibraryPurchaseDoc> {
  const doc = LibraryPurchaseDocSchema.parse({
    ...params,
    purchasedAt: new Date().toISOString(),
  });
  await db
    .collection("users")
    .doc(params.uid)
    .collection("library_purchases")
    .doc(params.itemKey)
    .set(doc, { merge: true });
  return doc;
}
