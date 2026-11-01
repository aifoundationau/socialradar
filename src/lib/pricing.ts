/**
 * Token economy constants, shared by server routes and the wallet UI.
 * Default currency is AUD ("aud") and default token price is 1 Token = AUD $1.00.
 * All invoices and Stripe Checkout transactions are billed in Australian Dollars (AUD).
 * For all nations except Australia and New Zealand, an AUD $1.00 -> USD conversion is shown.
 */
import type { TokenPackId } from "./contracts";

/**
 * Server-authoritative action costs (integers only). 0 makes an action free: it still needs a
 * signed-in user but writes nothing to the ledger. Customizable via SuperAdmin Control Panel.
 */
export const ACTION_COSTS: Record<"RADAR_SEARCH" | "AI_REMIX", number> = { RADAR_SEARCH: 0, AI_REMIX: 0 };
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
  return Math.max(0, Math.round(cost));
}

/** Standard foreign exchange rate: AUD $1.00 = USD $0.65. */
export const FX_AUD_TO_USD = 0.65;

export const TOKEN_PACK_CURRENCY = "aud";

/** Default rate is 1 Token = AUD $1.00 (100 cents AUD). */
export const DEFAULT_AUD_CENTS_PER_TOKEN = 100;
/** Legacy alias preserved for compatibility. */
export const DEFAULT_USD_CENTS_PER_TOKEN = 100;

/** Converts AUD cents to USD cents for nations outside Australia and New Zealand. */
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
  const audCents = Math.round(tokens * audCentsPerToken);
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
  /** Minor units (cents) in AUD — all invoices & Stripe checkouts settle in AUD. */
  priceCents: number;
  /** Minor units (cents) in USD — currency conversion shown for nations outside AU & NZ. */
  priceUsdCents: number;
}

/** Creates a TokenPack instance dynamically with the specified or system AUD base rate. */
export function buildTokenPack(
  id: TokenPackId,
  tokens: number,
  audCentsPerToken = DEFAULT_AUD_CENTS_PER_TOKEN
): TokenPack {
  const cleanTokens = Math.max(1, Math.round(tokens));
  const priceCents = Math.round(cleanTokens * audCentsPerToken);
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
    priceCents: 10 * DEFAULT_AUD_CENTS_PER_TOKEN, // A$10.00 AUD
    priceUsdCents: audToUsdCents(10 * DEFAULT_AUD_CENTS_PER_TOKEN), // US$6.50 USD
  },
  PACK_50: {
    id: "PACK_50",
    tokens: 50,
    priceCents: 50 * DEFAULT_AUD_CENTS_PER_TOKEN, // A$50.00 AUD
    priceUsdCents: audToUsdCents(50 * DEFAULT_AUD_CENTS_PER_TOKEN), // US$32.50 USD
  },
  PACK_100: {
    id: "PACK_100",
    tokens: 100,
    priceCents: 100 * DEFAULT_AUD_CENTS_PER_TOKEN, // A$100.00 AUD
    priceUsdCents: audToUsdCents(100 * DEFAULT_AUD_CENTS_PER_TOKEN), // US$65.00 USD
  },
};

export const formatAud = (cents: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(cents / 100);

export const formatUsd = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

export const formatPrice = (cents: number) => formatAud(cents);
