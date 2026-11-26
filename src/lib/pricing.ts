/**
 * Token economy constants, shared by server routes and the wallet UI.
 * Default currency is AUD ("aud") and default token price is 1 Token = AUD $1.
 * All invoices and Stripe Checkout transactions are strictly billed in Australian Dollars (AUD).
 * Never uses decimals: only whole numbers, with all amounts rounded up (Math.ceil).
 * For all nations except Australia and New Zealand, an AUD to USD conversion is shown.
 */
import type { AdAgentServiceCosts, FreeAccessWindow, ServiceCosts, TieredServiceCostKey, TokenPackId, UserDoc } from "./contracts";
import { TIERED_SERVICE_COST_KEYS } from "./contracts";
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

/** Master feature toggle for Monthly Search Subscriptions (hidden for now; flip to `true` to re-enable). */
export const ENABLE_MONTHLY_SUBSCRIPTIONS_FEATURE: boolean = false;

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
  // past_due / canceled subscribers don't count; a record with the pack but no status at all (saved before
  // statuses were tracked) still does.
  return (
    user.subscriptionStatus === "active" ||
    (user.subscriptionPackId === "SUB_MONTHLY_1000" && !user.subscriptionStatus)
  );
}

/**
 * Returns true if the user's country is included in the SuperAdmin's selected countries
 * for the Timed Free Access Window (`allowedCountries` contains `"ALL"` or `userCountry`).
 * When restricted to specific countries and `userCountry` is omitted, returns `false` so
 * server routes without edge geo defer the decision to `withTokenGate`'s IP lookup.
 */
export function isCountryEligibleForFreeAccess(
  freeAccessWindow?: Partial<FreeAccessWindow> | null,
  userCountry?: string | null
): boolean {
  if (!freeAccessWindow) return false;
  const countries = normalizeAllowedCountries(freeAccessWindow.allowedCountries);
  if (countries.includes(ALL_COUNTRIES_CODE)) return true;
  const cleanUserCountry = userCountry?.trim().toUpperCase();
  if (!cleanUserCountry) return false;
  return countries.includes(cleanUserCountry);
}

/**
 * Formats remaining seconds in a Timed Free Access countdown (e.g. `23h 59m 59s` or `14m 59s`).
 */
export function formatFreeAccessCountdown(remainingSec: number): string {
  const safeSec = Math.max(0, Math.floor(remainingSec));
  const hrs = Math.floor(safeSec / 3600);
  const mins = Math.floor((safeSec % 3600) / 60);
  const secs = safeSec % 60;
  if (hrs > 0) {
    return `${hrs}h ${String(mins).padStart(2, "0")}m ${String(secs).padStart(2, "0")}s`;
  }
  return `${mins}m ${String(secs).padStart(2, "0")}s`;
}

/**
 * Returns true if the SuperAdmin-controlled Timed Free Access Window (15m, 30m, 60m, or 1440m / 24h)
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
 * - SuperAdmin Free Rule: SuperAdmin never pays for use — everything is free (`0` tokens) for SuperAdmin.
 * - If `isTokenSystemEnabled === false`, charging is disabled for all users.
 * - If a Timed Free Access Window (15m/30m/60m/1440m) is active, charging is disabled for ALL Subscribers
 *   whose country is included in `freeAccessWindow.allowedCountries`.
 */
export function isChargingEnabled(
  config?: {
    isTokenSystemEnabled?: boolean;
    freeAccessWindow?: Partial<FreeAccessWindow> | null;
  } | null,
  nowMs?: number,
  _user?: Partial<Pick<UserDoc, "subscriptionStatus" | "subscriptionPackId">> | null,
  isSuperAdmin = false,
  userCountry?: string | null
): boolean {
  void _user;
  if (isSuperAdmin) return false;
  if (!config) return true;
  if (config.isTokenSystemEnabled === false) return false;
  if (
    isFreeAccessWindowActive(config.freeAccessWindow, nowMs) &&
    isCountryEligibleForFreeAccess(config.freeAccessWindow, userCountry)
  ) {
    return false;
  }
  return true;
}

export const SUPPORTER_DEFAULT_OPTION_TOKENS = 2;
export const AD_AGENT_DEFAULT_OPTION_TOKENS = 1;

/**
 * Server-authoritative action costs (integers only). 0 makes an action free: it still needs a
 * signed-in user but writes nothing to the ledger. Customizable via SuperAdmin Control Panel.
 * Defaults apply to Supporters (2 tokens per tiered option); Ad Agents use AD_AGENT_ACTION_COSTS (1 token).
 */
export const ACTION_COSTS: Record<
  | "RADAR_SEARCH"
  | "SEARCH_IMAGE_VIEW"
  | "AI_REMIX"
  | "REGENERATE_VARIATIONS"
  | "BUILD_REMIXED_AD_TEXT"
  | "LIBRARY_ITEM_PURCHASE"
  | "BRAND_CLONE"
  | "BRAND_TXT_DOWNLOAD"
  | "SEARCHMIX_DOWNLOAD"
  | "DECONSTRUCT_DOWNLOAD"
  | "CUSTOMIZE_SERVICE"
  | "CUSTOMIZE_AI_ASSISTANT",
  number
> = {
  RADAR_SEARCH: SUPPORTER_DEFAULT_OPTION_TOKENS,
  SEARCH_IMAGE_VIEW: 1,
  AI_REMIX: SUPPORTER_DEFAULT_OPTION_TOKENS,
  REGENERATE_VARIATIONS: SUPPORTER_DEFAULT_OPTION_TOKENS,
  BUILD_REMIXED_AD_TEXT: SUPPORTER_DEFAULT_OPTION_TOKENS,
  LIBRARY_ITEM_PURCHASE: SUPPORTER_DEFAULT_OPTION_TOKENS,
  BRAND_CLONE: SUPPORTER_DEFAULT_OPTION_TOKENS,
  BRAND_TXT_DOWNLOAD: SUPPORTER_DEFAULT_OPTION_TOKENS,
  SEARCHMIX_DOWNLOAD: SUPPORTER_DEFAULT_OPTION_TOKENS,
  DECONSTRUCT_DOWNLOAD: SUPPORTER_DEFAULT_OPTION_TOKENS,
  CUSTOMIZE_SERVICE: 55,
  CUSTOMIZE_AI_ASSISTANT: 1,
};
export type ChargeableAction = keyof typeof ACTION_COSTS;

export const AD_AGENT_ACTION_COSTS: Record<ChargeableAction, number> = {
  RADAR_SEARCH: AD_AGENT_DEFAULT_OPTION_TOKENS,
  SEARCH_IMAGE_VIEW: 1,
  AI_REMIX: AD_AGENT_DEFAULT_OPTION_TOKENS,
  REGENERATE_VARIATIONS: AD_AGENT_DEFAULT_OPTION_TOKENS,
  BUILD_REMIXED_AD_TEXT: AD_AGENT_DEFAULT_OPTION_TOKENS,
  LIBRARY_ITEM_PURCHASE: AD_AGENT_DEFAULT_OPTION_TOKENS,
  BRAND_CLONE: AD_AGENT_DEFAULT_OPTION_TOKENS,
  BRAND_TXT_DOWNLOAD: AD_AGENT_DEFAULT_OPTION_TOKENS,
  SEARCHMIX_DOWNLOAD: AD_AGENT_DEFAULT_OPTION_TOKENS,
  DECONSTRUCT_DOWNLOAD: AD_AGENT_DEFAULT_OPTION_TOKENS,
  CUSTOMIZE_SERVICE: 55,
  CUSTOMIZE_AI_ASSISTANT: 1,
};

export const SERVICE_SURCHARGES = {
  PROVEN_WINNERS: SUPPORTER_DEFAULT_OPTION_TOKENS,
  EXTENDED_DAYS: SUPPORTER_DEFAULT_OPTION_TOKENS,
  ELITE_SCORE: SUPPORTER_DEFAULT_OPTION_TOKENS,
};

export const AD_AGENT_SERVICE_SURCHARGES = {
  PROVEN_WINNERS: AD_AGENT_DEFAULT_OPTION_TOKENS,
  EXTENDED_DAYS: AD_AGENT_DEFAULT_OPTION_TOKENS,
  ELITE_SCORE: AD_AGENT_DEFAULT_OPTION_TOKENS,
};

export const DEFAULT_SUPPORTER_SERVICE_COSTS: ServiceCosts = {
  searchStandard: SUPPORTER_DEFAULT_OPTION_TOKENS,
  searchProvenWinners: SUPPORTER_DEFAULT_OPTION_TOKENS,
  searchExtendedDays: SUPPORTER_DEFAULT_OPTION_TOKENS,
  searchEliteScore: SUPPORTER_DEFAULT_OPTION_TOKENS,
  searchImageView: 1,
  aiRemix: SUPPORTER_DEFAULT_OPTION_TOKENS,
  regenerateVariations: SUPPORTER_DEFAULT_OPTION_TOKENS,
  buildRemixedAdText: SUPPORTER_DEFAULT_OPTION_TOKENS,
  libraryItems: SUPPORTER_DEFAULT_OPTION_TOKENS,
  brandClone: SUPPORTER_DEFAULT_OPTION_TOKENS,
  brandTxtDownload: SUPPORTER_DEFAULT_OPTION_TOKENS,
  searchMixDownload: SUPPORTER_DEFAULT_OPTION_TOKENS,
  deconstructDownload: SUPPORTER_DEFAULT_OPTION_TOKENS,
  customizeService: 55,
  customizeAiAssistant: 1,
};

export const DEFAULT_AD_AGENT_SERVICE_COSTS: AdAgentServiceCosts = {
  searchStandard: AD_AGENT_DEFAULT_OPTION_TOKENS,
  searchProvenWinners: AD_AGENT_DEFAULT_OPTION_TOKENS,
  searchExtendedDays: AD_AGENT_DEFAULT_OPTION_TOKENS,
  searchEliteScore: AD_AGENT_DEFAULT_OPTION_TOKENS,
  searchImageView: 1,
  aiRemix: AD_AGENT_DEFAULT_OPTION_TOKENS,
  regenerateVariations: AD_AGENT_DEFAULT_OPTION_TOKENS,
  buildRemixedAdText: AD_AGENT_DEFAULT_OPTION_TOKENS,
  libraryItems: AD_AGENT_DEFAULT_OPTION_TOKENS,
  brandClone: AD_AGENT_DEFAULT_OPTION_TOKENS,
  brandTxtDownload: AD_AGENT_DEFAULT_OPTION_TOKENS,
  searchMixDownload: AD_AGENT_DEFAULT_OPTION_TOKENS,
  deconstructDownload: AD_AGENT_DEFAULT_OPTION_TOKENS,
};

/**
 * Returns true if the user or claims subject should receive Ad Agent service pricing.
 * For Super Admins, only true when explicitly acting as `"ad_agent"`.
 */
export function isAdAgentPricingRole(
  subject?:
    | string
    | {
        role?: string | null;
        roles?: readonly string[] | null;
        isAdAgent?: boolean | null;
        isSuperAdmin?: boolean | null;
      }
    | null
): boolean {
  if (!subject) return false;
  if (typeof subject === "string") return subject === "ad_agent";
  if (subject.role === "ad_agent") return true;
  if (subject.isSuperAdmin) return false;
  return Boolean(
    subject.isAdAgent === true ||
      (Array.isArray(subject.roles) && subject.roles.includes("ad_agent"))
  );
}

/** Resolves effective integer service costs for Supporters (default) or Ad Agents. */
export function resolveServiceCostsForRole(
  config?: {
    serviceCosts?: Partial<ServiceCosts> | null;
    adAgentServiceCosts?: Partial<AdAgentServiceCosts> | null;
  } | null,
  isAdAgent = false
): ServiceCosts {
  const base: ServiceCosts = {
    ...DEFAULT_SUPPORTER_SERVICE_COSTS,
    ...(config?.serviceCosts ?? {}),
  };
  if (isAdAgent) {
    for (const key of TIERED_SERVICE_COST_KEYS) {
      const overrideVal = config?.adAgentServiceCosts?.[key];
      base[key] =
        typeof overrideVal === "number" && Number.isFinite(overrideVal)
          ? Math.max(0, Math.round(overrideVal))
          : DEFAULT_AD_AGENT_SERVICE_COSTS[key as TieredServiceCostKey];
    }
  }
  return base;
}

/** Calculates total token charge for a search including proven winners, longevity, and score filter surcharges. */
export function calculateSearchCost(
  req?: { provenWinnersOnly?: boolean; extendedLongevity?: boolean; eliteWinnersOnly?: boolean },
  customServiceCosts?: {
    searchStandard: number;
    searchProvenWinners?: number;
    searchExtendedDays: number;
    searchEliteScore: number;
  },
  isAdAgent = false
): number {
  const defaultAction = isAdAgent ? AD_AGENT_ACTION_COSTS : ACTION_COSTS;
  const defaultSurcharges = isAdAgent ? AD_AGENT_SERVICE_SURCHARGES : SERVICE_SURCHARGES;
  const base = customServiceCosts ? customServiceCosts.searchStandard : defaultAction.RADAR_SEARCH;
  const proven = customServiceCosts?.searchProvenWinners ?? defaultSurcharges.PROVEN_WINNERS;
  const ext = customServiceCosts ? customServiceCosts.searchExtendedDays : defaultSurcharges.EXTENDED_DAYS;
  const elite = customServiceCosts ? customServiceCosts.searchEliteScore : defaultSurcharges.ELITE_SCORE;

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

/** Standard Stripe Australia online card processing fee: 1.75% + $0.30 AUD (30 cents) per order. */
export const STRIPE_AU_FEE_RATE = 0.0175;
export const STRIPE_AU_FIXED_FEE_CENTS = 30;

/**
 * Returns net customization revenue in AUD cents after deducting Stripe processing fees
 * (1.75% + $0.30 AUD per customization order). Never returns negative cents.
 */
export function netAudCentsAfterStripeFee(grossAudCents: number, orderCount = 1): number {
  const gross = Math.max(0, Math.round(grossAudCents));
  if (gross <= 0) return 0;
  const orders = Math.max(1, Math.round(orderCount));
  const stripeFeeCents = Math.round(gross * STRIPE_AU_FEE_RATE) + orders * STRIPE_AU_FIXED_FEE_CENTS;
  return Math.max(0, gross - stripeFeeCents);
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
