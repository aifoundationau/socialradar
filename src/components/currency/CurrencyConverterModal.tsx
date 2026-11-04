"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/ui/Icon";
import { btnPrimary, btnSecondary, field, label } from "@/components/ui/styles";
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
      // fallback rate
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
      className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4"
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        aria-hidden="true"
        className="fixed inset-0 bg-black/80 backdrop-blur-xs transition-opacity animate-in fade-in"
      />

      {/* Modal Surface */}
      <div
        data-testid="currency-converter-dialog"
        data-agent-id="currency-converter-dialog"
        className="relative z-10 flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/10 bg-surface-container-high shadow-2xl animate-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4 bg-surface-container-highest/40">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-xl bg-secondary/15 text-secondary border border-secondary/30">
              <Icon name="tag" className="size-4.5" />
            </div>
            <div>
              <h2
                id="currency-modal-title"
                className="text-title-sm font-semibold tracking-tight text-on-surface"
              >
                AUD to USD Currency Converter
              </h2>
              <p className="text-xs text-on-surface-variant">
                Live ECB exchange rates powered by Frankfurter API
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close currency converter"
            data-testid="close-currency-modal"
            data-agent-id="close-currency-modal"
            className="rounded-lg p-1.5 text-outline transition-colors hover:bg-white/10 hover:text-on-surface active:scale-95"
          >
            <Icon name="x" className="size-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          {/* Live Rate Chip */}
          <div className="rounded-xl border border-secondary/30 bg-secondary/10 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-secondary opacity-75" />
                  <span className="relative inline-flex size-2 rounded-full bg-secondary" />
                </span>
                <span className="text-xs font-mono font-semibold uppercase tracking-wider text-secondary">
                  Live Frankfurter Rate
                </span>
              </div>
              <div className="text-lg font-bold font-mono tracking-tight text-on-surface">
                1.00 AUD ={" "}
                <span className="text-secondary">
                  ${currentRate.toFixed(4)} USD
                </span>
              </div>
              <div className="text-[11px] font-mono text-outline">
                1.00 USD = ${(1 / currentRate).toFixed(4)} AUD · Date:{" "}
                {data?.date || "Today"}
              </div>
            </div>

            <button
              type="button"
              onClick={() => void fetchRate()}
              disabled={isLoading}
              data-testid="refresh-currency-rate-btn"
              data-agent-id="refresh-currency-rate-btn"
              aria-label="Refresh Frankfurter live rate"
              className="inline-flex items-center gap-1.5 self-start sm:self-center rounded-lg border border-white/10 bg-surface-container px-2.5 py-1.5 text-xs text-on-surface hover:border-secondary/40 hover:text-secondary active:scale-95 disabled:opacity-50 transition-all shrink-0"
            >
              <Icon
                name="sliders"
                className={`size-3 ${isLoading ? "animate-spin text-secondary" : ""}`}
              />
              <span>{isLoading ? "Refreshing..." : "Refresh"}</span>
            </button>
          </div>

          {/* Converter Tool */}
          <div className="rounded-xl border border-white/10 bg-surface-container-low p-4 space-y-4">
            <div className="flex items-center justify-between">
              <label htmlFor="modal-token-input" className={label}>
                Tokens to Convert
              </label>
              <span className="text-[11px] font-mono text-outline">
                Rate: AUD $1.00 / Token
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-outline mb-1 block">
                  AdRadarHQ Tokens
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
                    className={`${field} font-mono`}
                    placeholder="1"
                  />
                  <span className="absolute right-3 top-2.5 text-xs text-outline font-mono">
                    Tokens
                  </span>
                </div>
              </div>

              <div>
                <label className="text-[11px] text-outline mb-1 block">
                  Australian Dollars (AUD)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={audAmount}
                    onChange={(e) => handleAudChange(e.target.value)}
                    data-testid="converter-aud-input"
                    data-agent-id="converter-aud-input"
                    className={`${field} font-mono`}
                    placeholder="1.00"
                  />
                  <span className="absolute right-3 top-2.5 text-xs text-outline font-mono">
                    AUD $
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Presets */}
            <div>
              <span className="text-[11px] text-outline mb-1.5 block">
                Quick Token Presets:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => handlePreset(preset)}
                    data-testid={`preset-tokens-${preset}`}
                    data-agent-id={`preset-tokens-${preset}`}
                    className={`rounded-lg border px-2.5 py-1 text-xs font-mono transition-all active:scale-95 ${
                      tokensAmount === preset.toString()
                        ? "border-secondary bg-secondary/20 text-secondary font-semibold"
                        : "border-white/10 bg-surface-container text-on-surface-variant hover:border-white/20 hover:text-on-surface"
                    }`}
                  >
                    {preset} {preset === 1 ? "Token" : "Tokens"}
                  </button>
                ))}
              </div>
            </div>

            {/* Conversion Result Display */}
            <div className="rounded-lg border border-primary/20 bg-primary/10 p-3.5 flex items-center justify-between">
              <div>
                <div className="text-[11px] font-mono uppercase tracking-wider text-primary">
                  US Dollar Equivalent
                </div>
                <div className="text-xl font-bold font-mono tracking-tight text-on-surface mt-0.5">
                  ≈ ${computedUsd.toFixed(2)} USD
                </div>
              </div>
              <div className="text-right">
                <div className="text-[11px] font-mono text-outline">
                  Strict Whole Invoices
                </div>
                <div className="text-xs font-mono text-on-surface font-semibold">
                  AUD ${Math.round(numAud || 0)}
                </div>
              </div>
            </div>
          </div>

          {/* Statutory Policy & GST Notice */}
          <div className="rounded-xl border border-white/5 bg-surface-container-lowest p-3.5 space-y-2 text-xs text-on-surface-variant">
            <div className="flex items-center gap-1.5 font-semibold text-on-surface">
              <Icon name="shield" className="size-3.5 text-primary" />
              <span>Australian Business & Invoicing Standard</span>
            </div>
            <p className="leading-relaxed">
              Because AI Foundation is an Australian registered business, all
              Stripe checkout transactions and official tax invoices are issued
              and settled in <strong>Australian Dollars (AUD)</strong> using
              strict whole numbers.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              <div className="rounded-lg bg-surface-container p-2 border border-white/5">
                <span className="font-semibold text-on-surface block mb-0.5">
                  🇦🇺 Australia
                </span>
                <span className="text-[11px] text-outline">
                  10% GST added on top at checkout via automatic Stripe Tax.
                </span>
              </div>
              <div className="rounded-lg bg-surface-container p-2 border border-white/5">
                <span className="font-semibold text-on-surface block mb-0.5">
                  🇳🇿 New Zealand & Global
                </span>
                <span className="text-[11px] text-outline">
                  0% GST ($0.00 tax). International orders incur zero GST.
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end border-t border-white/10 bg-surface-container-highest/30 px-5 py-3.5">
          <button
            type="button"
            onClick={onClose}
            data-testid="close-currency-modal-btn"
            data-agent-id="close-currency-modal-btn"
            className={btnPrimary}
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
