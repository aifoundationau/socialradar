import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const headers = new Headers(req.headers);
  const country =
    headers.get("x-vercel-ip-country") ||
    headers.get("cf-ipcountry") ||
    headers.get("x-country-code") ||
    "AU"; // Default to AU for Australia-based business

  const city = headers.get("x-vercel-ip-city") || "Sydney";
  const region = headers.get("x-vercel-ip-country-region") || "NSW";

  const normCountry = country.toUpperCase().trim();
  const isAuNz = normCountry === "AU" || normCountry === "NZ";

  return NextResponse.json({
    country: normCountry,
    isAuNz,
    city: decodeURIComponent(city),
    region: decodeURIComponent(region),
    currency: isAuNz ? "AUD" : "USD",
  });
}
