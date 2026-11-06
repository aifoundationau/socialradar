/**
 * Token economy constants, shared by server routes and the wallet UI.
 * Default currency is AUD ("aud") and default token price is 1 Token = AUD $1.
 * All invoices and Stripe Checkout transactions are strictly billed in Australian Dollars (AUD).
 * Never uses decimals: only whole numbers, with all amounts rounded up (Math.ceil).
 * For all nations except Australia and New Zealand, an AUD to USD conversion is shown.
 */
import type { FreeAccessWindow, TokenPackId, UserDoc } from "./contracts";
import {
  ALL_COUNTRIES_CODE,
  WORLD_COUNTRIES,
  formatAllowedCountriesSummary,
  getCountryName,
  normalizeAllowedCountries,
  type WorldCountryOption,
} from "./countries";

export {
  ALL_COUNTRIES_CODE,
  WORLD_COUNTRIES,
  formatAllowedCountriesSummary,
  getCountryName,
  normalizeAllowedCountries,
  type WorldCountryOption,
};

/**
 * Returns true if the user has an active Monthly Search Subscription (`SUB_MONTHLY_1000`)
 * or is a Super Admin.
 */
export function isMonthlySubscriber(
  user?: Partial<Pick<UserDoc, "subscriptionStatus" | "subscriptionPackId">> | null,
  isSuperAdmin = false
): boolean {
  if (isSuperAdmin) return true;
  if (!user) return false;
  return (
    user.subscriptionStatus === "active" ||
    (user.subscriptionPackId === "SUB_MONTHLY_1000" && user.subscriptionStatus !== "canceled")
  );
}

/**
 * Returns true if the user's country is included in the SuperAdmin's selected countries
 * for the Timed Free Access Window (`allowedCountries` contains `"ALL"` or `userCountry`).
 */
export function isCountryEligibleForFreeAccess(
  freeAccessWindow?: Partial<FreeAccessWindow> | null,
  userCountry?: string | null
): boolean {
  if (!freeAccessWindow) return false;
  const countries = normalizeAllowedCountries(freeAccessWindow.allowedCountries);
  if (countries.includes(ALL_COUNTRIES_CODE)) return true;
  const cleanUserCountry = (userCountry || "AU").trim().toUpperCase();
  return countries.includes(cleanUserCountry);
}

/**
 * Returns true if the SuperAdmin-controlled Timed Free Access Window (15m, 30m, or 60m)
 * is currently toggled on and has not yet expired.
 */
export function isFreeAccessWindowActive(
  freeAccessWindow?: Partial<FreeAccessWindow> | null,
  nowMs?: number
): boolean {
  if (!freeAccessWindow || !freeAccessWindow.enabled || !freeAccessWindow.expiresAt) {
    return false;
  }
  const currentMs = typeof nowMs === "number" ? nowMs : Date.now();
  if (currentMs <= 0) return false;
  const exp = Date.parse(freeAccessWindow.expiresAt);
  return Number.isFinite(exp) && exp > currentMs;
}

/**
 * Returns true if paid token charging is active for the given user.
 * - If `isTokenSystemEnabled === false`, charging is disabled for all users.
 * - If a Timed Free Access Window (15m/30m/60m) is active, charging is disabled ONLY for Monthly Subscribers
 *   whose country is included in `freeAccessWindow.allowedCountries`.
 */
export function isChargingEnabled(
  config?: {
    isTokenSystemEnabled?: boolean;
    freeAccessWindow?: Partial<FreeAccessWindow> | null;
  } | null,
  nowMs?: number,
  user?: Partial<Pick<UserDoc, "subscriptionStatus" | "subscriptionPackId">> | null,
  isSuperAdmin = false,
  userCountry?: string | null
): boolean {
  if (!config) return true;
  if (config.isTokenSystemEnabled === false) return false;
  if (
    isFreeAccessWindowActive(config.freeAccessWindow, nowMs) &&
    isMonthlySubscriber(user, isSuperAdmin) &&
    isCountryEligibleForFreeAccess(config.freeAccessWindow, userCountry ?? "AU")
  ) {
    return false;
  }
  return true;
}

/**
 * Server-authoritative action costs (integers only). 0 makes an action free: it still needs a
 * signed-in user but writes nothing to the ledger. Customizable via SuperAdmin Control Panel.
 */
export const ACTION_COSTS: Record<"RADAR_SEARCH" | "AI_REMIX" | "REGENERATE_VARIATIONS" | "BRAND_CLONE" | "CUSTOMIZE_SERVICE", number> = {
  RADAR_SEARCH: 1,
  AI_REMIX: 1,
  REGENERATE_VARIATIONS: 1,
  BRAND_CLONE: 1,
  CUSTOMIZE_SERVICE: 55,
};
export type ChargeableAction = keyof typeof ACTION_COSTS;

export const SERVICE_SURCHARGES = {
  PROVEN_WINNERS: 1,
  EXTENDED_DAYS: 1,
  ELITE_SCORE: 1,
};

/** Calculates total token charge for a search including proven winners, longevity, and score filter surcharges. */
export function calculateSearchCost(
  req?: { provenWinnersOnly?: boolean; extendedLongevity?: boolean; eliteWinnersOnly?: boolean },
  customServiceCosts?: {
    searchStandard: number;
    searchProvenWinners?: number;
    searchExtendedDays: number;
    searchEliteScore: number;
  }
): number {
  const base = customServiceCosts ? customServiceCosts.searchStandard : ACTION_COSTS.RADAR_SEARCH;
  const proven = customServiceCosts?.searchProvenWinners ?? SERVICE_SURCHARGES.PROVEN_WINNERS;
  const ext = customServiceCosts ? customServiceCosts.searchExtendedDays : SERVICE_SURCHARGES.EXTENDED_DAYS;
  const elite = customServiceCosts ? customServiceCosts.searchEliteScore : SERVICE_SURCHARGES.ELITE_SCORE;

  let cost = base;
  if (req?.provenWinnersOnly) cost += proven;
  if (req?.extendedLongevity) cost += ext;
  if (req?.eliteWinnersOnly) cost += elite;
  return Math.max(0, Math.ceil(cost));
}

/** Standard foreign exchange rate: AUD $1 = USD $0.65. */
export const FX_AUD_TO_USD = 0.65;

export const TOKEN_PACK_CURRENCY = "aud";

/** Default rate is 1 Token = AUD $1 (100 cents AUD). */
export const DEFAULT_AUD_CENTS_PER_TOKEN = 100;
/** Legacy alias preserved for compatibility. */
export const DEFAULT_USD_CENTS_PER_TOKEN = 100;

/**
 * Converts AUD cents to USD cents for nations outside Australia and New Zealand.
 * Currency conversion can show up to 2 decimal places (rounded to the nearest cent).
 * Supports an optional dynamic live FX rate (defaults to FX_AUD_TO_USD = 0.65).
 */
export function audToUsdCents(audCents: number, fxRate: number = FX_AUD_TO_USD): number {
  const rate = typeof fxRate === "number" && fxRate > 0 ? fxRate : FX_AUD_TO_USD;
  return Math.round(audCents * rate);
}

/** Converts USD cents to AUD cents. Supports an optional dynamic live FX rate. */
export function usdToAudCents(usdCents: number, fxRate: number = FX_AUD_TO_USD): number {
  const rate = typeof fxRate === "number" && fxRate > 0 ? fxRate : FX_AUD_TO_USD;
  return Math.round(usdCents / rate);
}

export function formatTokenEstimateHover(
  tokens: number,
  isAuNz = true,
  audCentsPerToken = DEFAULT_AUD_CENTS_PER_TOKEN
): string {
  if (tokens <= 0) return "Free (0 tokens)";
  const audCents = Math.ceil(tokens * audCentsPerToken);
  const usdCents = audToUsdCents(audCents);
  if (isAuNz) {
    return `${formatAud(audCents)} AUD`;
  }
  return `${formatAud(audCents)} AUD (≈ ${formatUsd(usdCents)} USD)`;
}

/** "Free", "1 token" or "5 tokens". */
export const costLabel = (action: ChargeableAction, overrideCost?: number) => {
  const cost = typeof overrideCost === "number" ? overrideCost : ACTION_COSTS[action];
  return cost === 0 ? "Free" : `${cost} ${cost === 1 ? "token" : "tokens"}`;
};

export interface TokenPack {
  id: TokenPackId;
  name?: string;
  tokens: number;
  /** Minor units (cents) in AUD — all invoices & Stripe checkouts settle in AUD. Whole dollars. */
  priceCents: number;
  /** Minor units (cents) in USD — currency conversion shown for nations outside AU & NZ. Whole dollars. */
  priceUsdCents: number;
}

/** Creates a TokenPack instance dynamically with the specified or system AUD base rate and optional live FX rate. */
export function buildTokenPack(
  id: TokenPackId,
  tokens: number,
  audCentsPerToken = DEFAULT_AUD_CENTS_PER_TOKEN,
  fxRate?: number,
  customPriceCents?: number,
  name?: string
): TokenPack {
  const cleanTokens = Math.max(1, Math.ceil(tokens));
  const priceCents =
    typeof customPriceCents === "number" && customPriceCents >= 100
      ? Math.round(customPriceCents)
      : Math.ceil(cleanTokens * audCentsPerToken);
  const priceUsdCents = audToUsdCents(priceCents, fxRate);
  return {
    id,
    ...(name ? { name } : {}),
    tokens: cleanTokens,
    priceCents,
    priceUsdCents,
  };
}

export const TOKEN_PACKS: Record<"PACK_10" | "PACK_50" | "PACK_100", TokenPack> = {
  PACK_10: {
    id: "PACK_10",
    name: "Quick Pack (10)",
    tokens: 10,
    priceCents: 10 * DEFAULT_AUD_CENTS_PER_TOKEN, // $10 AUD
    priceUsdCents: audToUsdCents(10 * DEFAULT_AUD_CENTS_PER_TOKEN), // $6.50 USD
  },
  PACK_50: {
    id: "PACK_50",
    name: "Creator Pack (50)",
    tokens: 50,
    priceCents: 50 * DEFAULT_AUD_CENTS_PER_TOKEN, // $50 AUD
    priceUsdCents: audToUsdCents(50 * DEFAULT_AUD_CENTS_PER_TOKEN), // $32.50 USD
  },
  PACK_100: {
    id: "PACK_100",
    name: "Pro Pack (100)",
    tokens: 100,
    priceCents: 100 * DEFAULT_AUD_CENTS_PER_TOKEN, // $100 AUD
    priceUsdCents: audToUsdCents(100 * DEFAULT_AUD_CENTS_PER_TOKEN), // $65 USD
  },
};

/** Formats AUD without decimals, rounding up to whole dollars. */
export const formatAud = (cents: number) =>
  new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.ceil(cents / 100));

/** Formats USD currency conversion showing up to 2 decimal places. */
export const formatUsd = (cents: number) => {
  const dollars = cents / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: dollars % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(dollars);
};

export const formatPrice = (cents: number) => formatAud(cents);
