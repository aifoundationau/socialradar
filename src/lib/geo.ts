"use client";

export interface GeoConfig {
  country: string;
  isAu: boolean;
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
const DETECTED_GEO_STORAGE_KEY = "adradar_detected_geo_country_v1";

export function loadDetectedGeoCountry(): string {
  if (typeof window === "undefined") return "AU";
  try {
    const detected = localStorage.getItem(DETECTED_GEO_STORAGE_KEY);
    if (detected && detected.trim().length >= 2) {
      return detected.trim().toUpperCase();
    }
  } catch {
    // ignore storage errors
  }
  return loadGeoConfig().country;
}

export function saveDetectedGeoCountry(countryCode: string): void {
  if (typeof window === "undefined") return;
  const clean = (countryCode || "").trim().toUpperCase();
  if (clean.length < 2) return;
  try {
    localStorage.setItem(DETECTED_GEO_STORAGE_KEY, clean);
    window.dispatchEvent(new CustomEvent("adradar:geo-updated", { detail: { detectedCountry: clean } }));
  } catch {
    // ignore storage errors
  }
}

export const DEFAULT_AU_GEO: GeoConfig = {
  country: "AU",
  isAu: true,
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
      const country = (parsed.country || "AU").toUpperCase();
      return {
        ...DEFAULT_AU_GEO,
        ...parsed,
        country,
        isAu: country === "AU",
        isAuNz: country === "AU" || country === "NZ",
      };
    }
  } catch {
    // fallback to detection
  }

  const isAuNz = detectBrowserAuNz();
  return {
    ...DEFAULT_AU_GEO,
    country: isAuNz ? "AU" : "US",
    isAu: isAuNz,
    isAuNz,
    suburb: isAuNz ? "Sydney" : "San Francisco",
    state: isAuNz ? "NSW" : "CA",
    weatherTemp: isAuNz ? 24 : 18,
    weatherCondition: "Sunny",
  };
}

export function hasSavedGeoConfig(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return Boolean(localStorage.getItem(STORAGE_KEY));
  } catch {
    return false;
  }
}

export function saveGeoConfig(config: GeoConfig): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    if (config.country) {
      localStorage.setItem(DETECTED_GEO_STORAGE_KEY, config.country.trim().toUpperCase());
    }
    window.dispatchEvent(new CustomEvent("adradar:geo-updated", { detail: config }));
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

        const isAu = country === "AU";
        const isAuNz = country === "AU" || country === "NZ";
        const newCfg: GeoConfig = {
          ...current,
          country,
          isAu,
          isAuNz,
          suburb,
          state,
          latitude: gpsPosition.lat,
          longitude: gpsPosition.lon,
          weatherTemp,
          weatherCondition,
        };
        saveDetectedGeoCountry(country);
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
      const country = (data.country || current.country).toUpperCase();
      const isAu = country === "AU";
      const isAuNz = country === "AU" || country === "NZ";
      const newCfg: GeoConfig = {
        ...current,
        country,
        isAu,
        isAuNz,
        suburb: data.suburb || current.suburb,
        state: data.state || current.state,
        latitude: data.latitude ?? current.latitude,
        longitude: data.longitude ?? current.longitude,
        weatherTemp: typeof data.weatherTemp === "number" ? data.weatherTemp : current.weatherTemp,
        weatherCondition: data.weatherCondition || current.weatherCondition,
      };
      saveDetectedGeoCountry(country);
      saveGeoConfig(newCfg);
      return newCfg;
    }
  } catch {
    // retain existing config
  }

  return current;
}

let inflightGeoDetection: Promise<string> | null = null;

/**
 * Ensures the user's real geolocation country (via GPS reverse-geocode or IP geolocation `/api/geo`)
 * is detected and cached for geolocation-gated features such as Timed Free Access Windows.
 */
export async function ensureUserGeolocationCountry(): Promise<string> {
  if (typeof window === "undefined") return "AU";
  try {
    const existing = localStorage.getItem(DETECTED_GEO_STORAGE_KEY);
    if (existing && existing.trim().length >= 2) {
      return existing.trim().toUpperCase();
    }
  } catch {
    // continue to detect
  }

  if (!inflightGeoDetection) {
    inflightGeoDetection = autofindUserLocation()
      .then((cfg) => {
        const code = (cfg.country || "AU").trim().toUpperCase();
        saveDetectedGeoCountry(code);
        return code;
      })
      .catch(() => loadGeoConfig().country)
      .finally(() => {
        inflightGeoDetection = null;
      });
  }
  return inflightGeoDetection;
}

export interface SuburbSuggestion {
  label: string;
  suburb: string;
  state: string;
  country: string;
}

export const COMMON_SUBURBS: SuburbSuggestion[] = [
  // NSW (Sydney & Regional)
  { label: "Sydney, NSW (AU)", suburb: "Sydney", state: "NSW", country: "AU" },
  { label: "Bondi Beach, NSW (AU)", suburb: "Bondi Beach", state: "NSW", country: "AU" },
  { label: "Bondi Junction, NSW (AU)", suburb: "Bondi Junction", state: "NSW", country: "AU" },
  { label: "Surry Hills, NSW (AU)", suburb: "Surry Hills", state: "NSW", country: "AU" },
  { label: "Paddington, NSW (AU)", suburb: "Paddington", state: "NSW", country: "AU" },
  { label: "Darlinghurst, NSW (AU)", suburb: "Darlinghurst", state: "NSW", country: "AU" },
  { label: "Newtown, NSW (AU)", suburb: "Newtown", state: "NSW", country: "AU" },
  { label: "Manly, NSW (AU)", suburb: "Manly", state: "NSW", country: "AU" },
  { label: "Mosman, NSW (AU)", suburb: "Mosman", state: "NSW", country: "AU" },
  { label: "North Sydney, NSW (AU)", suburb: "North Sydney", state: "NSW", country: "AU" },
  { label: "Chatswood, NSW (AU)", suburb: "Chatswood", state: "NSW", country: "AU" },
  { label: "Parramatta, NSW (AU)", suburb: "Parramatta", state: "NSW", country: "AU" },
  { label: "Ryde, NSW (AU)", suburb: "Ryde", state: "NSW", country: "AU" },
  { label: "Cronulla, NSW (AU)", suburb: "Cronulla", state: "NSW", country: "AU" },
  { label: "Penrith, NSW (AU)", suburb: "Penrith", state: "NSW", country: "AU" },
  { label: "Liverpool, NSW (AU)", suburb: "Liverpool", state: "NSW", country: "AU" },
  { label: "Newcastle, NSW (AU)", suburb: "Newcastle", state: "NSW", country: "AU" },
  { label: "Wollongong, NSW (AU)", suburb: "Wollongong", state: "NSW", country: "AU" },
  { label: "Byron Bay, NSW (AU)", suburb: "Byron Bay", state: "NSW", country: "AU" },
  { label: "Central Coast, NSW (AU)", suburb: "Central Coast", state: "NSW", country: "AU" },
  { label: "Tweed Heads, NSW (AU)", suburb: "Tweed Heads", state: "NSW", country: "AU" },
  { label: "Wagga Wagga, NSW (AU)", suburb: "Wagga Wagga", state: "NSW", country: "AU" },
  { label: "Albury, NSW (AU)", suburb: "Albury", state: "NSW", country: "AU" },
  { label: "Port Macquarie, NSW (AU)", suburb: "Port Macquarie", state: "NSW", country: "AU" },
  { label: "Coffs Harbour, NSW (AU)", suburb: "Coffs Harbour", state: "NSW", country: "AU" },
  { label: "Dubbo, NSW (AU)", suburb: "Dubbo", state: "NSW", country: "AU" },
  { label: "Orange, NSW (AU)", suburb: "Orange", state: "NSW", country: "AU" },
  { label: "Bathurst, NSW (AU)", suburb: "Bathurst", state: "NSW", country: "AU" },

  // VIC (Melbourne & Regional)
  { label: "Melbourne, VIC (AU)", suburb: "Melbourne", state: "VIC", country: "AU" },
  { label: "South Yarra, VIC (AU)", suburb: "South Yarra", state: "VIC", country: "AU" },
  { label: "St Kilda, VIC (AU)", suburb: "St Kilda", state: "VIC", country: "AU" },
  { label: "Richmond, VIC (AU)", suburb: "Richmond", state: "VIC", country: "AU" },
  { label: "Fitzroy, VIC (AU)", suburb: "Fitzroy", state: "VIC", country: "AU" },
  { label: "Carlton, VIC (AU)", suburb: "Carlton", state: "VIC", country: "AU" },
  { label: "Prahran, VIC (AU)", suburb: "Prahran", state: "VIC", country: "AU" },
  { label: "Brunswick, VIC (AU)", suburb: "Brunswick", state: "VIC", country: "AU" },
  { label: "Collingwood, VIC (AU)", suburb: "Collingwood", state: "VIC", country: "AU" },
  { label: "Southbank, VIC (AU)", suburb: "Southbank", state: "VIC", country: "AU" },
  { label: "Docklands, VIC (AU)", suburb: "Docklands", state: "VIC", country: "AU" },
  { label: "Brighton, VIC (AU)", suburb: "Brighton", state: "VIC", country: "AU" },
  { label: "Hawthorn, VIC (AU)", suburb: "Hawthorn", state: "VIC", country: "AU" },
  { label: "Geelong, VIC (AU)", suburb: "Geelong", state: "VIC", country: "AU" },
  { label: "Ballarat, VIC (AU)", suburb: "Ballarat", state: "VIC", country: "AU" },
  { label: "Bendigo, VIC (AU)", suburb: "Bendigo", state: "VIC", country: "AU" },
  { label: "Frankston, VIC (AU)", suburb: "Frankston", state: "VIC", country: "AU" },
  { label: "Mornington, VIC (AU)", suburb: "Mornington", state: "VIC", country: "AU" },
  { label: "Shepparton, VIC (AU)", suburb: "Shepparton", state: "VIC", country: "AU" },
  { label: "Warrnambool, VIC (AU)", suburb: "Warrnambool", state: "VIC", country: "AU" },

  // QLD (Brisbane, Gold Coast & Regional)
  { label: "Brisbane, QLD (AU)", suburb: "Brisbane", state: "QLD", country: "AU" },
  { label: "Fortitude Valley, QLD (AU)", suburb: "Fortitude Valley", state: "QLD", country: "AU" },
  { label: "New Farm, QLD (AU)", suburb: "New Farm", state: "QLD", country: "AU" },
  { label: "West End, QLD (AU)", suburb: "West End", state: "QLD", country: "AU" },
  { label: "South Brisbane, QLD (AU)", suburb: "South Brisbane", state: "QLD", country: "AU" },
  { label: "Paddington, QLD (AU)", suburb: "Paddington", state: "QLD", country: "AU" },
  { label: "Gold Coast, QLD (AU)", suburb: "Gold Coast", state: "QLD", country: "AU" },
  { label: "Surfers Paradise, QLD (AU)", suburb: "Surfers Paradise", state: "QLD", country: "AU" },
  { label: "Broadbeach, QLD (AU)", suburb: "Broadbeach", state: "QLD", country: "AU" },
  { label: "Burleigh Heads, QLD (AU)", suburb: "Burleigh Heads", state: "QLD", country: "AU" },
  { label: "Robina, QLD (AU)", suburb: "Robina", state: "QLD", country: "AU" },
  { label: "Southport, QLD (AU)", suburb: "Southport", state: "QLD", country: "AU" },
  { label: "Sunshine Coast, QLD (AU)", suburb: "Sunshine Coast", state: "QLD", country: "AU" },
  { label: "Noosa Heads, QLD (AU)", suburb: "Noosa Heads", state: "QLD", country: "AU" },
  { label: "Maroochydore, QLD (AU)", suburb: "Maroochydore", state: "QLD", country: "AU" },
  { label: "Caloundra, QLD (AU)", suburb: "Caloundra", state: "QLD", country: "AU" },
  { label: "Cairns, QLD (AU)", suburb: "Cairns", state: "QLD", country: "AU" },
  { label: "Townsville, QLD (AU)", suburb: "Townsville", state: "QLD", country: "AU" },
  { label: "Toowoomba, QLD (AU)", suburb: "Toowoomba", state: "QLD", country: "AU" },
  { label: "Mackay, QLD (AU)", suburb: "Mackay", state: "QLD", country: "AU" },
  { label: "Rockhampton, QLD (AU)", suburb: "Rockhampton", state: "QLD", country: "AU" },
  { label: "Bundaberg, QLD (AU)", suburb: "Bundaberg", state: "QLD", country: "AU" },
  { label: "Hervey Bay, QLD (AU)", suburb: "Hervey Bay", state: "QLD", country: "AU" },

  // WA (Perth & Regional)
  { label: "Perth, WA (AU)", suburb: "Perth", state: "WA", country: "AU" },
  { label: "Fremantle, WA (AU)", suburb: "Fremantle", state: "WA", country: "AU" },
  { label: "Subiaco, WA (AU)", suburb: "Subiaco", state: "WA", country: "AU" },
  { label: "Scarborough, WA (AU)", suburb: "Scarborough", state: "WA", country: "AU" },
  { label: "Cottesloe, WA (AU)", suburb: "Cottesloe", state: "WA", country: "AU" },
  { label: "Joondalup, WA (AU)", suburb: "Joondalup", state: "WA", country: "AU" },
  { label: "Mandurah, WA (AU)", suburb: "Mandurah", state: "WA", country: "AU" },
  { label: "Bunbury, WA (AU)", suburb: "Bunbury", state: "WA", country: "AU" },
  { label: "Busselton, WA (AU)", suburb: "Busselton", state: "WA", country: "AU" },
  { label: "Geraldton, WA (AU)", suburb: "Geraldton", state: "WA", country: "AU" },

  // SA (Adelaide & Regional)
  { label: "Adelaide, SA (AU)", suburb: "Adelaide", state: "SA", country: "AU" },
  { label: "Glenelg, SA (AU)", suburb: "Glenelg", state: "SA", country: "AU" },
  { label: "Norwood, SA (AU)", suburb: "Norwood", state: "SA", country: "AU" },
  { label: "North Adelaide, SA (AU)", suburb: "North Adelaide", state: "SA", country: "AU" },
  { label: "Mount Gambier, SA (AU)", suburb: "Mount Gambier", state: "SA", country: "AU" },

  // ACT (Canberra)
  { label: "Canberra, ACT (AU)", suburb: "Canberra", state: "ACT", country: "AU" },
  { label: "Braddon, ACT (AU)", suburb: "Braddon", state: "ACT", country: "AU" },
  { label: "Kingston, ACT (AU)", suburb: "Kingston", state: "ACT", country: "AU" },
  { label: "Belconnen, ACT (AU)", suburb: "Belconnen", state: "ACT", country: "AU" },
  { label: "Woden, ACT (AU)", suburb: "Woden", state: "ACT", country: "AU" },

  // TAS (Hobart & Regional)
  { label: "Hobart, TAS (AU)", suburb: "Hobart", state: "TAS", country: "AU" },
  { label: "Sandy Bay, TAS (AU)", suburb: "Sandy Bay", state: "TAS", country: "AU" },
  { label: "Launceston, TAS (AU)", suburb: "Launceston", state: "TAS", country: "AU" },
  { label: "Devonport, TAS (AU)", suburb: "Devonport", state: "TAS", country: "AU" },

  // NT (Darwin & Alice Springs)
  { label: "Darwin, NT (AU)", suburb: "Darwin", state: "NT", country: "AU" },
  { label: "Palmerston, NT (AU)", suburb: "Palmerston", state: "NT", country: "AU" },
  { label: "Alice Springs, NT (AU)", suburb: "Alice Springs", state: "NT", country: "AU" },

  // NZ (New Zealand)
  { label: "Auckland (NZ)", suburb: "Auckland", state: "AUK", country: "NZ" },
  { label: "Ponsonby, Auckland (NZ)", suburb: "Ponsonby", state: "AUK", country: "NZ" },
  { label: "Takapuna, Auckland (NZ)", suburb: "Takapuna", state: "AUK", country: "NZ" },
  { label: "Wellington (NZ)", suburb: "Wellington", state: "WGN", country: "NZ" },
  { label: "Christchurch (NZ)", suburb: "Christchurch", state: "CAN", country: "NZ" },
  { label: "Queenstown (NZ)", suburb: "Queenstown", state: "OTA", country: "NZ" },
  { label: "Hamilton (NZ)", suburb: "Hamilton", state: "WKO", country: "NZ" },
  { label: "Tauranga (NZ)", suburb: "Tauranga", state: "BOP", country: "NZ" },
  { label: "Dunedin (NZ)", suburb: "Dunedin", state: "OTA", country: "NZ" },

  // Global / Remote
  { label: "Remote (Worldwide)", suburb: "Remote", state: "Global", country: "Global" },
  { label: "London, England (UK)", suburb: "London", state: "ENG", country: "GB" },
  { label: "New York, NY (US)", suburb: "New York", state: "NY", country: "US" },
  { label: "Los Angeles, CA (US)", suburb: "Los Angeles", state: "CA", country: "US" },
  { label: "San Francisco, CA (US)", suburb: "San Francisco", state: "CA", country: "US" },
  { label: "Singapore (SG)", suburb: "Singapore", state: "SG", country: "SG" },
  { label: "Toronto, ON (CA)", suburb: "Toronto", state: "ON", country: "CA" },
];

type NominatimPlace = { name?: string; address?: Record<string, string | undefined> };

/** Nominatim results per query (this tab only), and when the last request went out. */
const nominatimCache = new Map<string, SuburbSuggestion[]>();
let lastNominatimRequestAt = 0;

/**
 * Searches and autofinds matching suburbs from the local fast dataset, and (only with `allowNetwork`, i.e.
 * an explicit user action such as pressing Enter) OpenStreetMap Nominatim. Nominatim's usage policy
 * forbids type-ahead autocomplete and allows at most one request per second, so typing must use the
 * local list only.
 */
export async function searchSuburbs(
  rawQuery: string,
  options: { allowNetwork?: boolean } = {},
): Promise<SuburbSuggestion[]> {
  const query = rawQuery.trim().toLowerCase();
  if (query.length < 2) return [];

  // Instant local match
  const localMatches = COMMON_SUBURBS.filter(
    (s) =>
      s.suburb.toLowerCase().includes(query) ||
      s.label.toLowerCase().includes(query) ||
      s.state.toLowerCase() === query,
  );

  // If query is an exact or strong match with local database (or no lookup was asked for), return fast
  if (localMatches.length >= 3 || !options.allowNetwork) {
    return localMatches.slice(0, 8);
  }

  const merge = (fetched: SuburbSuggestion[]) => {
    const combined = [...localMatches];
    for (const item of fetched) {
      if (!combined.some((c) => c.label.toLowerCase() === item.label.toLowerCase())) {
        combined.push(item);
      }
    }
    return combined.slice(0, 8);
  };

  const cached = nominatimCache.get(query);
  if (cached) return merge(cached);

  // At most one Nominatim request per second.
  const wait = lastNominatimRequestAt + 1100 - Date.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastNominatimRequestAt = Date.now();

  // Network fetch for niche or specific suburbs with short timeout
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(rawQuery)}&format=json&addressdetails=1&limit=6&countrycodes=au,nz,us,gb,ca`,
      { signal: AbortSignal.timeout(2200), headers: { "Accept-Language": "en" } },
    );
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        const fetched: SuburbSuggestion[] = data
          .map((item: NominatimPlace) => {
            const addr = item.address || {};
            const suburbName =
              addr.suburb ||
              addr.city_district ||
              addr.neighbourhood ||
              addr.town ||
              addr.village ||
              addr.city ||
              item.name;
            const state = addr.state || addr.state_district || "";
            const countryCode = (addr.country_code || "AU").toUpperCase();
            if (!suburbName) return null;
            return {
              label: `${suburbName}${state ? `, ${state}` : ""} (${countryCode})`,
              suburb: suburbName,
              state,
              country: countryCode,
            };
          })
          .filter(Boolean) as SuburbSuggestion[];

        nominatimCache.set(query, fetched);
        return merge(fetched);
      }
    }
  } catch {
    // network timeout or offline - rely on local matches
  }

  return localMatches.slice(0, 8);
}
