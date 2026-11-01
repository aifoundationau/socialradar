"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { Icon } from "@/components/ui/Icon";
import { alertError, alertInfo, btnDanger, btnPrimary, btnSecondary, card, field, label } from "@/components/ui/styles";
import { formatPrice, formatTokenEstimateHover } from "@/lib/pricing";
import type {
  AdminMessage,
  EquityPartner,
  RedistributiveLedgerSummary,
  StripePurchaseRecord,
} from "@/lib/contracts";

const emptySubscribe = () => () => {};
function useIsClient() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
}

interface ServiceCosts {
  searchStandard: number;
  searchExtendedDays: number;
  searchEliteScore: number;
  aiRemix: number;
}

interface TokenPackItem {
  id: string;
  name: string;
  tokens: number;
  priceCents: number;
  enabled: boolean;
}

interface AdminConfigData {
  isTokenSystemEnabled: boolean;
  isAudEnabled: boolean;
  isUsdEnabled: boolean;
  serviceCosts: ServiceCosts;
  tokenPacks: TokenPackItem[];
  equityPartners: EquityPartner[];
  updatedAt?: string;
}

interface SuperAdminModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type TabKey = "CURRENCY" | "PRICING" | "PACKS" | "LEDGER" | "MESSAGES" | "DEV";

export function SuperAdminModal({ isOpen, onClose }: SuperAdminModalProps) {
  const isClient = useIsClient();
  const [tab, setTab] = useState<TabKey>("CURRENCY");
  const [config, setConfig] = useState<AdminConfigData | null>(null);
  const [ledger, setLedger] = useState<RedistributiveLedgerSummary | null>(null);
  const [recentPurchases, setRecentPurchases] = useState<StripePurchaseRecord[]>([]);
  const [adminMessages, setAdminMessages] = useState<AdminMessage[]>([]);
  const [selectedMessage, setSelectedMessage] = useState<AdminMessage | null>(null);

  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Pack delete confirmation
  const [confirmDeletePackId, setConfirmDeletePackId] = useState<string | null>(null);

  // Equity Partner delete confirmation
  const [confirmDeletePartnerId, setConfirmDeletePartnerId] = useState<string | null>(null);

  // New Pack input state
  const [newPack, setNewPack] = useState<TokenPackItem>({
    id: "",
    name: "",
    tokens: 100,
    priceCents: 1900,
    enabled: true,
  });
  const [showAddPack, setShowAddPack] = useState(false);

  // New Equity Partner input state
  const [showAddPartner, setShowAddPartner] = useState(false);
  const [newPartner, setNewPartner] = useState({
    name: "",
    email: "",
    percentage: 10,
    notes: "",
    status: "active" as const,
  });

  async function reloadConfig() {
    setLoading(true);
    setErrorMsg(null);
    try {
      const data = await apiFetch<{
        config: AdminConfigData;
        ledger?: RedistributiveLedgerSummary;
        recentPurchases?: StripePurchaseRecord[];
        isAdmin: boolean;
      }>("/api/admin/config");
      setConfig(data.config);
      if (data.ledger) setLedger(data.ledger);
      if (data.recentPurchases) setRecentPurchases(data.recentPurchases);
      setIsAdmin(data.isAdmin);

      try {
        const msgData = await apiFetch<{ messages: AdminMessage[] }>("/api/admin/messages");
        if (msgData.messages) setAdminMessages(msgData.messages);
      } catch {
        // Non-admin or messages not accessible
      }
    } catch (err) {
      setErrorMsg(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    }
    if (!isOpen) {
      document.body.style.overflow = "";
      return;
    }

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    let active = true;
    Promise.all([
      apiFetch<{
        config: AdminConfigData;
        ledger?: RedistributiveLedgerSummary;
        recentPurchases?: StripePurchaseRecord[];
        isAdmin: boolean;
      }>("/api/admin/config"),
      apiFetch<{ messages: AdminMessage[] }>("/api/admin/messages").catch(() => ({
        messages: [] as AdminMessage[],
      })),
    ])
      .then(([adminData, msgData]) => {
        if (active) {
          setConfig(adminData.config);
          if (adminData.ledger) setLedger(adminData.ledger);
          if (adminData.recentPurchases) setRecentPurchases(adminData.recentPurchases);
          setIsAdmin(adminData.isAdmin);
          if (msgData?.messages) setAdminMessages(msgData.messages);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (active) {
          setErrorMsg(errorMessage(err));
          setLoading(false);
        }
      });

    return () => {
      active = false;
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  async function saveConfig(patch: Partial<AdminConfigData>) {
    if (!config) return;
    setSaving(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const data = await apiFetch<{
        success: boolean;
        config: AdminConfigData;
        ledger?: RedistributiveLedgerSummary;
      }>("/api/admin/config", {
        method: "PUT",
        body: patch,
      });
      setConfig(data.config);
      if (data.ledger) setLedger(data.ledger);
      setStatusMsg("Configuration saved successfully.");
    } catch (err) {
      setErrorMsg(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleFlushCache() {
    setSaving(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const data = await apiFetch<{ success: boolean; flushedCount: number }>("/api/admin/config", {
        method: "PUT",
        body: { action: "FLUSH_CACHE" },
      });
      setStatusMsg(`Flushed ${data.flushedCount} cached query results.`);
    } catch (err) {
      setErrorMsg(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleGrantAdmin() {
    setSaving(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      await apiFetch("/api/admin/config", { method: "POST" });
      setStatusMsg("Admin custom claim assigned to your session. Please refresh.");
      setIsAdmin(true);
    } catch (err) {
      setErrorMsg(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  // Pack CRUD
  function handleAddPack() {
    if (!config || !newPack.id || !newPack.name) return;
    const updatedPacks = [...config.tokenPacks, newPack];
    saveConfig({ tokenPacks: updatedPacks });
    setShowAddPack(false);
    setNewPack({ id: "", name: "", tokens: 100, priceCents: 1900, enabled: true });
  }

  function handleDeletePack(packId: string) {
    if (!config) return;
    const updatedPacks = config.tokenPacks.filter((p) => p.id !== packId);
    saveConfig({ tokenPacks: updatedPacks });
    setConfirmDeletePackId(null);
  }

  // Equity Partners CRUD
  async function handleAddPartner(e: React.FormEvent) {
    e.preventDefault();
    if (!newPartner.name.trim() || !newPartner.email.trim()) {
      setErrorMsg("Partner name and email are required.");
      return;
    }
    const pct = Number(newPartner.percentage);
    if (isNaN(pct) || pct <= 0 || pct > 100) {
      setErrorMsg("Percentage must be between 0.01 and 100.");
      return;
    }

    setSaving(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const data = await apiFetch<{
        success: boolean;
        equityPartners: EquityPartner[];
        ledger: RedistributiveLedgerSummary;
      }>("/api/admin/config", {
        method: "PUT",
        body: {
          action: "ADD_EQUITY_PARTNER",
          partner: {
            name: newPartner.name.trim(),
            email: newPartner.email.trim().toLowerCase(),
            percentage: pct,
            notes: newPartner.notes.trim(),
            status: newPartner.status,
          },
        },
      });

      if (config) {
        setConfig({ ...config, equityPartners: data.equityPartners });
      }
      setLedger(data.ledger);
      setShowAddPartner(false);
      setNewPartner({ name: "", email: "", percentage: 10, notes: "", status: "active" });
      setStatusMsg(`Added equity partner ${newPartner.name}.`);
    } catch (err) {
      setErrorMsg(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDeletePartner(partnerId: string) {
    setSaving(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const data = await apiFetch<{
        success: boolean;
        equityPartners: EquityPartner[];
        ledger: RedistributiveLedgerSummary;
      }>("/api/admin/config", {
        method: "PUT",
        body: {
          action: "DELETE_EQUITY_PARTNER",
          partnerId,
        },
      });

      if (config) {
        setConfig({ ...config, equityPartners: data.equityPartners });
      }
      setLedger(data.ledger);
      setConfirmDeletePartnerId(null);
      setStatusMsg("Equity partner removed.");
    } catch (err) {
      setErrorMsg(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleTogglePartnerStatus(partner: EquityPartner) {
    setSaving(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const newStatus = partner.status === "active" ? "inactive" : "active";
      const data = await apiFetch<{
        success: boolean;
        equityPartners: EquityPartner[];
        ledger: RedistributiveLedgerSummary;
      }>("/api/admin/config", {
        method: "PUT",
        body: {
          action: "UPDATE_EQUITY_PARTNER",
          partnerId: partner.partnerId,
          patch: { status: newStatus },
        },
      });

      if (config) {
        setConfig({ ...config, equityPartners: data.equityPartners });
      }
      setLedger(data.ledger);
      setStatusMsg(`Partner ${partner.name} status updated to ${newStatus}.`);
    } catch (err) {
      setErrorMsg(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleSimulatePurchase() {
    setSaving(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const data = await apiFetch<{
        success: boolean;
        ledger: RedistributiveLedgerSummary;
        recentPurchases: StripePurchaseRecord[];
      }>("/api/admin/config", {
        method: "PUT",
        body: {
          action: "SIMULATE_PURCHASE",
          tokens: 500,
          amountCents: 7900,
          packId: "PACK_500",
        },
      });
      setLedger(data.ledger);
      setRecentPurchases(data.recentPurchases);
      setStatusMsg("Simulated purchase (+500 tokens, $79.00 AUD) recorded to redistributive ledger.");
    } catch (err) {
      setErrorMsg(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateMessageStatus(messageId: string, status: "read" | "archived" | "unread") {
    try {
      const data = await apiFetch<{ success: boolean; messages: AdminMessage[] }>(
        "/api/admin/messages",
        {
          method: "PATCH",
          body: { messageId, status },
        }
      );
      setAdminMessages(data.messages);
      if (selectedMessage && selectedMessage.messageId === messageId) {
        setSelectedMessage({ ...selectedMessage, status });
      }
    } catch (err) {
      setErrorMsg(errorMessage(err));
    }
  }

  if (!isOpen || !isClient) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="superadmin-title"
      data-testid="superadmin-modal"
      data-agent-id="superadmin-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/80 backdrop-blur-md transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Main Container */}
      <div className="relative z-10 flex w-full max-w-4xl max-h-[calc(100dvh-1.5rem)] sm:max-h-[92vh] flex-col rounded-2xl border border-white/[0.14] bg-surface-container-high shadow-2xl overflow-hidden my-auto">
        {/* Header */}
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-white/[0.08] px-6">
          <div className="flex items-center gap-2.5">
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary/20 text-primary">
              <Icon name="sparkles" className="size-4" />
            </span>
            <div>
              <h2 id="superadmin-title" className="text-title-sm font-bold text-on-surface">
                Super Admin Panel
              </h2>
              <p className="text-[11px] text-on-surface-variant font-mono">
                AdRadar System Configuration, Redistributive Ledger & 7-Year Archive
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={reloadConfig}
              title="Refresh settings"
              aria-label="Refresh settings"
              data-testid="refresh-superadmin-button"
              className="flex size-9 items-center justify-center rounded-lg text-on-surface-variant transition hover:bg-white/[0.08] hover:text-on-surface"
            >
              <Icon name="refresh" className={`size-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close admin panel"
              data-testid="close-superadmin-button"
              data-agent-id="close-superadmin-btn"
              className="flex size-9 items-center justify-center rounded-lg text-on-surface-variant transition hover:bg-white/[0.08] hover:text-on-surface"
            >
              <Icon name="x" className="size-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-white/[0.08] bg-surface-container px-6 no-scrollbar overflow-x-auto">
          {[
            { id: "CURRENCY", label: "Currency Controls" },
            { id: "PRICING", label: "Service Pricing" },
            { id: "PACKS", label: "Token Packs (CRUD)" },
            { id: "LEDGER", label: "Redistributive Ledger" },
            { id: "MESSAGES", label: `User Messages (${adminMessages.filter((m) => m.status === "unread").length})` },
            { id: "DEV", label: "Developer Diagnostics" },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id as TabKey)}
              className={`flex h-12 items-center gap-2 border-b-2 px-4 font-mono text-[12px] font-semibold whitespace-nowrap transition ${
                tab === t.id
                  ? "border-primary text-primary"
                  : "border-transparent text-on-surface-variant hover:text-on-surface"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {errorMsg && <p className={alertError}>{errorMsg}</p>}
          {statusMsg && <p className={alertInfo}>{statusMsg}</p>}

          {loading ? (
            <div className="flex h-48 items-center justify-center">
              <span className="flex items-center gap-2 text-on-surface-variant font-mono text-sm">
                <Icon name="refresh" className="size-4 animate-spin" />
                Loading system configuration…
              </span>
            </div>
          ) : !config ? (
            <p className={alertError}>Failed to load system configuration.</p>
          ) : (
            <>
              {/* TAB 1: CURRENCY CONTROLS */}
              {tab === "CURRENCY" && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-title-sm font-semibold text-on-surface">Currency & Ledger Toggles</h3>
                    <p className="mt-1 text-compact text-on-surface-variant">
                      Independently toggle token deductions, Australian Dollar display (strict AU geolocation), and US Dollar pricing.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div className={`${card} p-4 flex flex-col justify-between`}>
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-body font-medium text-on-surface">Token Economy</span>
                          <span className={`inline-flex size-2 rounded-full ${config.isTokenSystemEnabled ? "bg-primary" : "bg-outline"}`} />
                        </div>
                        <p className="mt-1 text-[12px] text-on-surface-variant">
                          Enforces atomic token deductions on searches and AI remixes.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => saveConfig({ isTokenSystemEnabled: !config.isTokenSystemEnabled })}
                        disabled={saving}
                        className={`mt-4 ${config.isTokenSystemEnabled ? btnPrimary : btnSecondary}`}
                      >
                        {config.isTokenSystemEnabled ? "Enabled" : "Disabled"}
                      </button>
                    </div>

                    <div className={`${card} p-4 flex flex-col justify-between`}>
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-body font-medium text-on-surface">AUD Currency</span>
                          <span className={`inline-flex size-2 rounded-full ${config.isAudEnabled ? "bg-primary" : "bg-outline"}`} />
                        </div>
                        <p className="mt-1 text-[12px] text-on-surface-variant">
                          Australian Dollar (A$) pricing displayed strictly to users in AU.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => saveConfig({ isAudEnabled: !config.isAudEnabled })}
                        disabled={saving}
                        className={`mt-4 ${config.isAudEnabled ? btnPrimary : btnSecondary}`}
                      >
                        {config.isAudEnabled ? "Enabled" : "Disabled"}
                      </button>
                    </div>

                    <div className={`${card} p-4 flex flex-col justify-between`}>
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-body font-medium text-on-surface">USD Currency</span>
                          <span className={`inline-flex size-2 rounded-full ${config.isUsdEnabled ? "bg-primary" : "bg-outline"}`} />
                        </div>
                        <p className="mt-1 text-[12px] text-on-surface-variant">
                          US Dollar ($USD) global default pricing and fallback currency.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => saveConfig({ isUsdEnabled: !config.isUsdEnabled })}
                        disabled={saving}
                        className={`mt-4 ${config.isUsdEnabled ? btnPrimary : btnSecondary}`}
                      >
                        {config.isUsdEnabled ? "Enabled" : "Disabled"}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: SERVICE PRICING */}
              {tab === "PRICING" && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-title-sm font-semibold text-on-surface">Service Token Surcharges</h3>
                    <p className="mt-1 text-compact text-on-surface-variant">
                      Configure strict integer token costs per service operation. AUD/USD estimates display strictly on hover.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {[
                      { key: "searchStandard" as const, label: "Base Search", desc: "Base platform query across Meta, TikTok, or Google" },
                      { key: "searchExtendedDays" as const, label: "Extended (60+d) Longevity", desc: "Filter for high-performing battle-tested 60+ day ads" },
                      { key: "searchEliteScore" as const, label: "Top Winners (90%+)", desc: "Filter for elite tier ads with composite resonance >= 90%" },
                      { key: "aiRemix" as const, label: "AI Creative Remix", desc: "Gemini multimodal remix generation with brand strategy" },
                    ].map(({ key, label: serviceLabel, desc }) => (
                      <div key={key} className={`${card} p-4 space-y-3`}>
                        <div className="flex items-center justify-between">
                          <span className="text-body font-medium text-on-surface">{serviceLabel}</span>
                          <span
                            title={formatTokenEstimateHover(config.serviceCosts[key])}
                            className="cursor-help rounded bg-surface-container-highest px-2 py-0.5 font-mono text-[12px] text-primary"
                          >
                            {config.serviceCosts[key]} tokens
                          </span>
                        </div>
                        <p className="text-[12px] text-on-surface-variant">{desc}</p>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min={0}
                            step={1}
                            value={config.serviceCosts[key]}
                            onChange={(e) => {
                              const val = Math.max(0, Math.round(Number(e.target.value) || 0));
                              saveConfig({
                                serviceCosts: {
                                  ...config.serviceCosts,
                                  [key]: val,
                                },
                              });
                            }}
                            className={field}
                          />
                          <span className="text-compact text-on-surface-variant whitespace-nowrap">tokens</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TAB 3: TOKEN PACKS CRUD */}
              {tab === "PACKS" && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-title-sm font-semibold text-on-surface">Token Pack Catalog</h3>
                      <p className="mt-1 text-compact text-on-surface-variant">
                        Manage item catalog and pricing for Stripe checkout.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowAddPack(!showAddPack)}
                      className={btnPrimary}
                      data-testid="toggle-add-pack-button"
                    >
                      <Icon name="plus" className="size-4" />
                      Add Token Pack
                    </button>
                  </div>

                  {showAddPack && (
                    <div className={`${card} p-4 border border-primary/30 space-y-4`}>
                      <h4 className="text-compact font-semibold text-on-surface">Create New Token Pack</h4>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                        <div>
                          <label className={label}>ID</label>
                          <input
                            type="text"
                            placeholder="PACK_1000"
                            value={newPack.id}
                            onChange={(e) => setNewPack({ ...newPack, id: e.target.value.toUpperCase() })}
                            className={field}
                          />
                        </div>
                        <div>
                          <label className={label}>Name</label>
                          <input
                            type="text"
                            placeholder="Power Pack"
                            value={newPack.name}
                            onChange={(e) => setNewPack({ ...newPack, name: e.target.value })}
                            className={field}
                          />
                        </div>
                        <div>
                          <label className={label}>Tokens (Integer)</label>
                          <input
                            type="number"
                            min={1}
                            step={1}
                            value={newPack.tokens}
                            onChange={(e) => setNewPack({ ...newPack, tokens: Math.round(Number(e.target.value)) })}
                            className={field}
                          />
                        </div>
                        <div>
                          <label className={label}>Price (Cents)</label>
                          <input
                            type="number"
                            min={100}
                            step={100}
                            placeholder="1900 = $19.00"
                            value={newPack.priceCents}
                            onChange={(e) => setNewPack({ ...newPack, priceCents: Math.round(Number(e.target.value)) })}
                            className={field}
                          />
                        </div>
                      </div>
                      <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => setShowAddPack(false)} className={btnSecondary}>
                          Cancel
                        </button>
                        <button type="button" onClick={handleAddPack} className={btnPrimary}>
                          Save Pack
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="space-y-3">
                    {config.tokenPacks.map((pack) => (
                      <div
                        key={pack.id}
                        className={`${card} p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="flex size-9 items-center justify-center rounded-lg bg-surface-container-highest text-primary">
                            <Icon name="zap" className="size-4" />
                          </span>
                          <div>
                            <p className="text-body font-semibold text-on-surface">{pack.name}</p>
                            <p className="text-[12px] text-on-surface-variant font-mono">
                              {pack.id} • {pack.tokens.toLocaleString("en-AU")} tokens • {formatPrice(pack.priceCents)}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 self-end sm:self-center">
                          {confirmDeletePackId === pack.id ? (
                            <div className="flex items-center gap-1.5 animate-fadeIn">
                              <button
                                type="button"
                                onClick={() => handleDeletePack(pack.id)}
                                className={btnDanger}
                                data-testid={`confirm-delete-pack-${pack.id}`}
                              >
                                Confirm Delete
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeletePackId(null)}
                                className={btnSecondary}
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeletePackId(pack.id)}
                              className="flex size-8 items-center justify-center rounded-lg text-error hover:bg-error/10 transition"
                              data-testid={`delete-pack-${pack.id}`}
                              title="Delete pack"
                            >
                              <Icon name="trash" className="size-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TAB 4: REDISTRIBUTIVE LEDGER */}
              {tab === "LEDGER" && (
                <div className="space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h3 className="text-title-sm font-semibold text-on-surface">Redistributive Equity Ledger</h3>
                      <p className="mt-1 text-compact text-on-surface-variant">
                        Calculates equity partner ownership from total Stripe token revenue and purchased tokens.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleSimulatePurchase}
                        disabled={saving}
                        className={btnSecondary}
                        title="Simulate a test token purchase (+500 ⚡, $79.00 AUD)"
                        data-testid="simulate-purchase-button"
                      >
                        <Icon name="plus" className="size-3.5" />
                        Simulate Purchase (Test)
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowAddPartner(!showAddPartner)}
                        className={btnPrimary}
                        data-testid="toggle-add-partner-button"
                      >
                        <Icon name="plus" className="size-4" />
                        Add Equity Partner
                      </button>
                    </div>
                  </div>

                  {/* Top Stats Cards */}
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className={`${card} p-4`}>
                      <span className="text-[11px] font-mono text-on-surface-variant uppercase">Gross Stripe Revenue</span>
                      <p className="mt-1 text-title-md font-bold text-on-surface">
                        {formatPrice(ledger?.totalGrossCents ?? 0)}
                      </p>
                      <span className="text-[11px] text-on-surface-variant">
                        {ledger?.totalPurchasesCount ?? 0} Stripe transaction(s)
                      </span>
                    </div>

                    <div className={`${card} p-4`}>
                      <span className="text-[11px] font-mono text-on-surface-variant uppercase">Total Tokens Sold</span>
                      <p className="mt-1 text-title-md font-bold text-primary flex items-center gap-1.5">
                        <Icon name="zap" className="size-5" />
                        {(ledger?.totalTokens ?? 0).toLocaleString("en-AU")}
                      </p>
                      <span className="text-[11px] text-on-surface-variant">Strict integers only</span>
                    </div>

                    <div className={`${card} p-4`}>
                      <span className="text-[11px] font-mono text-on-surface-variant uppercase">Allocated Equity</span>
                      <p className="mt-1 text-title-md font-bold text-secondary">
                        {(ledger?.allocatedPercentage ?? 0).toFixed(2)}%
                      </p>
                      <span className="text-[11px] text-on-surface-variant">
                        {config.equityPartners?.filter((p) => p.status === "active").length ?? 0} active partner(s)
                      </span>
                    </div>

                    <div className={`${card} p-4`}>
                      <span className="text-[11px] font-mono text-on-surface-variant uppercase">Treasury Retained</span>
                      <p className="mt-1 text-title-md font-bold text-on-surface">
                        {(ledger?.treasuryPercentage ?? 0).toFixed(2)}%
                      </p>
                      <span className="text-[11px] text-on-surface-variant">
                        {formatPrice(ledger?.treasuryCents ?? 0)} • {(ledger?.treasuryTokens ?? 0).toLocaleString("en-AU")} ⚡
                      </span>
                    </div>
                  </div>

                  {/* Add Partner Form */}
                  {showAddPartner && (
                    <form onSubmit={handleAddPartner} className={`${card} p-5 border border-primary/30 space-y-4`}>
                      <h4 className="text-compact font-semibold text-on-surface">Add Equity Partner</h4>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <div>
                          <label className={label}>Partner Name</label>
                          <input
                            type="text"
                            required
                            placeholder="e.g. Jane Doe"
                            value={newPartner.name}
                            onChange={(e) => setNewPartner({ ...newPartner, name: e.target.value })}
                            className={field}
                            data-testid="partner-name-input"
                          />
                        </div>
                        <div>
                          <label className={label}>Partner Email</label>
                          <input
                            type="email"
                            required
                            placeholder="partner@example.com"
                            value={newPartner.email}
                            onChange={(e) => setNewPartner({ ...newPartner, email: e.target.value })}
                            className={field}
                            data-testid="partner-email-input"
                          />
                        </div>
                        <div>
                          <label className={label}>Equity Percentage (0.01 - 100%)</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            max="100"
                            required
                            placeholder="20"
                            value={newPartner.percentage}
                            onChange={(e) => setNewPartner({ ...newPartner, percentage: parseFloat(e.target.value) || 0 })}
                            className={field}
                            data-testid="partner-percentage-input"
                          />
                        </div>
                      </div>
                      <div>
                        <label className={label}>Notes / Account Reference</label>
                        <input
                          type="text"
                          placeholder="e.g. Co-founder allocation, agreement dated Jan 2026"
                          value={newPartner.notes}
                          onChange={(e) => setNewPartner({ ...newPartner, notes: e.target.value })}
                          className={field}
                          data-testid="partner-notes-input"
                        />
                      </div>
                      <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => setShowAddPartner(false)} className={btnSecondary}>
                          Cancel
                        </button>
                        <button type="submit" disabled={saving} className={btnPrimary} data-testid="save-partner-button">
                          Save Partner
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Equity Partners Breakdown Table */}
                  <div className="space-y-3">
                    <h4 className="text-compact font-semibold text-on-surface">Partner Distribution Calculations</h4>
                    {config.equityPartners?.length === 0 ? (
                      <div className={`${card} p-8 text-center text-on-surface-variant`}>
                        <p>No equity partners registered yet.</p>
                        <p className="text-[12px] mt-1">Click &ldquo;Add Equity Partner&rdquo; to configure redistributive shares.</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto rounded-xl border border-white/[0.08] bg-surface-container-low">
                        <table className="w-full text-left text-[13px]">
                          <thead className="border-b border-white/[0.08] bg-surface-container-high/40 font-mono text-mono-label text-on-surface-variant">
                            <tr>
                              <th className="px-4 py-3">Partner</th>
                              <th className="px-4 py-3">Equity %</th>
                              <th className="px-4 py-3">Owned Tokens</th>
                              <th className="px-4 py-3">Owned Gross (AUD)</th>
                              <th className="px-4 py-3">Status</th>
                              <th className="px-4 py-3 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/[0.04]">
                            {ledger?.distributions.map((dist) => {
                              const partner = config.equityPartners.find((p) => p.partnerId === dist.partnerId);
                              if (!partner) return null;
                              return (
                                <tr key={dist.partnerId} className="hover:bg-white/[0.02] transition">
                                  <td className="px-4 py-3">
                                    <div className="font-semibold text-on-surface">{dist.name}</div>
                                    <div className="text-[11px] text-on-surface-variant font-mono">{dist.email}</div>
                                  </td>
                                  <td className="px-4 py-3 font-mono font-bold text-secondary">
                                    {dist.percentage}%
                                  </td>
                                  <td className="px-4 py-3 font-mono text-primary font-semibold">
                                    ⚡ {dist.ownedTokens.toLocaleString("en-AU")}
                                  </td>
                                  <td className="px-4 py-3 font-mono font-semibold text-on-surface">
                                    {formatPrice(dist.ownedCents)}
                                  </td>
                                  <td className="px-4 py-3">
                                    <button
                                      type="button"
                                      onClick={() => handleTogglePartnerStatus(partner)}
                                      className={`rounded px-2 py-0.5 text-[11px] font-mono font-semibold transition ${
                                        dist.status === "active"
                                          ? "bg-primary/20 text-primary hover:bg-primary/30"
                                          : "bg-surface-container-highest text-on-surface-variant hover:bg-white/[0.08]"
                                      }`}
                                    >
                                      {dist.status.toUpperCase()}
                                    </button>
                                  </td>
                                  <td className="px-4 py-3 text-right">
                                    {confirmDeletePartnerId === dist.partnerId ? (
                                      <div className="flex items-center justify-end gap-1.5 animate-fadeIn">
                                        <button
                                          type="button"
                                          onClick={() => handleDeletePartner(dist.partnerId)}
                                          className={btnDanger}
                                          data-testid={`confirm-delete-partner-${dist.partnerId}`}
                                        >
                                          Confirm Delete
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setConfirmDeletePartnerId(null)}
                                          className={btnSecondary}
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => setConfirmDeletePartnerId(dist.partnerId)}
                                        className="text-error hover:text-error/80 font-mono text-[11px] underline"
                                        data-testid={`delete-partner-${dist.partnerId}`}
                                      >
                                        Delete
                                      </button>
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

                  {/* Recorded Stripe Purchases Table */}
                  <div className="space-y-3 pt-4 border-t border-white/[0.08]">
                    <h4 className="text-compact font-semibold text-on-surface">Recent Stripe Token Purchases</h4>
                    {recentPurchases.length === 0 ? (
                      <p className="text-[12px] text-on-surface-variant italic">
                        No Stripe purchases recorded yet. Make a purchase via Wallet or click &ldquo;Simulate Purchase (Test)&rdquo; above.
                      </p>
                    ) : (
                      <div className="overflow-x-auto rounded-xl border border-white/[0.08] bg-surface-container-low max-h-60 overflow-y-auto">
                        <table className="w-full text-left text-[12px]">
                          <thead className="border-b border-white/[0.08] bg-surface-container-high/40 font-mono text-mono-label text-on-surface-variant sticky top-0">
                            <tr>
                              <th className="px-3 py-2">Date</th>
                              <th className="px-3 py-2">Buyer</th>
                              <th className="px-3 py-2">Pack</th>
                              <th className="px-3 py-2">Tokens</th>
                              <th className="px-3 py-2">Gross (AUD)</th>
                              <th className="px-3 py-2">Session ID</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/[0.04] font-mono">
                            {recentPurchases.map((p) => (
                              <tr key={p.purchaseId} className="hover:bg-white/[0.02]">
                                <td className="px-3 py-2 text-on-surface-variant">
                                  {new Date(p.createdAt).toLocaleDateString("en-AU")}
                                </td>
                                <td className="px-3 py-2 text-on-surface truncate max-w-[12rem]">
                                  {p.email || p.uid}
                                </td>
                                <td className="px-3 py-2 text-on-surface-variant">{p.packId}</td>
                                <td className="px-3 py-2 text-primary font-semibold">
                                  ⚡ {p.tokens.toLocaleString("en-AU")}
                                </td>
                                <td className="px-3 py-2 text-on-surface">{formatPrice(p.amountCents)}</td>
                                <td className="px-3 py-2 text-on-surface-variant text-[10px] truncate max-w-[8rem]" title={p.purchaseId}>
                                  {p.purchaseId}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 5: USER MESSAGES (7-YEAR COMPLIANCE ARCHIVE) */}
              {tab === "MESSAGES" && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-title-sm font-semibold text-on-surface">User Messages & 7-Year Statutory Backup</h3>
                    <p className="mt-1 text-compact text-on-surface-variant">
                      Direct plain-text messages submitted by users. Immutable 7-year audit retention. Binary attachments strictly prohibited.
                    </p>
                  </div>

                  {/* 7-Year Statutory Compliance Badge */}
                  <div className="rounded-xl border border-secondary/30 bg-secondary/10 p-3.5 flex items-start gap-3">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-secondary/20 text-secondary">
                      <Icon name="shield" className="size-4" />
                    </span>
                    <div className="text-[12px] text-on-surface-variant leading-relaxed">
                      <p className="font-semibold text-secondary">Statutory Record Retention Guarantee (7 Years)</p>
                      <p className="mt-0.5">
                        In adherence with the Australian Corporations Act and financial record regulations, all user communications are cryptographically indexed with an immutable <code>retentionUntil</code> timestamp set 7 years from arrival. Messages cannot be destroyed before statutory expiry.
                      </p>
                    </div>
                  </div>

                  {adminMessages.length === 0 ? (
                    <div className={`${card} p-8 text-center text-on-surface-variant`}>
                      <p>No user messages received yet.</p>
                      <p className="text-[12px] mt-1">Users can message superadmin via the &ldquo;Message Super Admin&rdquo; button in the account menu.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                      {/* Message List */}
                      <div className="space-y-2.5 max-h-[28rem] overflow-y-auto pr-1">
                        {adminMessages.map((msg) => {
                          const isSelected = selectedMessage?.messageId === msg.messageId;
                          return (
                            <div
                              key={msg.messageId}
                              onClick={() => {
                                setSelectedMessage(msg);
                                if (msg.status === "unread") {
                                  handleUpdateMessageStatus(msg.messageId, "read");
                                }
                              }}
                              className={`cursor-pointer rounded-xl border p-3.5 transition ${
                                isSelected
                                  ? "border-primary bg-primary/10"
                                  : msg.status === "unread"
                                  ? "border-primary/40 bg-surface-container-high hover:border-primary/60"
                                  : "border-white/[0.08] bg-surface-container-low hover:border-white/20"
                              }`}
                            >
                              <div className="flex items-center justify-between text-[11px] font-mono text-on-surface-variant">
                                <span className="font-semibold text-on-surface truncate max-w-[12rem]">{msg.senderEmail}</span>
                                <span>{new Date(msg.createdAt).toLocaleDateString("en-AU")}</span>
                              </div>
                              <p className="mt-1 text-body font-semibold text-on-surface truncate">{msg.subject}</p>
                              <p className="mt-1 text-[12px] text-on-surface-variant line-clamp-2">{msg.body}</p>
                              <div className="mt-2 flex items-center justify-between">
                                <span
                                  className={`rounded px-1.5 py-0.5 text-[10px] font-mono font-semibold uppercase ${
                                    msg.status === "unread"
                                      ? "bg-amber-500/20 text-amber-300"
                                      : msg.status === "read"
                                      ? "bg-primary/20 text-primary"
                                      : "bg-surface-container-highest text-on-surface-variant"
                                  }`}
                                >
                                  {msg.status}
                                </span>
                                <span className="text-[10px] text-on-surface-variant font-mono">
                                  Retained until: {new Date(msg.retentionUntil).toLocaleDateString("en-AU")}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Message Viewer Pane */}
                      <div className={`${card} p-5 flex flex-col justify-between min-h-[22rem]`}>
                        {selectedMessage ? (
                          <div className="space-y-4">
                            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
                              <div>
                                <h4 className="text-title-sm font-bold text-on-surface">{selectedMessage.subject}</h4>
                                <p className="text-[12px] font-mono text-on-surface-variant mt-0.5">
                                  From: {selectedMessage.senderEmail} • UID: {selectedMessage.uid}
                                </p>
                              </div>
                              <span
                                className={`rounded px-2 py-0.5 text-[11px] font-mono font-semibold uppercase ${
                                  selectedMessage.status === "unread"
                                    ? "bg-amber-500/20 text-amber-300"
                                    : selectedMessage.status === "read"
                                    ? "bg-primary/20 text-primary"
                                    : "bg-surface-container-highest text-on-surface-variant"
                                }`}
                              >
                                {selectedMessage.status}
                              </span>
                            </div>

                            <div className="space-y-2">
                              <span className="text-[11px] font-mono uppercase text-on-surface-variant">Message Body (Plain Text)</span>
                              <div className="rounded-xl border border-white/[0.08] bg-surface-container-lowest p-4 text-[13px] text-on-surface whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto">
                                {selectedMessage.body}
                              </div>
                            </div>

                            <div className="text-[11px] font-mono text-on-surface-variant space-y-0.5">
                              <p>Created: {new Date(selectedMessage.createdAt).toLocaleString("en-AU")}</p>
                              <p>Statutory Retention Until: {new Date(selectedMessage.retentionUntil).toLocaleString("en-AU")}</p>
                            </div>

                            <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/[0.08]">
                              {selectedMessage.status !== "archived" ? (
                                <button
                                  type="button"
                                  onClick={() => handleUpdateMessageStatus(selectedMessage.messageId, "archived")}
                                  className={btnSecondary}
                                >
                                  Archive Message
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleUpdateMessageStatus(selectedMessage.messageId, "read")}
                                  className={btnSecondary}
                                >
                                  Move to Inbox
                                </button>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="flex h-full items-center justify-center text-center text-on-surface-variant p-6">
                            <p>Select a message on the left to inspect its plain text content and compliance retention schedule.</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 6: DEVELOPER DIAGNOSTICS */}
              {tab === "DEV" && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-title-sm font-semibold text-on-surface">Developer Diagnostics & Next.js Controls</h3>
                    <p className="mt-1 text-compact text-on-surface-variant">
                      Developer tooling relocated from public preview. Grant admin custom claims, inspect system runtime, and flush query cache.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className={`${card} p-4 space-y-3`}>
                      <div className="flex items-center justify-between">
                        <span className="text-body font-medium text-on-surface">Admin Custom Claim</span>
                        <span className={`rounded px-2 py-0.5 font-mono text-[11px] font-semibold ${isAdmin ? "bg-primary/20 text-primary" : "bg-error/20 text-error"}`}>
                          {isAdmin ? "ROLE: ADMIN" : "ROLE: USER"}
                        </span>
                      </div>
                      <p className="text-[12px] text-on-surface-variant">
                        Grants Firebase Admin role claims to your active session for elevated API endpoints.
                      </p>
                      <button
                        type="button"
                        onClick={handleGrantAdmin}
                        disabled={saving || isAdmin}
                        className={btnPrimary}
                      >
                        {isAdmin ? "Claim Active" : "Grant Admin Claim"}
                      </button>
                    </div>

                    <div className={`${card} p-4 space-y-3`}>
                      <div className="flex items-center justify-between">
                        <span className="text-body font-medium text-on-surface">Radar Query Cache</span>
                        <span className="rounded bg-surface-container-highest px-2 py-0.5 font-mono text-[11px] text-on-surface-variant">
                          TTL 24h
                        </span>
                      </div>
                      <p className="text-[12px] text-on-surface-variant">
                        Flushes all cached normalized ad search responses stored in Firestore <code>radar_cache</code>.
                      </p>
                      <button
                        type="button"
                        onClick={handleFlushCache}
                        disabled={saving}
                        className={btnSecondary}
                      >
                        Flush Radar Cache
                      </button>
                    </div>
                  </div>

                  <div className={`${card} p-4 space-y-2`}>
                    <span className="font-mono text-mono-label text-on-surface-variant">Environment Diagnostics</span>
                    <div className="grid grid-cols-2 gap-2 text-[12px] font-mono text-on-surface sm:grid-cols-4">
                      <div>Node Env: <span className="text-primary">{process.env.NODE_ENV}</span></div>
                      <div>Indicator: <span className="text-primary">Dev-Hidden</span></div>
                      <div>Updated: <span className="text-primary">{config.updatedAt ? new Date(config.updatedAt).toLocaleTimeString("en-AU") : "–"}</span></div>
                      <div>Ledger: <span className="text-primary">Active</span></div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
