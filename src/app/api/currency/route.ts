import { NextResponse } from "next/server";

export interface CurrencyRateResponse {
  rate: number;
  base: string;
  target: string;
  date: string;
  syncedDate?: string;
  source: string;
  cachedAt: string;
}

const FALLBACK_RATE = 0.65;
const IN_DAY_CACHE_TTL_MS = 60 * 60 * 1000; // Re-verify hourly within the same UTC calendar day

let cachedDailyRate: {
  dayKey: string;
  fetchedAtMs: number;
  payload: CurrencyRateResponse;
} | null = null;

/**
 * Fetches the latest AUD to USD reference exchange rate from the European Central Bank (ECB)
 * via the open Frankfurter API. Always forces a fresh upstream lookup when a new calendar day starts
 * (or when `?refresh=1` is passed) and bypasses Next.js disk fetch caching so the rate updates daily.
 */
export async function GET(req: Request) {
  // Touch request headers/URL so Next.js 16 always evaluates this route dynamically on demand.
  void req.headers.get("accept");
  let forceRefresh = false;
  try {
    forceRefresh = new URL(req.url).searchParams.get("refresh") === "1";
  } catch {
    forceRefresh = false;
  }

  const nowMs = Date.now();
  const todayKey = new Date(nowMs).toISOString().split("T")[0];

  if (
    !forceRefresh &&
    cachedDailyRate &&
    cachedDailyRate.dayKey === todayKey &&
    nowMs - cachedDailyRate.fetchedAtMs < IN_DAY_CACHE_TTL_MS
  ) {
    return NextResponse.json(cachedDailyRate.payload, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  }

  const endpoints = [
    "https://api.frankfurter.dev/v1/latest?from=AUD&to=USD",
    "https://api.frankfurter.app/latest?from=AUD&to=USD",
  ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        cache: "no-store",
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
            syncedDate: todayKey,
            source: "European Central Bank (ECB) via Frankfurter API",
            cachedAt: new Date(nowMs).toISOString(),
          };
          cachedDailyRate = {
            dayKey: todayKey,
            fetchedAtMs: nowMs,
            payload,
          };
          return NextResponse.json(payload, {
            headers: {
              "Cache-Control": "no-store, max-age=0",
            },
          });
        }
      }
    } catch {
      // try next endpoint or fallback
    }
  }

  if (cachedDailyRate) {
    return NextResponse.json(cachedDailyRate.payload, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  }

  // Graceful fallback if upstream is temporarily unreachable
  const fallbackPayload: CurrencyRateResponse = {
    rate: FALLBACK_RATE,
    base: "AUD",
    target: "USD",
    date: todayKey,
    syncedDate: todayKey,
    source: "Frankfurter Offline Fallback Rate (AUD 1 = USD 0.65)",
    cachedAt: new Date(nowMs).toISOString(),
  };

  return NextResponse.json(fallbackPayload, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
