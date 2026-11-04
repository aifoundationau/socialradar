import { NextResponse } from "next/server";

export interface CurrencyRateResponse {
  rate: number;
  base: string;
  target: string;
  date: string;
  source: string;
  cachedAt: string;
}

const FALLBACK_RATE = 0.65;

/**
 * Fetches the latest AUD to USD reference exchange rate from the European Central Bank (ECB)
 * via the open Frankfurter API, cached for 1 hour.
 */
export async function GET() {
  const endpoints = [
    "https://api.frankfurter.dev/v1/latest?from=AUD&to=USD",
    "https://api.frankfurter.app/latest?from=AUD&to=USD",
  ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        next: { revalidate: 3600 },
        signal: AbortSignal.timeout(5000),
      });

      if (res.ok) {
        const data = (await res.json()) as {
          amount: number;
          base: string;
          date: string;
          rates: { USD: number };
        };

        const rate = data.rates?.USD;
        if (typeof rate === "number" && rate > 0) {
          const payload: CurrencyRateResponse = {
            rate: Math.round(rate * 10000) / 10000,
            base: "AUD",
            target: "USD",
            date: data.date,
            source: "European Central Bank (ECB) via Frankfurter API",
            cachedAt: new Date().toISOString(),
          };
          return NextResponse.json(payload, {
            headers: {
              "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
            },
          });
        }
      }
    } catch {
      // try next endpoint or fallback
    }
  }

  // Graceful fallback if upstream is temporarily unreachable
  const fallbackPayload: CurrencyRateResponse = {
    rate: FALLBACK_RATE,
    base: "AUD",
    target: "USD",
    date: new Date().toISOString().split("T")[0],
    source: "Frankfurter Offline Fallback Rate (AUD 1 = USD 0.65)",
    cachedAt: new Date().toISOString(),
  };

  return NextResponse.json(fallbackPayload, {
    headers: {
      "Cache-Control": "public, s-maxage=300",
    },
  });
}

