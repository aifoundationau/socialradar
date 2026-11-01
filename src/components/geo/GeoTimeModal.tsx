"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/ui/Icon";
import { btnPrimary, btnSecondary, field, label } from "@/components/ui/styles";
import { type GeoConfig, saveGeoConfig } from "@/lib/geo";

const emptySubscribe = () => () => {};
function useIsClient() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
}

interface GeoTimeModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: GeoConfig;
  onSave: (config: GeoConfig) => void;
}

export function GeoTimeModal({ isOpen, onClose, config, onSave }: GeoTimeModalProps) {
  const isClient = useIsClient();
  const [formData, setFormData] = useState<GeoConfig>(config);

  useEffect(() => {
    setFormData(config);
  }, [config]);

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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const isAuNz = formData.country === "AU" || formData.country === "NZ";
    const nextConfig: GeoConfig = {
      ...formData,
      isAuNz,
    };
    saveGeoConfig(nextConfig);
    onSave(nextConfig);
    onClose();
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="geo-modal-title"
      data-testid="geo-time-modal"
      data-agent-id="geo-time-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/80 backdrop-blur-md transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Centered Modal with NO Scrollbar */}
      <div className="relative z-10 flex w-full max-w-md flex-col rounded-2xl border border-white/[0.14] bg-surface-container-high shadow-2xl overflow-hidden my-auto">
        {/* Header */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-white/[0.08] px-5 sm:px-6">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary/20 text-primary">
              <Icon name="mapPin" className="size-4" />
            </span>
            <h3 id="geo-modal-title" className="text-title-sm font-bold text-on-surface">
              Configure Location & Time
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="flex size-8 items-center justify-center rounded-lg text-on-surface-variant hover:bg-white/[0.08] hover:text-on-surface"
          >
            <Icon name="x" className="size-4" />
          </button>
        </div>

        {/* Content Form */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4">
          {/* Currency Geolocation Notice */}
          <div className="rounded-xl border border-secondary/30 bg-secondary/10 p-3 text-[12px] text-on-surface-variant leading-relaxed">
            <p className="font-semibold text-secondary flex items-center gap-1.5">
              <Icon name="globe" className="size-3.5" />
              <span>Geolocation & Currency Policy</span>
            </p>
            <p className="mt-1">
              Australians and New Zealanders exclusively view <strong>AUD currency converted price</strong>. International visitors see USD prices converted to AUD at checkout.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="geo-suburb" className={label}>Suburb / City</label>
              <input
                id="geo-suburb"
                type="text"
                required
                value={formData.suburb}
                onChange={(e) => setFormData({ ...formData, suburb: e.target.value })}
                className={field}
                placeholder="e.g. Sydney"
              />
            </div>
            <div>
              <label htmlFor="geo-state" className={label}>State / Region</label>
              <input
                id="geo-state"
                type="text"
                required
                value={formData.state}
                onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                className={field}
                placeholder="e.g. NSW"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="geo-country" className={label}>Country</label>
              <select
                id="geo-country"
                value={formData.country}
                onChange={(e) => {
                  const country = e.target.value;
                  const isAuNz = country === "AU" || country === "NZ";
                  setFormData({ ...formData, country, isAuNz });
                }}
                className={field}
              >
                <option value="AU">Australia (AUD)</option>
                <option value="NZ">New Zealand (AUD)</option>
                <option value="US">United States (USD)</option>
                <option value="GB">United Kingdom (USD)</option>
                <option value="CA">Canada (USD)</option>
                <option value="SG">Singapore (USD)</option>
              </select>
            </div>
            <div>
              <label htmlFor="geo-time-format" className={label}>Clock Format</label>
              <select
                id="geo-time-format"
                value={formData.timeFormat}
                onChange={(e) => setFormData({ ...formData, timeFormat: e.target.value as "12h" | "24h" })}
                className={field}
              >
                <option value="12h">12-Hour (e.g. 5:30 PM)</option>
                <option value="24h">24-Hour (e.g. 17:30)</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="geo-date-format" className={label}>Date Format</label>
            <select
              id="geo-date-format"
              value={formData.dateFormat}
              onChange={(e) => setFormData({ ...formData, dateFormat: e.target.value as any })}
              className={field}
            >
              <option value="DD MMM YYYY">DD MMM YYYY (e.g. 01 Nov 2026)</option>
              <option value="DD/MM/YYYY">DD/MM/YYYY (e.g. 01/11/2026)</option>
              <option value="YYYY-MM-DD">YYYY-MM-DD (e.g. 2026-11-01)</option>
            </select>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-white/[0.08]">
            <button
              type="button"
              onClick={onClose}
              className={btnSecondary}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={btnPrimary}
            >
              Save Location
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
