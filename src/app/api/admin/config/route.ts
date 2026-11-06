import { NextResponse } from "next/server";
import { verifyRequest } from "@/lib/firebase-admin";
import { errorResponse, readJson } from "@/lib/api";
import {
  addEquityPartner,
  deleteEquityPartner,
  flushRadarCache,
  getRedistributiveLedger,
  getStripePurchases,
  getSystemConfig,
  grantDevAdminRole,
  recordStripePurchase,
  resetPartnerTokens,
  resetRedistributiveLedger,
  setFreeAccessWindow,
  updateEquityPartner,
  updateSystemConfig,
} from "@/lib/admin";
import type { EquityPartner, FreeAccessDurationMinutes } from "@/lib/contracts";

export async function GET(req: Request) {
  try {
    const caller = await verifyRequest(req, { requireRole: "admin" });
    const [config, ledger, recentPurchases] = await Promise.all([
      getSystemConfig(),
      getRedistributiveLedger(),
      getStripePurchases(50),
    ]);

    return NextResponse.json({
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

export async function PUT(req: Request) {
  try {
    const caller = await verifyRequest(req, { requireRole: "admin" });

    const body = (await readJson(req)) as Record<string, unknown>;

    if (body.action === "SET_FREE_ACCESS_WINDOW" || body.freeAccessWindow !== undefined) {
      const superCaller = await verifyRequest(req, { requireRole: "superadmin" });
      if (body.action === "SET_FREE_ACCESS_WINDOW") {
        const hasDuration = Object.prototype.hasOwnProperty.call(body, "durationMinutes");
        const rawDuration = body.durationMinutes;
        const durationMinutes: FreeAccessDurationMinutes | null | undefined = !hasDuration
          ? undefined
          : rawDuration === 15 || rawDuration === 30 || rawDuration === 60
            ? rawDuration
            : null;
        const allowedCountries = Array.isArray(body.allowedCountries)
          ? body.allowedCountries.map((c) => String(c))
          : undefined;
        const updated = await setFreeAccessWindow(durationMinutes, superCaller.email, allowedCountries);
        const ledger = await getRedistributiveLedger();
        return NextResponse.json({ success: true, config: updated, ledger });
      }
    }

    if (body.action === "FLUSH_CACHE") {
      const flushedCount = await flushRadarCache();
      return NextResponse.json({ success: true, flushedCount });
    }

    if (body.action === "ADD_EQUITY_PARTNER") {
      const partner = body.partner as Omit<EquityPartner, "createdAt" | "partnerId">;
      const updated = await addEquityPartner(partner);
      const ledger = await getRedistributiveLedger();
      return NextResponse.json({ success: true, equityPartners: updated, ledger });
    }

    if (body.action === "UPDATE_EQUITY_PARTNER") {
      const partnerId = String(body.partnerId);
      const patch = (body.patch || {}) as Partial<EquityPartner>;
      const updated = await updateEquityPartner(partnerId, patch);
      const ledger = await getRedistributiveLedger();
      return NextResponse.json({ success: true, equityPartners: updated, ledger });
    }

    if (body.action === "DELETE_EQUITY_PARTNER") {
      const partnerId = String(body.partnerId);
      const updated = await deleteEquityPartner(partnerId);
      const ledger = await getRedistributiveLedger();
      return NextResponse.json({ success: true, equityPartners: updated, ledger });
    }

    if (body.action === "RESET_PARTNER_TOKENS") {
      const partnerId = String(body.partnerId);
      const result = await resetPartnerTokens({
        partnerId,
        resetByEmail: caller.email,
        callerUid: caller.uid,
      });
      const [ledger, recentPurchases] = await Promise.all([
        getRedistributiveLedger(),
        getStripePurchases(50),
      ]);
      return NextResponse.json({
        success: true,
        equityPartners: result.equityPartners,
        ledger,
        recentPurchases,
        clearedTokens: result.clearedTokens,
        partnerEmail: result.partnerEmail,
      });
    }

    if (body.action === "RESET_REDISTRIBUTIVE_LEDGER") {
      const result = await resetRedistributiveLedger(caller.uid);
      return NextResponse.json({
        success: true,
        deletedCount: result.deletedCount,
        ledger: result.ledger,
        recentPurchases: result.recentPurchases,
      });
    }

    if (body.action === "SIMULATE_PURCHASE") {
      const tokens = Number(body.tokens) || 100;
      const amountCents = Number(body.amountCents) || 1900;
      const packId = String(body.packId || "PACK_100");
      const purchaseId = `sim_ch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      await recordStripePurchase({
        purchaseId,
        uid: caller.uid,
        email: caller.email,
        packId,
        tokens,
        amountCents,
        currency: "aud",
        createdAt: new Date().toISOString(),
      });
      const [ledger, recentPurchases] = await Promise.all([
        getRedistributiveLedger(),
        getStripePurchases(50),
      ]);
      return NextResponse.json({ success: true, ledger, recentPurchases });
    }

    const updated = await updateSystemConfig(body);
    const ledger = await getRedistributiveLedger();
    return NextResponse.json({ success: true, config: updated, ledger });
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
      getStripePurchases(50),
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
