"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { Icon, type IconName } from "@/components/ui/Icon";
import { alertError, alertInfo, btnDanger, btnPrimary, btnSecondary, card, field, label } from "@/components/ui/styles";
import { audToUsdCents, formatAud, formatPrice, formatTokenEstimateHover, formatUsd, usdToAudCents } from "@/lib/pricing";
import type {
  AdminMessage,
  EquityPartner,
  FaqItem,
  RbacMatrix,
  RbacPermission,
  RbacRole,
  RedistributiveLedgerSummary,
  StripePurchaseRecord,
} from "@/lib/contracts";
import { LINK_URL_PATTERN, RBAC_PERMISSIONS_LIST, RBAC_ROLES_LIST } from "@/lib/contracts";

const emptySubscribe = () => () => {};
function useIsClient() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
}

interface RbacUserItem {
  uid: string;
  email: string;
  displayName?: string;
  photoUrl?: string;
  role: RbacRole;
  tier: string;
  createdAt: string;
  isPermanentSuperAdmin: boolean;
}

const PERMISSION_METADATA: Record<RbacPermission, { label: string; desc: string }> = {
  view_analytics: { label: "View Analytics", desc: "Access global usage and search metrics" },
  manage_config: { label: "System Config", desc: "Adjust pricing, token packs, and currencies" },
  manage_ledger: { label: "Redistributive Ledger", desc: "Manage equity partners and token allocations" },
  flush_cache: { label: "Flush Cache", desc: "Flush radar search cache and index keys" },
  manage_messages: { label: "Manage Messages", desc: "Read and manage 7-year user compliance messages" },
  manage_rbac: { label: "Manage RBAC", desc: "Configure role permissions matrix and assign roles" },
  manage_users: { label: "Manage Users", desc: "Inspect registered accounts and adjust token balances" },
  search_radar: { label: "Search Ad Radar", desc: "Perform Meta ad library intelligence searches" },
  ai_remix: { label: "AI Remix Studio", desc: "Generate generative ad variations using Gemini" },
  manage_brands: { label: "Manage Brands", desc: "Create, edit, and select brand profiles" },
};

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
  audCentsPerToken?: number;
  usdCentsPerToken?: number;
  serviceCosts: ServiceCosts;
  tokenPacks: TokenPackItem[];
  equityPartners: EquityPartner[];
  updatedAt?: string;
}

interface SuperAdminModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type TabKey = "CURRENCY" | "PRICING" | "PACKS" | "LEDGER" | "MESSAGES" | "RBAC" | "FAQS" | "DEV";

export function SuperAdminModal({ isOpen, onClose }: SuperAdminModalProps) {
  const isClient = useIsClient();
  const [tab, setTab] = useState<TabKey>("CURRENCY");
  const [config, setConfig] = useState<AdminConfigData | null>(null);
  const [ledger, setLedger] = useState<RedistributiveLedgerSummary | null>(null);
  const [recentPurchases, setRecentPurchases] = useState<StripePurchaseRecord[]>([]);
  const [adminMessages, setAdminMessages] = useState<AdminMessage[]>([]);
  const [selectedMessage, setSelectedMessage] = useState<AdminMessage | null>(null);
  // Superadmin Messaging Anyone state
  const [showComposeMessage, setShowComposeMessage] = useState(false);
  const [composeRecipientEmail, setComposeRecipientEmail] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [composeSending, setComposeSending] = useState(false);

  const composeHasLinks = LINK_URL_PATTERN.test(composeSubject) || LINK_URL_PATTERN.test(composeBody);

  // RBAC Matrix & Role Assignment state
  const [rbacMatrix, setRbacMatrix] = useState<RbacMatrix | null>(null);
  const [rbacUsers, setRbacUsers] = useState<RbacUserItem[]>([]);
  const [rbacLoading, setRbacLoading] = useState(false);
  const [rbacSaving, setRbacSaving] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [quickAssignEmail, setQuickAssignEmail] = useState("");
  const [quickAssignRole, setQuickAssignRole] = useState<Exclude<RbacRole, "superadmin">>("supporter");

  // FAQ Management state
  const [faqs, setFaqs] = useState<FaqItem[]>([]);
  const [faqsLoading, setFaqsLoading] = useState(false);
  const [faqsSaving, setFaqsSaving] = useState(false);
  const [showAddFaq, setShowAddFaq] = useState(false);
  const [confirmDeleteFaqId, setConfirmDeleteFaqId] = useState<string | null>(null);
  const [newFaq, setNewFaq] = useState({
    question: "",
    answer: "",
    category: "General",
    order: 1,
    enabled: true,
  });
  const [editingFaqId, setEditingFaqId] = useState<string | null>(null);
  const [editFaqData, setEditFaqData] = useState<Partial<FaqItem>>({});

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

  async function reloadRbac() {
    setRbacLoading(true);
    try {
      const data = await apiFetch<{
        matrix: RbacMatrix;
        users: RbacUserItem[];
        roles: RbacRole[];
        permissions: RbacPermission[];
      }>("/api/admin/rbac", { method: "GET" });
      if (data.matrix) setRbacMatrix(data.matrix);
      if (data.users) setRbacUsers(data.users);
    } catch (err) {
      console.warn("[rbac] could not load rbac data", err);
    } finally {
      setRbacLoading(false);
    }
  }

  function handleTogglePermission(role: RbacRole, perm: RbacPermission) {
    if (role === "superadmin" || !rbacMatrix) return;
    const currentList = rbacMatrix[role] || [];
    const exists = currentList.includes(perm);
    const updated = exists ? currentList.filter((p) => p !== perm) : [...currentList, perm];
    setRbacMatrix({
      ...rbacMatrix,
      [role]: updated,
    });
  }

  async function handleSaveRolePermissions(role: Exclude<RbacRole, "superadmin">) {
    if (!rbacMatrix) return;
    setRbacSaving(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const data = await apiFetch<{ success: boolean; matrix: RbacMatrix }>("/api/admin/rbac", {
        method: "PUT",
        body: {
          action: "UPDATE_ROLE_PERMISSIONS",
          role,
          permissions: rbacMatrix[role] || [],
        },
      });
      if (data.matrix) setRbacMatrix(data.matrix);
      setStatusMsg(`Permissions for role "${role.toUpperCase()}" successfully saved.`);
    } catch (err) {
      setErrorMsg(errorMessage(err));
    } finally {
      setRbacSaving(false);
    }
  }

  async function handleAssignUserRole(email: string, targetRole: Exclude<RbacRole, "superadmin">) {
    setRbacSaving(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const data = await apiFetch<{ success: boolean; users: RbacUserItem[] }>("/api/admin/rbac", {
        method: "PUT",
        body: {
          action: "ASSIGN_USER_ROLE",
          email,
          role: targetRole,
        },
      });
      if (data.users) setRbacUsers(data.users);
      setStatusMsg(`Role "${targetRole.toUpperCase()}" successfully assigned to ${email}.`);
      setQuickAssignEmail("");
    } catch (err) {
      setErrorMsg(errorMessage(err));
    } finally {
      setRbacSaving(false);
    }
  }

  async function reloadFaqs() {
    setFaqsLoading(true);
    try {
      const data = await apiFetch<{ faqs: FaqItem[] }>("/api/admin/faqs", { method: "GET" });
      if (data.faqs) setFaqs(data.faqs);
    } catch (err) {
      console.warn("[faqs] failed to load faqs", err);
    } finally {
      setFaqsLoading(false);
    }
  }

  async function handleCreateFaq(e: React.FormEvent) {
    e.preventDefault();
    if (!newFaq.question.trim() || !newFaq.answer.trim()) return;
    setFaqsSaving(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const data = await apiFetch<{ success: boolean; faqs: FaqItem[] }>("/api/admin/faqs", {
        method: "POST",
        body: newFaq,
      });
      if (data.faqs) setFaqs(data.faqs);
      setShowAddFaq(false);
      setNewFaq({
        question: "",
        answer: "",
        category: "General",
        order: (data.faqs?.length || 0) + 1,
        enabled: true,
      });
      setStatusMsg("New FAQ item successfully published.");
    } catch (err) {
      setErrorMsg(errorMessage(err));
    } finally {
      setFaqsSaving(false);
    }
  }

  async function handleUpdateFaq(faqId: string) {
    setFaqsSaving(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const data = await apiFetch<{ success: boolean; faqs: FaqItem[] }>("/api/admin/faqs", {
        method: "PUT",
        body: { faqId, patch: editFaqData },
      });
      if (data.faqs) setFaqs(data.faqs);
      setEditingFaqId(null);
      setEditFaqData({});
      setStatusMsg("FAQ item updated.");
    } catch (err) {
      setErrorMsg(errorMessage(err));
    } finally {
      setFaqsSaving(false);
    }
  }

  async function handleDeleteFaq(faqId: string) {
    setFaqsSaving(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const data = await apiFetch<{ success: boolean; faqs: FaqItem[] }>("/api/admin/faqs", {
        method: "DELETE",
        body: { faqId },
      });
      if (data.faqs) setFaqs(data.faqs);
      setConfirmDeleteFaqId(null);
      setStatusMsg("FAQ item deleted.");
    } catch (err) {
      setErrorMsg(errorMessage(err));
    } finally {
      setFaqsSaving(false);
    }
  }

  async function handleResetDefaultFaqs() {
    setFaqsSaving(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const data = await apiFetch<{ success: boolean; faqs: FaqItem[] }>("/api/admin/faqs", {
        method: "POST",
        body: { action: "RESET_DEFAULTS" },
      });
      if (data.faqs) setFaqs(data.faqs);
      setStatusMsg("Reset to standard seed FAQs (Brands, Radar Feed, Token Ledger).");
    } catch (err) {
      setErrorMsg(errorMessage(err));
    } finally {
      setFaqsSaving(false);
    }
  }

  async function reloadConfig() {
    setLoading(true);
    setErrorMsg(null);
    try {
      const data = await apiFetch<{
        config: AdminConfigData;
        ledger?: RedistributiveLedgerSummary;
        recentPurchases?: StripePurchaseRecord[];
        isAdmin: boolean;
      }>("/api/admin/config", { method: "GET" });
      setConfig(data.config);
      if (data.ledger) setLedger(data.ledger);
      if (data.recentPurchases) setRecentPurchases(data.recentPurchases);
      setIsAdmin(data.isAdmin);

      try {
        const msgData = await apiFetch<{ messages: AdminMessage[] }>("/api/admin/messages", { method: "GET" });
        if (msgData.messages) setAdminMessages(msgData.messages);
      } catch {
        // Non-admin or messages not accessible
      }

      await Promise.all([reloadRbac(), reloadFaqs()]);
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
      }>("/api/admin/config", { method: "GET" }),
      apiFetch<{ messages: AdminMessage[] }>("/api/admin/messages", { method: "GET" }).catch(() => ({
        messages: [] as AdminMessage[],
      })),
      apiFetch<{
        matrix: RbacMatrix;
        users: RbacUserItem[];
        roles: RbacRole[];
        permissions: RbacPermission[];
      }>("/api/admin/rbac", { method: "GET" }).catch(() => null),
      apiFetch<{ faqs: FaqItem[] }>("/api/admin/faqs", { method: "GET" }).catch(() => null),
    ])
      .then(([adminData, msgData, rbacData, faqData]) => {
        if (active) {
          setConfig(adminData.config);
          if (adminData.ledger) setLedger(adminData.ledger);
          if (adminData.recentPurchases) setRecentPurchases(adminData.recentPurchases);
          setIsAdmin(adminData.isAdmin);
          if (msgData?.messages) setAdminMessages(msgData.messages);
          if (rbacData?.matrix) setRbacMatrix(rbacData.matrix);
          if (rbacData?.users) setRbacUsers(rbacData.users);
          if (faqData?.faqs) setFaqs(faqData.faqs);
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
    const cleanEmail = newPartner.email.trim().toLowerCase();
    if (!cleanEmail) {
      setErrorMsg("Partner email address is required.");
      return;
    }
    const pct = Number(newPartner.percentage);
    if (isNaN(pct) || pct <= 0 || pct > 100) {
      setErrorMsg("Percentage must be between 0.01 and 100.");
      return;
    }

    const cleanName = newPartner.name.trim() || cleanEmail.split("@")[0] || cleanEmail;

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
            name: cleanName,
            email: cleanEmail,
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
      setStatusMsg(`Added equity partner ${cleanEmail} (${pct}%).`);
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

  async function handleSendSuperadminMessage(e: React.FormEvent) {
    e.preventDefault();
    if (composeHasLinks) {
      setErrorMsg("Plain text only. Upload links, URLs, and file attachments are strictly prohibited.");
      return;
    }
    if (!composeRecipientEmail.trim() || !composeSubject.trim() || !composeBody.trim()) return;
    setComposeSending(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const data = await apiFetch<{ success: boolean; message: AdminMessage; messages: AdminMessage[] }>(
        "/api/admin/messages",
        {
          method: "POST",
          body: {
            recipientEmail: composeRecipientEmail.trim(),
            subject: composeSubject.trim(),
            body: composeBody.trim(),
          },
        }
      );
      if (data.messages) setAdminMessages(data.messages);
      setShowComposeMessage(false);
      setComposeRecipientEmail("");
      setComposeSubject("");
      setComposeBody("");
      setStatusMsg(`Message delivered to ${data.message.recipientEmail} and recorded under 7-year statutory retention.`);
    } catch (err) {
      setErrorMsg(errorMessage(err));
    } finally {
      setComposeSending(false);
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
      <div className="relative z-10 flex w-full max-w-4xl lg:max-w-6xl xl:max-w-7xl max-h-[calc(100dvh-1.5rem)] sm:max-h-[92vh] flex-col rounded-2xl border border-white/[0.14] bg-surface-container-high shadow-2xl overflow-hidden my-auto transition-all duration-200">
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

        {/* Responsive Navbar (Single sleek row on lg: desktop/laptop, fluid grid on mobile) */}
        <nav
          aria-label="Superadmin Navigation"
          data-testid="superadmin-navbar"
          className="border-b border-white/[0.08] bg-surface-container p-2 sm:px-5 sm:py-2.5 shrink-0"
        >
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 lg:grid-cols-8 sm:gap-2 lg:gap-1.5">
            {[
              { id: "CURRENCY" as const, label: "Currency Controls", icon: "sliders" as IconName },
              { id: "PRICING" as const, label: "Service Pricing", icon: "zap" as IconName },
              { id: "PACKS" as const, label: "Token Packs (CRUD)", icon: "plus" as IconName },
              { id: "LEDGER" as const, label: "Redistributive Ledger", icon: "wallet" as IconName },
              {
                id: "MESSAGES" as const,
                label: `User Messages (${adminMessages.filter((m) => m.status === "unread").length})`,
                icon: "user" as IconName,
              },
              { id: "RBAC" as const, label: "RBAC Matrix & Roles", icon: "shield" as IconName },
              {
                id: "FAQS" as const,
                label: `Help & FAQs (${faqs.length})`,
                icon: "sparkles" as IconName,
              },
              { id: "DEV" as const, label: "Developer Diagnostics", icon: "flask" as IconName },
            ].map((t) => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  data-testid={`superadmin-tab-${t.id.toLowerCase()}`}
                  data-agent-id={`superadmin-tab-${t.id.toLowerCase()}`}
                  className={`group relative flex items-center gap-1.5 sm:gap-2 rounded-xl border px-2 py-1.5 sm:px-3 sm:py-2 text-left font-mono text-[10px] sm:text-[11px] font-semibold transition-all duration-150 ${
                    active
                      ? "border-primary/50 bg-primary/15 text-primary shadow-sm ring-1 ring-primary/30"
                      : "border-white/[0.06] bg-surface-container-high/60 text-on-surface-variant hover:border-white/15 hover:bg-surface-container-high hover:text-on-surface"
                  }`}
                >
                  <Icon
                    name={t.icon}
                    className={`size-3 sm:size-3.5 shrink-0 transition-colors ${
                      active ? "text-primary" : "text-on-surface-variant group-hover:text-on-surface"
                    }`}
                  />
                  <span className="truncate">{t.label}</span>
                </button>
              );
            })}
          </div>
        </nav>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
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
                  {/* Token Base Price (AUD) */}
                  <div className={`${card} p-5 space-y-4`}>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <h4 className="text-body font-semibold text-on-surface">Base Token Price (AUD — Default Currency)</h4>
                        <p className="mt-0.5 text-compact text-on-surface-variant">
                          Default is 1 Token = AUD $1.00. All invoices are in AUD. Nations outside AU & NZ see the AUD → USD conversion.
                        </p>
                      </div>
                      <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 font-mono text-xs font-bold text-primary">
                        {formatAud(config.audCentsPerToken ?? 100)} AUD / token
                      </span>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                      <div className="relative max-w-xs flex-1">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-outline font-mono text-sm">A$</span>
                        <input
                          type="number"
                          min={0.01}
                          step={0.05}
                          data-testid="superadmin-aud-rate-input"
                          value={((config.audCentsPerToken ?? 100) / 100).toFixed(2)}
                          onChange={(e) => {
                            const val = Math.max(1, Math.round((parseFloat(e.target.value) || 1) * 100));
                            saveConfig({ audCentsPerToken: val });
                          }}
                          className={`${field} pl-9 font-mono text-sm`}
                        />
                      </div>
                      <p className="text-xs font-mono text-outline">
                        International Conversion (Outside AU/NZ): {formatAud(config.audCentsPerToken ?? 100)} AUD ≈ {formatUsd(audToUsdCents(config.audCentsPerToken ?? 100))} USD
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: SERVICE PRICING */}
              {tab === "PRICING" && (
                <div className="space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h3 className="text-title-sm font-semibold text-on-surface">
                        Customizable Product & Service Token Amounts
                      </h3>
                      <p className="mt-1 text-compact text-on-surface-variant">
                        Customize the integer token amount required for each product and service. Default rate is 1 Token = {formatAud(config.audCentsPerToken ?? 100)} AUD (≈ {formatUsd(audToUsdCents(config.audCentsPerToken ?? 100))} USD for nations outside AU & NZ).
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        data-testid="preset-free-services"
                        disabled={saving}
                        onClick={() =>
                          saveConfig({
                            serviceCosts: {
                              searchStandard: 0,
                              searchExtendedDays: 0,
                              searchEliteScore: 0,
                              aiRemix: 0,
                            },
                          })
                        }
                        className={btnSecondary}
                      >
                        Set All Free (0)
                      </button>
                      <button
                        type="button"
                        data-testid="preset-paid-services"
                        disabled={saving}
                        onClick={() =>
                          saveConfig({
                            serviceCosts: {
                              searchStandard: 2,
                              searchExtendedDays: 1,
                              searchEliteScore: 2,
                              aiRemix: 5,
                            },
                          })
                        }
                        className={btnPrimary}
                      >
                        Standard Paid Rates
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {[
                      {
                        key: "searchStandard" as const,
                        label: "Base Radar Search",
                        desc: "Base platform ad library search across Meta, TikTok, or Google",
                      },
                      {
                        key: "searchExtendedDays" as const,
                        label: "Extended (60+d) Longevity Surcharge",
                        desc: "Additional tokens for battle-tested 60+ day proven ads filter",
                      },
                      {
                        key: "searchEliteScore" as const,
                        label: "Top Winners (90%+) Surcharge",
                        desc: "Additional tokens for elite tier ads with composite score >= 90%",
                      },
                      {
                        key: "aiRemix" as const,
                        label: "AI Creative Remix Studio",
                        desc: "Gemini multimodal creative deconstruction, 3 hook variants & storyboard",
                      },
                    ].map(({ key, label: serviceLabel, desc }) => {
                      const tok = config.serviceCosts[key] ?? 0;
                      const audCents = Math.round(tok * (config.audCentsPerToken ?? 100));
                      const usdCents = audToUsdCents(audCents);

                      return (
                        <div key={key} data-testid={`service-cost-card-${key}`} className={`${card} p-4 space-y-3`}>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-body font-semibold text-on-surface">{serviceLabel}</span>
                            <span
                              title={formatTokenEstimateHover(tok, false, config.audCentsPerToken ?? 100)}
                              className="cursor-help rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 font-mono text-[12px] font-bold text-primary"
                            >
                              {tok} {tok === 1 ? "token" : "tokens"}
                            </span>
                          </div>
                          <p className="text-[12px] text-on-surface-variant">{desc}</p>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              aria-label={`Decrease ${serviceLabel} tokens`}
                              disabled={saving || tok <= 0}
                              onClick={() =>
                                saveConfig({
                                  serviceCosts: {
                                    ...config.serviceCosts,
                                    [key]: Math.max(0, tok - 1),
                                  },
                                })
                              }
                              className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-surface-container-highest font-mono text-sm font-bold text-on-surface hover:border-primary/40 hover:text-primary disabled:opacity-40"
                            >
                              -
                            </button>
                            <input
                              type="number"
                              min={0}
                              step={1}
                              data-testid={`service-cost-input-${key}`}
                              value={tok}
                              onChange={(e) => {
                                const val = Math.max(0, Math.round(Number(e.target.value) || 0));
                                saveConfig({
                                  serviceCosts: {
                                    ...config.serviceCosts,
                                    [key]: val,
                                  },
                                });
                              }}
                              className={`${field} text-center font-mono`}
                            />
                            <button
                              type="button"
                              aria-label={`Increase ${serviceLabel} tokens`}
                              disabled={saving}
                              onClick={() =>
                                saveConfig({
                                  serviceCosts: {
                                    ...config.serviceCosts,
                                    [key]: tok + 1,
                                  },
                                })
                              }
                              className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-surface-container-highest font-mono text-sm font-bold text-on-surface hover:border-primary/40 hover:text-primary disabled:opacity-40"
                            >
                              +
                            </button>
                            <span className="text-compact text-on-surface-variant whitespace-nowrap font-mono">
                              tokens
                            </span>
                          </div>
                          <div className="flex items-center justify-between pt-1 border-t border-white/[0.06] font-mono text-[11px] text-outline">
                            <span>AU/NZ: {tok === 0 ? "Free (A$0.00)" : `${formatAud(audCents)} AUD`}</span>
                            <span>Intl: {tok === 0 ? "Free" : `≈ ${formatUsd(usdCents)} USD`}</span>
                          </div>
                        </div>
                      );
                    })}
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
                              {pack.id} • {pack.tokens.toLocaleString("en-AU")} tokens • {formatAud(pack.priceCents)} AUD (≈ {formatUsd(audToUsdCents(pack.priceCents))} USD)
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
                <div className="space-y-4 lg:space-y-3.5">
                  {/* Top Bar: Title & Action Buttons */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-title-sm font-semibold text-on-surface">Redistributive Equity Ledger</h3>
                        <span className="rounded-full bg-secondary/15 px-2 py-0.5 font-mono text-[10px] font-semibold text-secondary">
                          Live Statutory Splits
                        </span>
                      </div>
                      <p className="mt-0.5 text-[12px] text-on-surface-variant">
                        Calculates equity partner ownership from total Stripe token revenue and purchased tokens.
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
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

                  {/* Top Stats Cards: Total Tokens and Sum in USD & AUD */}
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:gap-2.5">
                    <div className={`${card} p-3 lg:py-2.5 lg:px-3.5`}>
                      <span className="text-[10px] font-mono text-on-surface-variant uppercase tracking-wider">Total Tokens</span>
                      <p className="mt-0.5 text-title-sm lg:text-title-md font-bold text-primary flex items-center gap-1.5">
                        <Icon name="zap" className="size-4 lg:size-5" />
                        {(ledger?.totalTokens ?? 0).toLocaleString("en-AU")}
                      </p>
                      <span className="text-[10px] text-on-surface-variant truncate block">Stripe · Integers only</span>
                    </div>

                    <div className={`${card} p-3 lg:py-2.5 lg:px-3.5`}>
                      <span className="text-[10px] font-mono text-on-surface-variant uppercase tracking-wider">Sum Amount (AUD)</span>
                      <p className="mt-0.5 text-title-sm lg:text-title-md font-bold text-on-surface">
                        {formatAud(ledger?.totalGrossAudCents ?? ledger?.totalGrossCents ?? 0)}
                      </p>
                      <span className="text-[10px] text-on-surface-variant truncate block">
                        {ledger?.totalPurchasesCount ?? 0} transaction(s)
                      </span>
                    </div>

                    <div className={`${card} p-3 lg:py-2.5 lg:px-3.5`}>
                      <span className="text-[10px] font-mono text-on-surface-variant uppercase tracking-wider">Sum Amount (USD)</span>
                      <p className="mt-0.5 text-title-sm lg:text-title-md font-bold text-on-surface">
                        {formatUsd(ledger?.totalGrossUsdCents ?? Math.round((ledger?.totalGrossCents ?? 0) * 0.65))}
                      </p>
                      <span className="text-[10px] text-on-surface-variant truncate block">
                        Dual currency standard
                      </span>
                    </div>

                    <div className={`${card} p-3 lg:py-2.5 lg:px-3.5`}>
                      <span className="text-[10px] font-mono text-on-surface-variant uppercase tracking-wider">Owner Redistribution</span>
                      <p className="mt-0.5 text-title-sm lg:text-title-md font-bold text-secondary">
                        {(ledger?.allocatedPercentage ?? 0).toFixed(2)}% Allocated
                      </p>
                      <span className="text-[10px] text-on-surface-variant truncate block" title={`Treasury retains ${(ledger?.treasuryPercentage ?? 100).toFixed(2)}% (${formatAud(ledger?.treasuryAudCents ?? ledger?.treasuryCents ?? 0)} / ${formatUsd(ledger?.treasuryUsdCents ?? Math.round((ledger?.treasuryCents ?? 0) * 0.65))})`}>
                        Treasury retains {(ledger?.treasuryPercentage ?? 100).toFixed(2)}%
                      </span>
                    </div>
                  </div>

                  {/* Add Partner Form */}
                  {showAddPartner && (
                    <form onSubmit={handleAddPartner} className={`${card} p-4 border border-primary/30 space-y-3 animate-fadeIn`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-compact font-semibold text-on-surface">Add Owner to Redistributive Ledger</h4>
                          <p className="text-[11px] text-on-surface-variant">
                            Add owner email address and percentage allocation to redistribute Stripe token proceeds.
                          </p>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                        <div>
                          <label className={label}>Owner Email Address *</label>
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
                          <label className={label}>Equity Percentage (0.01 - 100%) *</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            max="100"
                            required
                            placeholder="25"
                            value={newPartner.percentage}
                            onChange={(e) => setNewPartner({ ...newPartner, percentage: parseFloat(e.target.value) || 0 })}
                            className={field}
                            data-testid="partner-percentage-input"
                          />
                        </div>
                        <div>
                          <label className={label}>Display Name / Role (Optional)</label>
                          <input
                            type="text"
                            placeholder="e.g. Jane Doe (Co-founder)"
                            value={newPartner.name}
                            onChange={(e) => setNewPartner({ ...newPartner, name: e.target.value })}
                            className={field}
                            data-testid="partner-name-input"
                          />
                        </div>
                      </div>
                      <div>
                        <label className={label}>Notes / Agreement Reference (Optional)</label>
                        <input
                          type="text"
                          placeholder="e.g. Equity partner agreement dated 2026"
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
                          Add to Ledger
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Dual-Pane Grid on Desktop / Stacks on Mobile & Tablet */}
                  <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-12 lg:items-start">
                    {/* LEFT PANE (7 COLS): Owner Redistribution Breakdown */}
                    <div className="space-y-2 lg:col-span-7">
                      <div className="flex items-center justify-between">
                        <h4 className="text-compact font-semibold text-on-surface">Owner Redistribution Breakdown</h4>
                        <span className="font-mono text-[11px] text-on-surface-variant">
                          {config.equityPartners?.length ?? 0} Partner(s)
                        </span>
                      </div>

                      {config.equityPartners?.length === 0 ? (
                        <div className={`${card} p-6 text-center text-on-surface-variant`}>
                          <p className="text-sm">No owners or equity partners added yet.</p>
                          <p className="text-[11px] mt-1 text-outline">
                            Click &ldquo;Add Equity Partner&rdquo; to add someone by email address and configure their percentage.
                          </p>
                        </div>
                      ) : (
                        <div className="overflow-x-auto rounded-xl border border-white/[0.08] bg-surface-container-low max-h-[360px] overflow-y-auto">
                          <table className="w-full text-left text-[12px]">
                            <thead className="border-b border-white/[0.08] bg-surface-container-high/60 font-mono text-mono-label text-on-surface-variant sticky top-0 z-10 backdrop-blur-sm">
                              <tr>
                                <th className="px-3 py-2">Owner / Email</th>
                                <th className="px-2.5 py-2">Equity %</th>
                                <th className="px-2.5 py-2">Tokens</th>
                                <th className="px-2.5 py-2">AUD</th>
                                <th className="px-2.5 py-2">USD</th>
                                <th className="px-2 py-2">Status</th>
                                <th className="px-3 py-2 text-right">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-white/[0.04]">
                              {ledger?.distributions.map((dist) => {
                                const partner = config.equityPartners.find((p) => p.partnerId === dist.partnerId);
                                if (!partner) return null;
                                return (
                                  <tr key={dist.partnerId} className="hover:bg-white/[0.02] transition">
                                    <td className="px-3 py-2">
                                      <div className="font-semibold text-on-surface font-mono text-[11px] truncate max-w-[140px] sm:max-w-[180px]" title={dist.email}>
                                        {dist.email}
                                      </div>
                                      {dist.name && dist.name !== dist.email && (
                                        <div className="text-[10px] text-on-surface-variant truncate max-w-[140px]">{dist.name}</div>
                                      )}
                                    </td>
                                    <td className="px-2.5 py-2 font-mono font-bold text-secondary text-[11px]">
                                      {dist.percentage}%
                                    </td>
                                    <td className="px-2.5 py-2 font-mono text-primary font-semibold text-[11px] whitespace-nowrap">
                                      ⚡ {dist.ownedTokens.toLocaleString("en-AU")}
                                    </td>
                                    <td className="px-2.5 py-2 font-mono font-semibold text-on-surface text-[11px] whitespace-nowrap">
                                      {formatAud(dist.ownedAudCents ?? dist.ownedCents)}
                                    </td>
                                    <td className="px-2.5 py-2 font-mono font-semibold text-on-surface-variant text-[10px] whitespace-nowrap">
                                      {formatUsd(dist.ownedUsdCents ?? Math.round(dist.ownedCents * 0.65))}
                                    </td>
                                    <td className="px-2 py-2">
                                      <button
                                        type="button"
                                        onClick={() => handleTogglePartnerStatus(partner)}
                                        className={`rounded px-1.5 py-0.5 text-[10px] font-mono font-semibold transition ${
                                          dist.status === "active"
                                            ? "bg-primary/20 text-primary hover:bg-primary/30"
                                            : "bg-surface-container-highest text-on-surface-variant hover:bg-white/[0.08]"
                                        }`}
                                      >
                                        {dist.status.toUpperCase()}
                                      </button>
                                    </td>
                                    <td className="px-3 py-2 text-right">
                                      {confirmDeletePartnerId === dist.partnerId ? (
                                        <div className="flex items-center justify-end gap-1 animate-fadeIn">
                                          <button
                                            type="button"
                                            onClick={() => handleDeletePartner(dist.partnerId)}
                                            className={`${btnDanger} px-2 py-1 text-[10px]`}
                                            data-testid={`confirm-delete-partner-${dist.partnerId}`}
                                          >
                                            Confirm
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => setConfirmDeletePartnerId(null)}
                                            className={`${btnSecondary} px-2 py-1 text-[10px]`}
                                          >
                                            Cancel
                                          </button>
                                        </div>
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={() => setConfirmDeletePartnerId(dist.partnerId)}
                                          className="text-error hover:text-error/80 font-mono text-[10px] underline"
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

                    {/* RIGHT PANE (5 COLS): Recent Stripe Purchases */}
                    <div className="space-y-2 lg:col-span-5">
                      <div className="flex items-center justify-between">
                        <h4 className="text-compact font-semibold text-on-surface">Recent Stripe Purchases</h4>
                        <span className="font-mono text-[11px] text-on-surface-variant">
                          {recentPurchases.length} Logged
                        </span>
                      </div>

                      {recentPurchases.length === 0 ? (
                        <div className={`${card} p-6 text-center text-on-surface-variant`}>
                          <p className="text-sm italic">No Stripe purchases recorded yet.</p>
                          <p className="text-[11px] mt-1 text-outline">
                            Make a purchase via Wallet or click &ldquo;Simulate Purchase (Test)&rdquo; above.
                          </p>
                        </div>
                      ) : (
                        <div className="overflow-x-auto rounded-xl border border-white/[0.08] bg-surface-container-low max-h-[360px] overflow-y-auto">
                          <table className="w-full text-left text-[11px]">
                            <thead className="border-b border-white/[0.08] bg-surface-container-high/60 font-mono text-mono-label text-on-surface-variant sticky top-0 z-10 backdrop-blur-sm">
                              <tr>
                                <th className="px-2.5 py-2">Date</th>
                                <th className="px-2.5 py-2">Buyer</th>
                                <th className="px-2 py-2">Tokens</th>
                                <th className="px-2.5 py-2 text-right">Gross (AUD)</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-white/[0.04] font-mono">
                              {recentPurchases.map((p) => (
                                <tr key={p.purchaseId} className="hover:bg-white/[0.02]">
                                  <td className="px-2.5 py-2 text-on-surface-variant whitespace-nowrap">
                                    {new Date(p.createdAt).toLocaleDateString("en-AU", { day: "2-digit", month: "short" })}
                                  </td>
                                  <td className="px-2.5 py-2 text-on-surface truncate max-w-[110px]" title={p.email || p.uid}>
                                    {p.email || p.uid}
                                  </td>
                                  <td className="px-2 py-2 text-primary font-semibold whitespace-nowrap">
                                    ⚡ {p.tokens.toLocaleString("en-AU")}
                                  </td>
                                  <td className="px-2.5 py-2 text-on-surface text-right font-semibold whitespace-nowrap">
                                    {formatPrice(p.amountCents)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 5: USER MESSAGES (7-YEAR COMPLIANCE ARCHIVE) */}
              {tab === "MESSAGES" && (
                <div className="space-y-6">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="text-title-sm font-semibold text-on-surface">User Messages & Communications</h3>
                      <p className="mt-1 text-compact text-on-surface-variant">
                        Inspect incoming user communications or message anyone. Immutable 7-year statutory retention. Plain text only, no upload links.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowComposeMessage((v) => !v)}
                      className={btnPrimary}
                      data-testid="compose-message-button"
                    >
                      <Icon name="sparkles" className="size-4" />
                      {showComposeMessage ? "Close Compose" : "Message Anyone"}
                    </button>
                  </div>

                  {showComposeMessage && (
                    <form onSubmit={handleSendSuperadminMessage} className={`${card} p-5 space-y-4`}>
                      <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
                        <div className="flex items-center gap-2">
                          <Icon name="sparkles" className="size-4 text-primary" />
                          <h4 className="text-compact font-bold text-on-surface">Compose Message to Anyone</h4>
                        </div>
                        <span className="rounded bg-primary/20 px-2 py-0.5 font-mono text-[11px] text-primary">
                          7-Year Compliance Archive
                        </span>
                      </div>

                      {composeHasLinks && (
                        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-[12px] text-red-300">
                          <p className="font-semibold">Upload links / URLs detected</p>
                          <p className="mt-0.5">Please remove links or URLs. Plain text communication only.</p>
                        </div>
                      )}

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <label className={label}>Recipient Email</label>
                          <input
                            type="email"
                            required
                            list="registered-users-list"
                            placeholder="user@example.com"
                            value={composeRecipientEmail}
                            onChange={(e) => setComposeRecipientEmail(e.target.value)}
                            className={field}
                          />
                          <datalist id="registered-users-list">
                            {rbacUsers.map((u) => (
                              <option key={u.uid} value={u.email} />
                            ))}
                          </datalist>
                        </div>
                        <div>
                          <label className={label}>Subject</label>
                          <input
                            type="text"
                            required
                            maxLength={150}
                            placeholder="e.g. Account update, compliance notice, or support reply"
                            value={composeSubject}
                            onChange={(e) => setComposeSubject(e.target.value)}
                            className={field}
                          />
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between">
                          <label className={label}>Message Body (Plain Text Only)</label>
                          <span className="font-mono text-[11px] text-on-surface-variant">
                            {composeBody.length} / 2000
                          </span>
                        </div>
                        <textarea
                          required
                          rows={4}
                          maxLength={2000}
                          placeholder="Type your plain-text message here..."
                          value={composeBody}
                          onChange={(e) => setComposeBody(e.target.value)}
                          className={`${field} font-sans leading-relaxed`}
                        />
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/[0.08]">
                        <button
                          type="button"
                          onClick={() => setShowComposeMessage(false)}
                          className={btnSecondary}
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={composeSending || composeHasLinks || !composeRecipientEmail || !composeSubject || !composeBody}
                          className={btnPrimary}
                        >
                          {composeSending ? (
                            <>
                              <Icon name="refresh" className="size-4 animate-spin" />
                              Sending…
                            </>
                          ) : (
                            <>
                              <Icon name="sparkles" className="size-4" />
                              Send Message
                            </>
                          )}
                        </button>
                      </div>
                    </form>
                  )}

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
                              <button
                                type="button"
                                onClick={() => {
                                  setComposeRecipientEmail(selectedMessage.senderEmail);
                                  setComposeSubject(`Re: ${selectedMessage.subject}`);
                                  setComposeBody("");
                                  setShowComposeMessage(true);
                                }}
                                className={btnPrimary}
                              >
                                <Icon name="sparkles" className="size-3.5" />
                                Reply to Sender
                              </button>
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

              {/* TAB 6: RBAC MATRIX & ROLES */}
              {tab === "RBAC" && (
                <div className="space-y-8">
                  <div>
                    <h3 className="text-title-sm font-semibold text-on-surface">
                      Role-Based Access Control (RBAC) Matrix
                    </h3>
                    <p className="mt-1 text-compact text-on-surface-variant">
                      Cryptographically enforced permissions matrix across system roles. Superadmin holds full immutable privileges.
                    </p>
                  </div>

                  <div className="rounded-xl border border-primary/30 bg-primary/10 p-4 text-compact text-on-surface">
                    <div className="flex items-start gap-3">
                      <Icon name="sparkles" className="mt-0.5 size-4 text-primary shrink-0" />
                      <div>
                        <strong className="text-primary font-semibold">Strict Database Superadmin Gate:</strong>
                        <p className="text-[12px] text-on-surface-variant mt-0.5">
                          Only the authenticated Firebase database administrator email holds permanent Super Admin status. All permissions for Super Admin are locked. Non-admin users start at Supporter level and can be granted operational or administrative roles below.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* 1. ROLE-PERMISSION MATRIX TABLE */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-compact font-semibold text-on-surface">
                        1. Feature Permission Matrix
                      </h4>
                      <button
                        type="button"
                        onClick={reloadRbac}
                        disabled={rbacLoading}
                        className="text-xs text-primary hover:underline flex items-center gap-1"
                      >
                        <Icon name="refresh" className={`size-3 ${rbacLoading ? "animate-spin" : ""}`} />
                        Refresh Matrix
                      </button>
                    </div>

                    <div className="overflow-x-auto rounded-xl border border-white/[0.08] bg-surface-container">
                      <table className="w-full text-left text-compact border-collapse">
                        <thead>
                          <tr className="border-b border-white/[0.08] bg-surface-container-high/60 font-mono text-[11px] text-on-surface-variant">
                            <th className="p-3 font-semibold text-on-surface min-w-[200px]">Permission / Capability</th>
                            <th className="p-3 text-center min-w-[120px]">
                              <span className="inline-flex items-center gap-1 text-primary font-bold">
                                superadmin
                              </span>
                              <div className="text-[10px] text-on-surface-variant/80 font-normal">Immutable 🔒</div>
                            </th>
                            {(["admin", "moderator", "agency", "supporter"] as const).map((role) => (
                              <th key={role} className="p-3 text-center min-w-[130px]">
                                <div className="font-semibold text-on-surface capitalize">{role}</div>
                                <button
                                  type="button"
                                  onClick={() => handleSaveRolePermissions(role)}
                                  disabled={rbacSaving}
                                  data-testid={`save-role-${role}-button`}
                                  data-agent-id={`save-role-${role}-btn`}
                                  className="mt-1 inline-flex items-center gap-1 rounded bg-surface-container-highest px-2 py-0.5 text-[10px] font-mono text-primary hover:bg-primary hover:text-on-primary transition"
                                >
                                  Save Role
                                </button>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.04]">
                          {RBAC_PERMISSIONS_LIST.map((perm) => {
                            const meta = PERMISSION_METADATA[perm];
                            return (
                              <tr key={perm} className="hover:bg-white/[0.02] transition-colors">
                                <td className="p-3">
                                  <div className="font-medium text-on-surface">{meta.label}</div>
                                  <div className="text-[11px] text-on-surface-variant font-mono">{meta.desc}</div>
                                </td>
                                {/* Superadmin (Locked) */}
                                <td className="p-3 text-center">
                                  <span className="inline-flex items-center gap-1 rounded bg-primary/20 px-2 py-0.5 text-[11px] font-mono font-bold text-primary">
                                    [✔] Locked
                                  </span>
                                </td>
                                {/* Configurable Roles */}
                                {(["admin", "moderator", "agency", "supporter"] as const).map((role) => {
                                  const isChecked = (rbacMatrix?.[role] || []).includes(perm);
                                  return (
                                    <td key={role} className="p-3 text-center">
                                      <label className="inline-flex items-center justify-center cursor-pointer p-1">
                                        <input
                                          type="checkbox"
                                          checked={isChecked}
                                          onChange={() => handleTogglePermission(role, perm)}
                                          data-testid={`rbac-checkbox-${role}-${perm}`}
                                          data-agent-id={`rbac-checkbox-${role}-${perm}`}
                                          aria-label={`Allow ${perm} for ${role}`}
                                          className="size-4.5 rounded border border-white/20 bg-surface-container-lowest text-primary focus:ring-1 focus:ring-primary focus:ring-offset-0 cursor-pointer"
                                        />
                                      </label>
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* 2. USER ROLE ASSIGNMENT TABLE */}
                  <div className="space-y-4 pt-4 border-t border-white/[0.08]">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h4 className="text-compact font-semibold text-on-surface">
                          2. User Role Assignments
                        </h4>
                        <p className="text-[12px] text-on-surface-variant">
                          Assign RBAC roles to authenticated users. Instant update to Firebase custom claims.
                        </p>
                      </div>
                      <input
                        type="search"
                        placeholder="Filter users by email..."
                        value={userSearchQuery}
                        onChange={(e) => setUserSearchQuery(e.target.value)}
                        className="rounded-lg border border-white/10 bg-surface-container px-3 py-1.5 text-compact text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:outline-none max-w-xs"
                      />
                    </div>

                    {/* Quick Assign Card */}
                    <div className={`${card} p-4`}>
                      <span className="font-mono text-mono-label text-on-surface-variant">Quick Assign Role by Email</span>
                      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                        <input
                          type="email"
                          placeholder="user@example.com"
                          value={quickAssignEmail}
                          onChange={(e) => setQuickAssignEmail(e.target.value)}
                          className={`flex-1 ${field}`}
                        />
                        <select
                          value={quickAssignRole}
                          onChange={(e) => setQuickAssignRole(e.target.value as Exclude<RbacRole, "superadmin">)}
                          className={`w-full sm:w-44 ${field}`}
                        >
                          <option value="supporter">Supporter (Default)</option>
                          <option value="agency">Agency Tier</option>
                          <option value="moderator">Moderator</option>
                          <option value="admin">Administrator</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => {
                            if (!quickAssignEmail.trim()) return;
                            handleAssignUserRole(quickAssignEmail.trim(), quickAssignRole);
                          }}
                          disabled={rbacSaving || !quickAssignEmail.trim()}
                          data-testid="quick-assign-button"
                          data-agent-id="quick-assign-btn"
                          className={`${btnPrimary} shrink-0`}
                        >
                          Assign Role
                        </button>
                      </div>
                    </div>

                    {/* Users List Table */}
                    <div className="overflow-x-auto rounded-xl border border-white/[0.08] bg-surface-container">
                      <table className="w-full text-left text-compact border-collapse">
                        <thead>
                          <tr className="border-b border-white/[0.08] bg-surface-container-high/60 font-mono text-[11px] text-on-surface-variant">
                            <th className="p-3 font-semibold text-on-surface">User Account</th>
                            <th className="p-3">Current Role</th>
                            <th className="p-3">Tier</th>
                            <th className="p-3 text-right">Assign Role</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.04]">
                          {rbacUsers
                            .filter((u) =>
                              u.email.toLowerCase().includes(userSearchQuery.toLowerCase()) ||
                              (u.displayName || "").toLowerCase().includes(userSearchQuery.toLowerCase())
                            )
                            .map((user) => (
                              <tr key={user.uid} className="hover:bg-white/[0.02] transition-colors">
                                <td className="p-3">
                                  <div className="font-medium text-on-surface">{user.email}</div>
                                  <div className="text-[11px] text-on-surface-variant font-mono">
                                    UID: {user.uid.slice(0, 12)}… • Created {new Date(user.createdAt).toLocaleDateString("en-AU")}
                                  </div>
                                </td>
                                <td className="p-3">
                                  <span
                                    className={`inline-block rounded px-2 py-0.5 font-mono text-[11px] font-semibold uppercase ${
                                      user.isPermanentSuperAdmin
                                        ? "border border-primary/40 bg-primary/20 text-primary"
                                        : user.role === "admin"
                                        ? "border border-secondary/40 bg-secondary/20 text-secondary"
                                        : user.role === "moderator"
                                        ? "border border-tertiary/40 bg-tertiary/20 text-tertiary"
                                        : "border border-white/10 bg-surface-container-highest text-on-surface-variant"
                                    }`}
                                  >
                                    {user.role}
                                  </span>
                                </td>
                                <td className="p-3 font-mono text-[12px] text-on-surface-variant uppercase">
                                  {user.tier}
                                </td>
                                <td className="p-3 text-right">
                                  <button
                                    type="button"
                                    title={`Message ${user.email}`}
                                    onClick={() => {
                                      setTab("MESSAGES");
                                      setComposeRecipientEmail(user.email);
                                      setComposeSubject("Direct Notice from Super Admin");
                                      setComposeBody("");
                                      setShowComposeMessage(true);
                                    }}
                                    className="rounded border border-primary/30 bg-primary/10 px-2 py-1 text-xs font-mono text-primary hover:bg-primary/20 transition mr-2"
                                  >
                                    Message
                                  </button>
                                  {user.isPermanentSuperAdmin ? (
                                    <span className="inline-flex items-center gap-1 rounded bg-primary/20 px-2 py-1 text-xs font-mono font-semibold text-primary">
                                      Permanent Super Admin 🔒
                                    </span>
                                  ) : (
                                    <select
                                      value={user.role}
                                      onChange={(e) =>
                                        handleAssignUserRole(user.email, e.target.value as Exclude<RbacRole, "superadmin">)
                                      }
                                      disabled={rbacSaving}
                                      aria-label={`Change role for ${user.email}`}
                                      className="rounded border border-white/15 bg-surface-container-low px-2 py-1 text-xs text-on-surface font-mono focus:border-primary focus:outline-none"
                                    >
                                      <option value="supporter">Supporter</option>
                                      <option value="agency">Agency</option>
                                      <option value="moderator">Moderator</option>
                                      <option value="admin">Admin</option>
                                    </select>
                                  )}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 7: FAQS MANAGEMENT */}
              {tab === "FAQS" && (
                <div className="space-y-6">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="text-title-sm font-semibold text-on-surface">Help & FAQ Management</h3>
                      <p className="mt-1 text-compact text-on-surface-variant">
                        Manage platform knowledge base FAQs explaining My Brands, Radar Feed, and Token Ledger mechanics.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleResetDefaultFaqs}
                        disabled={faqsSaving}
                        className="rounded-lg border border-white/10 px-3 py-1.5 text-compact text-on-surface-variant hover:bg-white/[0.04] hover:text-on-surface transition"
                      >
                        Reset Defaults
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowAddFaq((v) => !v)}
                        data-testid="add-faq-button"
                        className={btnPrimary}
                      >
                        <Icon name="plus" className="size-4" />
                        {showAddFaq ? "Cancel" : "Add FAQ"}
                      </button>
                    </div>
                  </div>

                  {/* Add New FAQ Form */}
                  {showAddFaq && (
                    <form onSubmit={handleCreateFaq} className={`${card} p-5 space-y-4`}>
                      <h4 className="text-compact font-semibold text-on-surface">Create New FAQ Item</h4>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <div className="sm:col-span-2">
                          <label className={label}>Question</label>
                          <input
                            type="text"
                            required
                            placeholder="e.g. How does AI Remix generate ad hooks?"
                            value={newFaq.question}
                            onChange={(e) => setNewFaq({ ...newFaq, question: e.target.value })}
                            className={field}
                          />
                        </div>
                        <div>
                          <label className={label}>Category</label>
                          <input
                            type="text"
                            placeholder="Brands, Radar, General"
                            value={newFaq.category}
                            onChange={(e) => setNewFaq({ ...newFaq, category: e.target.value })}
                            className={field}
                          />
                        </div>
                      </div>

                      <div>
                        <label className={label}>Answer</label>
                        <textarea
                          required
                          rows={4}
                          placeholder="Provide a detailed, clear explanation..."
                          value={newFaq.answer}
                          onChange={(e) => setNewFaq({ ...newFaq, answer: e.target.value })}
                          className={field}
                        />
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <label className="flex items-center gap-2 text-compact text-on-surface cursor-pointer">
                          <input
                            type="checkbox"
                            checked={newFaq.enabled}
                            onChange={(e) => setNewFaq({ ...newFaq, enabled: e.target.checked })}
                            className="size-4 rounded border-white/20 bg-surface-container-lowest text-primary"
                          />
                          Enabled (Visible to Users)
                        </label>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setShowAddFaq(false)}
                            className={btnSecondary}
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            disabled={faqsSaving || !newFaq.question.trim() || !newFaq.answer.trim()}
                            data-testid="save-new-faq-button"
                            className={btnPrimary}
                          >
                            Publish FAQ
                          </button>
                        </div>
                      </div>
                    </form>
                  )}

                  {/* FAQ Items List */}
                  {faqsLoading ? (
                    <div className="flex h-32 items-center justify-center text-on-surface-variant">
                      <Icon name="refresh" className="size-5 animate-spin" />
                    </div>
                  ) : faqs.length === 0 ? (
                    <div className={`${card} p-8 text-center text-on-surface-variant space-y-3`}>
                      <p>No FAQs available in the system.</p>
                      <button
                        type="button"
                        onClick={handleResetDefaultFaqs}
                        className={btnPrimary}
                      >
                        Load Seed FAQs (Brands & Radar Feed)
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {faqs.map((faq) => {
                        const isEditing = editingFaqId === faq.faqId;
                        return (
                          <div
                            key={faq.faqId}
                            className={`${card} p-4 space-y-2 border border-white/[0.08] transition`}
                          >
                            {isEditing ? (
                              <div className="space-y-3">
                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                                  <input
                                    type="text"
                                    value={editFaqData.question ?? faq.question}
                                    onChange={(e) => setEditFaqData({ ...editFaqData, question: e.target.value })}
                                    className={`sm:col-span-2 ${field}`}
                                  />
                                  <input
                                    type="text"
                                    value={editFaqData.category ?? faq.category}
                                    onChange={(e) => setEditFaqData({ ...editFaqData, category: e.target.value })}
                                    className={field}
                                  />
                                </div>
                                <textarea
                                  rows={3}
                                  value={editFaqData.answer ?? faq.answer}
                                  onChange={(e) => setEditFaqData({ ...editFaqData, answer: e.target.value })}
                                  className={field}
                                />
                                <div className="flex items-center justify-end gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setEditingFaqId(null)}
                                    className={btnSecondary}
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateFaq(faq.faqId)}
                                    disabled={faqsSaving}
                                    className={btnPrimary}
                                  >
                                    Save Changes
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div>
                                <div className="flex items-start justify-between gap-3">
                                  <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                      <span className="rounded bg-primary/20 px-2 py-0.5 font-mono text-[10px] font-semibold text-primary uppercase">
                                        {faq.category}
                                      </span>
                                      <span className="text-[11px] font-mono text-on-surface-variant">
                                        Order #{faq.order}
                                      </span>
                                      {!faq.enabled && (
                                        <span className="rounded bg-error/20 px-2 py-0.5 font-mono text-[10px] text-error">
                                          Draft / Hidden
                                        </span>
                                      )}
                                    </div>
                                    <h4 className="text-body font-semibold text-on-surface">{faq.question}</h4>
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingFaqId(faq.faqId);
                                        setEditFaqData({
                                          question: faq.question,
                                          answer: faq.answer,
                                          category: faq.category,
                                          order: faq.order,
                                          enabled: faq.enabled,
                                        });
                                      }}
                                      className="rounded p-1 text-on-surface-variant hover:bg-white/[0.08] hover:text-on-surface transition"
                                      title="Edit FAQ"
                                      aria-label={`Edit ${faq.question}`}
                                    >
                                      <Icon name="sliders" className="size-3.5" />
                                    </button>

                                    {confirmDeleteFaqId === faq.faqId ? (
                                      <div className="flex items-center gap-1">
                                        <button
                                          type="button"
                                          onClick={() => handleDeleteFaq(faq.faqId)}
                                          disabled={faqsSaving}
                                          data-testid={`confirm-delete-faq-${faq.faqId}`}
                                          className="rounded bg-error px-2 py-0.5 text-[11px] font-medium text-white hover:bg-error/90 transition"
                                        >
                                          Confirm Delete
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setConfirmDeleteFaqId(null)}
                                          className="rounded bg-surface-container-highest px-1.5 py-0.5 text-[11px] text-on-surface-variant"
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => setConfirmDeleteFaqId(faq.faqId)}
                                        className="rounded p-1 text-error/70 hover:bg-error/20 hover:text-error transition"
                                        title="Delete FAQ"
                                        aria-label={`Delete ${faq.question}`}
                                      >
                                        <Icon name="trash" className="size-3.5" />
                                      </button>
                                    )}
                                  </div>
                                </div>
                                <p className="mt-2 text-compact leading-relaxed text-on-surface-variant">
                                  {faq.answer}
                                </p>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 8: DEVELOPER DIAGNOSTICS */}
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
