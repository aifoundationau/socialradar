import type { AdAgentDistributionItem } from "./contracts";
import { audToUsdCents } from "./pricing";

/**
 * Computes consistent display metrics for an Ad Agent row across both the
 * Super Admin `Ad Agent & Customizations Value` table and the Ad Agent's
 * own `Distributions` tab.
 *
 * - Enforces strict integer tokens (`Math.round`, non-negative).
 * - Reflects Super Admin's `Reset 0 ⚡` action (`lastResetAt` with `0` unpaid tokens)
 *   immediately by setting Redistribution Amount to `0`, and accrues only new
 *   unpaid customizations completed after `lastResetAt`.
 */
export function computeAdAgentDisplayItem(
  agent: AdAgentDistributionItem,
  options: {
    customizeServiceUnitTokens: number;
    audCentsPerTokenUnit: number;
    ecbRate?: number;
  },
): AdAgentDistributionItem {
  const unitTokens = Math.max(0, Math.round(Number(options.customizeServiceUnitTokens ?? 55)));
  const centsPerToken = Math.max(1, Math.round(Number(options.audCentsPerTokenUnit ?? 100)));

  const effectiveOrdersCount = Math.max(1, Math.round(Number(agent.customizationsCount || 1)));
  const totalCustomizationsTokens = Math.max(0, Math.round(effectiveOrdersCount * unitTokens));
  const totalCustomizationsAudCents = Math.max(0, Math.round(totalCustomizationsTokens * centsPerToken));
  const totalCustomizationsUsdCents = audToUsdCents(totalCustomizationsAudCents, options.ecbRate);

  const pct = Math.round(Number(agent.redistributionPercentage || 30));
  const isResetToZero = Boolean(agent.lastResetAt) && Math.round(Number(agent.redistributionTokens || 0)) === 0;
  const hasPostResetUnpaid =
    Boolean(agent.lastResetAt) &&
    agent.customizationsCount > 0 &&
    Math.round(Number(agent.redistributionTokens || 0)) > 0;

  const redistributionTokens = isResetToZero
    ? 0
    : hasPostResetUnpaid
      ? Math.max(0, Math.round(agent.redistributionTokens))
      : Math.max(0, Math.round((totalCustomizationsTokens * pct) / 100));

  const redistributionAudCents = isResetToZero
    ? 0
    : hasPostResetUnpaid
      ? Math.max(0, Math.round(agent.redistributionAudCents))
      : Math.max(0, Math.round((totalCustomizationsAudCents * pct) / 100));

  const redistributionUsdCents = isResetToZero
    ? 0
    : audToUsdCents(redistributionAudCents, options.ecbRate);

  return {
    ...agent,
    inActiveLedger: agent.inActiveLedger !== false,
    redistributionPercentage: pct,
    totalCustomizationsTokens,
    totalCustomizationsAudCents,
    totalCustomizationsUsdCents,
    redistributionTokens,
    redistributionAudCents,
    redistributionUsdCents,
  };
}

