"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/ui/Icon";
import { btnPrimary, field } from "@/components/ui/styles";
import type { CurrencyRateResponse } from "@/app/api/currency/route";

const emptySubscribe = () => () => {};
function useIsClient() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
}

interface CurrencyConverterModalProps {
  isOpen: boolean;
  onClose: () => void;
  baseTokenPriceAud?: number;
}

const PRESETS = [1, 10, 50, 100, 500];

export function CurrencyConverterModal({
  isOpen,
  onClose,
  baseTokenPriceAud = 1,
}: CurrencyConverterModalProps) {
  const isClient = useIsClient();
  const [data, setData] = useState<CurrencyRateResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [audAmount, setAudAmount] = useState<string>("1");
  const [tokensAmount, setTokensAmount] = useState<string>("1");
  const [lastEdited, setLastEdited] = useState<"aud" | "tokens">("tokens");

  async function fetchRate() {
    setIsLoading(true);
    try {
      const res = await fetch("/api/currency", { cache: "no-store" });
      if (res.ok) {
        const json = (await res.json()) as CurrencyRateResponse;
        setData(json);
      }
    } catch {
      setData({
        rate: 0.7015,
        base: "AUD",
        target: "USD",
        date: new Date().toISOString().split("T")[0],
        source: "European Central Bank via Frankfurter API (Cached)",
        cachedAt: new Date().toISOString(),
      });
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (isOpen) {
      void fetchRate();
    }
  }, [isOpen]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    }
    if (isOpen) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !isClient) return null;

  const currentRate = data?.rate ?? 0.7015;
  const numAud = parseFloat(audAmount) || 0;
  const numTokens = parseFloat(tokensAmount) || 0;

  const computedUsd =
    lastEdited === "tokens"
      ? numTokens * baseTokenPriceAud * currentRate
      : numAud * currentRate;

  const handleTokensChange = (val: string) => {
    setLastEdited("tokens");
    setTokensAmount(val);
    const parsed = parseFloat(val);
    if (!isNaN(parsed) && parsed >= 0) {
      setAudAmount((parsed * baseTokenPriceAud).toString());
    } else {
      setAudAmount("");
    }
  };

  const handleAudChange = (val: string) => {
    setLastEdited("aud");
    setAudAmount(val);
    const parsed = parseFloat(val);
    if (!isNaN(parsed) && parsed >= 0) {
      setTokensAmount(Math.round(parsed / baseTokenPriceAud).toString());
    } else {
      setTokensAmount("");
    }
  };

  const handlePreset = (presetTokens: number) => {
    setLastEdited("tokens");
    setTokensAmount(presetTokens.toString());
    setAudAmount((presetTokens * baseTokenPriceAud).toString());
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="currency-modal-title"
      className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 overflow-hidden"
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        aria-hidden="true"
        className="fixed inset-0 bg-black/80 backdrop-blur-xs transition-opacity animate-in fade-in"
      />

      {/* Modal Surface - Compact, Zero Scrollbars */}
      <div
        data-testid="currency-converter-dialog"
        data-agent-id="currency-converter-dialog"
        className="relative z-10 flex w-full max-w-md flex-col overflow-hidden rounded-2xl border border-white/10 bg-surface-container-high shadow-2xl animate-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 sm:px-5 bg-surface-container-highest/50">
          <div className="flex items-center gap-2.5">
            <div className="flex size-7.5 items-center justify-center rounded-lg bg-secondary/15 text-secondary border border-secondary/30 shrink-0">
              <Icon name="tag" className="size-3.5" />
            </div>
            <div>
              <h2
                id="currency-modal-title"
                className="text-sm font-semibold tracking-tight text-on-surface sm:text-base leading-tight"
              >
                AUD to USD Currency Converter
              </h2>
              <p className="text-[11px] text-on-surface-variant leading-tight">
                Live ECB exchange rate via Frankfurter API
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close currency converter"
            data-testid="close-currency-modal"
            data-agent-id="close-currency-modal"
            className="rounded-lg p-1 text-outline transition-colors hover:bg-white/10 hover:text-on-surface active:scale-95"
          >
            <Icon name="x" className="size-4.5" />
          </button>
        </div>

        {/* Content Body - Compact Vertical Rhythm */}
        <div className="p-4 sm:p-5 space-y-3">
          {/* Live Rate Banner */}
          <div className="flex items-center justify-between rounded-xl border border-secondary/30 bg-secondary/10 px-3 py-2 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <span className="relative flex size-2 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-secondary opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-secondary" />
              </span>
              <span className="font-mono font-bold text-on-surface truncate">
                1 AUD = <span className="text-secondary">${currentRate.toFixed(4)} USD</span>
              </span>
              <span className="hidden sm:inline font-mono text-[10px] text-outline">
                ({data?.date || "Live"})
              </span>
            </div>

            <button
              type="button"
              onClick={() => void fetchRate()}
              disabled={isLoading}
              data-testid="refresh-currency-rate-btn"
              data-agent-id="refresh-currency-rate-btn"
              aria-label="Refresh Frankfurter live rate"
              title="Refresh live exchange rate from Frankfurter API"
              className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-surface-container px-2 py-1 text-[11px] text-on-surface hover:border-secondary/40 hover:text-secondary active:scale-95 disabled:opacity-50 transition-all shrink-0"
            >
              <Icon
                name="sliders"
                className={`size-2.5 ${isLoading ? "animate-spin text-secondary" : ""}`}
              />
              <span>{isLoading ? "Syncing..." : "Sync"}</span>
            </button>
          </div>

          {/* Dual Inputs */}
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label htmlFor="modal-token-input" className="text-[11px] font-medium text-outline mb-1 block">
                Tokens (AUD $1/ea)
              </label>
              <div className="relative">
                <input
                  id="modal-token-input"
                  type="number"
                  min="0"
                  step="1"
                  value={tokensAmount}
                  onChange={(e) => handleTokensChange(e.target.value)}
                  data-testid="converter-token-input"
                  data-agent-id="converter-token-input"
                  className={`${field} font-mono text-sm py-1.5 px-2.5 pr-14`}
                  placeholder="1"
                />
                <span className="pointer-events-none absolute right-2.5 top-2 text-[11px] text-outline font-mono">
                  Tokens
                </span>
              </div>
            </div>

            <div>
              <label htmlFor="modal-aud-input" className="text-[11px] font-medium text-outline mb-1 block">
                Australian Dollars
              </label>
              <div className="relative">
                <input
                  id="modal-aud-input"
                  type="number"
                  min="0"
                  step="any"
                  value={audAmount}
                  onChange={(e) => handleAudChange(e.target.value)}
                  data-testid="converter-aud-input"
                  data-agent-id="converter-aud-input"
                  className={`${field} font-mono text-sm py-1.5 px-2.5 pr-12`}
                  placeholder="1.00"
                />
                <span className="pointer-events-none absolute right-2.5 top-2 text-[11px] text-outline font-mono">
                  AUD $
                </span>
              </div>
            </div>
          </div>

          {/* Quick Preset Pills */}
          <div className="flex items-center justify-between gap-1">
            <span className="text-[10px] uppercase font-mono tracking-wider text-outline shrink-0">
              Presets:
            </span>
            <div className="flex flex-wrap items-center justify-end gap-1">
              {PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => handlePreset(preset)}
                  data-testid={`preset-tokens-${preset}`}
                  data-agent-id={`preset-tokens-${preset}`}
                  className={`rounded-md border px-2 py-0.5 text-[11px] font-mono transition-all active:scale-95 ${
                    tokensAmount === preset.toString()
                      ? "border-secondary bg-secondary/20 text-secondary font-semibold"
                      : "border-white/10 bg-surface-container text-on-surface-variant hover:border-white/20 hover:text-on-surface"
                  }`}
                >
                  {preset}T
                </button>
              ))}
            </div>
          </div>

          {/* Conversion Output Banner */}
          <div className="flex items-center justify-between rounded-xl border border-primary/30 bg-primary/10 px-3.5 py-2.5">
            <div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-primary">
                USD Estimate
              </div>
              <div className="text-xl font-bold font-mono tracking-tight text-on-surface">
                ≈ ${computedUsd.toFixed(2)} <span className="text-xs font-normal text-on-surface-variant">USD</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] font-mono text-outline uppercase tracking-wider">
                Formal Billing
              </div>
              <div className="text-sm font-bold font-mono text-secondary">
                AUD ${Math.round(numAud || 0)}
              </div>
            </div>
          </div>

          {/* Compact Tax & Jurisdiction Footer Note */}
          <div className="flex items-center justify-between rounded-lg border border-white/5 bg-surface-container-lowest px-3 py-2 text-[11px] text-on-surface-variant">
            <div className="flex items-center gap-1.5">
              <span>🇦🇺 AU: <strong>+10% GST</strong></span>
            </div>
            <div className="h-3 w-px bg-white/10" />
            <div className="flex items-center gap-1.5">
              <span>🇳🇿 NZ & Global: <strong>0% GST</strong> (Tax Free)</span>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-white/10 bg-surface-container-highest/30 px-4 py-2.5 sm:px-5">
          <span className="text-[10px] font-mono text-outline">
            All invoices issued in AUD (Whole Numbers)
          </span>
          <button
            type="button"
            onClick={onClose}
            data-testid="close-currency-modal-btn"
            data-agent-id="close-currency-modal-btn"
            className={`${btnPrimary} !py-1 !px-4 !text-xs`}
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
