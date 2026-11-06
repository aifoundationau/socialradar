"use client";

import { useEffect, useState } from "react";
import type { FreeAccessWindow } from "@/lib/contracts";
import {
  ALL_COUNTRIES_CODE,
  getCountryName,
  isCountryEligibleForFreeAccess,
  isFreeAccessWindowActive,
  normalizeAllowedCountries,
} from "@/lib/pricing";
import { ensureUserGeolocationCountry, loadDetectedGeoCountry } from "@/lib/geo";
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
        const code = loadDetectedGeoCountry();
        if (code) setUserCountry(code.trim().toUpperCase());
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
    void ensureUserGeolocationCountry().then((detected) => {
      if (active && detected) setUserCountry(detected);
    });
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

  const selectedCountries = normalizeAllowedCountries(freeAccessWindow?.allowedCountries);
  const isAllCountries = !timedWindowActive || selectedCountries.includes(ALL_COUNTRIES_CODE);

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

        {/* Hoverable statement: does NOT list countries in red, but shows hover popover of all countries in this campaign */}
        <div
          tabIndex={0}
          data-agent-id="free-access-banner-hover-trigger"
          data-testid="free-access-banner-hover-trigger"
          className="group relative inline-flex cursor-pointer items-center gap-1.5 focus:outline-none"
        >
          <span className="font-semibold tracking-tight text-white">
            AdRadarHQ is currently{" "}
            <span className="underline decoration-white/80 underline-offset-2 font-bold">
              FREE TO USE
            </span>{" "}
            for Monthly Subscribers!
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-white/30 bg-black/25 px-2 py-0.5 font-mono text-[10px] font-semibold text-amber-100">
            <Icon name="globe" className="size-3 text-amber-200" />
            <span>Hover for Campaign Countries</span>
          </span>

          {/* Dark-theme hover card listing all countries part of this campaign */}
          <div
            role="tooltip"
            data-agent-id="free-access-banner-countries-tooltip"
            data-testid="free-access-banner-countries-tooltip"
            className="pointer-events-none invisible absolute top-full left-1/2 z-[70] mt-2 w-72 sm:w-80 -translate-x-1/2 rounded-xl border border-white/15 bg-surface-container-highest/98 p-3.5 text-left font-sans text-xs text-on-surface opacity-0 shadow-2xl backdrop-blur-xl transition-all duration-150 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
          >
            <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-2">
              <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                <Icon name="globe" className="size-3.5 text-primary" />
                <span>Campaign Eligible Countries</span>
              </span>
              <span className="rounded-full bg-winner/20 px-2 py-0.5 font-mono text-[10px] font-bold text-winner-soft">
                {isAllCountries ? "Worldwide" : `${selectedCountries.length} Selected`}
              </span>
            </div>

            <div className="mt-2.5 max-h-48 overflow-y-auto flex flex-wrap gap-1.5">
              {isAllCountries ? (
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-winner/40 bg-winner/15 px-2.5 py-1 font-mono text-[11px] font-semibold text-winner-soft">
                  <span>🌐 All Countries (Worldwide)</span>
                </span>
              ) : (
                selectedCountries.map((code) => (
                  <span
                    key={code}
                    className="inline-flex items-center gap-1 rounded-lg border border-white/12 bg-surface-container px-2 py-1 font-mono text-[11px] font-medium text-on-surface"
                  >
                    <span>
                      {getCountryName(code)} ({code})
                    </span>
                  </span>
                ))
              )}
            </div>

            <p className="mt-2.5 border-t border-white/10 pt-2 text-[11px] leading-snug text-on-surface-variant">
              Eligibility is based on user geolocation. The list of countries receiving free access changes from time to time — message AdRadarHQ for the latest list of countries.
            </p>
          </div>
        </div>

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
