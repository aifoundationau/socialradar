"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { collection, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { clientDb } from "@/lib/firebase-client";
import { useSession } from "@/components/auth/SessionProvider";
import { Icon } from "@/components/ui/Icon";
import { alertError, alertInfo, btnPrimary, btnSecondary, card, field, label } from "@/components/ui/styles";
import { TokenPacks } from "@/components/wallet/TokenPacks";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { LINK_URL_PATTERN, type AdAgentContractor, type AdminMessage, type TokenTransactionDoc } from "@/lib/contracts";

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
  initialTab?: SupporterTab;
}

export type SupporterTab = "TOKENS" | "BUY_TOKENS" | "MESSAGES" | "CONTRACTORS";

export function SupporterModal({ isOpen, onClose, initialTab }: SupporterModalProps) {
  const isClient = useIsClient();
  const { user, profile, activeBrand, role, isSuperAdmin, resetRole } = useSession();
  const uid = user?.uid;

  const [tab, setTab] = useState<SupporterTab>(initialTab ?? "TOKENS");

  useEffect(() => {
    if (initialTab && isOpen) {
      setTab(initialTab);
    }
  }, [initialTab, isOpen]);

  // Token ledger state
  const [rows, setRows] = useState<TokenTransactionDoc[] | null>(null);
  const [ledgerError, setLedgerError] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState("");
  const [platformFilter, setPlatformFilter] = useState<"ALL" | "META" | "TIKTOK" | "GOOGLE">("ALL");
  const [typeFilter, setTypeFilter] = useState<"ALL" | "RADAR_SEARCH" | "AI_REMIX" | "CUSTOMIZE_SERVICE" | "TOPUP" | "REFUND_GIFT">("ALL");
  const [confirmRefreshZeroOpen, setConfirmRefreshZeroOpen] = useState(false);
  const [refreshingZero, setRefreshingZero] = useState(false);
  const [refreshZeroMsg, setRefreshZeroMsg] = useState<string | null>(null);

  async function handleConfirmSelfRefreshZero() {
    setRefreshingZero(true);
    setLedgerError(null);
    setRefreshZeroMsg(null);
    try {
      const res = await apiFetch<{
        success: boolean;
        clearedTokens: number;
        balanceAfter: number;
      }>("/api/wallet/reset", {
        method: "POST",
        body: { confirmForfeit: true },
      });
      setConfirmRefreshZeroOpen(false);
      setRefreshZeroMsg(
        `Your token balance has been refreshed to 0 (${res.clearedTokens.toLocaleString("en-AU")} unused tokens permanently cleared).`
      );
      window.dispatchEvent(new CustomEvent("wallet-updated"));
    } catch (err) {
      setLedgerError(errorMessage(err));
    } finally {
      setRefreshingZero(false);
    }
  }

  // Messaging state
  const [messages, setMessages] = useState<AdminMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [messageTab, setMessageTab] = useState<"HISTORY" | "COMPOSE">("HISTORY");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const [messageStatusMsg, setMessageStatusMsg] = useState<string | null>(null);
  const [messageErrorMsg, setMessageErrorMsg] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function handleCopyText(text: string, id: string) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopiedId(id);
    setTimeout(() => {
      setCopiedId((prev) => (prev === id ? null : prev));
    }, 2000);
  }

  const composeHasLinks = LINK_URL_PATTERN.test(composeSubject) || LINK_URL_PATTERN.test(composeBody);

  // Contractors state (Ad Agents contractor list)
  const [contractors, setContractors] = useState<AdAgentContractor[]>([]);
  const [loadingContractors, setLoadingContractors] = useState(false);
  const [contractorSearch, setContractorSearch] = useState("");
  const [showAddContractor, setShowAddContractor] = useState(false);
  const [editingContractorId, setEditingContractorId] = useState<string | null>(null);
  const [savingContractor, setSavingContractor] = useState(false);
  const [contractorFormError, setContractorFormError] = useState<string | null>(null);
  const [contractorStatusMsg, setContractorStatusMsg] = useState<string | null>(null);
  const [confirmDeleteContractorId, setConfirmDeleteContractorId] = useState<string | null>(null);
  const [deletingContractor, setDeletingContractor] = useState(false);

  const [contractorForm, setContractorForm] = useState({
    name: "",
    location: "",
    email: "",
    phone: "",
    expertise: "Graphic Design",
    payIdPaymentDetails: "",
    averageRates: "",
    notes: "",
  });

  async function loadContractors() {
    if (!uid) return;
    setLoadingContractors(true);
    try {
      const data = await apiFetch<{ success: boolean; contractors: AdAgentContractor[] }>("/api/contractors", {
        method: "GET",
      });
      if (data.contractors) setContractors(data.contractors);
    } catch {
      // Quietly ignore network blip
    } finally {
      setLoadingContractors(false);
    }
  }

  function handleStartAddContractor() {
    setEditingContractorId(null);
    setContractorForm({
      name: "",
      location: "",
      email: "",
      phone: "",
      expertise: "Graphic Design",
      payIdPaymentDetails: "",
      averageRates: "",
      notes: "",
    });
    setContractorFormError(null);
    setShowAddContractor(true);
  }

  function handleStartEditContractor(c: AdAgentContractor) {
    setEditingContractorId(c.contractorId);
    setContractorForm({
      name: c.name,
      location: c.location,
      email: c.email,
      phone: c.phone,
      expertise: c.expertise,
      payIdPaymentDetails: c.payIdPaymentDetails || "",
      averageRates: c.averageRates || "",
      notes: c.notes || "",
    });
    setContractorFormError(null);
    setShowAddContractor(true);
  }

  async function handleSaveContractor(e: React.FormEvent) {
    e.preventDefault();
    if (!contractorForm.name.trim()) {
      setContractorFormError("Contractor name is required.");
      return;
    }
    if (!contractorForm.location.trim()) {
      setContractorFormError("Contractor location is required.");
      return;
    }
    if (!contractorForm.email.trim()) {
      setContractorFormError("Contractor email is required.");
      return;
    }
    if (!contractorForm.phone.trim()) {
      setContractorFormError("Contractor phone number is required.");
      return;
    }

    setSavingContractor(true);
    setContractorFormError(null);
    setContractorStatusMsg(null);

    try {
      if (editingContractorId) {
        const res = await apiFetch<{ success: boolean; contractors: AdAgentContractor[] }>("/api/contractors", {
          method: "POST",
          body: {
            action: "UPDATE_CONTRACTOR",
            contractorId: editingContractorId,
            patch: contractorForm,
          },
        });
        if (res.contractors) setContractors(res.contractors);
        setContractorStatusMsg("Contractor details updated successfully.");
      } else {
        const res = await apiFetch<{ success: boolean; contractors: AdAgentContractor[] }>("/api/contractors", {
          method: "POST",
          body: {
            action: "CREATE_CONTRACTOR",
            contractor: contractorForm,
          },
        });
        if (res.contractors) setContractors(res.contractors);
        setContractorStatusMsg("New contractor added successfully.");
      }
      setShowAddContractor(false);
      setEditingContractorId(null);
      window.dispatchEvent(new CustomEvent("adradar:contractors-updated"));
    } catch (err) {
      setContractorFormError(errorMessage(err));
    } finally {
      setSavingContractor(false);
    }
  }

  async function handleDeleteContractor(contractorId: string) {
    setDeletingContractor(true);
    setContractorFormError(null);
    setContractorStatusMsg(null);
    try {
      const res = await apiFetch<{ success: boolean; contractors: AdAgentContractor[] }>("/api/contractors", {
        method: "POST",
        body: {
          action: "DELETE_CONTRACTOR",
          contractorId,
        },
      });
      if (res.contractors) setContractors(res.contractors);
      setConfirmDeleteContractorId(null);
      setContractorStatusMsg("Contractor removed from your directory.");
      window.dispatchEvent(new CustomEvent("adradar:contractors-updated"));
    } catch (err) {
      setContractorFormError(errorMessage(err));
    } finally {
      setDeletingContractor(false);
    }
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    }
    if (isOpen) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
      loadMessages();
      loadContractors();
      window.addEventListener("adradar:contractors-updated", loadContractors);
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("adradar:contractors-updated", loadContractors);
    };
  }, [isOpen, onClose]);

  // Live real-time listener for user's own token transactions
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
        setRows(
          snap.docs.map((d) => {
            const raw = d.data() as TokenTransactionDoc;
            return {
              ...raw,
              balanceAfter: Math.max(0, Math.round(Number(raw.balanceAfter ?? 0))),
            };
          }),
        );
        setLedgerError(null);
      },
      (err) => {
        if (err.name === "FirebaseError" && (err as { code?: string }).code === "unavailable") {
          console.warn("[supporter-panel] firestore temporarily unavailable; retrying");
          return;
        }
        setLedgerError(err.message);
      },
    );
    return () => unsub();
  }, [uid, isOpen]);

  async function loadMessages() {
    if (!uid) return;
    setLoadingMessages(true);
    try {
      const data = await apiFetch<{ messages: AdminMessage[] }>("/api/contact", { method: "GET" });
      if (data.messages) setMessages(data.messages);
    } catch {
      // Quietly ignore network blip
    } finally {
      setLoadingMessages(false);
    }
  }

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (composeHasLinks) {
      setMessageErrorMsg("Plain text only. Upload links, URLs, and external links are prohibited.");
      return;
    }
    if (!composeSubject.trim()) {
      setMessageErrorMsg("Subject is required.");
      return;
    }
    if (!composeBody.trim()) {
      setMessageErrorMsg("Message body is required.");
      return;
    }

    setSendingMessage(true);
    setMessageErrorMsg(null);
    setMessageStatusMsg(null);

    try {
      await apiFetch<{ success: boolean; message: string; messageId: string }>("/api/contact", {
        method: "POST",
        body: {
          subject: composeSubject.trim(),
          body: composeBody.trim(),
        },
      });
      setMessageStatusMsg("Message delivered to Super Admin and archived under statutory 7-year compliance.");
      setComposeSubject("");
      setComposeBody("");
      setMessageTab("HISTORY");
      await loadMessages();
    } catch (err) {
      setMessageErrorMsg(errorMessage(err));
    } finally {
      setSendingMessage(false);
    }
  }

  // Filtered rows for Tokens tab
  const filteredRows = useMemo(() => {
    if (!rows) return [];
    const q = searchFilter.trim().toLowerCase();

    return rows.filter((rec) => {
      // Type filter
      if (typeFilter === "RADAR_SEARCH" && rec.type !== "RADAR_SEARCH") return false;
      if (typeFilter === "AI_REMIX" && rec.type !== "AI_REMIX") return false;
      if (typeFilter === "CUSTOMIZE_SERVICE" && rec.type !== "CUSTOMIZE_SERVICE") return false;
      if (typeFilter === "TOPUP" && rec.type !== "TOPUP") return false;
      if (typeFilter === "REFUND_GIFT" && rec.type !== "REFUND" && rec.type !== "GIFT") return false;

      // Platform filter (for search rows)
      if (platformFilter !== "ALL") {
        const refUpper = (rec.referenceId || "").toUpperCase();
        if (!refUpper.includes(platformFilter)) return false;
      }

      // Keyword query search
      if (!q) return true;
      return (
        (rec.referenceId || "").toLowerCase().includes(q) ||
        (rec.txId || "").toLowerCase().includes(q) ||
        (rec.type || "").toLowerCase().includes(q)
      );
    });
  }, [rows, searchFilter, platformFilter, typeFilter]);

  const filteredContractors = useMemo(() => {
    const q = contractorSearch.trim().toLowerCase();
    if (!q) return contractors;
    return contractors.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.expertise.toLowerCase().includes(q) ||
        c.location.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        c.averageRates.toLowerCase().includes(q) ||
        (c.payIdPaymentDetails && c.payIdPaymentDetails.toLowerCase().includes(q)) ||
        (c.notes && c.notes.toLowerCase().includes(q))
    );
  }, [contractors, contractorSearch]);

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
        <div className="flex items-center justify-between border-b border-white/[0.08] px-5 py-4 bg-surface-container-high/60 backdrop-blur-sm shrink-0">
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
              <p className="text-[12px] text-on-surface-variant font-mono">
                Tokens · Buy More Tokens · Messages · Contractors
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isSuperAdmin && (
              <div className="flex items-center gap-2">
                <span className="hidden sm:inline font-mono text-[10px] text-on-surface-variant">
                  Acting as Supporter
                </span>
                <button
                  type="button"
                  onClick={() => {
                    resetRole();
                    onClose();
                  }}
                  className="rounded-lg bg-primary/20 border border-primary/30 px-2.5 py-1 font-mono text-[11px] font-bold text-primary hover:bg-primary/30 transition"
                  data-agent-id="supporter-switch-to-superadmin"
                  data-testid="supporter-switch-to-superadmin"
                  aria-label="Return to Super Admin"
                >
                  Return to Super Admin
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Supporter Panel"
              data-agent-id="close-supporter-modal-button"
              data-testid="close-supporter-modal-button"
              className="flex size-9 items-center justify-center rounded-xl text-on-surface-variant hover:bg-white/[0.06] hover:text-on-surface transition"
            >
              <Icon name="x" className="size-5" />
            </button>
          </div>
        </div>

        {/* 4 Dedicated Navigation Tabs: Tokens, Buy More Tokens, Messages, Contractors */}
        <nav
          aria-label="Supporter Panel Navigation"
          data-testid="supporter-navbar"
          className="flex items-center gap-2 px-5 pt-3 border-b border-white/[0.08] bg-surface-container shrink-0 overflow-x-auto no-scrollbar"
        >
          <button
            type="button"
            onClick={() => setTab("TOKENS")}
            data-testid="supporter-tab-tokens"
            data-agent-id="supporter-tab-tokens"
            className={`flex items-center gap-2 px-4 py-2.5 font-mono text-xs font-semibold rounded-t-xl transition border-b-2 shrink-0 ${
              tab === "TOKENS"
                ? "border-primary text-primary bg-primary/10 shadow-sm"
                : "border-transparent text-on-surface-variant hover:text-on-surface hover:bg-white/[0.03]"
            }`}
          >
            <Icon name="zap" className="size-3.5" />
            <span>Tokens</span>
            <span className="ml-1 rounded-full bg-primary/20 px-2 py-0.2 font-mono text-[10px] font-bold text-primary">
              {profile ? profile.tokenBalance.toLocaleString("en-AU") : "–"}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setTab("BUY_TOKENS")}
            data-testid="supporter-tab-buy"
            data-agent-id="supporter-tab-buy"
            className={`flex items-center gap-2 px-4 py-2.5 font-mono text-xs font-semibold rounded-t-xl transition border-b-2 shrink-0 ${
              tab === "BUY_TOKENS"
                ? "border-secondary text-secondary bg-secondary/10 shadow-sm"
                : "border-transparent text-on-surface-variant hover:text-on-surface hover:bg-white/[0.03]"
            }`}
          >
            <Icon name="plus" className="size-3.5" />
            <span>Buy More Tokens</span>
          </button>

          <button
            type="button"
            onClick={() => setTab("MESSAGES")}
            data-testid="supporter-tab-messages"
            data-agent-id="supporter-tab-messages"
            className={`flex items-center gap-2 px-4 py-2.5 font-mono text-xs font-semibold rounded-t-xl transition border-b-2 shrink-0 ${
              tab === "MESSAGES"
                ? "border-tertiary-container text-tertiary-container bg-tertiary-container/10 shadow-sm"
                : "border-transparent text-on-surface-variant hover:text-on-surface hover:bg-white/[0.03]"
            }`}
          >
            <Icon name="sparkles" className="size-3.5" />
            <span>Messages</span>
            {messages.filter((m) => m.status === "unread").length > 0 && (
              <span className="ml-1 rounded-full bg-tertiary-container text-on-tertiary px-1.5 py-0.2 font-mono text-[10px] font-bold">
                {messages.filter((m) => m.status === "unread").length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setTab("CONTRACTORS")}
            data-testid="supporter-tab-contractors"
            data-agent-id="supporter-tab-contractors"
            className={`flex items-center gap-2 px-4 py-2.5 font-mono text-xs font-semibold rounded-t-xl transition border-b-2 shrink-0 ${
              tab === "CONTRACTORS"
                ? "border-amber-400 text-amber-300 bg-amber-400/10 shadow-sm"
                : "border-transparent text-on-surface-variant hover:text-on-surface hover:bg-white/[0.03]"
            }`}
          >
            <Icon name="users" className="size-3.5" />
            <span>Contractors</span>
            <span className="ml-1 rounded-full bg-amber-400/20 text-amber-200 px-2 py-0.2 font-mono text-[10px] font-bold">
              {contractors.length}
            </span>
          </button>
        </nav>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* ========================================================================= */}
          {/* TAB 1: TOKENS */}
          {/* ========================================================================= */}
          {tab === "TOKENS" && (
            <div className="space-y-6">
              {/* Token Wallet Card */}
              <div className={`${card} p-5 bg-gradient-to-r from-surface-container-high to-surface-container space-y-4 border border-white/10 shadow-lg`}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="flex size-7 items-center justify-center rounded-lg bg-primary/20 text-primary">
                        <Icon name="zap" className="size-4" />
                      </span>
                      <span className="text-body font-semibold text-on-surface">Your Token Balance</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 pt-1">
                      <div className="flex items-baseline gap-2">
                        <span className="font-mono text-3xl sm:text-4xl font-extrabold text-primary tabular-nums">
                          {profile ? Math.max(0, Math.round(profile.tokenBalance)).toLocaleString("en-AU") : "–"}
                        </span>
                        <span className="font-mono text-sm font-semibold text-on-surface-variant uppercase tracking-wider">
                          Tokens
                        </span>
                      </div>
                      {!confirmRefreshZeroOpen && (
                        <button
                          type="button"
                          disabled={!profile || Math.max(0, Math.round(profile.tokenBalance)) <= 0 || refreshingZero}
                          onClick={() => {
                            setRefreshZeroMsg(null);
                            setLedgerError(null);
                            setConfirmRefreshZeroOpen(true);
                          }}
                          data-agent-id="supporter-refresh-tokens-zero-btn"
                          data-testid="supporter-refresh-tokens-zero-btn"
                          aria-label="Refresh token balance to 0"
                          className="inline-flex items-center gap-1.5 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 font-mono text-xs font-semibold text-rose-300 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <Icon name="refresh" className="size-3.5" />
                          <span>Refresh Tokens to 0</span>
                        </button>
                      )}
                    </div>
                    <p className="text-compact text-on-surface-variant">
                      Standard paid rate is 1 Token = $1.00 AUD. Tokens never expire, deductions are atomic, and no account can have negative tokens.
                    </p>
                  </div>

                  <div className="flex flex-col sm:items-end gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setTab("BUY_TOKENS")}
                      data-agent-id="tokens-tab-buy-more-button"
                      data-testid="tokens-tab-buy-more-button"
                      aria-label="Buy More Tokens"
                      className={`${btnPrimary} flex items-center gap-2`}
                    >
                      <Icon name="plus" className="size-4" />
                      <span>Buy More Tokens</span>
                    </button>
                    <span className="font-mono text-[11px] text-outline">
                      Instant Stripe checkout · No monthly lock-in
                    </span>
                  </div>
                </div>

                {profile && Math.max(0, Math.round(profile.tokenBalance)) === 0 && (
                  <div
                    role="alert"
                    data-agent-id="supporter-zero-balance-buy-banner"
                    data-testid="supporter-zero-balance-buy-banner"
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-body-sm text-amber-200"
                  >
                    <div className="flex items-center gap-2">
                      <Icon name="alert" className="size-4 shrink-0 text-amber-300" />
                      <span>
                        Your token balance is <strong className="font-mono">0</strong>. Nobody can have negative tokens — please buy more tokens to run Radar searches, AI Remixes, or Customizes.
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setTab("BUY_TOKENS")}
                      data-agent-id="supporter-zero-balance-buy-cta"
                      data-testid="supporter-zero-balance-buy-cta"
                      className="inline-flex items-center gap-1.5 rounded-lg bg-amber-400 px-3 py-1.5 font-mono text-xs font-bold text-black transition hover:bg-amber-300"
                    >
                      <Icon name="zap" className="size-3.5" />
                      <span>Buy More Tokens</span>
                    </button>
                  </div>
                )}

                {confirmRefreshZeroOpen && (
                  <div
                    role="alertdialog"
                    data-agent-id="supporter-confirm-refresh-zero-box"
                    data-testid="supporter-confirm-refresh-zero-box"
                    className="rounded-xl border border-rose-500/50 bg-rose-500/10 p-4 space-y-3"
                  >
                    <div className="flex items-start gap-2.5">
                      <Icon name="alert" className="mt-0.5 size-5 shrink-0 text-rose-300" />
                      <div className="space-y-1">
                        <p className="font-mono text-xs font-bold uppercase tracking-wider text-rose-200">
                          Confirm Refresh Tokens to 0 — Permanent Action
                        </p>
                        <p className="text-body-sm text-on-surface">
                          You are about to refresh your token balance (
                          <strong className="font-mono text-rose-200">
                            {(profile?.tokenBalance ?? 0).toLocaleString("en-AU")} tokens
                          </strong>
                          ) to <strong className="font-mono text-rose-200">0</strong>. Once confirmed,{" "}
                          <strong>you cannot retrieve those unused tokens</strong>.
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <button
                        type="button"
                        disabled={refreshingZero}
                        onClick={() => setConfirmRefreshZeroOpen(false)}
                        data-agent-id="supporter-cancel-refresh-tokens-zero-btn"
                        data-testid="supporter-cancel-refresh-tokens-zero-btn"
                        className={btnSecondary}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={refreshingZero}
                        onClick={handleConfirmSelfRefreshZero}
                        data-agent-id="supporter-confirm-refresh-tokens-zero-btn"
                        data-testid="supporter-confirm-refresh-tokens-zero-btn"
                        className="inline-flex items-center gap-1.5 rounded-xl border border-rose-500/70 bg-rose-500/25 px-3.5 py-2 font-mono text-xs font-bold text-rose-100 transition hover:bg-rose-500/35 disabled:opacity-50"
                      >
                        <Icon
                          name="refresh"
                          className={`size-3.5 ${refreshingZero ? "animate-spin" : ""}`}
                        />
                        <span>
                          {refreshingZero
                            ? "Refreshing to 0…"
                            : "Confirm Refresh to 0 (Cannot Retrieve Unused Tokens)"}
                        </span>
                      </button>
                    </div>
                  </div>
                )}

                {refreshZeroMsg && <p className={alertInfo}>{refreshZeroMsg}</p>}
              </div>

              {/* Token Activity & Search Records */}
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-title-sm font-semibold text-on-surface">
                      Token Activity & Search Records
                    </h3>
                    <p className="mt-0.5 text-compact text-on-surface-variant">
                      Every search and token transaction you execute is permanently recorded in our database.
                    </p>
                  </div>
                  <span className="font-mono text-xs text-outline">
                    {filteredRows.length} record(s) found
                  </span>
                </div>

                {/* Filter Controls */}
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                  <div className="sm:col-span-6 relative">
                    <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-outline" />
                    <input
                      type="text"
                      value={searchFilter}
                      onChange={(e) => setSearchFilter(e.target.value)}
                      placeholder="Search query, reference or tx ID…"
                      className={`${field} pl-9 font-mono text-xs`}
                      aria-label="Filter token activity by keyword or transaction ID"
                      data-agent-id="supporter-search-input"
                      data-testid="supporter-search-input"
                    />
                  </div>

                  <div className="sm:col-span-3">
                    <select
                      value={platformFilter}
                      onChange={(e) => setPlatformFilter(e.target.value as typeof platformFilter)}
                      className={`${field} font-mono text-xs`}
                      aria-label="Filter token activity by platform"
                      data-agent-id="supporter-platform-filter"
                      data-testid="supporter-platform-filter"
                    >
                      <option value="ALL">All Platforms</option>
                      <option value="META">Meta Ads</option>
                      <option value="TIKTOK">TikTok Ads</option>
                      <option value="GOOGLE">Google Ads</option>
                    </select>
                  </div>

                  <div className="sm:col-span-3">
                    <select
                      value={typeFilter}
                      onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
                      className={`${field} font-mono text-xs`}
                      aria-label="Filter token activity by transaction type"
                      data-agent-id="supporter-type-filter"
                      data-testid="supporter-type-filter"
                    >
                      <option value="ALL">All Activity</option>
                      <option value="RADAR_SEARCH">Ad Searches</option>
                      <option value="AI_REMIX">AI Remixes</option>
                      <option value="CUSTOMIZE_SERVICE">Customize</option>
                      <option value="TOPUP">Stripe Top-ups</option>
                      <option value="REFUND_GIFT">Refunds & Gifts</option>
                    </select>
                  </div>
                </div>

                {ledgerError && <p className={alertError}>{ledgerError}</p>}

                {/* Records Table */}
                <div className="rounded-xl border border-white/[0.08] bg-surface-container-high/40 overflow-hidden">
                  <div className="max-h-96 overflow-y-auto">
                    <table className="w-full text-left font-mono text-xs border-collapse">
                      <thead className="sticky top-0 bg-surface-container-high border-b border-white/[0.08] text-on-surface-variant font-semibold">
                        <tr>
                          <th className="p-3">Time</th>
                          <th className="p-3">Activity / Query</th>
                          <th className="p-3 text-center">Type</th>
                          <th className="p-3 text-right">Tokens</th>
                          <th className="p-3 text-right">Balance</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.04]">
                        {rows === null ? (
                          <tr>
                            <td colSpan={5} className="p-8 text-center text-on-surface-variant">
                              <span className="inline-flex items-center gap-2">
                                <Icon name="refresh" className="size-4 animate-spin text-primary" />
                                Loading recorded activity…
                              </span>
                            </td>
                          </tr>
                        ) : filteredRows.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="p-8 text-center text-on-surface-variant">
                              No records found matching your filters.
                            </td>
                          </tr>
                        ) : (
                          filteredRows.map((r) => {
                            const isSearch = r.type === "RADAR_SEARCH";
                            const isDebit = r.delta < 0;
                            const isZero = r.delta === 0;

                            return (
                              <tr key={r.txId} className="hover:bg-white/[0.02] transition">
                                <td className="p-3 whitespace-nowrap text-outline text-[11px]">
                                  {new Date(r.createdAt).toLocaleString("en-AU", {
                                    month: "short",
                                    day: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </td>
                                <td className="p-3 font-sans">
                                  <div className="font-medium text-on-surface truncate max-w-xs sm:max-w-md" title={r.referenceId || "Activity"}>
                                    {r.referenceId || "Activity"}
                                  </div>
                                  <div className="font-mono text-[10px] text-outline truncate" title={r.txId}>
                                    tx: {r.txId}
                                  </div>
                                </td>
                                <td className="p-3 text-center">
                                  <span
                                    className={`inline-block rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                                      isSearch
                                        ? "bg-secondary/15 text-secondary border border-secondary/30"
                                        : r.type === "TOPUP"
                                        ? "bg-primary/15 text-primary border border-primary/30"
                                        : r.type === "REFUND"
                                        ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                                        : "bg-surface-container text-on-surface-variant border border-white/10"
                                    }`}
                                  >
                                    {r.type.replace("_", " ")}
                                  </span>
                                </td>
                                <td className="p-3 text-right font-bold whitespace-nowrap tabular-nums">
                                  {isZero ? (
                                    <span className="text-outline">0</span>
                                  ) : isDebit ? (
                                    <span className="text-amber-400">{r.delta}</span>
                                  ) : (
                                    <span className="text-emerald-400">+{r.delta}</span>
                                  )}
                                </td>
                                <td className="p-3 text-right text-on-surface-variant whitespace-nowrap tabular-nums">
                                  {r.balanceAfter.toLocaleString("en-AU")}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 2: BUY MORE TOKENS */}
          {/* ========================================================================= */}
          {tab === "BUY_TOKENS" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
                <div>
                  <h3 className="text-title-sm font-semibold text-on-surface">Buy More Tokens</h3>
                  <p className="mt-0.5 text-compact text-on-surface-variant">
                    Instant token credits delivered directly to your wallet via Stripe Checkout.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setTab("TOKENS")}
                  data-agent-id="supporter-view-balance-btn"
                  data-testid="supporter-view-balance-btn"
                  aria-label="View token balance"
                  className="font-mono text-xs text-primary hover:underline flex items-center gap-1"
                >
                  <Icon name="chevronLeft" className="size-3" />
                  <span>View balance</span>
                </button>
              </div>

              {/* Embedded TokenPacks catalog */}
              <TokenPacks />
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 3: MESSAGES */}
          {/* ========================================================================= */}
          {tab === "MESSAGES" && (
            <div className="space-y-6">
              {/* Header & Sub-tab Switcher */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/[0.08] pb-4">
                <div>
                  <h3 className="text-title-sm font-semibold text-on-surface">
                    Messages with Super Admin
                  </h3>
                  <p className="mt-0.5 text-compact text-on-surface-variant">
                    Direct communications, inquiry replies, customized deliverables, and statutory refund requests.
                  </p>
                </div>

                <div className="flex items-center gap-1.5 p-1 rounded-xl bg-surface-container-high border border-white/[0.08] shrink-0">
                  <button
                    type="button"
                    onClick={() => setMessageTab("HISTORY")}
                    className={`px-3 py-1.5 font-mono text-xs font-semibold rounded-lg transition ${
                      messageTab === "HISTORY"
                        ? "bg-primary text-on-primary shadow-sm"
                        : "text-on-surface-variant hover:text-on-surface"
                    }`}
                    data-agent-id="message-tab-history"
                    data-testid="message-tab-history"
                    aria-label="View Message Inbox"
                  >
                    Inbox ({messages.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setMessageTab("COMPOSE")}
                    className={`px-3 py-1.5 font-mono text-xs font-semibold rounded-lg transition ${
                      messageTab === "COMPOSE"
                        ? "bg-primary text-on-primary shadow-sm"
                        : "text-on-surface-variant hover:text-on-surface"
                    }`}
                    data-agent-id="message-tab-compose"
                    data-testid="message-tab-compose"
                    aria-label="Compose Message"
                  >
                    Compose Message
                  </button>
                </div>
              </div>

              {messageErrorMsg && <p className={alertError}>{messageErrorMsg}</p>}
              {messageStatusMsg && <p className={alertInfo}>{messageStatusMsg}</p>}

              {/* Sub-view: Message History */}
              {messageTab === "HISTORY" && (
                <div className="space-y-4">
                  {loadingMessages ? (
                    <div className="p-8 text-center text-on-surface-variant font-mono text-xs">
                      <Icon name="refresh" className="size-4 animate-spin text-primary inline mr-2" />
                      Loading your messages…
                    </div>
                  ) : messages.length === 0 ? (
                    <div className={`${card} p-8 text-center space-y-3`}>
                      <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary mx-auto">
                        <Icon name="sparkles" className="size-6" />
                      </span>
                      <h4 className="text-body font-semibold text-on-surface">No messages yet</h4>
                      <p className="text-compact text-on-surface-variant max-w-sm mx-auto">
                        Have a question, customization brief, or feedback for the Super Admin? Send a message anytime.
                      </p>
                      <button
                        type="button"
                        onClick={() => setMessageTab("COMPOSE")}
                        data-agent-id="supporter-send-first-message-btn"
                        data-testid="supporter-send-first-message-btn"
                        aria-label="Send First Message"
                        className={btnPrimary}
                      >
                        Send First Message
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {messages.map((m) => (
                        <div
                          key={m.messageId}
                          data-testid={`supporter-message-card-${m.messageId}`}
                          className={`${card} p-4 space-y-2 border border-white/[0.08] hover:border-white/20 transition`}
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="text-body font-semibold text-on-surface">
                                {m.subject}
                              </span>
                              {m.requestType && (
                                <span className="rounded bg-primary/15 border border-primary/30 px-2 py-0.2 font-mono text-[10px] font-bold text-primary uppercase">
                                  {m.requestType.replace("_", " ")}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  const rawSub = (m.subject || "Message").trim();
                                  const cleanSub = rawSub.toLowerCase().startsWith("re:")
                                    ? rawSub.slice(0, 100)
                                    : `Re: ${rawSub}`.slice(0, 100);
                                  setComposeSubject(cleanSub);
                                  setComposeBody("");
                                  setMessageErrorMsg(null);
                                  setMessageStatusMsg(null);
                                  setMessageTab("COMPOSE");
                                }}
                                data-testid={`reply-supporter-msg-btn-${m.messageId}`}
                                data-agent-id={`reply-supporter-msg-btn-${m.messageId}`}
                                aria-label={`Reply to message ${m.subject}`}
                                className="inline-flex items-center gap-1 rounded-lg border border-secondary/40 bg-secondary/15 px-2.5 py-0.5 font-mono text-[10px] font-bold text-secondary hover:bg-secondary/25 transition"
                              >
                                <Icon name="sparkles" className="size-3" />
                                <span>Reply</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleCopyText(m.body, m.messageId)}
                                data-testid={`copy-supporter-msg-btn-${m.messageId}`}
                                data-agent-id={`copy-supporter-msg-btn-${m.messageId}`}
                                aria-label={`Copy text of message ${m.subject}`}
                                className="inline-flex items-center gap-1 rounded-lg border border-primary/40 bg-primary/15 px-2.5 py-0.5 font-mono text-[10px] font-bold text-primary hover:bg-primary/25 transition"
                              >
                                <Icon name={copiedId === m.messageId ? "checkCircle" : "copy"} className="size-3" />
                                <span>{copiedId === m.messageId ? "Copied ✓" : "Copy Text"}</span>
                              </button>
                              <span className="font-mono text-[11px] text-outline">
                                {new Date(m.createdAt).toLocaleString("en-AU", {
                                  dateStyle: "medium",
                                  timeStyle: "short",
                                })}
                              </span>
                            </div>
                          </div>

                          <p className="text-body-sm text-on-surface-variant whitespace-pre-wrap leading-relaxed">
                            {m.body}
                          </p>

                          <div className="flex items-center justify-between pt-2 border-t border-white/[0.06] font-mono text-[11px] text-outline">
                            <span>Status: <strong className="capitalize text-on-surface">{m.status}</strong></span>
                            <span>Archived under 7-Year Statutory Audit</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Sub-view: Compose Message */}
              {messageTab === "COMPOSE" && (
                <form onSubmit={handleSendMessage} className={`${card} p-5 space-y-4`} data-testid="supporter-compose-form">
                  <div className="space-y-1">
                    <label htmlFor="supporter-compose-subject" className={label}>
                      Subject
                    </label>
                    <input
                      id="supporter-compose-subject"
                      type="text"
                      maxLength={100}
                      value={composeSubject}
                      onChange={(e) => setComposeSubject(e.target.value)}
                      placeholder="e.g. Question about custom brand strategy or token receipt"
                      className={field}
                      required
                      data-agent-id="supporter-compose-subject"
                      data-testid="supporter-compose-subject"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label htmlFor="supporter-compose-body" className={label}>
                        Message (Plain text only)
                      </label>
                      <span className="font-mono text-[11px] text-outline">
                        {composeBody.length}/10000
                      </span>
                    </div>
                    <textarea
                      id="supporter-compose-body"
                      rows={5}
                      maxLength={10000}
                      value={composeBody}
                      onChange={(e) => setComposeBody(e.target.value)}
                      placeholder="Type your message clearly here. Links and external URLs are prohibited for safety."
                      className={`${field} resize-none font-sans`}
                      required
                      data-agent-id="supporter-compose-body"
                      data-testid="supporter-compose-body"
                    />
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                    <p className="font-mono text-[11px] text-outline">
                      Delivers directly to Super Admin · Zero token cost ($0)
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setMessageTab("HISTORY")}
                        data-agent-id="supporter-cancel-compose"
                        data-testid="supporter-cancel-compose"
                        aria-label="Cancel message"
                        className={btnSecondary}
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={sendingMessage || composeHasLinks}
                        className={btnPrimary}
                        data-agent-id="supporter-submit-message"
                        data-testid="supporter-submit-message"
                        aria-label="Send Message"
                      >
                        {sendingMessage ? "Sending…" : "Send Message"}
                      </button>
                    </div>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 4: CONTRACTORS */}
          {/* ========================================================================= */}
          {tab === "CONTRACTORS" && (
            <div className="space-y-5" data-testid="supporter-contractors-section">
              {/* Header Card with Add Contractor Button */}
              <div className={`${card} p-5 bg-gradient-to-r from-surface-container-high to-surface-container border border-white/10 space-y-3 shadow-md`}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="flex size-7 items-center justify-center rounded-lg bg-amber-400/20 text-amber-300">
                        <Icon name="users" className="size-4" />
                      </span>
                      <h3 className="text-title-sm font-bold text-on-surface">
                        Ad Agent Contractors Directory
                      </h3>
                      <span className="rounded-full bg-amber-400/15 border border-amber-400/30 px-2.5 py-0.5 font-mono text-[10px] font-bold text-amber-200">
                        {contractors.length} {contractors.length === 1 ? "Contractor" : "Contractors"}
                      </span>
                    </div>
                    <p className="text-[12px] text-on-surface-variant mt-1 max-w-2xl leading-relaxed">
                      List your creative contractors, videographers, graphic artists, and AI specialists. These contractors can be selected directly from the Service Provider box in the Ad Agent Registration &amp; Customize Orders Panel.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleStartAddContractor}
                    data-agent-id="add-contractor-btn"
                    data-testid="add-contractor-btn"
                    className={`${btnPrimary} shrink-0 text-xs py-2 px-3.5`}
                  >
                    <Icon name="plus" className="size-3.5 mr-1.5" />
                    <span>Add Contractor</span>
                  </button>
                </div>

                {contractorStatusMsg && (
                  <div className={alertInfo} role="status">
                    {contractorStatusMsg}
                  </div>
                )}
                {contractorFormError && (
                  <div className={alertError} role="alert">
                    {contractorFormError}
                  </div>
                )}
              </div>

              {/* Add / Edit Contractor Form Drawer */}
              {showAddContractor && (
                <form
                  onSubmit={handleSaveContractor}
                  className={`${card} p-5 space-y-4 border-2 border-primary/40 bg-surface-container shadow-xl`}
                  data-testid="contractor-form"
                  data-agent-id="contractor-form"
                >
                  <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
                    <h4 className="font-mono text-sm font-bold text-primary flex items-center gap-2">
                      <Icon name="tag" className="size-4" />
                      <span>{editingContractorId ? "Edit Contractor" : "Add New Contractor"}</span>
                    </h4>
                    <button
                      type="button"
                      onClick={() => setShowAddContractor(false)}
                      className="p-1 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-white/[0.08]"
                      data-agent-id="close-contractor-form-btn"
                      data-testid="close-contractor-form-btn"
                      aria-label="Close form"
                    >
                      <Icon name="x" className="size-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label className={label}>Name *</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Sarah Chen Creative Studio"
                        value={contractorForm.name}
                        onChange={(e) => setContractorForm({ ...contractorForm, name: e.target.value })}
                        className={field}
                        data-agent-id="contractor-name-input"
                        data-testid="contractor-name-input"
                      />
                    </div>

                    <div>
                      <label className={label}>Location *</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Sydney, NSW, Australia"
                        value={contractorForm.location}
                        onChange={(e) => setContractorForm({ ...contractorForm, location: e.target.value })}
                        className={field}
                        data-agent-id="contractor-location-input"
                        data-testid="contractor-location-input"
                      />
                    </div>

                    <div>
                      <label className={label}>Email *</label>
                      <input
                        type="email"
                        required
                        placeholder="e.g. sarah@creativestudio.com.au"
                        value={contractorForm.email}
                        onChange={(e) => setContractorForm({ ...contractorForm, email: e.target.value })}
                        className={field}
                        data-agent-id="contractor-email-input"
                        data-testid="contractor-email-input"
                      />
                    </div>

                    <div>
                      <label className={label}>Phone Number *</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. +61 400 123 456"
                        value={contractorForm.phone}
                        onChange={(e) => setContractorForm({ ...contractorForm, phone: e.target.value })}
                        className={field}
                        data-agent-id="contractor-phone-input"
                        data-testid="contractor-phone-input"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className={label}>Expertise *</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Graphic Designer, UGC Video Editor, Visual AI Specialist, Copywriter"
                        value={contractorForm.expertise}
                        onChange={(e) => setContractorForm({ ...contractorForm, expertise: e.target.value })}
                        className={field}
                        data-agent-id="contractor-expertise-input"
                        data-testid="contractor-expertise-input"
                      />
                    </div>

                    <div>
                      <label className={label}>PayID and payment details</label>
                      <textarea
                        rows={2}
                        placeholder="e.g. PayID: studio@creativestudio.com.au / BSB: 062-000 Acc: 12345678"
                        value={contractorForm.payIdPaymentDetails}
                        onChange={(e) => setContractorForm({ ...contractorForm, payIdPaymentDetails: e.target.value })}
                        className={`${field} resize-none font-mono text-xs`}
                        data-agent-id="contractor-payid-input"
                        data-testid="contractor-payid-input"
                      />
                    </div>

                    <div>
                      <label className={label}>Average Rates Box (Hourly, per job, etc.)</label>
                      <textarea
                        rows={2}
                        placeholder="e.g. $80/hr or $250 per short-form UGC video, $600 full package"
                        value={contractorForm.averageRates}
                        onChange={(e) => setContractorForm({ ...contractorForm, averageRates: e.target.value })}
                        className={`${field} resize-none font-mono text-xs`}
                        data-agent-id="contractor-rates-input"
                        data-testid="contractor-rates-input"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className={label}>Specialty Notes (Optional)</label>
                      <input
                        type="text"
                        placeholder="e.g. 48hr delivery, specialized in e-commerce fashion & beauty campaigns"
                        value={contractorForm.notes}
                        onChange={(e) => setContractorForm({ ...contractorForm, notes: e.target.value })}
                        className={field}
                        data-agent-id="contractor-notes-input"
                        data-testid="contractor-notes-input"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/[0.08]">
                    <button
                      type="button"
                      onClick={() => setShowAddContractor(false)}
                      className={btnSecondary}
                      data-agent-id="cancel-contractor-form-btn"
                      data-testid="cancel-contractor-form-btn"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={savingContractor}
                      className={btnPrimary}
                      data-agent-id="save-contractor-btn"
                      data-testid="save-contractor-btn"
                    >
                      {savingContractor ? "Saving..." : editingContractorId ? "Update Contractor" : "Save Contractor"}
                    </button>
                  </div>
                </form>
              )}

              {/* Contractors Search & Directory Cards */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-on-surface-variant pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Search contractors by name, expertise, location, rates..."
                      value={contractorSearch}
                      onChange={(e) => setContractorSearch(e.target.value)}
                      className={`${field} pl-9 text-xs`}
                      data-agent-id="search-contractors-input"
                      data-testid="search-contractors-input"
                    />
                  </div>
                </div>

                {loadingContractors ? (
                  <div className="p-8 text-center font-mono text-xs text-on-surface-variant">
                    Loading contractors directory...
                  </div>
                ) : filteredContractors.length === 0 ? (
                  <div className="rounded-xl border border-white/10 bg-surface-container/50 p-8 text-center space-y-2">
                    <Icon name="users" className="size-8 mx-auto text-on-surface-variant/50" />
                    <p className="font-mono text-xs font-semibold text-on-surface">
                      {contractorSearch ? "No contractors match your search." : "No contractors listed yet."}
                    </p>
                    <p className="text-[11px] text-on-surface-variant max-w-md mx-auto">
                      {contractorSearch
                        ? "Try searching with a different term."
                        : "Ad Agents can list as many contractors as they want (videographers, graphic artists, AI specialists). They can then be chosen directly from the Service Provider box when fulfilling customize orders."}
                    </p>
                    {!contractorSearch && (
                      <button
                        type="button"
                        onClick={handleStartAddContractor}
                        className={`${btnPrimary} text-xs py-1.5 px-3 mt-2`}
                      >
                        + Add First Contractor
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    {filteredContractors.map((c) => (
                      <div
                        key={c.contractorId}
                        className={`${card} p-4 space-y-3 border border-white/10 bg-surface-container hover:border-amber-400/40 transition`}
                        data-agent-id={`contractor-card-${c.contractorId}`}
                        data-testid={`contractor-card-${c.contractorId}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <h4 className="font-bold text-on-surface text-sm sm:text-base truncate">
                              {c.name}
                            </h4>
                            <span className="inline-block mt-0.5 rounded-full bg-secondary/15 border border-secondary/30 px-2 py-0.2 font-mono text-[10px] font-semibold text-secondary">
                              {c.expertise}
                            </span>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleStartEditContractor(c)}
                              className="p-1.5 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-white/10 transition"
                              data-agent-id={`edit-contractor-btn-${c.contractorId}`}
                              data-testid={`edit-contractor-btn-${c.contractorId}`}
                              aria-label={`Edit ${c.name}`}
                              title="Edit Contractor"
                            >
                              <Icon name="sliders" className="size-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteContractorId(c.contractorId)}
                              className="p-1.5 rounded-lg text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition"
                              data-agent-id={`delete-contractor-btn-${c.contractorId}`}
                              data-testid={`delete-contractor-btn-${c.contractorId}`}
                              aria-label={`Delete ${c.name}`}
                              title="Delete Contractor"
                            >
                              <Icon name="trash" className="size-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Confirm Delete Banner */}
                        {confirmDeleteContractorId === c.contractorId && (
                          <div className="rounded-lg border border-rose-500/50 bg-rose-500/15 p-2.5 space-y-2">
                            <p className="font-mono text-xs text-rose-200">
                              Delete <strong>{c.name}</strong> from your contractors?
                            </p>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                disabled={deletingContractor}
                                onClick={() => handleDeleteContractor(c.contractorId)}
                                className="rounded-md bg-rose-600 px-2.5 py-1 font-mono text-[11px] font-bold text-white hover:bg-rose-700 transition"
                                data-agent-id={`confirm-delete-contractor-btn-${c.contractorId}`}
                                data-testid={`confirm-delete-contractor-btn-${c.contractorId}`}
                              >
                                {deletingContractor ? "Deleting..." : "Confirm Delete"}
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteContractorId(null)}
                                className="rounded-md bg-white/10 px-2.5 py-1 font-mono text-[11px] text-on-surface hover:bg-white/20 transition"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}

                        <div className="space-y-1.5 text-xs text-on-surface-variant font-mono">
                          <div className="flex items-center gap-1.5">
                            <Icon name="mapPin" className="size-3.5 text-primary shrink-0" />
                            <span className="truncate">{c.location}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Icon name="mail" className="size-3.5 text-outline shrink-0" />
                            <a href={`mailto:${c.email}`} className="truncate hover:text-primary transition underline decoration-dotted">
                              {c.email}
                            </a>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Icon name="phone" className="size-3.5 text-outline shrink-0" />
                            <span>{c.phone}</span>
                          </div>
                        </div>

                        {/* Average Rates Box */}
                        {c.averageRates && (
                          <div className="rounded-lg border border-amber-400/25 bg-amber-400/10 p-2 font-mono text-[11px] text-on-surface">
                            <span className="font-bold text-amber-300 block mb-0.5">Average Rates Box:</span>
                            <span className="whitespace-pre-line">{c.averageRates}</span>
                          </div>
                        )}

                        {/* PayID and Payment Details */}
                        {c.payIdPaymentDetails && (
                          <div className="rounded-lg border border-white/10 bg-surface-container-lowest/60 p-2 font-mono text-[11px] text-on-surface-variant">
                            <span className="font-semibold text-outline block mb-0.5">PayID &amp; Payment Details:</span>
                            <span className="whitespace-pre-line">{c.payIdPaymentDetails}</span>
                          </div>
                        )}

                        {c.notes && (
                          <p className="text-[11px] text-on-surface-variant italic">
                            &quot;{c.notes}&quot;
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
