"use client";

import { useEffect, useState } from "react";
import type { FreeAccessWindow } from "@/lib/contracts";
import {
  formatAllowedCountriesSummary,
  isCountryEligibleForFreeAccess,
  isFreeAccessWindowActive,
} from "@/lib/pricing";
import { loadGeoConfig } from "@/lib/geo";
import { Icon } from "@/components/ui/Icon";

/**
 * Global Red Banner displayed across the very top of the web app (including the front
 * start page `/` and before logging in) whenever the Timed Free Access Window
 * (Free 15 Minutes, Free 30 Minutes, Free Hour — for Monthly Subscribers in selected countries)
 * or global Free Mode (`isTokenSystemEnabled === false`) is active.
 */
export function FreeAccessTopBanner() {
  const [loaded, setLoaded] = useState(false);
  const [isTokenSystemEnabled, setIsTokenSystemEnabled] = useState<boolean>(true);
  const [freeAccessWindow, setFreeAccessWindow] = useState<FreeAccessWindow | null>(null);
  const [userCountry, setUserCountry] = useState<string>("AU");
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    let active = true;

    function syncUserCountry() {
      try {
        const geo = loadGeoConfig();
        if (geo?.country) setUserCountry(geo.country.trim().toUpperCase());
      } catch {
        // Fallback to AU
      }
    }

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

    syncUserCountry();
    void fetchFreeStatus();
    window.addEventListener("adradar:config-updated", fetchFreeStatus);
    window.addEventListener("adradar:geo-updated", syncUserCountry);
    const pollTimer = setInterval(fetchFreeStatus, 10_000);
    const tickTimer = setInterval(() => setNowMs(Date.now()), 1_000);

    return () => {
      active = false;
      window.removeEventListener("adradar:config-updated", fetchFreeStatus);
      window.removeEventListener("adradar:geo-updated", syncUserCountry);
      clearInterval(pollTimer);
      clearInterval(tickTimer);
    };
  }, []);

  if (!loaded) return null;

  const timedWindowActive =
    isFreeAccessWindowActive(freeAccessWindow, nowMs) &&
    isCountryEligibleForFreeAccess(freeAccessWindow, userCountry);
  const showBanner = timedWindowActive || isTokenSystemEnabled === false;
  if (!showBanner) return null;

  const countriesLabel = timedWindowActive
    ? formatAllowedCountriesSummary(freeAccessWindow?.allowedCountries)
    : "All Countries (Worldwide)";

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
          AdRadarHQ is currently <span className="underline decoration-white/80 underline-offset-2 font-bold">FREE TO USE</span> for Monthly Subscribers!
        </span>
        {timedWindowActive && (
          <span
            data-agent-id="free-access-banner-countries"
            data-testid="free-access-banner-countries"
            className="inline-flex items-center gap-1 rounded-md bg-white/15 px-2 py-0.5 font-mono text-[11px] font-semibold text-white"
          >
            <span>Countries: {countriesLabel}</span>
          </span>
        )}
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
