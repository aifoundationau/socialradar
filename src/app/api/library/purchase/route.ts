import { NextResponse } from "next/server";
import { db, verifyRequest } from "@/lib/firebase-admin";
import { errorResponse, readJson, requireIdempotencyKey } from "@/lib/api";
import {
  LibraryPurchaseRequestSchema,
  type LibraryPurchaseRequest,
  type LibraryPurchaseResponse,
} from "@/lib/contracts";
import { getSystemConfig } from "@/lib/admin";
import {
  getUnlockedLibraryItem,
  hasPurchasedLibraryItem,
  recordLibraryPurchase,
} from "@/lib/library";
import { isChargingEnabled } from "@/lib/pricing";
import { withTokenGate } from "@/lib/token-ledger";

/**
 * Unlocks and purchases a Library item using the SuperAdmin-configured `serviceCosts.libraryItems` fee.
 * Already-unlocked items return immediately at 0 extra tokens.
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

    // Never double-charge if the user already unlocked this Library item earlier.
    const alreadyPurchased = await hasPurchasedLibraryItem(caller.uid, input.itemKey);
    if (alreadyPurchased) {
      const [payload, userSnap] = await Promise.all([
        getUnlockedLibraryItem(caller.uid, input.itemKey, true),
        db.collection("users").doc(caller.uid).get(),
      ]);
      const balanceAfter = Math.max(
        0,
        Math.round(Number(userSnap.exists ? userSnap.get("tokenBalance") ?? 0 : 0)),
      );
      return NextResponse.json({
        item: { ...payload.summary, purchased: true },
        detail: payload.detail,
        fileName: payload.fileName,
        txtContent: payload.txtContent,
        balanceAfter,
        alreadyPurchased: true,
      } satisfies LibraryPurchaseResponse);
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
