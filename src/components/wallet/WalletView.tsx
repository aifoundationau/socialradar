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

              {!confirmRefreshOpen && (
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
              )}
            </div>
          </div>
          <div className="max-w-sm space-y-1.5 text-right sm:text-left">
            <div className="flex items-center gap-1.5 font-mono text-xs font-bold text-emerald-400">
              <Icon name="checkCircle" className="size-3.5 text-emerald-400 shrink-0" />
              <span>Tokens Never Expire Rule</span>
            </div>
            <p className="text-body-sm text-on-surface-variant leading-relaxed">
              Purchased tokens remain permanently in your account with zero expiration dates or maintenance fees. If a search or remix fails on our side, tokens are refunded automatically.
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

        {/* Mandatory Two-Step Confirmation Warning */}
        {confirmRefreshOpen && (
          <div
            role="alertdialog"
            aria-labelledby="confirm-refresh-zero-title"
            data-agent-id="wallet-confirm-refresh-zero-box"
            data-testid="wallet-confirm-refresh-zero-box"
            className="rounded-xl border border-rose-500/50 bg-rose-500/10 p-4 space-y-3"
          >
            <div className="flex items-start gap-2.5">
              <Icon name="alert" className="mt-0.5 size-5 shrink-0 text-rose-300" />
              <div className="space-y-1">
                <h2
                  id="confirm-refresh-zero-title"
                  className="font-mono text-xs font-bold uppercase tracking-wider text-rose-200"
                >
                  Confirm Refresh Tokens to 0 — Permanent Action
                </h2>
                <p className="text-body-sm text-on-surface">
                  You are about to refresh your token balance (
                  <strong className="font-mono text-rose-200">
                    {currentBalance.toLocaleString("en-AU")} tokens
                  </strong>
                  ) to <strong className="font-mono text-rose-200">0</strong>. Once confirmed,{" "}
                  <strong>you cannot retrieve those unused tokens</strong>.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
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
                    : "Confirm Refresh to 0 (Cannot Retrieve Unused Tokens)"}
                </span>
              </button>
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
