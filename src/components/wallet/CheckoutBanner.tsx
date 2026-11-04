"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "@/components/auth/SessionProvider";
import { apiFetch, errorMessage } from "@/lib/api-client";
import type { CheckoutFulfillmentResult } from "@/lib/stripe";
import { alertError, alertInfo, alertSuccess } from "@/components/ui/styles";

/** Shown after Stripe redirects back to /wallet?checkout=success|cancelled(&session_id=cs_...). */
export function CheckoutBanner() {
  const params = useSearchParams();
  const status = params.get("checkout");
  const sessionId = params.get("session_id");
  const router = useRouter();
  const { user } = useSession();

  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<CheckoutFulfillmentResult | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const confirmedRef = useRef<string | null>(null);

  useEffect(() => {
    if (status !== "success" || !sessionId || !user) return;
    if (confirmedRef.current === sessionId) return;
    confirmedRef.current = sessionId;

    setConfirming(true);
    setConfirmError(null);
    apiFetch<CheckoutFulfillmentResult>("/api/wallet/confirm", {
      method: "POST",
      body: { sessionId },
    })
      .then((res) => {
        setResult(res);
      })
      .catch((err) => {
        setConfirmError(errorMessage(err));
      })
      .finally(() => {
        setConfirming(false);
      });
  }, [status, sessionId, user]);

  if (status !== "success" && status !== "cancelled") return null;

  let bannerText = "Checkout cancelled. You have not been charged.";
  if (status === "success") {
    if (confirming) {
      bannerText = "Confirming your Stripe AUD payment and distributing tokens to your account…";
    } else if (confirmError) {
      bannerText = `Payment received (${confirmError}). Your tokens will sync automatically.`;
    } else if (result?.fulfilled) {
      const taxStr =
        result.taxApplied === false || result.taxCents === 0
          ? ` (No Tax · ${result.buyerCountry || "International"})`
          : typeof result.taxCents === "number"
            ? ` (+ $${(result.taxCents / 100).toFixed(2)} AUD 10% GST)`
            : " (+ 10% GST)";
      if (result.isSubscription) {
        bannerText = `Monthly Search Subscription active! Payment confirmed in AUD${taxStr} and +${(result.tokens ?? 1000).toLocaleString("en-AU")} monthly searches/tokens have been distributed to your account (Balance: ${(result.balanceAfter ?? 0).toLocaleString("en-AU")} tokens).`;
      } else {
        bannerText = `Payment confirmed in AUD${taxStr}! +${(result.tokens ?? 0).toLocaleString("en-AU")} tokens have been distributed to your account (Balance: ${(result.balanceAfter ?? 0).toLocaleString("en-AU")} tokens).`;
      }
    } else {
      bannerText =
        "Payment received in AUD. Your tokens are added as soon as Stripe confirms it, usually within a few seconds.";
    }
  }

  return (
    <div
      className={`${
        status !== "success"
          ? alertInfo
          : confirmError
            ? alertError
            : alertSuccess
      } flex items-start justify-between gap-4`}
      role="status"
      data-agent-id="checkout-status-banner"
      data-testid="checkout-status-banner"
    >
      <p>{bannerText}</p>
      <button
        type="button"
        data-agent-id="checkout-banner-dismiss"
        data-testid="checkout-banner-dismiss"
        aria-label="Dismiss checkout status banner"
        className="shrink-0 font-medium underline-offset-2 hover:underline"
        onClick={() => router.replace("/wallet", { scroll: false })}
      >
        Dismiss
      </button>
    </div>
  );
}
