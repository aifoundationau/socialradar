import { NextResponse } from "next/server";
import { db, verifyRequest } from "@/lib/firebase-admin";
import { ApiError, errorResponse, readJson, requireIdempotencyKey } from "@/lib/api";
import {
  LibraryPurchaseRequestSchema,
  type LibraryPurchaseRequest,
  type LibraryPurchaseResponse,
} from "@/lib/contracts";
import { getSystemConfig } from "@/lib/admin";
import {
  getLibraryItemAccess,
  getUnlockedLibraryItem,
  recordLibraryPurchase,
} from "@/lib/library";
import { isChargingEnabled } from "@/lib/pricing";
import { withTokenGate } from "@/lib/token-ledger";

/**
 * Unlocks and purchases a Library item using the SuperAdmin-configured `serviceCosts.libraryItems` fee.
 * Items the caller already bought, or created themselves, open at 0 extra tokens. A remix or remixed ad text is
 * only for sale once its creator has made it public.
 */
export async function POST(req: Request) {
  let input: LibraryPurchaseRequest;
  try {
    input = LibraryPurchaseRequestSchema.parse(await readJson(req));
  } catch (err) {
    return errorResponse(err);
  }

  try {
    const caller = await verifyRequest(req);
    requireIdempotencyKey(req);

    // Never charge for something the caller already has: an item bought earlier, or their own creation.
    const access = await getLibraryItemAccess(caller.uid, input.itemKey);
    if (access.purchased || access.isOwn) {
      const [payload, userSnap] = await Promise.all([
        getUnlockedLibraryItem(caller.uid, input.itemKey, access.purchased),
        db.collection("users").doc(caller.uid).get(),
      ]);
      const balanceAfter = Math.max(
        0,
        Math.round(Number(userSnap.exists ? userSnap.get("tokenBalance") ?? 0 : 0)),
      );
      return NextResponse.json({
        item: { ...payload.summary, purchased: access.purchased },
        detail: payload.detail,
        fileName: payload.fileName,
        txtContent: payload.txtContent,
        balanceAfter,
        alreadyPurchased: true,
      } satisfies LibraryPurchaseResponse);
    }
    // Remixes are written from their creator's private brand profile, so they're private until made public.
    if (!access.isPublic) {
      throw new ApiError("FORBIDDEN", "This item is private: its creator hasn't made it public.", 403);
    }
  } catch (err) {
    return errorResponse(err);
  }

  const config = await getSystemConfig();
  const configuredFee = config.serviceCosts?.libraryItems ?? 1;
  const cost = isChargingEnabled(config) ? Math.max(0, Math.round(configuredFee)) : 0;

  return withTokenGate(
    req,
    "LIBRARY_ITEM_PURCHASE",
    `Library Item: ${input.itemKey}`,
    async ({ caller, txId, cost: effectiveCost, balanceAfter, replayed }) => {
      const payload = await getUnlockedLibraryItem(caller.uid, input.itemKey, true);
      if (!replayed) {
        await recordLibraryPurchase({
          itemKey: input.itemKey,
          sourceId: payload.summary.sourceId,
          kind: payload.summary.kind,
          uid: caller.uid,
          txId,
          tokensPaid: effectiveCost,
        });
      }
      return NextResponse.json({
        item: { ...payload.summary, purchased: true },
        detail: payload.detail,
        fileName: payload.fileName,
        txtContent: payload.txtContent,
        balanceAfter,
        alreadyPurchased: replayed,
      } satisfies LibraryPurchaseResponse);
    },
    cost,
  );
}
