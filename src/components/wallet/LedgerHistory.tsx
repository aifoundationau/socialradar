"use client";

import { useEffect, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { clientDb } from "@/lib/firebase-client";
import type { TokenTransactionDoc, TokenTxType } from "@/lib/contracts";
import { alertError, card } from "@/components/ui/styles";

const TYPE_LABELS: Record<TokenTxType, string> = {
  TOPUP: "Top-up",
  RADAR_SEARCH: "Radar search",
  AI_REMIX: "AI remix",
  REFUND: "Refund",
};

const HISTORY_LIMIT = 50;

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
        (err) => setError(err.message),
      ),
    [uid],
  );

  return (
    <section className="space-y-4" aria-labelledby="history-heading">
      <h2 id="history-heading" className="text-lg font-semibold">
        History
      </h2>
      {error && <p className={alertError}>Could not load history: {error}</p>}
      {rows === null && !error && <div className={`${card} h-32 animate-pulse`} aria-busy="true" />}
      {rows?.length === 0 && (
        <p className="text-sm text-zinc-500">No transactions yet. Top-ups, searches and remixes will appear here.</p>
      )}
      {rows && rows.length > 0 && (
        <div className={`${card} overflow-x-auto p-0`}>
          <table className="w-full min-w-[32rem] text-sm">
            <thead className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800">
              <tr>
                <th className="px-5 py-3 font-medium">Date</th>
                <th className="px-5 py-3 font-medium">Type</th>
                <th className="px-5 py-3 text-right font-medium">Tokens</th>
                <th className="px-5 py-3 text-right font-medium">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {rows.map((tx) => (
                <tr key={tx.txId}>
                  <td className="whitespace-nowrap px-5 py-3 text-zinc-600 dark:text-zinc-400">
                    {new Date(tx.createdAt).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" })}
                  </td>
                  <td className="px-5 py-3">{TYPE_LABELS[tx.type]}</td>
                  <td
                    className={`px-5 py-3 text-right font-medium tabular-nums ${
                      tx.delta > 0 ? "text-emerald-700 dark:text-emerald-400" : "text-zinc-900 dark:text-zinc-100"
                    }`}
                  >
                    {tx.delta > 0 ? `+${tx.delta}` : tx.delta}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-zinc-600 dark:text-zinc-400">{tx.balanceAfter}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
