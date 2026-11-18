import { NextResponse } from "next/server";
import { db, verifyRequest } from "@/lib/firebase-admin";
import { ApiError, errorResponse } from "@/lib/api";
import {
  LibraryItemKeySchema,
  LibraryListQuerySchema,
  type FreeAccessWindow,
  type LibraryListResponse,
  type UserDoc,
} from "@/lib/contracts";
import { getSystemConfig } from "@/lib/admin";
import { getUnlockedLibraryItem, hasPurchasedLibraryItem, listLibraryItems } from "@/lib/library";
import {
  ALL_COUNTRIES_CODE,
  isChargingEnabled,
  isFreeAccessWindowActive,
  normalizeAllowedCountries,
} from "@/lib/pricing";
import { resolveRequestCountry } from "@/lib/request-geo";

/**
 * Lists all saved Library items (Previous Searches, Remix Studio, Remixed Ad Text),
 * or fetches a previously purchased item's full unlocked payload via `?itemKey=...`.
 */
export async function GET(req: Request) {
  // Touch request headers before try/catch so Next.js 16 cleanly bails out of static prerendering without logging an unhandled error.
  void req.headers.get("authorization");
  try {
    const caller = await verifyRequest(req);
    const { searchParams } = new URL(req.url);
    const rawItemKey = searchParams.get("itemKey");

    if (rawItemKey) {
      const itemKey = LibraryItemKeySchema.parse(rawItemKey);
      const unlockedBefore = await hasPurchasedLibraryItem(caller.uid, itemKey);
      if (!unlockedBefore) {
        throw new ApiError(
          "FORBIDDEN",
          "Purchase this Library item first to view or download its full contents.",
          403,
        );
      }
      const payload = await getUnlockedLibraryItem(caller.uid, itemKey, true);
      return NextResponse.json(
        {
          item: payload.summary,
          detail: payload.detail,
          fileName: payload.fileName,
          txtContent: payload.txtContent,
          alreadyPurchased: true,
        },
        { headers: { "Cache-Control": "no-store, max-age=0" } },
      );
    }

    const rawLimit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!, 10) : 120;
    const query = LibraryListQuerySchema.parse({
      q: searchParams.get("q") || undefined,
      kind: (searchParams.get("kind") || "ALL").toUpperCase(),
      platform: (searchParams.get("platform") || "ALL").toUpperCase(),
      limit: Number.isFinite(rawLimit) ? rawLimit : 120,
    });

    const [listing, config, userSnap] = await Promise.all([
      listLibraryItems(caller.uid, query),
      getSystemConfig(),
      db.collection("users").doc(caller.uid).get().catch(() => null),
    ]);

    const userData = userSnap?.exists ? (userSnap.data() as Partial<UserDoc>) : null;
    const freeWindow = config.freeAccessWindow as Partial<FreeAccessWindow> | undefined;
    const countryMatters =
      isFreeAccessWindowActive(freeWindow) &&
      !normalizeAllowedCountries(freeWindow?.allowedCountries).includes(ALL_COUNTRIES_CODE);
    const userCountry = countryMatters ? (await resolveRequestCountry(req)) || "AU" : ALL_COUNTRIES_CODE;

    const charging = isChargingEnabled(
      config,
      Date.now(),
      userData,
      caller.claims.isSuperAdmin,
      userCountry,
    );
    const libraryItemFee = charging
      ? Math.max(0, Math.round(config.serviceCosts?.libraryItems ?? 1))
      : 0;

    return NextResponse.json(
      {
        items: listing.items,
        counts: listing.counts,
        libraryItemFee,
        audCentsPerToken: config.audCentsPerToken ?? 100,
      } satisfies LibraryListResponse,
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (err) {
    return errorResponse(err);
  }
}
