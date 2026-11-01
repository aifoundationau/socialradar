"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

export interface GeoConfig {
  country: string;
  isAuNz: boolean;
  suburb: string;
  state: string;
  timeFormat: "12h" | "24h";
  dateFormat: "DD/MM/YYYY" | "DD MMM YYYY" | "YYYY-MM-DD";
  weatherTemp: number;
  weatherCondition: string;
}

const STORAGE_KEY = "adradar_geo_config_v1";

const DEFAULT_AU_GEO: GeoConfig = {
  country: "AU",
  isAuNz: true,
  suburb: "Sydney",
  state: "NSW",
  timeFormat: "12h",
  dateFormat: "DD MMM YYYY",
  weatherTemp: 23,
  weatherCondition: "Mostly Sunny",
};

export function detectBrowserAuNz(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    if (
      tz.startsWith("Australia/") ||
      tz.startsWith("Pacific/Auckland") ||
      tz.startsWith("Pacific/Chatham") ||
      tz.includes("Sydney") ||
      tz.includes("Melbourne") ||
      tz.includes("Brisbane") ||
      tz.includes("Perth") ||
      tz.includes("Hobart") ||
      tz.includes("Adelaide") ||
      tz.includes("Darwin")
    ) {
      return true;
    }
    const lang = navigator.language || "";
    if (lang === "en-AU" || lang === "en-NZ") return true;
  } catch {
    // default to true for Australian business platform
  }
  return true;
}

export function loadGeoConfig(): GeoConfig {
  if (typeof window === "undefined") return DEFAULT_AU_GEO;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        ...DEFAULT_AU_GEO,
        ...parsed,
        isAuNz: parsed.country === "AU" || parsed.country === "NZ",
      };
    }
  } catch {
    // fallback to detection
  }

  const isAuNz = detectBrowserAuNz();
  return {
    ...DEFAULT_AU_GEO,
    country: isAuNz ? "AU" : "US",
    isAuNz,
    suburb: isAuNz ? "Sydney" : "San Francisco",
    state: isAuNz ? "NSW" : "CA",
    weatherTemp: isAuNz ? 24 : 18,
    weatherCondition: "Sunny",
  };
}

export function saveGeoConfig(config: GeoConfig): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // localstorage unavailable
  }
}
