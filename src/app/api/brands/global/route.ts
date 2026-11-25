import { NextResponse } from "next/server";
import { db, verifyRequest } from "@/lib/firebase-admin";
import { errorResponse } from "@/lib/api";
import { redactCommunityBrandForListing, searchGlobalBrands } from "@/lib/brands";
import { GlobalBrandSearchQuerySchema, type FreeAccessWindow, type UserDoc } from "@/lib/contracts";
import { getSystemConfig } from "@/lib/admin";
import {
  ALL_COUNTRIES_CODE,
  isAdAgentPricingRole,
  isChargingEnabled,
  isFreeAccessWindowActive,
  normalizeAllowedCountries,
  resolveServiceCostsForRole,
} from "@/lib/pricing";
import { resolveRequestCountry } from "@/lib/request-geo";

async function handleGlobalBrands(req: Request) {
  try {
    const caller = await verifyRequest(req);
    const { searchParams } = new URL(req.url);
    let bodyParams: Record<string, unknown> = {};
    if (req.method === "POST") {
      bodyParams = (await req.json().catch(() => ({}))) ?? {};
    }

    const rawQ = searchParams.get("q") ?? (typeof bodyParams.q === "string" ? bodyParams.q : undefined);
    const rawTone = searchParams.get("tone") ?? (typeof bodyParams.tone === "string" ? bodyParams.tone : undefined);
    const rawLimit = searchParams.get("limit")
      ? parseInt(searchParams.get("limit")!, 10)
      : typeof bodyParams.limit === "number"
        ? bodyParams.limit
        : 50;

    const parsed = GlobalBrandSearchQuerySchema.parse({
      q: rawQ || undefined,
      tone: rawTone && rawTone !== "ALL" ? rawTone : undefined,
      limit: Number.isFinite(rawLimit) ? rawLimit : 50,
    });

    const [brands, config, userSnap] = await Promise.all([
      searchGlobalBrands({
        query: parsed.q,
        tone: parsed.tone,
        limit: parsed.limit,
        callerUid: caller.uid,
      }),
      getSystemConfig(),
      db.collection("users").doc(caller.uid).get().catch(() => null),
    ]);

    const userData = userSnap?.exists ? (userSnap.data() as Partial<UserDoc>) : null;
    const freeWindow = config.freeAccessWindow as Partial<FreeAccessWindow> | undefined;
    const countryMatters =
      isFreeAccessWindowActive(freeWindow) &&
      !normalizeAllowedCountries(freeWindow?.allowedCountries).includes(ALL_COUNTRIES_CODE);
    // "" (country unknown) means the limited window doesn't apply, matching what withTokenGate charges.
    const userCountry = countryMatters ? await resolveRequestCountry(req) : ALL_COUNTRIES_CODE;
    const charging = isChargingEnabled(config, Date.now(), userData, caller.claims.isSuperAdmin, userCountry);
    const isAdAgent = isAdAgentPricingRole(caller.claims) || isAdAgentPricingRole(userData);
    const resolvedCosts = resolveServiceCostsForRole(config, isAdAgent);
    const brandCloneFee = charging
      ? Math.max(0, Math.round(resolvedCosts.brandClone))
      : 0;
    const brandTxtDownloadFee = charging
      ? Math.max(0, Math.round(resolvedCosts.brandTxtDownload))
      : 0;

    const redactedBrands = brands.map((b) =>
      redactCommunityBrandForListing(b, {
        callerUid: caller.uid,
        isSuperAdmin: caller.claims.isSuperAdmin === true,
        cloneCharging: brandCloneFee > 0,
        txtDownloadCharging: brandTxtDownloadFee > 0,
      }),
    );

    return NextResponse.json({
      brands: redactedBrands,
      brandCloneFee,
      brandTxtDownloadFee,
      audCentsPerToken: config.audCentsPerToken ?? 100,
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function GET(req: Request) {
  return handleGlobalBrands(req);
}

export async function POST(req: Request) {
  return handleGlobalBrands(req);
}
