"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { collection, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { clientDb } from "@/lib/firebase-client";
import { useSession } from "@/components/auth/SessionProvider";
import { Icon } from "@/components/ui/Icon";
import { btnPrimary, btnSecondary, card, field } from "@/components/ui/styles";
import type { TokenTransactionDoc } from "@/lib/contracts";

const emptySubscribe = () => () => {};
function useIsClient() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
}

export interface SupporterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenContact?: () => void;
}

type SupporterTab = "SEARCHES" | "LEDGER" | "ACCOUNT";

export function SupporterModal({ isOpen, onClose, onOpenContact }: SupporterModalProps) {
  const isClient = useIsClient();
  const { user, profile, activeBrand, role } = useSession();
  const uid = user?.uid;

  const [tab, setTab] = useState<SupporterTab>("SEARCHES");
  const [rows, setRows] = useState<TokenTransactionDoc[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState("");
  const [platformFilter, setPlatformFilter] = useState<"ALL" | "META" | "TIKTOK" | "GOOGLE">("ALL");

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

  // Live real-time listener for user's own token transactions & search records
  useEffect(() => {
    if (!uid || !isOpen) return;
    const unsub = onSnapshot(
      query(
        collection(clientDb(), "token_transactions"),
        where("uid", "==", uid),
        orderBy("createdAt", "desc"),
        limit(150),
      ),
      (snap) => {
        setRows(snap.docs.map((d) => d.data() as TokenTransactionDoc));
        setError(null);
      },
      (err) => {
        if (err.name === "FirebaseError" && (err as { code?: string }).code === "unavailable") {
          console.warn("[supporter-panel] firestore temporarily unavailable; retrying");
          return;
        }
        setError(err.message);
      },
    );
    return () => unsub();
  }, [uid, isOpen]);

  // Filtered search records
  const searchRecords = useMemo(() => {
    if (!rows) return [];
    return rows.filter((r) => r.type === "RADAR_SEARCH");
  }, [rows]);

  const filteredSearches = useMemo(() => {
    const q = searchFilter.trim().toLowerCase();
    return searchRecords.filter((rec) => {
      if (platformFilter !== "ALL") {
        const refUpper = (rec.referenceId || "").toUpperCase();
        if (!refUpper.includes(platformFilter)) return false;
      }
      if (!q) return true;
      return (
        (rec.referenceId || "").toLowerCase().includes(q) ||
        (rec.txId || "").toLowerCase().includes(q)
      );
    });
  }, [searchRecords, searchFilter, platformFilter]);

  if (!isClient || !isOpen) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="supporter-modal-title"
      data-agent-id="supporter-modal"
      data-testid="supporter-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Dialog Content */}
      <div className="relative flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-white/12 bg-surface-container-low shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.08] px-5 py-4 bg-surface-container-high/60 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-xl bg-secondary/20 text-secondary">
              <Icon name="sliders" className="size-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="supporter-modal-title" className="text-title-sm sm:text-title-md font-bold text-on-surface">
                  Supporter Admin Panel
                </h2>
                <span className="rounded-full bg-secondary/20 border border-secondary/30 px-2.5 py-0.5 font-mono text-[10px] font-bold text-secondary uppercase tracking-wider">
                  Lifetime Supporter
                </span>
              </div>
              <p className="text-[12px] text-on-surface-variant">
                Your personal audit center. All searches and actions you perform are recorded securely in our database.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close Supporter Panel"
            data-testid="close-supporter-modal-button"
            className="flex size-9 items-center justify-center rounded-xl text-on-surface-variant hover:bg-white/[0.06] hover:text-on-surface transition"
          >
            <Icon name="x" className="size-5" />
          </button>
        </div>

        {/* Top Summary Stats Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-4 border-b border-white/[0.06] bg-surface-container/30">
          <div className={`${card} p-3`}>
            <span className="text-[10px] font-mono text-on-surface-variant uppercase tracking-wider">Your Role</span>
            <p className="mt-0.5 text-compact font-bold text-secondary capitalize">{role}</p>
            <span className="text-[10px] text-outline truncate block">Permanent membership</span>
          </div>

          <div className={`${card} p-3`}>
            <span className="text-[10px] font-mono text-on-surface-variant uppercase tracking-wider">Token Balance</span>
            <p className="mt-0.5 text-compact font-bold text-primary flex items-center gap-1">
              <Icon name="zap" className="size-3.5" />
              {profile ? profile.tokenBalance.toLocaleString("en-AU") : "–"} ⚡
            </p>
            <Link
              href="/wallet"
              onClick={onClose}
              className="text-[10px] text-primary hover:underline truncate block"
            >
              Top-up wallet →
            </Link>
          </div>

          <div className={`${card} p-3`}>
            <span className="text-[10px] font-mono text-on-surface-variant uppercase tracking-wider">Searches Logged</span>
            <p className="mt-0.5 text-compact font-bold text-on-surface">
              {searchRecords.length}
            </p>
            <span className="text-[10px] text-outline truncate block">Recorded in database</span>
          </div>

          <div className={`${card} p-3`}>
            <span className="text-[10px] font-mono text-on-surface-variant uppercase tracking-wider">Active Brand</span>
            <p className="mt-0.5 text-compact font-bold text-on-surface truncate" title={activeBrand?.brandName || "None"}>
              {activeBrand?.brandName || "None Selected"}
            </p>
            <Link
              href="/brands"
              onClick={onClose}
              className="text-[10px] text-on-surface-variant hover:text-on-surface hover:underline truncate block"
            >
              Manage brands →
            </Link>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1.5 px-4 pt-3 border-b border-white/[0.06]">
          <button
            type="button"
            onClick={() => setTab("SEARCHES")}
            className={`flex items-center gap-1.5 px-3 py-2 font-mono text-[12px] font-semibold rounded-t-lg transition border-b-2 ${
              tab === "SEARCHES"
                ? "border-secondary text-secondary bg-secondary/10"
                : "border-transparent text-on-surface-variant hover:text-on-surface hover:bg-white/[0.02]"
            }`}
            data-testid="supporter-tab-searches"
          >
            <Icon name="search" className="size-3.5" />
            <span>My Search Records ({searchRecords.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setTab("LEDGER")}
            className={`flex items-center gap-1.5 px-3 py-2 font-mono text-[12px] font-semibold rounded-t-lg transition border-b-2 ${
              tab === "LEDGER"
                ? "border-secondary text-secondary bg-secondary/10"
                : "border-transparent text-on-surface-variant hover:text-on-surface hover:bg-white/[0.02]"
            }`}
            data-testid="supporter-tab-ledger"
          >
            <Icon name="zap" className="size-3.5" />
            <span>Complete Order History ({rows?.length ?? 0})</span>
          </button>

          <button
            type="button"
            onClick={() => setTab("ACCOUNT")}
            className={`flex items-center gap-1.5 px-3 py-2 font-mono text-[12px] font-semibold rounded-t-lg transition border-b-2 ${
              tab === "ACCOUNT"
                ? "border-secondary text-secondary bg-secondary/10"
                : "border-transparent text-on-surface-variant hover:text-on-surface hover:bg-white/[0.02]"
            }`}
            data-testid="supporter-tab-account"
          >
            <Icon name="user" className="size-3.5" />
            <span>Supporter Details & Support</span>
          </button>
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-red-300 text-compact">
              {error}
            </div>
          )}

          {/* TAB 1: MY SEARCH RECORDS */}
          {tab === "SEARCHES" && (
            <div className="space-y-3" data-testid="supporter-searches-view">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div>
                  <h3 className="text-compact font-bold text-on-surface">
                    My Recorded Ad Radar Searches
                  </h3>
                  <p className="text-[11px] text-on-surface-variant">
                    Every competitor intelligence search you perform is permanently recorded in your database ledger.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Filter by keyword or brand..."
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                    className={`${field} !py-1.5 !text-[12px] w-48 sm:w-56`}
                    data-agent-id="supporter-search-input"
                    data-testid="supporter-search-input"
                  />
                </div>
              </div>

              {/* Platform Filter Buttons */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {(["ALL", "META", "TIKTOK", "GOOGLE"] as const).map((plat) => (
                  <button
                    key={plat}
                    type="button"
                    onClick={() => setPlatformFilter(plat)}
                    className={`rounded-lg px-2.5 py-1 font-mono text-[11px] font-semibold transition ${
                      platformFilter === plat
                        ? "bg-secondary/20 text-secondary border border-secondary/40"
                        : "bg-surface-container-highest text-on-surface-variant border border-white/[0.06] hover:text-on-surface"
                    }`}
                    data-testid={`supporter-platform-${plat.toLowerCase()}`}
                  >
                    {plat === "ALL" ? "All Platforms" : plat}
                  </button>
                ))}
              </div>

              {/* Search Records Table */}
              {rows === null ? (
                <div className={`${card} p-8 text-center animate-pulse text-on-surface-variant text-compact`}>
                  Loading search records from database...
                </div>
              ) : filteredSearches.length === 0 ? (
                <div className={`${card} p-8 text-center text-on-surface-variant space-y-2`}>
                  <p className="text-body font-semibold text-on-surface">No search records found</p>
                  <p className="text-[12px] text-outline max-w-md mx-auto">
                    {searchFilter || platformFilter !== "ALL"
                      ? "No searches match your active filters. Clear your filters to see all recorded searches."
                      : "You haven't run any searches yet. Search for a brand on Ad Radar to see your records appear here automatically."}
                  </p>
                  <Link
                    href="/radar"
                    onClick={onClose}
                    className={`${btnPrimary} inline-flex items-center gap-1.5 mt-2`}
                  >
                    <Icon name="search" className="size-3.5" />
                    Open Ad Radar Search
                  </Link>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-white/[0.08] bg-surface-container-low max-h-[380px] overflow-y-auto">
                  <table className="w-full text-left text-[11px]">
                    <thead className="border-b border-white/[0.08] bg-surface-container-high/80 font-mono text-mono-label text-on-surface-variant sticky top-0 z-10 backdrop-blur-sm">
                      <tr>
                        <th className="px-3 py-2">Date / Time</th>
                        <th className="px-2.5 py-2">Platform</th>
                        <th className="px-3 py-2">Search Query & Parameters</th>
                        <th className="px-2.5 py-2 text-right">Tokens</th>
                        <th className="px-2.5 py-2 text-right">Balance</th>
                        <th className="px-3 py-2 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.04] font-mono">
                      {filteredSearches.map((rec) => {
                        const isMeta = rec.referenceId.toUpperCase().includes("META");
                        const isTikTok = rec.referenceId.toUpperCase().includes("TIKTOK");
                        const isGoogle = rec.referenceId.toUpperCase().includes("GOOGLE");
                        const platName = isMeta ? "META" : isTikTok ? "TIKTOK" : isGoogle ? "GOOGLE" : "RADAR";

                        return (
                          <tr key={rec.txId} className="hover:bg-white/[0.02] transition">
                            <td className="px-3 py-2 text-on-surface-variant whitespace-nowrap">
                              {new Date(rec.createdAt).toLocaleString("en-AU", {
                                day: "2-digit",
                                month: "short",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </td>
                            <td className="px-2.5 py-2 whitespace-nowrap">
                              <span
                                className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                  platName === "META"
                                    ? "bg-sky-500/20 text-sky-300"
                                    : platName === "TIKTOK"
                                      ? "bg-pink-500/20 text-pink-300"
                                      : platName === "GOOGLE"
                                        ? "bg-emerald-500/20 text-emerald-300"
                                        : "bg-surface-container-highest text-on-surface"
                                }`}
                              >
                                {platName}
                              </span>
                            </td>
                            <td className="px-3 py-2 font-sans text-on-surface max-w-[280px] truncate" title={rec.referenceId}>
                              {rec.referenceId}
                            </td>
                            <td className="px-2.5 py-2 text-right font-bold whitespace-nowrap text-amber-300">
                              {rec.delta === 0 ? "Free (0 ⚡)" : `${rec.delta} ⚡`}
                            </td>
                            <td className="px-2.5 py-2 text-right text-on-surface-variant whitespace-nowrap">
                              {rec.balanceAfter} ⚡
                            </td>
                            <td className="px-3 py-2 text-center whitespace-nowrap">
                              {rec.refunded ? (
                                <span className="rounded bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                                  Refunded
                                </span>
                              ) : (
                                <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                                  Delivered
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: COMPLETE TRANSACTION HISTORY */}
          {tab === "LEDGER" && (
            <div className="space-y-3" data-testid="supporter-ledger-view">
              <div>
                <h3 className="text-compact font-bold text-on-surface">
                  Complete Token & Action Ledger
                </h3>
                <p className="text-[11px] text-on-surface-variant">
                  Chronological record of every token credit, search deduction, remix, top-up, and refund on your account.
                </p>
              </div>

              {rows === null ? (
                <div className={`${card} p-8 text-center animate-pulse text-on-surface-variant text-compact`}>
                  Loading complete order ledger...
                </div>
              ) : rows.length === 0 ? (
                <div className={`${card} p-8 text-center text-on-surface-variant`}>
                  <p className="text-body font-semibold">No transactions recorded yet.</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-white/[0.08] bg-surface-container-low max-h-[380px] overflow-y-auto">
                  <table className="w-full text-left text-[11px]">
                    <thead className="border-b border-white/[0.08] bg-surface-container-high/80 font-mono text-mono-label text-on-surface-variant sticky top-0 z-10 backdrop-blur-sm">
                      <tr>
                        <th className="px-3 py-2">Date / Time</th>
                        <th className="px-2.5 py-2">Type</th>
                        <th className="px-3 py-2">Details</th>
                        <th className="px-2.5 py-2 text-right">Tokens</th>
                        <th className="px-2.5 py-2 text-right">Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.04] font-mono">
                      {rows.map((tx) => {
                        const isCredit = tx.delta > 0;
                        return (
                          <tr key={tx.txId} className="hover:bg-white/[0.02] transition">
                            <td className="px-3 py-2 text-on-surface-variant whitespace-nowrap">
                              {new Date(tx.createdAt).toLocaleString("en-AU", {
                                day: "2-digit",
                                month: "short",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </td>
                            <td className="px-2.5 py-2 whitespace-nowrap">
                              <span
                                className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                                  tx.type === "TOPUP"
                                    ? "bg-emerald-500/15 text-emerald-300"
                                    : tx.type === "GIFT"
                                      ? "bg-primary/20 text-primary"
                                      : tx.type === "REFUND"
                                        ? "bg-amber-500/20 text-amber-300"
                                        : "bg-surface-container-highest text-on-surface-variant"
                                }`}
                              >
                                {tx.type}
                              </span>
                            </td>
                            <td className="px-3 py-2 font-sans text-on-surface max-w-[280px] truncate" title={tx.referenceId}>
                              {tx.referenceId}
                            </td>
                            <td
                              className={`px-2.5 py-2 text-right font-bold whitespace-nowrap ${
                                isCredit
                                  ? "text-emerald-400"
                                  : tx.delta === 0
                                    ? "text-on-surface-variant"
                                    : "text-amber-300"
                              }`}
                            >
                              {isCredit ? `+${tx.delta}` : tx.delta} ⚡
                            </td>
                            <td className="px-2.5 py-2 text-right text-on-surface-variant whitespace-nowrap">
                              {tx.balanceAfter} ⚡
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: SUPPORTER DETAILS & SUPPORT */}
          {tab === "ACCOUNT" && (
            <div className="space-y-4" data-testid="supporter-account-view">
              <div className={`${card} p-4 space-y-3`}>
                <div className="flex items-center gap-2">
                  <Icon name="shield" className="size-4 text-secondary" />
                  <h3 className="text-compact font-bold text-on-surface">
                    Supporter Membership Status
                  </h3>
                </div>
                <p className="text-[12px] leading-relaxed text-on-surface-variant">
                  When you sign in to Social Radar, you are automatically welcomed as a <strong>Supporter</strong> and retain permanent lifetime Supporter status. This guarantees full access to public ad intelligence feeds, automated refund protection, and dedicated support communications.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-[12px] font-mono">
                  <div className="p-2.5 rounded-lg bg-surface-container-high border border-white/[0.06]">
                    <span className="text-on-surface-variant block text-[10px] uppercase">Registered Email</span>
                    <span className="text-on-surface font-semibold truncate block">{user?.email}</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-surface-container-high border border-white/[0.06]">
                    <span className="text-on-surface-variant block text-[10px] uppercase">Account UID</span>
                    <span className="text-on-surface font-semibold truncate block">{uid}</span>
                  </div>
                </div>
              </div>

              <div className={`${card} p-4 space-y-3`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon name="sparkles" className="size-4 text-primary" />
                    <h3 className="text-compact font-bold text-on-surface">
                      Direct Support & Communications
                    </h3>
                  </div>
                  <span className="rounded bg-primary/20 px-2 py-0.5 font-mono text-[10px] text-primary">
                    Free (0 Tokens)
                  </span>
                </div>
                <p className="text-[12px] leading-relaxed text-on-surface-variant">
                  Need assistance, have strategic questions, or wish to request a refund? You can send a secure written message directly to the Super Admin. Messages to SuperAdmin are 100% free of charge and retained under our statutory 7-year audit compliance archive.
                </p>
                {onOpenContact && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenContact();
                    }}
                    className={btnPrimary}
                    data-agent-id="supporter-contact-admin-button"
                    data-testid="supporter-contact-admin-button"
                  >
                    <Icon name="sparkles" className="size-3.5" />
                    Message Super Admin
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-white/[0.08] px-5 py-3 bg-surface-container-high/40">
          <span className="text-[11px] font-mono text-on-surface-variant">
            Social Radar • Supporter Panel
          </span>
          <button
            type="button"
            onClick={onClose}
            className={btnSecondary}
            data-testid="supporter-panel-done-button"
          >
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
