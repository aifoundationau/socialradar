import { NextResponse } from "next/server";
import { clientIp, edgeCountry, getGeoTrust } from "@/lib/request-geo";

/** Decodes a URL-encoded header value; a malformed one reads as "". */
function decodeHeader(value: string | null): string {
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return "";
  }
}

function weatherCodeToCondition(code: number): string {
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

function cleanState(region: string, regionCode?: string): string {
  if (regionCode) {
    const stripped = regionCode.replace(/^[A-Z]{2}-/, "").trim();
    if (stripped) return stripped;
  }
  const lower = region.toLowerCase();
  if (lower.includes("queensland")) return "QLD";
  if (lower.includes("new south wales")) return "NSW";
  if (lower.includes("victoria")) return "VIC";
  if (lower.includes("western australia")) return "WA";
  if (lower.includes("south australia")) return "SA";
  if (lower.includes("tasmania")) return "TAS";
  if (lower.includes("capital territory")) return "ACT";
  if (lower.includes("northern territory")) return "NT";
  if (lower.includes("auckland")) return "AUK";
  if (lower.includes("wellington")) return "WGN";
  return region.slice(0, 4).toUpperCase();
}

export async function GET(req: Request) {
  const headers = new Headers(req.headers);

  // 1. The platform's trusted geo headers only (Vercel's own; see getGeoTrust). Headers a browser can set itself
  //    are ignored, so they can't change what this reports.
  let country = edgeCountry(headers);
  const vercelGeo = getGeoTrust() === "vercel";
  let city = vercelGeo ? decodeHeader(headers.get("x-vercel-ip-city")) : "";
  let region = vercelGeo ? decodeHeader(headers.get("x-vercel-ip-country-region")) : "";
  const latHeader = vercelGeo ? parseFloat(headers.get("x-vercel-ip-latitude") ?? "") : NaN;
  const lonHeader = vercelGeo ? parseFloat(headers.get("x-vercel-ip-longitude") ?? "") : NaN;
  let lat: number | null = Number.isFinite(latHeader) ? latHeader : null;
  let lon: number | null = Number.isFinite(lonHeader) ? lonHeader : null;

  // 2. If edge headers are missing, look up the visitor's IP. With no visitor IP, only local development
  //    may look up "self" (the server is the visitor's machine there); in production that would be the
  //    data centre's location, so the defaults below are used instead.
  const visitorIp = clientIp(headers);
  const lookupUrl = visitorIp
    ? `https://ipwho.is/${encodeURIComponent(visitorIp)}`
    : process.env.NODE_ENV !== "production"
      ? "https://ipwho.is/"
      : "";
  if (lookupUrl && (!country || !city || lat === null || lon === null)) {
    try {
      const ipRes = await fetch(lookupUrl, {
        signal: AbortSignal.timeout(3000),
      });
      if (ipRes.ok) {
        const ipData = await ipRes.json();
        if (ipData && ipData.success) {
          country = (ipData.country_code || country || "AU").toUpperCase().trim();
          city = ipData.city || city || "Sydney";
          region = cleanState(ipData.region || region || "NSW", ipData.region_code);
          lat = typeof ipData.latitude === "number" ? ipData.latitude : lat;
          lon = typeof ipData.longitude === "number" ? ipData.longitude : lon;
        }
      }
    } catch {
      // fallback to sensible defaults
    }
  }

  // Fallback defaults if still missing
  country = country || "AU";
  city = city || "Sydney";
  region = region ? cleanState(region) : "NSW";
  const isAu = country === "AU";
  const isAuNz = country === "AU" || country === "NZ";

  // 3. Auto-fetch live weather for detected coordinates via Open-Meteo
  let weatherTemp = isAuNz ? 23 : 18;
  let weatherCondition = "Mostly Sunny";

  const targetLat = lat ?? (country === "AU" ? -33.8688 : 37.7749);
  const targetLon = lon ?? (country === "AU" ? 151.2093 : -122.4194);

  try {
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${targetLat}&longitude=${targetLon}&current=temperature_2m,weather_code`;
    const weatherRes = await fetch(weatherUrl, {
      signal: AbortSignal.timeout(3000),
    });
    if (weatherRes.ok) {
      const weatherData = await weatherRes.json();
      if (weatherData?.current) {
        weatherTemp = Math.round(weatherData.current.temperature_2m);
        weatherCondition = weatherCodeToCondition(weatherData.current.weather_code);
      }
    }
  } catch {
    // preserve default weather
  }

  return NextResponse.json({
    country,
    isAu,
    isAuNz,
    suburb: city,
    state: region,
    latitude: targetLat,
    longitude: targetLon,
    weatherTemp,
    weatherCondition,
    currency: isAuNz ? "AUD" : "USD",
  });
}
