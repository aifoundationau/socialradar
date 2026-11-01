"use client";

import { useEffect, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { clientDb } from "@/lib/firebase-client";
import type { TokenTransactionDoc, TokenTxType } from "@/lib/contracts";
import { alertError, card, monoLabel } from "@/components/ui/styles";

const TYPE_LABELS: Record<TokenTxType, string> = {
  TOPUP: "Top-up",
  RADAR_SEARCH: "Radar search",
  AI_REMIX: "AI remix",
  REFUND: "Refund",
};

const HISTORY_LIMIT = 50;

const formatWhen = (iso: string) => new Date(iso).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" });

function Delta({ delta }: { delta: number }) {
  return (
    <span className={`font-mono font-semibold tabular-nums ${delta > 0 ? "text-winner-soft" : "text-on-surface"}`}>
      {delta > 0 ? `+${delta}` : delta}
    </span>
  );
}

/** Latest ledger entries for `uid`, live. Uses the (uid ASC, createdAt DESC) composite index. */
export function LedgerHistory({ uid }: { uid: string }) {
  const [rows, setRows] = useState<TokenTransactionDoc[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () =>
      onSnapshot(
        query(
          collection(clientDb(), "token_transactions"),
          where("uid", "==", uid),
          orderBy("createdAt", "desc"),
          limit(HISTORY_LIMIT),
        ),
        (snap) => {
          setRows(snap.docs.map((d) => d.data() as TokenTransactionDoc));
          setError(null);
        },
        (err) => {
          if (err.name === "FirebaseError" && (err as { code?: string }).code === "unavailable") {
            console.warn("[ledger] firestore backend temporarily unavailable; retrying in background");
            return;
          }
          setError(err.message);
        },
      ),
    [uid],
  );

  return (
    <section className="space-y-4" aria-labelledby="history-heading">
      <h2 id="history-heading" className="text-headline-md font-semibold">
        History
      </h2>
      {error && <p className={alertError}>Could not load history: {error}</p>}
      {rows === null && !error && <div className={`${card} h-32 animate-pulse`} aria-busy="true" />}
      {rows?.length === 0 && (
        <p className="text-body text-on-surface-variant">No transactions yet. Top-ups, searches and remixes will appear here.</p>
      )}
      {rows && rows.length > 0 && (
        <div className={`${card} p-0 sm:p-0`}>
          {/* Phones: stacked rows instead of a sideways-scrolling table */}
          <ul className="divide-y divide-white/[0.04] sm:hidden">
            {rows.map((tx) => (
              <li key={tx.txId} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-body font-medium">{TYPE_LABELS[tx.type]}</p>
                  <p className="text-compact text-outline">{formatWhen(tx.createdAt)}</p>
                </div>
                <div className="text-right">
                  <Delta delta={tx.delta} />
                  <p className="font-mono text-[11px] text-outline">bal {tx.balanceAfter}</p>
                </div>
              </li>
            ))}
          </ul>
          <table className="hidden w-full text-body sm:table">
            <thead className={`border-b border-white/[0.08] text-left ${monoLabel}`}>
              <tr>
                <th className="px-5 py-3 font-medium">Date</th>
                <th className="px-5 py-3 font-medium">Type</th>
                <th className="px-5 py-3 text-right font-medium">Tokens</th>
                <th className="px-5 py-3 text-right font-medium">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {rows.map((tx) => (
                <tr key={tx.txId} className="transition-colors hover:bg-white/[0.02]">
                  <td className="px-5 py-3 whitespace-nowrap text-on-surface-variant">{formatWhen(tx.createdAt)}</td>
                  <td className="px-5 py-3">{TYPE_LABELS[tx.type]}</td>
                  <td className="px-5 py-3 text-right">
                    <Delta delta={tx.delta} />
                  </td>
                  <td className="px-5 py-3 text-right font-mono tabular-nums text-on-surface-variant">{tx.balanceAfter}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
