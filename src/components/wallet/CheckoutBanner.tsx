"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { alertInfo, alertSuccess } from "@/components/ui/styles";

/** Shown after Stripe redirects back to /wallet?checkout=success|cancelled. */
export function CheckoutBanner() {
  const status = useSearchParams().get("checkout");
  const router = useRouter();
  if (status !== "success" && status !== "cancelled") return null;

  return (
    <div className={`${status === "success" ? alertSuccess : alertInfo} flex items-start justify-between gap-4`} role="status">
      <p>
        {status === "success"
          ? "Payment received. Your tokens are added as soon as Stripe confirms it, usually within a few seconds."
          : "Checkout cancelled. You have not been charged."}
      </p>
      <button
        type="button"
        className="shrink-0 font-medium underline-offset-2 hover:underline"
        onClick={() => router.replace("/wallet", { scroll: false })}
      >
        Dismiss
      </button>
    </div>
  );
}
