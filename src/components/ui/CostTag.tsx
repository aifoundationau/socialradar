"use client";

import { ACTION_COSTS, type ChargeableAction } from "@/lib/pricing";
import { Icon } from "./Icon";

/** Price chip for buttons that spend tokens ("⚡ 5"). Renders nothing while the action is free. */
export function CostTag({ action, free = false }: { action: ChargeableAction; free?: boolean }) {
  const cost = free ? 0 : ACTION_COSTS[action];
  if (cost === 0) return null;
  return (
    <span className="flex items-center font-mono text-mono-label opacity-75">
      <Icon name="zap" className="size-3" />
      {cost}
    </span>
  );
}
