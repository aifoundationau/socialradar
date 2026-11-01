"use client";

export interface GeoConfig {
  country: string;
  isAuNz: boolean;
  suburb: string;
  state: string;
  timeFormat: "12h" | "24h";
  dateFormat: "DD/MM/YYYY" | "DD MMM YYYY" | "YYYY-MM-DD";
  weatherTemp: number;
  weatherCondition: string;
  latitude?: number;
  longitude?: number;
}

const STORAGE_KEY = "adradar_geo_config_v1";

export const DEFAULT_AU_GEO: GeoConfig = {
  country: "AU",
  isAuNz: true,
  suburb: "Sydney",
  state: "NSW",
  timeFormat: "12h",
  dateFormat: "DD MMM YYYY",
  weatherTemp: 23,
  weatherCondition: "Mostly Sunny",
  latitude: -33.8688,
  longitude: 151.2093,
};

export function weatherCodeToCondition(code: number): string {
  if (code === 0) return "Clear Sky";
  if (code === 1) return "Mainly Clear";
  if (code === 2) return "Partly Cloudy";
  if (code === 3) return "Overcast";
  if (code === 45 || code === 48) return "Foggy";
  if (code >= 51 && code <= 55) return "Drizzle";
  if (code >= 61 && code <= 65) return "Rain";
  if (code >= 71 && code <= 77) return "Snow";
  if (code >= 80 && code <= 82) return "Showers";
  if (code >= 95 && code <= 99) return "Thunderstorm";
  return "Mostly Sunny";
}

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

/**
 * Autofind the user's location using browser GPS (if granted) or server IP geolocation fallback.
 * Fetches real live weather for the exact coordinates.
 */
export async function autofindUserLocation(): Promise<GeoConfig> {
  const current = loadGeoConfig();

  // Step 1: Try Browser Geolocation API if available
  const gpsPosition = await new Promise<{ lat: number; lon: number } | null>((resolve) => {
    if (typeof window === "undefined" || !navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
        });
      },
      () => resolve(null),
      { timeout: 3500, enableHighAccuracy: true }
    );
  });

  if (gpsPosition) {
    try {
      // Reverse geocode via BigDataCloud client API
      const geoRes = await fetch(
        `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${gpsPosition.lat}&longitude=${gpsPosition.lon}&localityLanguage=en`,
        { signal: AbortSignal.timeout(3000) }
      );
      if (geoRes.ok) {
        const geoData = await geoRes.json();
        const country = (geoData.countryCode || "AU").toUpperCase().trim();
        const suburb = geoData.locality || geoData.city || current.suburb;
        let state = current.state;
        if (geoData.principalSubdivisionCode) {
          state = geoData.principalSubdivisionCode.replace(/^[A-Z]{2}-/, "").trim();
        } else if (geoData.principalSubdivision) {
          state = geoData.principalSubdivision.slice(0, 4).toUpperCase();
        }

        // Live weather for GPS coordinates
        let weatherTemp = current.weatherTemp;
        let weatherCondition = current.weatherCondition;
        try {
          const wRes = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${gpsPosition.lat}&longitude=${gpsPosition.lon}&current=temperature_2m,weather_code`,
            { signal: AbortSignal.timeout(3000) }
          );
          if (wRes.ok) {
            const wData = await wRes.json();
            if (wData?.current) {
              weatherTemp = Math.round(wData.current.temperature_2m);
              weatherCondition = weatherCodeToCondition(wData.current.weather_code);
            }
          }
        } catch {
          // ignore weather failure
        }

        const isAuNz = country === "AU" || country === "NZ";
        const newCfg: GeoConfig = {
          ...current,
          country,
          isAuNz,
          suburb,
          state,
          latitude: gpsPosition.lat,
          longitude: gpsPosition.lon,
          weatherTemp,
          weatherCondition,
        };
        saveGeoConfig(newCfg);
        return newCfg;
      }
    } catch {
      // fall back to /api/geo
    }
  }

  // Step 2: Fallback to Server-Side IP Geolocation & Weather
  try {
    const res = await fetch("/api/geo", { signal: AbortSignal.timeout(4000) });
    if (res.ok) {
      const data = await res.json();
      const newCfg: GeoConfig = {
        ...current,
        country: data.country || current.country,
        isAuNz: Boolean(data.isAuNz),
        suburb: data.suburb || current.suburb,
        state: data.state || current.state,
        latitude: data.latitude ?? current.latitude,
        longitude: data.longitude ?? current.longitude,
        weatherTemp: typeof data.weatherTemp === "number" ? data.weatherTemp : current.weatherTemp,
        weatherCondition: data.weatherCondition || current.weatherCondition,
      };
      saveGeoConfig(newCfg);
      return newCfg;
    }
  } catch {
    // retain existing config
  }

  return current;
}
