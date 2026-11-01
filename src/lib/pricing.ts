/**
 * Token economy constants, shared by server routes and the wallet UI.
 * Default currency is AUD ("aud") and default token price is 1 Token = AUD $1.
 * All invoices and Stripe Checkout transactions are strictly billed in Australian Dollars (AUD).
 * Never uses decimals: only whole numbers, with all amounts rounded up (Math.ceil).
 * For all nations except Australia and New Zealand, an AUD to USD conversion is shown.
 */
import type { TokenPackId } from "./contracts";

/**
 * Server-authoritative action costs (integers only). 0 makes an action free: it still needs a
 * signed-in user but writes nothing to the ledger. Customizable via SuperAdmin Control Panel.
 */
export const ACTION_COSTS: Record<"RADAR_SEARCH" | "AI_REMIX" | "BRAND_CLONE", number> = {
  RADAR_SEARCH: 0,
  AI_REMIX: 0,
  BRAND_CLONE: 5,
};
export type ChargeableAction = keyof typeof ACTION_COSTS;

export const SERVICE_SURCHARGES = {
  EXTENDED_DAYS: 1,
  ELITE_SCORE: 2,
};

/** Calculates total token charge for a search including longevity and score filter surcharges. */
export function calculateSearchCost(
  req?: { extendedLongevity?: boolean; eliteWinnersOnly?: boolean },
  customServiceCosts?: { searchStandard: number; searchExtendedDays: number; searchEliteScore: number }
): number {
  const base = customServiceCosts ? customServiceCosts.searchStandard : ACTION_COSTS.RADAR_SEARCH;
  const ext = customServiceCosts ? customServiceCosts.searchExtendedDays : SERVICE_SURCHARGES.EXTENDED_DAYS;
  const elite = customServiceCosts ? customServiceCosts.searchEliteScore : SERVICE_SURCHARGES.ELITE_SCORE;

  let cost = base;
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
 * Enforces strict whole numbers: always rounds up (Math.ceil) to the nearest whole dollar in cents.
 */
export function audToUsdCents(audCents: number): number {
  const usdCents = audCents * FX_AUD_TO_USD;
  return Math.ceil(usdCents / 100) * 100;
}

/** Converts USD cents to AUD cents, strictly rounded up to whole dollars in cents. */
export function usdToAudCents(usdCents: number): number {
  return Math.ceil((usdCents / FX_AUD_TO_USD) / 100) * 100;
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
  tokens: number;
  /** Minor units (cents) in AUD — all invoices & Stripe checkouts settle in AUD. Whole dollars. */
  priceCents: number;
  /** Minor units (cents) in USD — currency conversion shown for nations outside AU & NZ. Whole dollars. */
  priceUsdCents: number;
}

/** Creates a TokenPack instance dynamically with the specified or system AUD base rate. */
export function buildTokenPack(
  id: TokenPackId,
  tokens: number,
  audCentsPerToken = DEFAULT_AUD_CENTS_PER_TOKEN
): TokenPack {
  const cleanTokens = Math.max(1, Math.ceil(tokens));
  const priceCents = Math.ceil(cleanTokens * audCentsPerToken);
  const priceUsdCents = audToUsdCents(priceCents);
  return {
    id,
    tokens: cleanTokens,
    priceCents,
    priceUsdCents,
  };
}

export const TOKEN_PACKS: Record<"PACK_10" | "PACK_50" | "PACK_100", TokenPack> = {
  PACK_10: {
    id: "PACK_10",
    tokens: 10,
    priceCents: 10 * DEFAULT_AUD_CENTS_PER_TOKEN, // $10 AUD
    priceUsdCents: audToUsdCents(10 * DEFAULT_AUD_CENTS_PER_TOKEN), // $7 USD (rounded up)
  },
  PACK_50: {
    id: "PACK_50",
    tokens: 50,
    priceCents: 50 * DEFAULT_AUD_CENTS_PER_TOKEN, // $50 AUD
    priceUsdCents: audToUsdCents(50 * DEFAULT_AUD_CENTS_PER_TOKEN), // $33 USD (rounded up)
  },
  PACK_100: {
    id: "PACK_100",
    tokens: 100,
    priceCents: 100 * DEFAULT_AUD_CENTS_PER_TOKEN, // $100 AUD
    priceUsdCents: audToUsdCents(100 * DEFAULT_AUD_CENTS_PER_TOKEN), // $65 USD (rounded up)
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

/** Formats USD without decimals, rounding up to whole dollars. */
export const formatUsd = (cents: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.ceil(cents / 100));

export const formatPrice = (cents: number) => formatAud(cents);
