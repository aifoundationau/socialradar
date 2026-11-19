import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyRequest } from "@/lib/firebase-admin";
import { ApiError, errorResponse, readJson } from "@/lib/api";
import {
  addEquityPartner,
  deleteEquityPartner,
  flushRadarCache,
  getRedistributiveLedger,
  getStripePurchases,
  getSystemConfig,
  resetPartnerTokens,
  resetRedistributiveLedger,
  setFreeAccessWindow,
  setPurchaseRefunded,
  updateEquityPartner,
  updateSystemConfig,
  type AdminSystemConfig,
} from "@/lib/admin";
import { assertPermission, getCallerPermissions } from "@/lib/rbac";
import {
  AdminConfigPatchSchema,
  EquityPartnerInputSchema,
  EquityPartnerPatchSchema,
  PartnerIdSchema,
  type FreeAccessDurationMinutes,
  type RbacPermission,
} from "@/lib/contracts";

/** Actions on equity partners and the Redistributive Ledger ("Redistributive Ledger" permission). */
const LEDGER_ACTIONS = new Set([
  "ADD_EQUITY_PARTNER",
  "UPDATE_EQUITY_PARTNER",
  "DELETE_EQUITY_PARTNER",
  "RESET_PARTNER_TOKENS",
  "RESET_REDISTRIBUTIVE_LEDGER",
]);

/** Most recent Stripe purchases listed in the ledger (each can be marked refunded from the list). */
const RECENT_PURCHASES_LIMIT = 200;

/** Equity partners, ledger figures and Stripe purchases are only for callers with the ledger permission. */
async function ledgerView(permissions: Set<RbacPermission>) {
  if (!permissions.has("manage_ledger")) return {};
  const [ledger, recentPurchases] = await Promise.all([
    getRedistributiveLedger(),
    getStripePurchases(RECENT_PURCHASES_LIMIT),
  ]);
  return { ledger, recentPurchases };
}

function configView(config: AdminSystemConfig, permissions: Set<RbacPermission>): AdminSystemConfig {
  return permissions.has("manage_ledger") ? config : { ...config, equityPartners: [] };
}

export async function GET(req: Request) {
  try {
    const caller = await verifyRequest(req, { requireRole: "admin" });
    const permissions = await getCallerPermissions(caller);
    if (!permissions.has("manage_config")) assertPermission(permissions, "view_analytics");

    const [config, ledgerInfo] = await Promise.all([getSystemConfig(), ledgerView(permissions)]);
    return NextResponse.json({
      config: configView(config, permissions),
      ...ledgerInfo,
      isAdmin: true,
      user: { uid: caller.uid, email: caller.email, claims: caller.claims },
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PUT(req: Request) {
  try {
    const caller = await verifyRequest(req, { requireRole: "admin" });
    const permissions = await getCallerPermissions(caller);
    const body = (await readJson(req)) as Record<string, unknown>;
    const action = typeof body.action === "string" ? body.action : undefined;

    if (action === "SET_FREE_ACCESS_WINDOW") {
      if (caller.claims.isSuperAdmin !== true) {
        throw new ApiError("FORBIDDEN", "Only Super Admin can turn the Timed Free Access Window on or off.", 403);
      }
      const hasDuration = Object.prototype.hasOwnProperty.call(body, "durationMinutes");
      const rawDuration = body.durationMinutes;
      const durationMinutes: FreeAccessDurationMinutes | null | undefined = !hasDuration
        ? undefined
        : rawDuration === 15 || rawDuration === 30 || rawDuration === 60 || rawDuration === 1440
          ? rawDuration
          : null;
      const allowedCountries = Array.isArray(body.allowedCountries)
        ? body.allowedCountries.map((c) => String(c))
        : undefined;
      const updated = await setFreeAccessWindow(durationMinutes, caller.email, allowedCountries);
      return NextResponse.json({ success: true, config: updated, ...(await ledgerView(permissions)) });
    }

    if (action === "MARK_PURCHASE_REFUNDED") {
      // After a refund or chargeback (done by hand in Stripe): leave the purchase out of the equity ledger.
      if (caller.claims.isSuperAdmin !== true) {
        throw new ApiError("FORBIDDEN", "Only Super Admin can mark a purchase refunded.", 403);
      }
      const purchaseId = z.string().trim().min(1).max(128).parse(body.purchaseId);
      if (typeof body.refunded !== "boolean") {
        throw new ApiError("INVALID_INPUT", "refunded must be true or false.", 400);
      }
      await setPurchaseRefunded(purchaseId, body.refunded, caller.email);
      return NextResponse.json({ success: true, purchaseId, refunded: body.refunded, ...(await ledgerView(permissions)) });
    }

    if (action === "FLUSH_CACHE") {
      assertPermission(permissions, "flush_cache");
      const flushedCount = await flushRadarCache();
      return NextResponse.json({ success: true, flushedCount });
    }

    if (action && LEDGER_ACTIONS.has(action)) {
      assertPermission(permissions, "manage_ledger");

      if (action === "ADD_EQUITY_PARTNER") {
        const partner = EquityPartnerInputSchema.parse(body.partner);
        const updated = await addEquityPartner(partner);
        return NextResponse.json({ success: true, equityPartners: updated, ...(await ledgerView(permissions)) });
      }

      if (action === "UPDATE_EQUITY_PARTNER") {
        const partnerId = PartnerIdSchema.parse(body.partnerId);
        const patch = EquityPartnerPatchSchema.parse(body.patch ?? {});
        const updated = await updateEquityPartner(partnerId, patch);
        return NextResponse.json({ success: true, equityPartners: updated, ...(await ledgerView(permissions)) });
      }

      if (action === "DELETE_EQUITY_PARTNER") {
        const partnerId = PartnerIdSchema.parse(body.partnerId);
        const updated = await deleteEquityPartner(partnerId);
        return NextResponse.json({ success: true, equityPartners: updated, ...(await ledgerView(permissions)) });
      }

      if (action === "RESET_PARTNER_TOKENS") {
        const partnerId = PartnerIdSchema.parse(body.partnerId);
        const result = await resetPartnerTokens({
          partnerId,
          resetByEmail: caller.email,
          callerUid: caller.uid,
        });
        return NextResponse.json({
          success: true,
          equityPartners: result.equityPartners,
          ...(await ledgerView(permissions)),
          clearedTokens: result.clearedTokens,
          partnerEmail: result.partnerEmail,
        });
      }

      // RESET_REDISTRIBUTIVE_LEDGER
      const result = await resetRedistributiveLedger(caller.uid);
      return NextResponse.json({
        success: true,
        deletedCount: result.deletedCount,
        ledger: result.ledger,
        recentPurchases: result.recentPurchases,
      });
    }

    if (action !== undefined) {
      throw new ApiError("INVALID_INPUT", `Unknown config action: ${action}`, 400);
    }

    // Plain config save: validated field by field; anything not in the schema is rejected.
    assertPermission(permissions, "manage_config");
    const patch = AdminConfigPatchSchema.parse(body);
    if (patch.tokenPacks !== undefined && caller.claims.isSuperAdmin !== true) {
      throw new ApiError("FORBIDDEN", "Only Super Admin can create, edit, or delete token packs.", 403);
    }
    const updated = await updateSystemConfig(patch);
    return NextResponse.json({
      success: true,
      config: configView(updated, permissions),
      ...(await ledgerView(permissions)),
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const caller = await verifyRequest(req, { requireRole: "superadmin" });
    const [config, ledger, recentPurchases] = await Promise.all([
      getSystemConfig(),
      getRedistributiveLedger(),
      getStripePurchases(RECENT_PURCHASES_LIMIT),
    ]);

    return NextResponse.json({
      success: true,
      config,
      ledger,
      recentPurchases,
      isAdmin: true,
      user: { uid: caller.uid, email: caller.email, claims: caller.claims },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
