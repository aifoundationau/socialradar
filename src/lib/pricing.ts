/**
 * Token economy constants, shared by server routes and the wallet UI.
 * Prices are what Stripe charges: the server builds Checkout line items from this table.
 * Default base rate: 1 Token = USD $1.00. Converted to AUD at checkout as an Australian business.
 */
import type { TokenPackId } from "./contracts";

/**
 * Server-authoritative action costs (integers only). 0 makes an action free: it still needs a
 * signed-in user but writes nothing to the ledger. Both are free for now; the paid prices are 2 and 5.
 */
export const ACTION_COSTS: Record<"RADAR_SEARCH" | "AI_REMIX", number> = { RADAR_SEARCH: 0, AI_REMIX: 0 };
export type ChargeableAction = keyof typeof ACTION_COSTS;

export const SERVICE_SURCHARGES = {
  EXTENDED_DAYS: 1,
  ELITE_SCORE: 2,
};

/** Calculates total token charge for a search including longevity and score filter surcharges. */
export function calculateSearchCost(req?: { extendedLongevity?: boolean; eliteWinnersOnly?: boolean }): number {
  let cost = ACTION_COSTS.RADAR_SEARCH;
  if (req?.extendedLongevity) cost += SERVICE_SURCHARGES.EXTENDED_DAYS;
  if (req?.eliteWinnersOnly) cost += SERVICE_SURCHARGES.ELITE_SCORE;
  return cost;
}

/** Standard foreign exchange rate: 1 AUD = 0.65 USD (or 1 USD = ~1.54 AUD). */
export const FX_AUD_TO_USD = 0.65;

export const TOKEN_PACK_CURRENCY = "aud";

/** Default rate is 1 Token = USD $1.00 (100 cents USD). */
export const DEFAULT_USD_CENTS_PER_TOKEN = 100;

export function usdToAudCents(usdCents: number): number {
  return Math.round(usdCents / FX_AUD_TO_USD);
}

export function formatTokenEstimateHover(tokens: number, isAuNz = false, usdCentsPerToken = DEFAULT_USD_CENTS_PER_TOKEN): string {
  if (tokens <= 0) return "Free";
  const usdCents = tokens * usdCentsPerToken;
  const audCents = usdToAudCents(usdCents);
  if (isAuNz) {
    return `~${formatAud(audCents)} AUD`;
  }
  return `~${formatUsd(usdCents)} USD (~${formatAud(audCents)} AUD)`;
}

/** "Free", "1 token" or "5 tokens". */
export const costLabel = (action: ChargeableAction) => {
  const cost = ACTION_COSTS[action];
  return cost === 0 ? "Free" : `${cost} ${cost === 1 ? "token" : "tokens"}`;
};

export interface TokenPack {
  id: TokenPackId;
  tokens: number;
  /** Minor units (cents) in USD (1 Token = USD $1 base). */
  priceUsdCents: number;
  /** Minor units (cents) in AUD (settled at checkout). */
  priceCents: number;
}

/** Creates a TokenPack instance dynamically with the specified or system base rate. */
export function buildTokenPack(
  id: TokenPackId,
  tokens: number,
  usdCentsPerToken = DEFAULT_USD_CENTS_PER_TOKEN
): TokenPack {
  const cleanTokens = Math.max(1, Math.round(tokens));
  const priceUsdCents = Math.round(cleanTokens * usdCentsPerToken);
  const priceCents = usdToAudCents(priceUsdCents);
  return {
    id,
    tokens: cleanTokens,
    priceUsdCents,
    priceCents,
  };
}

export const TOKEN_PACKS: Record<"PACK_10" | "PACK_50" | "PACK_100", TokenPack> = {
  PACK_10: {
    id: "PACK_10",
    tokens: 10,
    priceUsdCents: 10 * DEFAULT_USD_CENTS_PER_TOKEN, // $10.00 USD
    priceCents: usdToAudCents(10 * DEFAULT_USD_CENTS_PER_TOKEN), // $15.00 AUD
  },
  PACK_50: {
    id: "PACK_50",
    tokens: 50,
    priceUsdCents: 50 * DEFAULT_USD_CENTS_PER_TOKEN, // $50.00 USD
    priceCents: usdToAudCents(50 * DEFAULT_USD_CENTS_PER_TOKEN), // $77.00 AUD
  },
  PACK_100: {
    id: "PACK_100",
    tokens: 100,
    priceUsdCents: 100 * DEFAULT_USD_CENTS_PER_TOKEN, // $100.00 USD
    priceCents: usdToAudCents(100 * DEFAULT_USD_CENTS_PER_TOKEN), // $154.00 AUD
  },
};

export const formatAud = (cents: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(cents / 100);

export const formatUsd = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

export const formatPrice = (cents: number) => formatAud(cents);
