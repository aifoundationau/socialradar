"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import {
  type GeoConfig,
  DEFAULT_AU_GEO,
  loadGeoConfig,
  autofindUserLocation,
} from "@/lib/geo";
import { PolicyModal } from "@/components/legal/PolicyModal";
import { GeoTimeModal } from "@/components/geo/GeoTimeModal";

export function AppFooter() {
  // Use identical initial state on server and client to avoid hydration mismatch
  const [geoConfig, setGeoConfig] = useState<GeoConfig>(DEFAULT_AU_GEO);
  const [activePolicy, setActivePolicy] = useState<string | null>(null);
  const [isGeoModalOpen, setIsGeoModalOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState("");

  useEffect(() => {
    // 1. Initial client-side load from localStorage
    const saved = loadGeoConfig();
    setGeoConfig(saved);

    // 2. Automatic background autofind for real user location and weather
    autofindUserLocation()
      .then((detected) => {
        setGeoConfig(detected);
      })
      .catch(() => {
        // preserve current config if offline
      });

    // 3. Live clock
    function updateClock() {
      const now = new Date();
      const timeStr = now.toLocaleTimeString("en-AU", {
        hour12: saved.timeFormat === "12h",
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
      });
      setCurrentTime(timeStr);
    }

    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, [geoConfig.timeFormat]);

  return (
    <>
      <footer
        data-testid="app-footer"
        data-agent-id="app-footer"
        className="relative z-20 border-t border-white/[0.08] bg-surface-container-lowest text-on-surface-variant transition-colors"
      >
        {/* Thin Geo & Time Widget Bar */}
        <div
          data-testid="geo-time-bar"
          data-agent-id="geo-time-bar"
          className="border-b border-white/[0.06] bg-surface-container-low/70 px-4 py-2 backdrop-blur-md min-h-[46px] flex items-center"
        >
          <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-y-2 gap-x-3 font-mono text-xs">
            {/* Left chips: Location & Weather */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setIsGeoModalOpen(true)}
                data-testid="geo-chip-location"
                title="Click to change location or autofind"
                className="flex items-center gap-1.5 rounded-full border border-white/10 bg-surface-container px-3 py-1 text-on-surface transition-all hover:border-primary/40 hover:text-primary active:scale-95"
              >
                <Icon name="mapPin" className="size-3.5 text-primary shrink-0" />
                <span suppressHydrationWarning className="font-semibold">
                  {geoConfig.suburb}, {geoConfig.state}
                </span>
                <span
                  suppressHydrationWarning
                  className="rounded bg-white/10 px-1.5 py-0.2 text-[10px] font-bold text-outline shrink-0"
                >
                  {geoConfig.country}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setIsGeoModalOpen(true)}
                data-testid="geo-chip-weather"
                title="Live weather for detected location"
                className="flex items-center gap-1.5 rounded-full border border-white/10 bg-surface-container px-3 py-1 text-on-surface-variant transition-all hover:border-amber-400/40 hover:text-amber-300 active:scale-95"
              >
                <Icon name="sun" className="size-3.5 text-amber-400 shrink-0" />
                <span suppressHydrationWarning>
                  {geoConfig.weatherTemp}°C {geoConfig.weatherCondition}
                </span>
              </button>
            </div>

            {/* Right chips: Currency Gate, Live Clock & Settings Button */}
            <div className="flex flex-wrap items-center gap-2">
              <div
                data-testid="geo-chip-currency"
                className="flex items-center gap-1.5 rounded-full border border-secondary/30 bg-secondary/10 px-3 py-1 text-[11px] font-medium text-secondary"
              >
                <span className="size-1.5 rounded-full bg-secondary shrink-0 shadow-[0_0_6px_rgba(74,222,128,0.6)]" />
                <span suppressHydrationWarning>
                  {geoConfig.isAuNz
                    ? "AUD $1.00 / Token (AU/NZ Local Currency)"
                    : "AUD $1.00 ≈ USD $0.65 (All Invoices in AUD)"}
                </span>
              </div>

              <button
                type="button"
                onClick={() => setIsGeoModalOpen(true)}
                data-testid="geo-chip-clock"
                title="Click to configure clock, date format, and location"
                className="flex items-center gap-1.5 rounded-full border border-white/10 bg-surface-container px-3 py-1 text-on-surface transition-all hover:border-primary/40 hover:text-primary active:scale-95"
              >
                <Icon name="clock" className="size-3.5 text-primary shrink-0" />
                <span
                  suppressHydrationWarning
                  className="inline-block w-[78px] text-center font-mono tabular-nums tracking-tight"
                >
                  {currentTime || "12:00:00"}
                </span>
                <span className="text-white/20 select-none">|</span>
                <Icon name="sliders" className="size-3 text-outline shrink-0" />
                <span className="text-[11px] text-outline font-normal">Configure</span>
              </button>
            </div>
          </div>
        </div>

        {/* Main Footer Links & Copyright */}
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-5 px-4 py-6 sm:px-6 lg:flex-row pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-6">
          <div className="flex flex-col items-center gap-1 text-center lg:items-start lg:text-left">
            <p className="font-mono text-xs text-on-surface">
              Copyright © 2026 AI Foundation · All rights reserved.
            </p>
            <p className="font-mono text-[11px] text-outline">
              AdRadar Intelligence · Australian Registered Business · Strict 7-Year Statutory Compliance Archive
            </p>
          </div>

          <nav
            aria-label="Platform Policies & Governance"
            className="flex flex-wrap items-center justify-center gap-2 font-mono text-xs"
          >
            <button
              type="button"
              data-testid="policy-btn-founder"
              data-agent-id="policy-btn-founder"
              onClick={() => setActivePolicy("founder")}
              className="flex items-center gap-1.5 rounded-full border border-white/10 bg-surface-container-low px-3 py-1.5 text-on-surface-variant transition-all hover:border-primary/40 hover:bg-surface-container-high hover:text-primary active:scale-95 shadow-xs"
            >
              <Icon name="user" className="size-3 text-primary" />
              <span>Founder Welcome (David Robertson)</span>
            </button>
            <button
              type="button"
              data-testid="policy-btn-privacy"
              data-agent-id="policy-btn-privacy"
              onClick={() => setActivePolicy("privacy")}
              className="flex items-center gap-1.5 rounded-full border border-white/10 bg-surface-container-low px-3 py-1.5 text-on-surface-variant transition-all hover:border-primary/40 hover:bg-surface-container-high hover:text-primary active:scale-95 shadow-xs"
            >
              <Icon name="shield" className="size-3 text-primary" />
              <span>Privacy Policy</span>
            </button>
            <button
              type="button"
              data-testid="policy-btn-terms"
              data-agent-id="policy-btn-terms"
              onClick={() => setActivePolicy("terms")}
              className="flex items-center gap-1.5 rounded-full border border-white/10 bg-surface-container-low px-3 py-1.5 text-on-surface-variant transition-all hover:border-primary/40 hover:bg-surface-container-high hover:text-primary active:scale-95 shadow-xs"
            >
              <Icon name="tag" className="size-3 text-primary" />
              <span>Terms of Service</span>
            </button>
            <button
              type="button"
              data-testid="policy-btn-aipolicy"
              data-agent-id="policy-btn-aipolicy"
              onClick={() => setActivePolicy("aiPolicy")}
              className="flex items-center gap-1.5 rounded-full border border-white/10 bg-surface-container-low px-3 py-1.5 text-on-surface-variant transition-all hover:border-primary/40 hover:bg-surface-container-high hover:text-primary active:scale-95 shadow-xs"
            >
              <Icon name="sparkles" className="size-3 text-primary" />
              <span>AI Policy (ISO/IEC 42001)</span>
            </button>
            <button
              type="button"
              data-testid="policy-btn-securitypolicy"
              data-agent-id="policy-btn-securitypolicy"
              onClick={() => setActivePolicy("securityPolicy")}
              className="flex items-center gap-1.5 rounded-full border border-white/10 bg-surface-container-low px-3 py-1.5 text-on-surface-variant transition-all hover:border-primary/40 hover:bg-surface-container-high hover:text-primary active:scale-95 shadow-xs"
            >
              <Icon name="shield" className="size-3 text-primary" />
              <span>Security Policy (ISO/IEC 27001)</span>
            </button>
          </nav>
        </div>
      </footer>

      {/* Policy Modal Dialog */}
      <PolicyModal
        isOpen={Boolean(activePolicy)}
        initialPolicyId={activePolicy}
        onClose={() => setActivePolicy(null)}
      />

      {/* Geo & Time Configuration Popup */}
      <GeoTimeModal
        isOpen={isGeoModalOpen}
        config={geoConfig}
        onClose={() => setIsGeoModalOpen(false)}
        onSave={(newCfg) => setGeoConfig(newCfg)}
      />
    </>
  );
}
