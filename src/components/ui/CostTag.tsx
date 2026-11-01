"use client";

import { ACTION_COSTS, type ChargeableAction } from "@/lib/pricing";
import { Icon } from "./Icon";
import { useSession } from "@/components/auth/SessionProvider";

/** Price chip for buttons that spend tokens ("⚡ 5"). Renders nothing while the action is free or if caller is superadmin. */
export function CostTag({ action }: { action: ChargeableAction }) {
  const { isAdmin } = useSession();
  if (isAdmin) return null;
  const cost = ACTION_COSTS[action];
  if (cost === 0) return null;
  return (
    <span className="flex items-center font-mono text-mono-label opacity-75">
      <Icon name="zap" className="size-3" />
      {cost}
    </span>
  );
}
