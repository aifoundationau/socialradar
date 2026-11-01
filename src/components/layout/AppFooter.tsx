"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { type GeoConfig, loadGeoConfig } from "@/lib/geo";
import { PolicyModal } from "@/components/legal/PolicyModal";
import { GeoTimeModal } from "@/components/geo/GeoTimeModal";

export function AppFooter() {
  const [geoConfig, setGeoConfig] = useState<GeoConfig>(loadGeoConfig());
  const [activePolicy, setActivePolicy] = useState<string | null>(null);
  const [isGeoModalOpen, setIsGeoModalOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState("");

  useEffect(() => {
    function updateClock() {
      const now = new Date();
      const timeStr = now.toLocaleTimeString("en-AU", {
        hour12: geoConfig.timeFormat === "12h",
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
          onClick={() => setIsGeoModalOpen(true)}
          title="Click to configure suburb, state, date and clock formats"
          className="group cursor-pointer border-b border-white/[0.06] bg-surface-container-low/60 px-4 py-2 backdrop-blur-md transition hover:bg-surface-container-low"
        >
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 font-mono text-[11px]">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-on-surface group-hover:text-primary transition-colors">
                <Icon name="mapPin" className="size-3.5 text-primary" />
                <span className="font-semibold">{geoConfig.suburb}, {geoConfig.state}</span>
                <span className="rounded bg-white/10 px-1.5 py-0.2 text-[10px] text-outline">
                  {geoConfig.country}
                </span>
              </span>

              <span className="hidden sm:inline text-white/20">|</span>

              <span className="flex items-center gap-1.5 text-on-surface-variant">
                <Icon name="sun" className="size-3.5 text-amber-400" />
                <span>{geoConfig.weatherTemp}°C {geoConfig.weatherCondition}</span>
              </span>
            </div>

            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-secondary">
                <span className="size-1.5 rounded-full bg-secondary animate-pulse" />
                <span>
                  {geoConfig.isAuNz ? "AUD Price (AU/NZ Geolocation)" : "USD Price (Converted at Checkout)"}
                </span>
              </span>

              <span className="hidden sm:inline text-white/20">|</span>

              <span className="flex items-center gap-1.5 text-on-surface font-semibold tabular-nums">
                <Icon name="clock" className="size-3.5 text-primary" />
                <span>{currentTime || "12:00:00"}</span>
              </span>
            </div>
          </div>
        </div>

        {/* Main Footer Links & Copyright */}
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 py-6 sm:flex-row sm:px-6">
          <div className="flex flex-col items-center sm:items-start gap-1">
            <p className="font-mono text-xs text-on-surface">
              Copyright © 2026 AI Foundation · All rights reserved.
            </p>
            <p className="font-mono text-[11px] text-outline">
              AdRadar Intelligence · Australian Registered Business · Strict 7-Year Statutory Compliance Archive
            </p>
          </div>

          <nav aria-label="Legal & Governance" className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 font-mono text-xs">
            <button
              type="button"
              onClick={() => setActivePolicy("founder")}
              className="text-on-surface-variant hover:text-primary transition"
            >
              Founder Welcome (David Robertson)
            </button>
            <button
              type="button"
              onClick={() => setActivePolicy("privacy")}
              className="text-on-surface-variant hover:text-primary transition"
            >
              Privacy Policy
            </button>
            <button
              type="button"
              onClick={() => setActivePolicy("terms")}
              className="text-on-surface-variant hover:text-primary transition"
            >
              Terms of Service
            </button>
            <button
              type="button"
              onClick={() => setActivePolicy("aiPolicy")}
              className="text-on-surface-variant hover:text-primary transition"
            >
              AI Policy (ISO/IEC 42001)
            </button>
            <button
              type="button"
              onClick={() => setActivePolicy("securityPolicy")}
              className="text-on-surface-variant hover:text-primary transition"
            >
              Security Policy (ISO/IEC 27001)
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
