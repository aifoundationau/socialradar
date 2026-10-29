/**
 * Token economy constants, shared by server routes and the wallet UI.
 * Prices are what Stripe charges: the server builds Checkout line items from this table.
 */
import type { TokenPackId } from "./contracts";

/** Server-authoritative action costs (integers only). */
export const ACTION_COSTS = { RADAR_SEARCH: 2, AI_REMIX: 5 } as const;
export type ChargeableAction = keyof typeof ACTION_COSTS;

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
