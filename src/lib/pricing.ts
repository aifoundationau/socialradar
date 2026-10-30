/**
 * Token economy constants, shared by server routes and the wallet UI.
 * Prices are what Stripe charges: the server builds Checkout line items from this table.
 */
import type { TokenPackId } from "./contracts";

/**
 * Server-authoritative action costs (integers only). 0 makes an action free: it still needs a
 * signed-in user but writes nothing to the ledger. Both are free for now; the paid prices are 2 and 5.
 */
export const ACTION_COSTS: Record<"RADAR_SEARCH" | "AI_REMIX", number> = { RADAR_SEARCH: 0, AI_REMIX: 0 };
export type ChargeableAction = keyof typeof ACTION_COSTS;

/** "Free", "1 token" or "5 tokens". */
export const costLabel = (action: ChargeableAction) => {
  const cost = ACTION_COSTS[action];
  return cost === 0 ? "Free" : `${cost} ${cost === 1 ? "token" : "tokens"}`;
};

export const TOKEN_PACK_CURRENCY = "aud";

export interface TokenPack {
  id: TokenPackId;
  tokens: number;
  /** Minor units (cents) of TOKEN_PACK_CURRENCY. */
  priceCents: number;
}

export const TOKEN_PACKS: Record<TokenPackId, TokenPack> = {
  PACK_100: { id: "PACK_100", tokens: 100, priceCents: 1900 },
  PACK_500: { id: "PACK_500", tokens: 500, priceCents: 7900 },
  PACK_2000: { id: "PACK_2000", tokens: 2000, priceCents: 24900 },
};

export const formatPrice = (cents: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: TOKEN_PACK_CURRENCY.toUpperCase() }).format(cents / 100);
