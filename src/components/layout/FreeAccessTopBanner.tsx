"use client";

import { useEffect, useState } from "react";
import type { FreeAccessWindow } from "@/lib/contracts";
import { isChargingEnabled, isFreeAccessWindowActive } from "@/lib/pricing";
import { Icon } from "@/components/ui/Icon";

/**
 * Global Red Banner displayed across the very top of the web app (including the front
 * start page `/` and before logging in) whenever the web app is Free to use — either via
 * Super Admin's Timed Free Access Window (Free 15 Minutes, Free 30 Minutes, Free Hour)
 * or global Free Mode (`isTokenSystemEnabled === false`).
 */
export function FreeAccessTopBanner() {
  const [loaded, setLoaded] = useState(false);
  const [isTokenSystemEnabled, setIsTokenSystemEnabled] = useState<boolean>(true);
  const [freeAccessWindow, setFreeAccessWindow] = useState<FreeAccessWindow | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    let active = true;

    async function fetchFreeStatus() {
      try {
        const res = await fetch("/api/wallet/checkout", {
          headers: { accept: "application/json" },
          cache: "no-store",
        });
        if (!res.ok || !active) return;
        const data = await res.json();
        if (!active || !data) return;
        if (typeof data.isTokenSystemEnabled === "boolean") {
          setIsTokenSystemEnabled(data.isTokenSystemEnabled);
        }
        setFreeAccessWindow(data.freeAccessWindow ?? null);
        setNowMs(Date.now());
        setLoaded(true);
      } catch {
        // Non-blocking
      }
    }

    void fetchFreeStatus();
    window.addEventListener("adradar:config-updated", fetchFreeStatus);
    const pollTimer = setInterval(fetchFreeStatus, 10_000);
    const tickTimer = setInterval(() => setNowMs(Date.now()), 1_000);

    return () => {
      active = false;
      window.removeEventListener("adradar:config-updated", fetchFreeStatus);
      clearInterval(pollTimer);
      clearInterval(tickTimer);
    };
  }, []);

  if (!loaded) return null;

  const isFree = !isChargingEnabled({ isTokenSystemEnabled, freeAccessWindow }, nowMs);
  if (!isFree) return null;

  const timedWindowActive = isFreeAccessWindowActive(freeAccessWindow, nowMs);
  const durationMinutes = timedWindowActive ? (freeAccessWindow?.durationMinutes ?? null) : null;
  const remainingSec =
    timedWindowActive && freeAccessWindow?.expiresAt
      ? Math.max(0, Math.ceil((Date.parse(freeAccessWindow.expiresAt) - nowMs) / 1000))
      : 0;
  const remMin = Math.floor(remainingSec / 60);
  const remSec = remainingSec % 60;
  const countdownStr = `${remMin}m ${String(remSec).padStart(2, "0")}s`;
  const durationLabel =
    durationMinutes === 60
      ? "Free Hour"
      : durationMinutes === 30
        ? "Free 30 Minutes"
        : durationMinutes === 15
          ? "Free 15 Minutes"
          : "Free Access";

  return (
    <div
      role="status"
      aria-live="polite"
      data-agent-id="free-access-red-top-banner"
      data-testid="free-access-red-top-banner"
      className="relative z-50 w-full border-b border-red-400/50 bg-gradient-to-r from-red-700 via-red-600 to-red-700 px-3 py-2 text-white shadow-lg"
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center font-mono text-xs sm:text-sm">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/30 bg-black/25 px-2.5 py-0.5 text-[11px] font-bold tracking-wider uppercase text-white">
          <span className="size-2 rounded-full bg-white motion-safe:animate-ping" />
          <Icon name="zap" className="size-3.5 text-amber-200" />
          <span>{timedWindowActive ? durationLabel : "Free Mode Active"}</span>
        </span>
        <span className="font-semibold tracking-tight text-white">
          AdRadarHQ is currently <span className="underline decoration-white/80 underline-offset-2 font-bold">FREE TO USE</span> for all registered users!
        </span>
        {timedWindowActive && (
          <span
            data-agent-id="free-access-banner-countdown"
            data-testid="free-access-banner-countdown"
            className="inline-flex items-center gap-1 rounded-md bg-black/30 px-2 py-0.5 font-mono text-xs font-bold text-amber-100 tabular-nums"
          >
            <span>Time Left: {countdownStr}</span>
          </span>
        )}
      </div>
    </div>
  );
}
