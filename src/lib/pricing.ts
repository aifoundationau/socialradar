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
  RADAR_SEARCH: 1,
  AI_REMIX: 1,
  BRAND_CLONE: 1,
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
 */
export function audToUsdCents(audCents: number): number {
  return Math.round(audCents * FX_AUD_TO_USD);
}

/** Converts USD cents to AUD cents. */
export function usdToAudCents(usdCents: number): number {
  return Math.round(usdCents / FX_AUD_TO_USD);
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
    priceUsdCents: audToUsdCents(10 * DEFAULT_AUD_CENTS_PER_TOKEN), // $6.50 USD
  },
  PACK_50: {
    id: "PACK_50",
    tokens: 50,
    priceCents: 50 * DEFAULT_AUD_CENTS_PER_TOKEN, // $50 AUD
    priceUsdCents: audToUsdCents(50 * DEFAULT_AUD_CENTS_PER_TOKEN), // $32.50 USD
  },
  PACK_100: {
    id: "PACK_100",
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
