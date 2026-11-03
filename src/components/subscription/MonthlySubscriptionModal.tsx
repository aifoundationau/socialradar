"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useSession } from "@/components/auth/SessionProvider";
import { Icon } from "@/components/ui/Icon";
import { btnPrimary, btnSecondary, card } from "@/components/ui/styles";
import { formatAud, formatUsd, audToUsdCents } from "@/lib/pricing";
import { apiFetch, errorMessage, newIdempotencyKey } from "@/lib/api-client";
import type { MonthlySubscriptionConfig } from "@/lib/contracts";

const emptySubscribe = () => () => {};
function useIsClient() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
}

export interface MonthlySubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenPricing?: () => void;
}

export function MonthlySubscriptionModal({
  isOpen,
  onClose,
  onOpenPricing,
}: MonthlySubscriptionModalProps) {
  const isClient = useIsClient();
  const { user, isAdmin, role } = useSession();
  const [subConfig, setSubConfig] = useState<MonthlySubscriptionConfig>({
    enabled: true,
    priceAud: 500,
    searchesPerMonth: 1000,
    name: "Monthly Search Subscription",
    description:
      "1,000 monthly searches for AUD $500/month. Options for every search: Every option is one token. This gives you 1,000 of those.",
  });
  const [loading, setLoading] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [granting, setGranting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    }
    if (isOpen) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
      loadConfig();
    } else {
      document.body.style.overflow = "";
      setMessage(null);
    }
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  async function loadConfig() {
    setLoading(true);
    try {
      const data = await apiFetch<{
        monthlySubscription?: MonthlySubscriptionConfig;
      }>("/api/wallet/checkout", { method: "GET" });
      if (data?.monthlySubscription) {
        setSubConfig(data.monthlySubscription);
      }
    } catch {
      // Fall back to default
    } finally {
      setLoading(false);
    }
  }

  async function handleSubscribe() {
    setSubscribing(true);
    setMessage(null);
    try {
      const res = await apiFetch<{ url: string }>("/api/wallet/checkout", {
        method: "POST",
        idempotencyKey: newIdempotencyKey(),
        body: {
          packId: "SUB_MONTHLY_1000",
        },
      });
      if (res?.url) {
        window.location.href = res.url;
      } else {
        throw new Error("No checkout URL returned from payment processor.");
      }
    } catch (err) {
      setMessage({ type: "error", text: errorMessage(err) });
      setSubscribing(false);
    }
  }

  async function handleGrantTest() {
    if (!user?.email) return;
    setGranting(true);
    setMessage(null);
    try {
      const res = await apiFetch<{ creditedTokens: number; balanceAfter: number }>("/api/admin/orders", {
        method: "POST",
        idempotencyKey: newIdempotencyKey(),
        body: {
          targetEmail: user.email,
          tokens: subConfig.searchesPerMonth,
          note: `Monthly Search Subscription allocation (${subConfig.searchesPerMonth} searches / $${subConfig.priceAud} AUD)`,
        },
      });
      setMessage({
        type: "success",
        text: `Allocated ${res.creditedTokens.toLocaleString()} subscription searches to ${user.email}. New balance: ${res.balanceAfter.toLocaleString()} tokens.`,
      });
    } catch (err) {
      setMessage({ type: "error", text: errorMessage(err) });
    } finally {
      setGranting(false);
    }
  }

  if (!isClient || !isOpen) return null;

  const priceAud = subConfig.priceAud ?? 500;
  const searchesCount = subConfig.searchesPerMonth ?? 1000;
  const audCents = Math.round(priceAud * 100);
  const usdCents = audToUsdCents(audCents);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="monthly-sub-title"
      data-agent-id="monthly-subscription-modal"
      data-testid="monthly-subscription-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Dialog Content */}
      <div className="relative flex w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-surface-container-low shadow-2xl transition-all duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.08] px-5 py-3 sm:py-3.5 bg-gradient-to-r from-primary-container/20 to-surface-container-low">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <span className="flex size-9 sm:size-10 items-center justify-center rounded-xl border border-primary-container/40 bg-primary-container/30 text-primary shadow-sm shrink-0">
              <Icon name="sparkles" className="size-4 sm:size-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="monthly-sub-title" className="text-title-sm sm:text-title-md font-bold text-on-surface">
                  Monthly Search Subscription
                </h2>
                <span className="rounded bg-primary/20 px-2 py-0.5 font-mono text-[9px] sm:text-[10px] font-bold text-primary uppercase">
                  {role === "superadmin" ? "Super Admin" : "Main Admin"}
                </span>
              </div>
              <p className="text-[11px] sm:text-compact text-on-surface-variant">
                1,000 monthly searches for competitive intelligence &amp; creative scaling
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close subscription dialog"
            data-agent-id="close-subscription-modal-button"
            data-testid="close-subscription-modal-button"
            className="flex size-8 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-white/[0.08] hover:text-on-surface shrink-0"
          >
            <Icon name="x" className="size-4 sm:size-5" />
          </button>
        </div>

        {/* Content Body - Perfectly centered with zero scrollbars */}
        <div className="p-4 sm:p-5 space-y-3">
          {/* Main Price & Search Allowance Banner */}
          <div className="relative overflow-hidden rounded-xl border border-primary/30 bg-gradient-to-br from-primary/10 via-surface-container-high to-surface-container p-3.5 sm:p-4 text-on-surface">
            <div className="flex items-center justify-between gap-3">
              <div>
                <span className="font-mono text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-primary">
                  Privileged Search Tier
                </span>
                <h3 className="text-title-md sm:text-title-lg font-bold text-on-surface mt-0.5">
                  {searchesCount.toLocaleString()} Monthly Searches
                </h3>
                <p className="text-[11px] text-on-surface-variant mt-0.5">
                  Billed monthly at {formatAud(audCents)} AUD (≈ {formatUsd(usdCents)} USD)
                </p>
              </div>

              <div className="flex flex-col items-end shrink-0 rounded-xl border border-white/10 bg-surface-container-lowest/80 px-3 py-1.5 sm:py-2 backdrop-blur-sm">
                <span className="font-mono text-[9px] text-outline uppercase tracking-wider">
                  Monthly Fee
                </span>
                <span className="font-mono text-title-md sm:text-title-lg font-bold text-primary">
                  {formatAud(audCents)}
                  <span className="text-[11px] font-normal text-on-surface-variant"> / mo</span>
                </span>
                <span className="font-mono text-[10px] text-on-surface-variant">
                  ≈ {formatUsd(usdCents)} USD
                </span>
              </div>
            </div>

            {/* Explanation Quote from Specification */}
            <div className="mt-2.5 rounded-lg border border-primary/20 bg-surface-container-lowest/60 px-3 py-2 font-mono text-[11px] text-on-surface leading-snug">
              <span className="font-bold text-primary">Options for every search: </span>
              Every option is one token. This gives you {searchesCount.toLocaleString()} of those.
            </div>
          </div>

          {/* Breakdown of What the 1,000 Searches/Tokens Cover */}
          <div className="rounded-xl border border-white/[0.08] bg-surface-container-lowest/60 p-3 space-y-2">
            <h4 className="font-mono text-[10px] font-bold text-on-surface uppercase tracking-wider">
              Search Options &amp; Feature Breakdown
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
              <div className="flex items-center gap-2 rounded-lg border border-white/[0.04] bg-surface-container/70 px-2.5 py-1.5">
                <Icon name="search" className="size-3.5 text-primary shrink-0" />
                <span className="font-medium text-on-surface">Base Radar Search (1 token)</span>
              </div>

              <div className="flex items-center gap-2 rounded-lg border border-white/[0.04] bg-surface-container/70 px-2.5 py-1.5">
                <Icon name="zap" className="size-3.5 text-winner shrink-0" />
                <span className="font-medium text-on-surface">Proven Winners (28+d) (+1 token)</span>
              </div>

              <div className="flex items-center gap-2 rounded-lg border border-white/[0.04] bg-surface-container/70 px-2.5 py-1.5">
                <Icon name="layers" className="size-3.5 text-secondary shrink-0" />
                <span className="font-medium text-on-surface">Extended (60+d) (+1 token)</span>
              </div>

              <div className="flex items-center gap-2 rounded-lg border border-white/[0.04] bg-surface-container/70 px-2.5 py-1.5">
                <Icon name="flame" className="size-3.5 text-hot shrink-0" />
                <span className="font-medium text-on-surface">Top Winners (90%+ Score) (+1 token)</span>
              </div>
            </div>
            <p className="text-[10.5px] text-on-surface-variant font-mono leading-relaxed">
              Tokens can also be used to pay for <strong className="text-on-surface">Customize your Brand Strategy with Professional Experts</strong>, AI Creative Remixes (1 token) &amp; Variation Regenerations (1 token).
            </p>
          </div>

          {/* Status Message */}
          {message && (
            <div
              className={`rounded-xl border p-2.5 text-[11px] font-medium ${
                message.type === "success"
                  ? "border-winner/40 bg-winner/10 text-winner"
                  : "border-error/40 bg-error/10 text-error"
              }`}
            >
              {message.text}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 border-t border-white/[0.08] bg-surface-container-lowest/80 px-4 sm:px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            data-agent-id="sub-modal-close-button"
            data-testid="sub-modal-close-button"
            aria-label="Close subscription dialog"
            className={`${btnSecondary} w-full sm:w-auto text-xs py-1.5`}
          >
            Close
          </button>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
            {isAdmin && (
              <button
                type="button"
                onClick={handleGrantTest}
                disabled={granting || subscribing}
                data-agent-id="admin-grant-subscription-button"
                data-testid="admin-grant-subscription-button"
                aria-label={`Allocate ${searchesCount} subscription searches to ${user?.email}`}
                className={`${btnSecondary} text-xs font-mono py-1.5`}
                title="SuperAdmin / MainAdmin allocation"
              >
                {granting ? (
                  <span className="size-3.5 animate-spin rounded-full border-2 border-on-surface/30 border-t-on-surface" />
                ) : (
                  <Icon name="zap" className="size-3.5 text-primary" />
                )}
                <span>Allocate {searchesCount.toLocaleString()} Searches</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleSubscribe}
              disabled={subscribing || granting || loading}
              data-agent-id="subscribe-monthly-button"
              data-testid="subscribe-monthly-button"
              aria-label={`Subscribe Monthly for ${formatAud(audCents)} AUD`}
              className={`${btnPrimary} text-xs font-mono py-1.5`}
            >
              {subscribing ? (
                <span className="size-3.5 animate-spin rounded-full border-2 border-on-primary/30 border-t-on-primary" />
              ) : (
                <Icon name="sparkles" className="size-3.5" />
              )}
              <span>Subscribe ({formatAud(audCents)} AUD / mo)</span>
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

