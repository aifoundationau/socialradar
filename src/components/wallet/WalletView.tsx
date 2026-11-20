"use client";

import { Suspense, useState } from "react";
import { useSession } from "@/components/auth/SessionProvider";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { Icon } from "@/components/ui/Icon";
import { alertError, alertInfo, btnSecondary, card, monoLabel } from "@/components/ui/styles";
import { CheckoutBanner } from "./CheckoutBanner";
import { LedgerHistory } from "./LedgerHistory";
import { TokenPacks } from "./TokenPacks";

export function WalletView() {
  const { user, profile } = useSession();
  const [confirmRefreshOpen, setConfirmRefreshOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const currentBalance = Math.max(0, profile ? profile.tokenBalance : 0);

  async function handleConfirmRefreshToZero() {
    setRefreshing(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const res = await apiFetch<{
        success: boolean;
        clearedTokens: number;
        balanceAfter: number;
      }>("/api/wallet/reset", {
        method: "POST",
        body: { confirmForfeit: true },
      });
      setConfirmRefreshOpen(false);
      setStatusMsg(
        `Your token balance has been refreshed to 0 (${res.clearedTokens.toLocaleString("en-AU")} unused tokens permanently cleared).`
      );
      window.dispatchEvent(new CustomEvent("wallet-updated"));
    } catch (err) {
      setErrorMsg(errorMessage(err));
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="space-y-8">
      <Suspense fallback={null}>
        <CheckoutBanner />
      </Suspense>

      <section
        data-agent-id="wallet-balance-section"
        data-testid="wallet-balance-section"
        className={`${card} space-y-4`}
      >
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-2">
            <h1 className={monoLabel}>Token balance</h1>
            <div className="flex flex-wrap items-center gap-4">
              <p
                data-agent-id="wallet-token-balance-value"
                data-testid="wallet-token-balance-value"
                className="flex items-center gap-2 font-mono text-[2.5rem] leading-none font-semibold text-secondary tabular-nums"
              >
                <Icon name="zap" className="size-7" />
                {profile ? currentBalance.toLocaleString("en-AU") : "–"}
              </p>

              <button
                type="button"
                disabled={!profile || currentBalance <= 0 || refreshing}
                onClick={() => {
                  setStatusMsg(null);
                  setErrorMsg(null);
                  setConfirmRefreshOpen(true);
                }}
                data-agent-id="wallet-refresh-tokens-zero-btn"
                data-testid="wallet-refresh-tokens-zero-btn"
                aria-label="Refresh token balance to 0"
                className="inline-flex items-center gap-1.5 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 font-mono text-xs font-semibold text-rose-300 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Icon name="refresh" className="size-3.5" />
                <span>Refresh Tokens to 0</span>
              </button>
            </div>
          </div>
          <div className="max-w-sm space-y-1.5 text-right sm:text-left">
            <div className="flex items-center gap-1.5 font-mono text-xs font-bold text-emerald-400">
              <Icon name="checkCircle" className="size-3.5 text-emerald-400 shrink-0" />
              <span>Tokens Never Expire Rule</span>
            </div>
            <p className="text-body-sm text-on-surface-variant leading-relaxed">
              Purchased tokens remain permanently in your account with zero expiration dates or maintenance fees. Per our Terms of Service, all token sales are final and strictly non-refundable. If a search or remix fails on our side, tokens are refunded automatically.
            </p>
          </div>
        </div>

        {profile && currentBalance <= 0 && (
          <div
            role="status"
            data-agent-id="wallet-zero-balance-buy-banner"
            data-testid="wallet-zero-balance-buy-banner"
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-amber-400/40 bg-amber-500/10 p-3.5"
          >
            <div className="flex items-center gap-2.5">
              <Icon name="alert" className="size-5 shrink-0 text-amber-300" />
              <p className="text-body-sm text-on-surface">
                <strong className="text-amber-200">Account balance is 0 tokens.</strong> Nobody can have negative tokens — all users at 0 tokens must buy more tokens below to continue.
              </p>
            </div>
            <a
              href="#packs"
              data-agent-id="wallet-zero-balance-buy-btn"
              data-testid="wallet-zero-balance-buy-btn"
              aria-label="Buy more tokens"
              className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 font-mono text-xs font-bold text-on-primary transition hover:bg-primary-fixed"
            >
              <Icon name="plus" className="size-3.5" />
              <span>Buy More Tokens</span>
            </a>
          </div>
        )}

        {/* Mandatory Centered Pop-Up Confirmation Explaining Permanent Action */}
        {confirmRefreshOpen && (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            onClick={() => {
              if (!refreshing) setConfirmRefreshOpen(false);
            }}
          >
            <div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="confirm-refresh-zero-title"
              data-agent-id="wallet-confirm-refresh-zero-box"
              data-testid="wallet-confirm-refresh-zero-box"
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-2xl border border-rose-500/60 bg-surface-container-high p-5 sm:p-6 shadow-2xl space-y-4"
            >
              <div className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-rose-500/20 text-rose-300">
                  <Icon name="alert" className="size-5" />
                </span>
                <div className="space-y-2">
                  <h2
                    id="confirm-refresh-zero-title"
                    className="font-mono text-xs font-bold uppercase tracking-wider text-rose-200"
                  >
                    Confirm Refresh Tokens to 0 — This Cannot Be Undone
                  </h2>
                  <p className="text-body-sm text-on-surface leading-relaxed">
                    You are about to permanently clear your wallet balance of{" "}
                    <strong className="font-mono text-rose-200">
                      {currentBalance.toLocaleString("en-AU")} tokens
                    </strong>{" "}
                    down to <strong className="font-mono text-rose-200">0</strong>.
                  </p>
                  <p className="text-body-sm text-rose-100/90 leading-relaxed">
                    <strong>This action cannot be undone.</strong> Purchased and bonus tokens
                    never expire on their own, and once reset to 0, those forfeited tokens{" "}
                    <strong>cannot be recovered, restored, or refunded</strong>.
                  </p>
                </div>
              </div>

              {errorMsg && <p className={alertError}>{errorMsg}</p>}

              <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-white/10">
                <button
                  type="button"
                  disabled={refreshing}
                  onClick={() => setConfirmRefreshOpen(false)}
                  data-agent-id="wallet-cancel-refresh-tokens-zero-btn"
                  data-testid="wallet-cancel-refresh-tokens-zero-btn"
                  aria-label="Cancel refreshing tokens to 0"
                  className={btnSecondary}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={refreshing}
                  onClick={handleConfirmRefreshToZero}
                  data-agent-id="wallet-confirm-refresh-tokens-zero-btn"
                  data-testid="wallet-confirm-refresh-tokens-zero-btn"
                  aria-label="Confirm refreshing tokens to 0 permanently"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-rose-500/70 bg-rose-500/25 px-3.5 py-2 font-mono text-xs font-bold text-rose-100 transition hover:bg-rose-500/35 disabled:opacity-50"
                >
                  <Icon
                    name="refresh"
                    className={`size-3.5 ${refreshing ? "animate-spin" : ""}`}
                  />
                  <span>
                    {refreshing
                      ? "Refreshing to 0…"
                      : "Confirm Reset to 0 (Cannot Be Undone)"}
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}

        {statusMsg && <p className={alertInfo}>{statusMsg}</p>}
        {errorMsg && <p className={alertError}>{errorMsg}</p>}
      </section>

      <TokenPacks />
      {user && <LedgerHistory uid={user.uid} />}
    </div>
  );
}
