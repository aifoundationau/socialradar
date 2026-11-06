"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useSession } from "@/components/auth/SessionProvider";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { Icon, type IconName } from "@/components/ui/Icon";
import { alertError, alertInfo, btnDanger, btnPrimary, btnSecondary, card, field, label } from "@/components/ui/styles";
import { audToUsdCents, formatAud, formatPrice, formatTokenEstimateHover, formatUsd, usdToAudCents } from "@/lib/pricing";
import type {
  AdminMessage,
  EquityPartner,
  FaqItem,
  MonthlySubscriptionConfig,
  RagSentenceItem,
  RbacMatrix,
  RbacPermission,
  RbacRole,
  RedistributiveLedgerSummary,
  StripePurchaseRecord,
  TokenTransactionDoc,
} from "@/lib/contracts";
import { LINK_URL_PATTERN, RBAC_PERMISSIONS_LIST, RBAC_ROLES_LIST } from "@/lib/contracts";
import { GlobalRagCorpusSection, PerFaqRagDrawer } from "@/components/faq/FaqRagWorkspace";

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
  tokenBalance?: number;
}

const PERMISSION_METADATA: Record<RbacPermission, { label: string; desc: string }> = {
  view_analytics: { label: "View Analytics", desc: "Access global usage and search metrics" },
  manage_config: { label: "System Config", desc: "Adjust pricing, token packs, and currencies" },
  manage_ledger: { label: "Redistributive Ledger", desc: "Manage equity partners and token allocations" },
  flush_cache: { label: "Flush Cache", desc: "Flush radar search cache and index keys" },
  manage_messages: { label: "Manage Messages", desc: "Read and manage 7-year user compliance messages" },
  manage_rbac: { label: "Manage RBAC", desc: "Configure role permissions matrix and assign roles" },
  manage_users: { label: "Manage Users", desc: "Inspect registered accounts and adjust token balances" },
  search_radar: { label: "Search AdRadarHQ", desc: "Perform Meta ad library intelligence searches" },
  ai_remix: { label: "AI Remix Studio", desc: "Generate generative ad variations using Gemini" },
  manage_brands: { label: "Manage Brands", desc: "Create, edit, and select brand profiles" },
};

interface ServiceCosts {
  searchStandard: number;
  searchProvenWinners?: number;
  searchExtendedDays: number;
  searchEliteScore: number;
  aiRemix: number;
  regenerateVariations?: number;
  brandClone?: number;
  customizeService?: number;
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
  monthlySubscription?: MonthlySubscriptionConfig;
  updatedAt?: string;
}

export interface SuperAdminModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: TabKey;
}

type TabKey = "CURRENCY" | "PRICING" | "PACKS" | "LEDGER" | "MESSAGES" | "RBAC" | "FAQS" | "DEV";

export function SuperAdminModal({ isOpen, onClose, initialTab }: SuperAdminModalProps) {
  const isClient = useIsClient();
  const { role, isSuperAdmin, setActingRole } = useSession();
  const isSuper = role === "superadmin";

  const allowedTabs = useMemo<TabKey[]>(() => {
    return isSuper
      ? ["CURRENCY", "PRICING", "PACKS", "LEDGER", "MESSAGES", "RBAC", "FAQS", "DEV"]
      : ["CURRENCY", "PRICING", "PACKS", "LEDGER", "MESSAGES", "FAQS"];
  }, [isSuper]);

  const [tab, setTab] = useState<TabKey>(initialTab ?? "CURRENCY");

  useEffect(() => {
    if (initialTab && isOpen) {
      if (allowedTabs.includes(initialTab)) {
        setTab(initialTab);
      } else {
        setTab("CURRENCY");
      }
    }
  }, [initialTab, isOpen, allowedTabs]);

  useEffect(() => {
    if (!allowedTabs.includes(tab)) {
      setTab("CURRENCY");
    }
  }, [tab, allowedTabs]);
  const [config, setConfig] = useState<AdminConfigData | null>(null);
  const [ledger, setLedger] = useState<RedistributiveLedgerSummary | null>(null);
  const [recentPurchases, setRecentPurchases] = useState<StripePurchaseRecord[]>([]);
  const [orderLedger, setOrderLedger] = useState<TokenTransactionDoc[]>([]);
  const [orderFilter, setOrderFilter] = useState<"ALL" | "SEARCH" | "STRIPE" | "SERVICES" | "GIFT_REFUND">("ALL");
  const [orderSearch, setOrderSearch] = useState("");
  const [confirmRefundTxId, setConfirmRefundTxId] = useState<string | null>(null);
  const [refundingTxId, setRefundingTxId] = useState<string | null>(null);
  const [giftEmail, setGiftEmail] = useState("");
  const [giftTokensInput, setGiftTokensInput] = useState("0");
  const [giftNote, setGiftNote] = useState("");
  const [gifting, setGifting] = useState(false);
  const [tokenActionMode, setTokenActionMode] = useState<"GIFT" | "DEDUCT" | "REFUND">("GIFT");
  const [confirmDeductOpen, setConfirmDeductOpen] = useState(false);
  const [selectedRefundTxId, setSelectedRefundTxId] = useState("");
  const [confirmTopRefundOpen, setConfirmTopRefundOpen] = useState(false);
  const [isMasterLedgerExpanded, setIsMasterLedgerExpanded] = useState(false);
  const [userBalanceSearch, setUserBalanceSearch] = useState("");
  const [userRowAction, setUserRowAction] = useState<{
    uid: string;
    email: string;
    mode: "ADD" | "MINUS" | "RESET";
    amountInput: string;
    confirmOpen: boolean;
  } | null>(null);
  const [userRowBusyUid, setUserRowBusyUid] = useState<string | null>(null);
  const [confirmResetLedgerOpen, setConfirmResetLedgerOpen] = useState(false);
  const [adminMessages, setAdminMessages] = useState<AdminMessage[]>([]);
  const [selectedMessage, setSelectedMessage] = useState<AdminMessage | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [confirmDeleteMessageId, setConfirmDeleteMessageId] = useState<string | null>(null);
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null);

  async function handleCopyMessageText(text: string, id: string) {
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
    setCopiedMessageId(id);
    setTimeout(() => {
      setCopiedMessageId((prev) => (prev === id ? null : prev));
    }, 2000);
  }

  // Superadmin Messaging Anyone state
  const [showComposeMessage, setShowComposeMessage] = useState(false);
  const [composeRecipientEmail, setComposeRecipientEmail] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [composeSending, setComposeSending] = useState(false);
  const [composeCustomizeRequestId, setComposeCustomizeRequestId] = useState<string | undefined>(undefined);
  const [aiStaffNotes, setAiStaffNotes] = useState("");
  const [aiDrafting, setAiDrafting] = useState(false);

  const composeHasLinks = LINK_URL_PATTERN.test(composeSubject) || LINK_URL_PATTERN.test(composeBody);

  // RBAC Matrix & Role Assignment state
  const [rbacMatrix, setRbacMatrix] = useState<RbacMatrix | null>(null);
  const [rbacUsers, setRbacUsers] = useState<RbacUserItem[]>([]);
  const [rbacLoading, setRbacLoading] = useState(false);
  const [rbacSaving, setRbacSaving] = useState(false);

  // Monthly Search Subscription Price State
  const [draftSubPrice, setDraftSubPrice] = useState<string | null>(null);
  const subSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [quickAssignEmail, setQuickAssignEmail] = useState("");
  const [quickAssignRole, setQuickAssignRole] = useState<Exclude<RbacRole, "superadmin">>("supporter");

  // FAQ Management state
  const [faqs, setFaqs] = useState<FaqItem[]>([]);
  const [faqsLoading, setFaqsLoading] = useState(false);
  const [faqsSaving, setFaqsSaving] = useState(false);
  const [showAddFaq, setShowAddFaq] = useState(false);
  const [confirmDeleteFaqId, setConfirmDeleteFaqId] = useState<string | null>(null);
  const [faqSearchQuery, setFaqSearchQuery] = useState("");
  const [faqCategoryFilter, setFaqCategoryFilter] = useState<string>("ALL");
  // All FAQs collapsed on start; expand when needed
  const [expandedAdminFaqIds, setExpandedAdminFaqIds] = useState<Set<string>>(() => new Set());
  const [adminRagEntries, setAdminRagEntries] = useState<RagSentenceItem[]>([]);
  const [newFaq, setNewFaq] = useState({
    question: "",
    answer: "",
    category: "General",
    order: 1,
    enabled: true,
  });
  const [editingFaqId, setEditingFaqId] = useState<string | null>(null);
  const [editFaqData, setEditFaqData] = useState<Partial<FaqItem>>({});

  const faqCategories = useMemo(() => {
    const set = new Set<string>();
    for (const f of faqs) {
      if (f.category) set.add(f.category);
    }
    return ["ALL", ...Array.from(set)];
  }, [faqs]);

  const filteredAdminFaqs = useMemo(() => {
    const q = faqSearchQuery.trim().toLowerCase();
    return faqs.filter((f) => {
      if (
        faqCategoryFilter !== "ALL" &&
        f.category.toUpperCase() !== faqCategoryFilter.toUpperCase()
      ) {
        return false;
      }
      if (!q) return true;
      return (
        f.question.toLowerCase().includes(q) ||
        f.answer.toLowerCase().includes(q) ||
        f.category.toLowerCase().includes(q)
      );
    });
  }, [faqs, faqCategoryFilter, faqSearchQuery]);

  function toggleAdminFaqExpand(faqId: string) {
    setExpandedAdminFaqIds((prev) => {
      const next = new Set(prev);
      if (next.has(faqId)) {
        next.delete(faqId);
      } else {
        next.add(faqId);
      }
      return next;
    });
  }

  async function reloadRagEntries() {
    try {
      const res = await fetch("/api/rag", { method: "GET", cache: "no-store" });
      const data = await res.json();
      if (res.ok && Array.isArray(data.entries)) {
        setAdminRagEntries(data.entries);
      }
    } catch {
      // Non-blocking
    }
  }

  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draftCostInputs, setDraftCostInputs] = useState<Record<string, string>>({});
  const costSaveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Pack delete confirmation
  const [confirmDeletePackId, setConfirmDeletePackId] = useState<string | null>(null);

  // Equity Partner delete confirmation
  const [confirmDeletePartnerId, setConfirmDeletePartnerId] = useState<string | null>(null);
  const [confirmResetPartnerId, setConfirmResetPartnerId] = useState<string | null>(null);
  const [resettingPartnerId, setResettingPartnerId] = useState<string | null>(null);

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
      const [data] = await Promise.all([
        apiFetch<{ faqs: FaqItem[] }>("/api/admin/faqs", { method: "GET" }),
        reloadRagEntries(),
      ]);
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

  async function reloadOrders() {
    try {
      const data = await apiFetch<{ orders: TokenTransactionDoc[] }>("/api/admin/orders", { method: "GET" });
      if (data.orders) setOrderLedger(data.orders);
    } catch {
      // Non-admin or orders not accessible
    }
  }

  async function handleGiftTokens(e: React.FormEvent) {
    e.preventDefault();
    const recipientEmail = giftEmail.trim().toLowerCase();
    const tokens = Math.round(Number(giftTokensInput) || 0);
    if (!recipientEmail) {
      setErrorMsg("Enter a customer email address to add tokens.");
      return;
    }
    if (tokens <= 0) {
      setErrorMsg("Token amount to add must be a positive integer (1 or more).");
      return;
    }

    setGifting(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const data = await apiFetch<{
        success: boolean;
        recipientEmail: string;
        tokens: number;
        newBalance: number;
        orders: TokenTransactionDoc[];
      }>("/api/admin/orders", {
        method: "POST",
        body: {
          action: "GIFT_TOKENS",
          recipientEmail,
          tokens,
          note: giftNote.trim() || undefined,
        },
      });
      if (data.orders) setOrderLedger(data.orders);
      setGiftNote("");
      setGiftTokensInput("0");
      const gifted = data.tokens ?? (data as Record<string, unknown>).creditedTokens ?? tokens;
      const bal = data.newBalance ?? (data as Record<string, unknown>).balanceAfter ?? 0;
      setStatusMsg(
        `Added +${Number(gifted).toLocaleString("en-AU")} tokens to ${recipientEmail} (new balance: ${Number(bal).toLocaleString("en-AU")} ⚡).`
      );
      setRbacUsers((prev) =>
        prev.map((u) => (u.email.toLowerCase() === recipientEmail ? { ...u, tokenBalance: Number(bal) } : u))
      );
      window.dispatchEvent(new CustomEvent("wallet-updated"));
    } catch (err) {
      setErrorMsg(errorMessage(err));
    } finally {
      setGifting(false);
    }
  }

  async function handleDeductTokens() {
    const recipientEmail = giftEmail.trim().toLowerCase();
    const tokens = Math.round(Number(giftTokensInput) || 0);
    if (!recipientEmail) {
      setErrorMsg("Enter a customer email address to remove tokens.");
      return;
    }
    if (tokens <= 0) {
      setErrorMsg("Token amount to remove must be a positive integer (1 or more).");
      return;
    }

    setGifting(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const data = await apiFetch<{
        success: boolean;
        deductedTokens?: number;
        balanceAfter?: number;
        orders: TokenTransactionDoc[];
      }>("/api/admin/orders", {
        method: "POST",
        body: {
          action: "DEDUCT_TOKENS",
          recipientEmail,
          tokens,
          note: giftNote.trim() || undefined,
        },
      });
      if (data.orders) setOrderLedger(data.orders);
      setConfirmDeductOpen(false);
      setGiftNote("");
      setGiftTokensInput("0");
      const deducted = data.deductedTokens ?? tokens;
      const balance = data.balanceAfter ?? 0;
      setStatusMsg(
        `Removed -${deducted.toLocaleString("en-AU")} tokens from ${recipientEmail}. New balance: ${balance.toLocaleString("en-AU")} ⚡.`
      );
      setRbacUsers((prev) =>
        prev.map((u) => (u.email.toLowerCase() === recipientEmail ? { ...u, tokenBalance: balance } : u))
      );
      window.dispatchEvent(new CustomEvent("wallet-updated"));
    } catch (err) {
      setErrorMsg(errorMessage(err));
    } finally {
      setGifting(false);
    }
  }

  async function handleRefundOrder(txId: string) {
    setRefundingTxId(txId);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const data = await apiFetch<{
        success: boolean;
        refundedTokens?: number;
        newBalance?: number;
        refundResult?: { balanceAfter: number };
        orders: TokenTransactionDoc[];
      }>("/api/admin/orders", {
        method: "POST",
        body: {
          action: "REFUND_ORDER",
          txId,
        },
      });
      if (data.orders) setOrderLedger(data.orders);
      setConfirmRefundTxId(null);
      setConfirmTopRefundOpen(false);
      setSelectedRefundTxId("");
      const refundedAmt = Number(data.refundedTokens ?? 0);
      const balAfter = Number(data.newBalance ?? data.refundResult?.balanceAfter ?? 0);
      setStatusMsg(
        `Refunded +${refundedAmt.toLocaleString("en-AU")} tokens to customer wallet (new balance: ${balAfter.toLocaleString("en-AU")} ⚡).`
      );
      window.dispatchEvent(new CustomEvent("wallet-updated"));
    } catch (err) {
      setErrorMsg(errorMessage(err));
    } finally {
      setRefundingTxId(null);
    }
  }

  async function handleUserRowConfirmAction() {
    if (!userRowAction) return;
    const { uid, email, mode, amountInput } = userRowAction;
    const cleanEmail = email.trim().toLowerCase();
    const targetUser = rbacUsers.find((u) => u.uid === uid || u.email.toLowerCase() === cleanEmail);
    const currentBal = Math.max(0, Math.round(Number(targetUser?.tokenBalance ?? 0)));

    setUserRowBusyUid(uid);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      if (mode === "ADD") {
        const tokens = Math.round(Number(amountInput) || 0);
        if (tokens <= 0) {
          setErrorMsg("Enter a positive integer of tokens to add (1 or more).");
          return;
        }
        const data = await apiFetch<{
          success: boolean;
          tokens?: number;
          newBalance?: number;
          balanceAfter?: number;
          orders?: TokenTransactionDoc[];
        }>("/api/admin/orders", {
          method: "POST",
          body: {
            action: "GIFT_TOKENS",
            recipientEmail: cleanEmail,
            tokens,
            note: "Added by Super Admin in User Token Balances table",
          },
        });
        const newBal = Math.max(0, Math.round(Number(data.newBalance ?? data.balanceAfter ?? currentBal + tokens)));
        if (data.orders) setOrderLedger(data.orders);
        setRbacUsers((prev) =>
          prev.map((u) => (u.uid === uid || u.email.toLowerCase() === cleanEmail ? { ...u, tokenBalance: newBal } : u))
        );
        setStatusMsg(
          `Added +${tokens.toLocaleString("en-AU")} tokens to ${cleanEmail} (new balance: ${newBal.toLocaleString("en-AU")} ⚡).`
        );
      } else if (mode === "MINUS") {
        const tokens = Math.round(Number(amountInput) || 0);
        if (tokens <= 0) {
          setErrorMsg("Enter a positive integer of tokens to minus (1 or more).");
          return;
        }
        if (currentBal <= 0) {
          setErrorMsg(`Account "${cleanEmail}" has 0 tokens. Nobody can have negative tokens.`);
          return;
        }
        if (tokens > currentBal) {
          setErrorMsg(
            `Cannot minus ${tokens.toLocaleString("en-AU")} tokens from "${cleanEmail}" (current balance: ${currentBal.toLocaleString("en-AU")} tokens). Nobody can have negative tokens.`
          );
          return;
        }
        const data = await apiFetch<{
          success: boolean;
          deductedTokens?: number;
          balanceAfter?: number;
          orders?: TokenTransactionDoc[];
        }>("/api/admin/orders", {
          method: "POST",
          body: {
            action: "DEDUCT_TOKENS",
            recipientEmail: cleanEmail,
            tokens,
            note: "Minused by Super Admin in User Token Balances table",
          },
        });
        const newBal = Math.max(0, Math.round(Number(data.balanceAfter ?? currentBal - tokens)));
        if (data.orders) setOrderLedger(data.orders);
        setRbacUsers((prev) =>
          prev.map((u) => (u.uid === uid || u.email.toLowerCase() === cleanEmail ? { ...u, tokenBalance: newBal } : u))
        );
        setStatusMsg(
          `Minused -${tokens.toLocaleString("en-AU")} tokens from ${cleanEmail} (new balance: ${newBal.toLocaleString("en-AU")} ⚡).`
        );
      } else if (mode === "RESET") {
        const data = await apiFetch<{
          success: boolean;
          clearedTokens?: number;
          balanceAfter?: number;
          orders?: TokenTransactionDoc[];
        }>("/api/admin/orders", {
          method: "POST",
          body: {
            action: "RESET_TOKENS",
            recipientEmail: cleanEmail,
            note: "Reset to 0 by Super Admin in User Token Balances table",
          },
        });
        if (data.orders) setOrderLedger(data.orders);
        setRbacUsers((prev) =>
          prev.map((u) => (u.uid === uid || u.email.toLowerCase() === cleanEmail ? { ...u, tokenBalance: 0 } : u))
        );
        const cleared = Math.max(0, Math.round(Number(data.clearedTokens ?? currentBal)));
        setStatusMsg(
          `Reset ${cleanEmail} token balance to 0 ⚡ (${cleared.toLocaleString("en-AU")} tokens cleared).`
        );
      }
      setUserRowAction(null);
      window.dispatchEvent(new CustomEvent("wallet-updated"));
    } catch (err) {
      setErrorMsg(errorMessage(err));
    } finally {
      setUserRowBusyUid(null);
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

      await Promise.all([reloadRbac(), reloadFaqs(), reloadOrders()]);
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
    reloadRagEntries();
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
      apiFetch<{ orders: TokenTransactionDoc[] }>("/api/admin/orders", { method: "GET" }).catch(() => null),
    ])
      .then(([adminData, msgData, rbacData, faqData, ordersData]) => {
        if (active) {
          setConfig(adminData.config);
          if (adminData.ledger) setLedger(adminData.ledger);
          if (adminData.recentPurchases) setRecentPurchases(adminData.recentPurchases);
          setIsAdmin(adminData.isAdmin);
          if (msgData?.messages) setAdminMessages(msgData.messages);
          if (rbacData?.matrix) setRbacMatrix(rbacData.matrix);
          if (rbacData?.users) setRbacUsers(rbacData.users);
          if (faqData?.faqs) setFaqs(faqData.faqs);
          if (ordersData?.orders) setOrderLedger(ordersData.orders);
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
    const optimisticNext: AdminConfigData = {
      ...config,
      ...patch,
      serviceCosts: {
        ...config.serviceCosts,
        ...(patch.serviceCosts ?? {}),
      },
    };
    setConfig(optimisticNext);
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

  async function handleResetPartnerTokens(partnerId: string, email: string) {
    setResettingPartnerId(partnerId);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const data = await apiFetch<{
        success: boolean;
        equityPartners: EquityPartner[];
        ledger: RedistributiveLedgerSummary;
        clearedTokens: number;
        partnerEmail: string;
      }>("/api/admin/config", {
        method: "PUT",
        body: {
          action: "RESET_PARTNER_TOKENS",
          partnerId,
        },
      });

      if (config) {
        setConfig({ ...config, equityPartners: data.equityPartners });
      }
      setLedger(data.ledger);
      setConfirmResetPartnerId(null);
      setStatusMsg(
        `Refreshed ${data.partnerEmail} to 0 tokens in the Owner Redistribution Breakdown (cleared ${data.clearedTokens.toLocaleString("en-AU")} ⚡ tokens).`
      );
      setRbacUsers((prev) =>
        prev.map((u) => (u.email.toLowerCase() === email.toLowerCase() ? { ...u, tokenBalance: 0 } : u))
      );
      window.dispatchEvent(new CustomEvent("wallet-updated"));
    } catch (err) {
      setErrorMsg(errorMessage(err));
    } finally {
      setResettingPartnerId(null);
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
      await reloadOrders();
      setStatusMsg("Simulated purchase (+500 tokens, $79.00 AUD) recorded to redistributive ledger.");
    } catch (err) {
      setErrorMsg(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleResetLedgerToZero() {
    setSaving(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const data = await apiFetch<{
        success: boolean;
        deletedCount: number;
        ledger: RedistributiveLedgerSummary;
        recentPurchases: StripePurchaseRecord[];
      }>("/api/admin/config", {
        method: "PUT",
        body: {
          action: "RESET_REDISTRIBUTIVE_LEDGER",
        },
      });
      setLedger(data.ledger);
      setRecentPurchases(data.recentPurchases);
      setConfirmResetLedgerOpen(false);
      await reloadOrders();
      setStatusMsg(
        `Redistributive ledger refreshed to zero (${data.deletedCount} transaction(s) archived). Total tokens: 0, Sum AUD: $0.00.`
      );
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
            ...(composeCustomizeRequestId
              ? { requestType: "customize_reply" as const, customizeRequestId: composeCustomizeRequestId }
              : {}),
          },
        }
      );
      if (data.messages) setAdminMessages(data.messages);
      setShowComposeMessage(false);
      setComposeRecipientEmail("");
      setComposeSubject("");
      setComposeBody("");
      setComposeCustomizeRequestId(undefined);
      setAiStaffNotes("");
      setStatusMsg(`Message delivered to ${data.message.recipientEmail} and recorded under 7-year statutory retention.`);
    } catch (err) {
      setErrorMsg(errorMessage(err));
    } finally {
      setComposeSending(false);
    }
  }

  async function handleGenerateAiWorkReply(targetMsg?: AdminMessage) {
    const msg = targetMsg || selectedMessage;
    const targetEmail = (msg?.senderEmail || composeRecipientEmail).trim();
    if (!targetEmail) {
      setErrorMsg("Select a customer message or enter a recipient email before running the AI reply designer.");
      return;
    }

    setAiDrafting(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const data = await apiFetch<{
        success: boolean;
        draft: { subject: string; body: string };
      }>("/api/admin/messages/ai-draft", {
        method: "POST",
        body: {
          messageId: msg?.messageId,
          customizeRequestId: msg?.customizeRequestId || composeCustomizeRequestId,
          customerEmail: targetEmail,
          subject: msg?.subject || composeSubject,
          customerBriefText: msg?.body || composeBody || composeSubject || "Customer customize request",
          staffNotes: aiStaffNotes.trim() || undefined,
        },
      });

      setComposeRecipientEmail(targetEmail);
      setComposeSubject(data.draft.subject);
      setComposeBody(data.draft.body);
      if (msg?.customizeRequestId) {
        setComposeCustomizeRequestId(msg.customizeRequestId);
      }
      setShowComposeMessage(true);
      setStatusMsg("AI Customized Reply Work Message generated! Review or edit below, then click Send Message.");
    } catch (err) {
      setErrorMsg(errorMessage(err));
    } finally {
      setAiDrafting(false);
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

  async function handleDeleteMessage(messageId: string) {
    setDeletingMessageId(messageId);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const data = await apiFetch<{ success: boolean; deletedMessageId: string; messages: AdminMessage[] }>(
        "/api/admin/messages",
        {
          method: "DELETE",
          body: { messageId },
        }
      );
      setAdminMessages(data.messages);
      if (selectedMessage?.messageId === messageId) {
        setSelectedMessage(null);
      }
      setConfirmDeleteMessageId(null);
      setStatusMsg(`Message (${messageId}) permanently deleted from the Firestore database.`);
    } catch (err) {
      setErrorMsg(errorMessage(err));
    } finally {
      setDeletingMessageId(null);
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
                {isSuper ? "Super Admin Panel" : "Main Admin Panel"}
              </h2>
              <p className="text-[11px] text-on-surface-variant font-mono">
                {isSuper
                  ? "AdRadarHQ System Configuration, Redistributive Ledger & 7-Year Archive"
                  : "AdRadarHQ System Configuration, User Messages & FAQ Development"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isSuperAdmin && (
              <div className="hidden sm:flex items-center gap-1 rounded-xl bg-surface-container p-1 border border-white/[0.08] font-mono text-[10px]">
                <button
                  type="button"
                  onClick={() => setActingRole("superadmin")}
                  className={`rounded-lg px-2.5 py-1 font-semibold transition ${
                    role === "superadmin"
                      ? "bg-primary text-on-primary shadow-sm"
                      : "text-on-surface-variant hover:text-on-surface"
                  }`}
                  data-testid="modal-view-superadmin"
                >
                  Super Admin (8 tabs)
                </button>
                <button
                  type="button"
                  onClick={() => setActingRole("admin")}
                  className={`rounded-lg px-2.5 py-1 font-semibold transition ${
                    role === "admin"
                      ? "bg-primary text-on-primary shadow-sm"
                      : "text-on-surface-variant hover:text-on-surface"
                  }`}
                  data-testid="modal-view-mainadmin"
                >
                  Main Admin (5 tabs)
                </button>
              </div>
            )}
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
          aria-label={isSuper ? "Superadmin Navigation" : "Main Admin Navigation"}
          data-testid="superadmin-navbar"
          className="border-b border-white/[0.08] bg-surface-container p-2 sm:px-5 sm:py-2.5 shrink-0"
        >
          <div
            className={`grid grid-cols-2 gap-1.5 ${
              isSuper ? "sm:grid-cols-4 lg:grid-cols-8" : "sm:grid-cols-3 lg:grid-cols-5"
            } sm:gap-2 lg:gap-1.5`}
          >
            {[
              { id: "CURRENCY" as const, label: "Currency Controls", icon: "sliders" as IconName },
              { id: "PRICING" as const, label: "Service Pricing", icon: "zap" as IconName },
              { id: "PACKS" as const, label: "Token Packs (CRUD)", icon: "plus" as IconName },
              { id: "LEDGER" as const, label: "Token Controls & Ledger", icon: "wallet" as IconName },
              {
                id: "MESSAGES" as const,
                label: `User Messages (${adminMessages.filter((m) => m.status === "unread").length})`,
                icon: "user" as IconName,
              },
              { id: "RBAC" as const, label: "RBAC Matrix & Roles", icon: "shield" as IconName },
              {
                id: "FAQS" as const,
                label: `FAQ Development (${faqs.length})`,
                icon: "sparkles" as IconName,
              },
              { id: "DEV" as const, label: "Developer Diagnostics", icon: "flask" as IconName },
            ]
              .filter((t) => allowedTabs.includes(t.id))
              .map((t) => {
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
                              searchProvenWinners: 0,
                              searchExtendedDays: 0,
                              searchEliteScore: 0,
                              aiRemix: 0,
                              regenerateVariations: 0,
                              brandClone: 0,
                              customizeService: 0,
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
                              searchStandard: 1,
                              searchProvenWinners: 1,
                              searchExtendedDays: 1,
                              searchEliteScore: 1,
                              aiRemix: 1,
                              regenerateVariations: 1,
                              brandClone: 1,
                              customizeService: 55,
                            },
                          })
                        }
                        className={btnPrimary}
                      >
                        Standard Paid Rates (1 tok each)
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
                        key: "searchProvenWinners" as const,
                        label: "Proven Winners (28+d) Surcharge",
                        desc: "Additional tokens for filtering battle-tested 28+ day proven winner ads",
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
                      {
                        key: "regenerateVariations" as const,
                        label: "Regenerate Variations",
                        desc: "Regenerate fresh angles & 3 script variations for an existing deconstructed ad in Remix Studio",
                      },
                      {
                        key: "brandClone" as const,
                        label: "Global Brand Card Copy",
                        desc: "Token fee to copy a community brand card from the Global Library into personal account",
                      },
                      {
                        key: "customizeService" as const,
                        label: "Professional Customize Service",
                        desc: "Customer submits full brand brief + extra details for SuperAdmin & Main Admin strategy reply (Default: 45 tokens)",
                      },
                    ].map(({ key, label: serviceLabel, desc }) => {
                      const defaultTok = key === "customizeService" ? 55 : 0;
                      const tok = config.serviceCosts[key] ?? defaultTok;
                      const displayVal = draftCostInputs[key] !== undefined ? draftCostInputs[key] : String(tok);
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
                              onClick={() => {
                                if (costSaveTimersRef.current[key]) clearTimeout(costSaveTimersRef.current[key]);
                                setDraftCostInputs((prev) => {
                                  const next = { ...prev };
                                  delete next[key];
                                  return next;
                                });
                                saveConfig({
                                  serviceCosts: {
                                    ...config.serviceCosts,
                                    [key]: Math.max(0, tok - 1),
                                  },
                                });
                              }}
                              className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-surface-container-highest font-mono text-sm font-bold text-on-surface hover:border-primary/40 hover:text-primary disabled:opacity-40"
                            >
                              -
                            </button>
                            <input
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              data-testid={`service-cost-input-${key}`}
                              value={displayVal}
                              onChange={(e) => {
                                const raw = e.target.value.replace(/[^0-9]/g, "");
                                setDraftCostInputs((prev) => ({ ...prev, [key]: raw }));
                                const val = raw === "" ? 0 : Math.max(0, Math.round(Number(raw) || 0));
                                setConfig((prev) =>
                                  prev
                                    ? {
                                        ...prev,
                                        serviceCosts: {
                                          ...prev.serviceCosts,
                                          [key]: val,
                                        },
                                      }
                                    : prev
                                );
                                if (costSaveTimersRef.current[key]) {
                                  clearTimeout(costSaveTimersRef.current[key]);
                                }
                                costSaveTimersRef.current[key] = setTimeout(() => {
                                  setDraftCostInputs((prev) => {
                                    const next = { ...prev };
                                    delete next[key];
                                    return next;
                                  });
                                  saveConfig({
                                    serviceCosts: {
                                      ...config.serviceCosts,
                                      [key]: val,
                                    },
                                  });
                                }, 800);
                              }}
                              onBlur={() => {
                                if (draftCostInputs[key] === undefined) return;
                                if (costSaveTimersRef.current[key]) {
                                  clearTimeout(costSaveTimersRef.current[key]);
                                }
                                const raw = draftCostInputs[key];
                                const val = raw === "" ? 0 : Math.max(0, Math.round(Number(raw) || 0));
                                setDraftCostInputs((prev) => {
                                  const next = { ...prev };
                                  delete next[key];
                                  return next;
                                });
                                saveConfig({
                                  serviceCosts: {
                                    ...config.serviceCosts,
                                    [key]: val,
                                  },
                                });
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  (e.currentTarget as HTMLInputElement).blur();
                                }
                              }}
                              className={`${field} text-center font-mono`}
                            />
                            <button
                              type="button"
                              aria-label={`Increase ${serviceLabel} tokens`}
                              disabled={saving}
                              onClick={() => {
                                if (costSaveTimersRef.current[key]) clearTimeout(costSaveTimersRef.current[key]);
                                setDraftCostInputs((prev) => {
                                  const next = { ...prev };
                                  delete next[key];
                                  return next;
                                });
                                saveConfig({
                                  serviceCosts: {
                                    ...config.serviceCosts,
                                    [key]: tok + 1,
                                  },
                                });
                              }}
                              className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-surface-container-highest font-mono text-sm font-bold text-on-surface hover:border-primary/40 hover:text-primary disabled:opacity-40"
                            >
                              +
                            </button>
                            <span className="text-compact text-on-surface-variant whitespace-nowrap font-mono">
                              tokens
                            </span>
                          </div>
                          <div className="flex items-center justify-between pt-1 border-t border-white/[0.06] font-mono text-[11px] text-outline">
                            <span>AU/NZ: {tok === 0 ? "Free ($0 AUD)" : `${formatAud(audCents)} AUD`}</span>
                            <span>Intl: {tok === 0 ? "Free" : `≈ ${formatUsd(usdCents)} USD`}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* MONTHLY SEARCH SUBSCRIPTION CONFIGURATION */}
                  <div className="mt-8 rounded-xl border border-primary/30 bg-gradient-to-br from-primary/10 via-surface-container-high to-surface-container p-5 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className="flex size-10 items-center justify-center rounded-xl border border-primary-container/40 bg-primary-container/20 text-primary">
                          <Icon name="sparkles" className="size-5" />
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-title-sm font-bold text-on-surface">
                              Monthly Search Subscription (SuperAdmin &amp; MainAdmin)
                            </h4>
                            <span className="rounded bg-primary/20 px-2 py-0.5 font-mono text-[10px] font-bold text-primary uppercase">
                              Privileged Tier
                            </span>
                          </div>
                          <p className="mt-0.5 text-compact text-on-surface-variant">
                            1,000 monthly searches advertised next to FAQs in the top header (SuperAdmin &amp; MainAdmin view only).
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-surface-container-lowest/80 px-3 py-1 font-mono text-xs font-semibold text-primary border border-white/10">
                          1,000 Searches / mo
                        </span>
                      </div>
                    </div>

                    <div className="rounded-lg border border-primary/20 bg-surface-container-lowest/70 p-3 font-mono text-xs text-on-surface leading-relaxed">
                      <span className="font-bold text-primary">Value Proposition: </span>
                      Options for every search: Every option is one token. This gives you 1,000 of those. Can also be used to pay for Customize your Brand Strategy with Professional Experts ({config.serviceCosts?.customizeService ?? 55} {(config.serviceCosts?.customizeService ?? 55) === 1 ? "token" : "tokens"}).
                    </div>

                    <div className="rounded-lg border border-secondary/30 bg-secondary/10 p-3 font-mono text-xs text-on-surface leading-relaxed">
                      <div className="flex items-center gap-2 mb-1">
                        <Icon name="sliders" className="size-4 text-secondary" />
                        <span className="font-bold text-secondary uppercase tracking-wider">
                          SuperAdmin &amp; MainAdmin Controls
                        </span>
                      </div>
                      The monthly price is currently set to <strong>{formatAud(Math.round((config.monthlySubscription?.priceAud ?? 500) * 100))} AUD/month</strong>. Super Admin and Main Admin can adjust the price at any time directly through the Admin Control Panel in Service Pricing.
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 pt-2">
                      <div className="rounded-xl border border-white/10 bg-surface-container p-4 space-y-2">
                        <label className={label}>Monthly Subscription Fee (AUD $)</label>
                        <p className="text-[11px] text-on-surface-variant">
                          Change the monthly subscription amount at any time. Changes apply to the Stripe Checkout price and system ledger.
                        </p>
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            type="button"
                            aria-label="Decrease subscription price by $25"
                            disabled={saving}
                            onClick={() => {
                              const curr = config.monthlySubscription?.priceAud ?? 500;
                              const nextVal = Math.max(1, curr - 25);
                              setDraftSubPrice(null);
                              saveConfig({
                                monthlySubscription: {
                                  ...(config.monthlySubscription ?? { searchesPerMonth: 1000, enabled: true, name: "Monthly Search Subscription", description: "" }),
                                  priceAud: nextVal,
                                },
                              });
                            }}
                            className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-surface-container-highest font-mono text-sm font-bold text-on-surface hover:border-primary/40 hover:text-primary disabled:opacity-40"
                          >
                            -
                          </button>
                          <input
                            type="text"
                            inputMode="numeric"
                            aria-label="Monthly Subscription Price in AUD"
                            data-testid="sub-price-input"
                            data-agent-id="sub-price-input"
                            value={draftSubPrice !== null ? draftSubPrice : String(config.monthlySubscription?.priceAud ?? 500)}
                            onChange={(e) => {
                              const raw = e.target.value.replace(/[^0-9]/g, "");
                              setDraftSubPrice(raw);
                              const val = raw === "" ? 1 : Math.max(1, Math.round(Number(raw) || 1));
                              if (subSaveTimerRef.current) clearTimeout(subSaveTimerRef.current);
                              subSaveTimerRef.current = setTimeout(() => {
                                setDraftSubPrice(null);
                                saveConfig({
                                  monthlySubscription: {
                                    ...(config.monthlySubscription ?? { searchesPerMonth: 1000, enabled: true, name: "Monthly Search Subscription", description: "" }),
                                    priceAud: val,
                                  },
                                });
                              }, 800);
                            }}
                            onBlur={() => {
                              if (draftSubPrice === null) return;
                              if (subSaveTimerRef.current) clearTimeout(subSaveTimerRef.current);
                              const val = draftSubPrice === "" ? 1 : Math.max(1, Math.round(Number(draftSubPrice) || 1));
                              setDraftSubPrice(null);
                              saveConfig({
                                monthlySubscription: {
                                  ...(config.monthlySubscription ?? { searchesPerMonth: 1000, enabled: true, name: "Monthly Search Subscription", description: "" }),
                                  priceAud: val,
                                },
                              });
                            }}
                            className={`${field} text-center font-mono`}
                          />
                          <button
                            type="button"
                            aria-label="Increase subscription price by $25"
                            disabled={saving}
                            onClick={() => {
                              const curr = config.monthlySubscription?.priceAud ?? 500;
                              const nextVal = curr + 25;
                              setDraftSubPrice(null);
                              saveConfig({
                                monthlySubscription: {
                                  ...(config.monthlySubscription ?? { searchesPerMonth: 1000, enabled: true, name: "Monthly Search Subscription", description: "" }),
                                  priceAud: nextVal,
                                },
                              });
                            }}
                            className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-surface-container-highest font-mono text-sm font-bold text-on-surface hover:border-primary/40 hover:text-primary disabled:opacity-40"
                          >
                            +
                          </button>
                          <span className="font-mono text-xs font-semibold text-on-surface-variant whitespace-nowrap">
                            AUD / mo
                          </span>
                        </div>
                      </div>

                      <div className="rounded-xl border border-white/10 bg-surface-container p-4 space-y-2">
                        <span className="font-mono text-xs font-semibold text-on-surface">Dual-Currency Rate Breakdown</span>
                        <div className="space-y-1.5 pt-1 text-xs font-mono">
                          <div className="flex items-center justify-between text-on-surface">
                            <span>Australia (AUD + GST):</span>
                            <span className="font-bold text-primary">
                              {formatAud(Math.round((config.monthlySubscription?.priceAud ?? 500) * 100))} + 10% GST / mo
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-on-surface">
                            <span>New Zealand (AUD · No GST):</span>
                            <span className="font-bold text-primary">
                              {formatAud(Math.round((config.monthlySubscription?.priceAud ?? 500) * 100))} / mo
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-on-surface-variant">
                            <span>International (USD · No Tax):</span>
                            <span>
                              ≈ {formatUsd(audToUsdCents(Math.round((config.monthlySubscription?.priceAud ?? 500) * 100)))} / mo
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-outline pt-1 border-t border-white/[0.06]">
                            <span>Searches Allowance:</span>
                            <span className="font-bold text-on-surface">1,000 searches/mo</span>
                          </div>
                        </div>
                      </div>
                    </div>
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

              {/* TAB 4: TOKEN CONTROLS & LEDGER (Super Admin & Main Admin) */}
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
                    <div className="flex items-center gap-2 shrink-0 flex-wrap">
                      <button
                        type="button"
                        onClick={() => setConfirmResetLedgerOpen(true)}
                        disabled={saving || ((ledger?.totalTokens ?? 0) === 0 && (ledger?.totalPurchasesCount ?? 0) === 0)}
                        className={`${btnDanger} text-xs py-1.5 px-3 flex items-center gap-1.5`}
                        title="Refresh redistributive ledger to zero (requires confirmation)"
                        data-agent-id="reset-ledger-button"
                        data-testid="reset-ledger-button"
                        aria-label="Refresh Redistributive Ledger to 0"
                      >
                        <Icon name="refresh" className="size-3.5" />
                        Refresh Ledger to 0
                      </button>
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

                  {/* CONFIRMATION BANNER FOR REFRESH REDISTRIBUTIVE LEDGER TO 0 */}
                  {confirmResetLedgerOpen && (
                    <div
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-error/50 bg-error/10 p-3.5 animate-fadeIn"
                      data-agent-id="confirm-reset-ledger-dialog"
                      data-testid="confirm-reset-ledger-dialog"
                      role="alert"
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon name="alert" className="size-5 text-error shrink-0" />
                        <div className="font-mono text-xs text-on-surface">
                          <p className="font-bold text-error">Confirm Refreshing Redistributive Ledger to Zero?</p>
                          <p className="text-on-surface-variant text-[11px] mt-0.5">
                            This will refresh Total Tokens (<strong className="text-primary">{(ledger?.totalTokens ?? 0).toLocaleString("en-AU")}</strong>), Sum Amount (<strong className="text-on-surface">{formatAud(ledger?.totalGrossAudCents ?? ledger?.totalGrossCents ?? 0)} AUD</strong> / <strong className="text-on-surface">{formatUsd(ledger?.totalGrossUsdCents ?? Math.round((ledger?.totalGrossCents ?? 0) * 0.65))} USD</strong>), and clear <strong className="text-on-surface">{ledger?.totalPurchasesCount ?? 0} transaction(s)</strong> to 0. Historical records are preserved in archive.
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => setConfirmResetLedgerOpen(false)}
                          className={`${btnSecondary} text-xs py-1.5 px-3`}
                          data-agent-id="cancel-reset-ledger-button"
                          data-testid="cancel-reset-ledger-button"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleResetLedgerToZero}
                          disabled={saving}
                          className={`${btnDanger} text-xs py-1.5 px-3 font-bold`}
                          data-agent-id="confirm-reset-ledger-button"
                          data-testid="confirm-reset-ledger-button"
                        >
                          {saving ? "Refreshing..." : "Confirm Refresh to 0"}
                        </button>
                      </div>
                    </div>
                  )}

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
                                      <div>⚡ {dist.ownedTokens.toLocaleString("en-AU")}</div>
                                      {partner.lastResetAt && (
                                        <div className="text-[9px] font-mono text-secondary">
                                          {dist.ownedTokens === 0 ? "Refreshed to 0" : `Reset ${new Date(partner.lastResetAt).toLocaleDateString("en-AU")}`}
                                        </div>
                                      )}
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
                                    <td className="px-3 py-2 text-right whitespace-nowrap">
                                      <div className="flex items-center justify-end gap-1.5">
                                        {/* Refresh to 0 Tokens Button with 2-Step Confirmation */}
                                        {confirmResetPartnerId === dist.partnerId ? (
                                          <div className="flex items-center gap-1 animate-fadeIn">
                                            <button
                                              type="button"
                                              disabled={resettingPartnerId === dist.partnerId}
                                              onClick={() => handleResetPartnerTokens(dist.partnerId, dist.email)}
                                              data-testid={`confirm-reset-partner-${dist.partnerId}`}
                                              data-agent-id={`confirm-reset-partner-${dist.partnerId}`}
                                              aria-label={`Confirm refresh ${dist.email} to 0 tokens`}
                                              className="inline-flex items-center gap-1 rounded border border-amber-500/60 bg-amber-500/25 px-2 py-0.5 font-mono text-[10px] font-bold text-amber-200 hover:bg-amber-500/35 disabled:opacity-50 transition"
                                            >
                                              <Icon
                                                name="refresh"
                                                className={`size-2.5 ${resettingPartnerId === dist.partnerId ? "animate-spin" : ""}`}
                                              />
                                              <span>{resettingPartnerId === dist.partnerId ? "Resetting…" : "Confirm 0 ⚡"}</span>
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => setConfirmResetPartnerId(null)}
                                              className="rounded border border-white/10 bg-surface-container-highest px-1.5 py-0.5 font-mono text-[10px] text-on-surface-variant hover:text-on-surface"
                                            >
                                              Cancel
                                            </button>
                                          </div>
                                        ) : (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setConfirmResetPartnerId(dist.partnerId);
                                              setConfirmDeletePartnerId(null);
                                            }}
                                            data-testid={`reset-partner-tokens-${dist.partnerId}`}
                                            data-agent-id={`reset-partner-tokens-${dist.partnerId}`}
                                            aria-label={`Refresh ${dist.email} to 0 tokens`}
                                            className="inline-flex items-center gap-1 rounded border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-amber-300 hover:bg-amber-500/20 hover:border-amber-500/50 transition"
                                            title={`Refresh ${dist.email} to 0 tokens`}
                                          >
                                            <Icon name="refresh" className="size-2.5" />
                                            <span>Reset 0 ⚡</span>
                                          </button>
                                        )}

                                        {/* Delete Partner Button with 2-Step Confirmation */}
                                        {confirmDeletePartnerId === dist.partnerId ? (
                                          <div className="flex items-center gap-1 animate-fadeIn">
                                            <button
                                              type="button"
                                              onClick={() => handleDeletePartner(dist.partnerId)}
                                              className={`${btnDanger} px-2 py-0.5 text-[10px]`}
                                              data-testid={`confirm-delete-partner-${dist.partnerId}`}
                                              data-agent-id={`confirm-delete-partner-${dist.partnerId}`}
                                              aria-label={`Confirm delete partner ${dist.email}`}
                                            >
                                              Confirm
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => setConfirmDeletePartnerId(null)}
                                              className={`${btnSecondary} px-1.5 py-0.5 text-[10px]`}
                                            >
                                              Cancel
                                            </button>
                                          </div>
                                        ) : (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setConfirmDeletePartnerId(dist.partnerId);
                                              setConfirmResetPartnerId(null);
                                            }}
                                            className="text-error hover:text-error/80 font-mono text-[10px] underline ml-1"
                                            data-testid={`delete-partner-${dist.partnerId}`}
                                            data-agent-id={`delete-partner-${dist.partnerId}`}
                                            aria-label={`Delete partner ${dist.email}`}
                                          >
                                            Delete
                                          </button>
                                        )}
                                      </div>
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

              {/* SUPER ADMIN TOKEN CONTROLS: ADD TOKENS, REMOVE TOKENS & REFUND TOKENS ONLY */}
              {isSuper && (
                <div
                  className={`${card} p-4 border border-primary/30 bg-primary/[0.03] space-y-3.5`}
                  data-agent-id="user-token-management-card"
                  data-testid="user-token-management-card"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Icon name="sparkles" className="size-4 text-primary" />
                        <h4 className="text-compact font-bold text-on-surface">
                          Super Admin Token Controls (Add Tokens, Remove Tokens &amp; Refund Tokens Only)
                        </h4>
                        <span className="rounded-full bg-primary/15 px-2 py-0.5 font-mono text-[10px] font-semibold text-primary">
                          Super Admin Only
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-on-surface-variant">
                        Super Admin exclusive controls: Add tokens, remove tokens, or refund tokens on any deduction order.
                      </p>
                    </div>

                    {/* Action Mode Toggle: Add Tokens | Remove Tokens | Refund Tokens ONLY */}
                    <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-surface-container-high/60 p-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setTokenActionMode("GIFT");
                          setConfirmDeductOpen(false);
                          setConfirmTopRefundOpen(false);
                        }}
                        data-agent-id="token-mode-gift-btn"
                        data-testid="token-mode-gift-btn"
                        aria-label="Add Tokens Mode"
                        className={`flex items-center gap-1 rounded-lg px-2.5 py-1 font-mono text-[11px] font-semibold transition ${
                          tokenActionMode === "GIFT"
                            ? "bg-primary text-on-primary shadow-sm"
                            : "text-on-surface-variant hover:text-on-surface"
                        }`}
                      >
                        <Icon name="plus" className="size-3" />
                        <span>Add Tokens</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setTokenActionMode("DEDUCT");
                          setConfirmDeductOpen(false);
                          setConfirmTopRefundOpen(false);
                        }}
                        data-agent-id="token-mode-deduct-btn"
                        data-testid="token-mode-deduct-btn"
                        aria-label="Remove Tokens Mode"
                        className={`flex items-center gap-1 rounded-lg px-2.5 py-1 font-mono text-[11px] font-semibold transition ${
                          tokenActionMode === "DEDUCT"
                            ? "bg-warning text-black shadow-sm font-bold"
                            : "text-on-surface-variant hover:text-on-surface"
                        }`}
                      >
                        <Icon name="trash" className="size-3" />
                        <span>Remove Tokens</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setTokenActionMode("REFUND");
                          setConfirmDeductOpen(false);
                          setConfirmTopRefundOpen(false);
                        }}
                        data-agent-id="token-mode-refund-btn"
                        data-testid="token-mode-refund-btn"
                        aria-label="Refund Tokens Mode"
                        className={`flex items-center gap-1 rounded-lg px-2.5 py-1 font-mono text-[11px] font-semibold transition ${
                          tokenActionMode === "REFUND"
                            ? "bg-amber-400 text-black shadow-sm font-bold"
                            : "text-on-surface-variant hover:text-on-surface"
                        }`}
                      >
                        <Icon name="refresh" className="size-3" />
                        <span>Refund Tokens</span>
                      </button>
                    </div>
                  </div>

                  {/* Quick Presets */}
                  {tokenActionMode === "GIFT" && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-mono text-outline">Quick Add Presets:</span>
                      {[10, 45, 100, 500, 1000].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setGiftTokensInput(String(preset))}
                          className={`rounded-lg border px-2.5 py-1 font-mono text-[11px] font-semibold transition ${
                            Math.round(Number(giftTokensInput) || 0) === preset
                              ? "border-primary bg-primary/20 text-primary"
                              : "border-white/10 bg-surface-container-highest text-on-surface-variant hover:border-primary/40 hover:text-on-surface"
                          }`}
                          data-testid={`gift-preset-${preset}`}
                        >
                          +{preset} ⚡
                        </button>
                      ))}
                    </div>
                  )}

                  {tokenActionMode === "DEDUCT" && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-mono text-outline">Quick Remove Presets:</span>
                      {[5, 10, 25, 50, 100].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setGiftTokensInput(String(preset))}
                          className={`rounded-lg border px-2.5 py-1 font-mono text-[11px] font-semibold transition ${
                            Math.round(Number(giftTokensInput) || 0) === preset
                              ? "border-warning bg-warning/20 text-warning"
                              : "border-white/10 bg-surface-container-highest text-on-surface-variant hover:border-warning/40 hover:text-on-surface"
                          }`}
                          data-testid={`deduct-preset-${preset}`}
                        >
                          -{preset} ⚡
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Target User Peek */}
                  {giftEmail && (
                    <div className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-surface-container-high/50 px-3 py-1.5 font-mono text-xs">
                      <span className="text-on-surface-variant">Target User:</span>
                      <span className="font-semibold text-on-surface">{giftEmail}</span>
                      <span className="text-white/20">•</span>
                      <span className="text-on-surface-variant">Current Balance:</span>
                      <span className="font-bold text-primary">
                        ⚡ {(rbacUsers.find((u) => u.email.toLowerCase() === giftEmail.trim().toLowerCase())?.tokenBalance ?? 0).toLocaleString("en-AU")} tokens
                      </span>
                    </div>
                  )}

                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (tokenActionMode === "GIFT") {
                        handleGiftTokens(e);
                      } else if (tokenActionMode === "DEDUCT") {
                        setConfirmDeductOpen(true);
                      } else if (tokenActionMode === "REFUND") {
                        if (!selectedRefundTxId) {
                          setErrorMsg("Select a deduction order to refund tokens.");
                          return;
                        }
                        setConfirmTopRefundOpen(true);
                      }
                    }}
                    className="space-y-3"
                  >
                    {tokenActionMode !== "REFUND" ? (
                      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-12 items-end">
                        <div className="sm:col-span-4">
                          <label className={label}>Customer Email *</label>
                          <input
                            type="email"
                            required
                            list="gift-registered-users-list"
                            placeholder="customer@example.com"
                            value={giftEmail}
                            onChange={(e) => {
                              setGiftEmail(e.target.value);
                              setConfirmDeductOpen(false);
                            }}
                            className={field}
                            data-agent-id="gift-recipient-email-input"
                            data-testid="gift-recipient-email-input"
                          />
                          <datalist id="gift-registered-users-list">
                            {rbacUsers.map((u) => (
                              <option key={u.uid} value={u.email}>
                                {u.email} (Balance: {u.tokenBalance ?? 0} ⚡)
                              </option>
                            ))}
                          </datalist>
                        </div>

                        <div className="sm:col-span-2">
                          <label className={label}>
                            {tokenActionMode === "GIFT" ? "Tokens to Add *" : "Tokens to Remove *"}
                          </label>
                          <input
                            id="gift-tokens-amount-input"
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            required
                            value={giftTokensInput}
                            onFocus={(e) => e.target.select()}
                            onChange={(e) => {
                              setGiftTokensInput(e.target.value.replace(/[^0-9]/g, ""));
                              setConfirmDeductOpen(false);
                            }}
                            className={`${field} font-mono text-center`}
                            data-agent-id="gift-tokens-amount-input"
                            data-testid="gift-tokens-amount-input"
                          />
                        </div>

                        <div className="sm:col-span-4">
                          <label className={label}>Reason / Audit Note (Optional)</label>
                          <input
                            type="text"
                            maxLength={200}
                            placeholder={
                              tokenActionMode === "GIFT"
                                ? "e.g. VIP onboarding credit / promo bonus"
                                : "e.g. Manual adjustment / token removal"
                            }
                            value={giftNote}
                            onChange={(e) => setGiftNote(e.target.value)}
                            className={field}
                            data-agent-id="gift-tokens-note-input"
                            data-testid="gift-tokens-note-input"
                          />
                        </div>

                        <div className="sm:col-span-2">
                          {tokenActionMode === "GIFT" && (
                            <button
                              type="submit"
                              disabled={gifting}
                              className={`${btnPrimary} w-full justify-center`}
                              data-agent-id="submit-gift-tokens-button"
                              data-testid="submit-gift-tokens-button"
                            >
                              <Icon name="plus" className="size-3.5" />
                              {gifting ? "Adding..." : "Add Tokens"}
                            </button>
                          )}

                          {tokenActionMode === "DEDUCT" && !confirmDeductOpen && (
                            <button
                              type="button"
                              onClick={() => {
                                if (!giftEmail.trim()) {
                                  setErrorMsg("Enter a customer email to remove tokens.");
                                  return;
                                }
                                const amt = Number(giftTokensInput);
                                if (isNaN(amt) || amt <= 0) {
                                  setErrorMsg("Enter a valid number of tokens to remove (1 or more).");
                                  return;
                                }
                                const targetUser = rbacUsers.find(
                                  (u) => u.email.toLowerCase() === giftEmail.trim().toLowerCase()
                                );
                                const targetBalance = Math.max(0, targetUser?.tokenBalance ?? 0);
                                if (targetUser && targetBalance <= 0) {
                                  setErrorMsg(
                                    `Account "${giftEmail.trim()}" has 0 tokens. Nobody can have negative tokens — all users at 0 tokens must buy more tokens.`
                                  );
                                  return;
                                }
                                if (targetUser && amt > targetBalance) {
                                  setErrorMsg(
                                    `Cannot remove ${amt.toLocaleString("en-AU")} tokens from "${giftEmail.trim()}" (current balance: ${targetBalance.toLocaleString("en-AU")} tokens). Nobody can have negative tokens.`
                                  );
                                  return;
                                }
                                setConfirmDeductOpen(true);
                              }}
                              disabled={gifting}
                              className={`${btnSecondary} w-full justify-center text-warning hover:border-warning/50`}
                              data-agent-id="trigger-deduct-tokens-button"
                              data-testid="trigger-deduct-tokens-button"
                            >
                              <Icon name="trash" className="size-3.5" />
                              Remove Tokens
                            </button>
                          )}
                        </div>
                      </div>
                    ) : (
                      /* REFUND TOKENS MODE */
                      (() => {
                        const emailQ = giftEmail.trim().toLowerCase();
                        const refundableOrders = orderLedger.filter(
                          (tx) =>
                            tx.delta < 0 &&
                            !tx.refunded &&
                            (!emailQ || (tx.email || "").toLowerCase().includes(emailQ))
                        );
                        const selectedOrder = refundableOrders.find((tx) => tx.txId === selectedRefundTxId);

                        return (
                          <div className="space-y-3">
                            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-12 items-end">
                              <div className="sm:col-span-4">
                                <label className={label}>Filter by Customer Email (Optional)</label>
                                <input
                                  type="text"
                                  list="gift-registered-users-list"
                                  placeholder="All customers or filter email..."
                                  value={giftEmail}
                                  onChange={(e) => {
                                    setGiftEmail(e.target.value);
                                    setConfirmTopRefundOpen(false);
                                  }}
                                  className={field}
                                  data-agent-id="refund-filter-email-input"
                                  data-testid="refund-filter-email-input"
                                />
                              </div>

                              <div className="sm:col-span-6">
                                <label className={label}>
                                  Select Deduction Order to Refund ({refundableOrders.length} eligible) *
                                </label>
                                <select
                                  value={selectedRefundTxId}
                                  onChange={(e) => {
                                    setSelectedRefundTxId(e.target.value);
                                    setConfirmTopRefundOpen(false);
                                  }}
                                  className={`${field} font-mono text-xs`}
                                  data-agent-id="refund-order-select"
                                  data-testid="refund-order-select"
                                >
                                  <option value="">-- Choose a deduction order to refund tokens --</option>
                                  {refundableOrders.map((tx) => (
                                    <option key={tx.txId} value={tx.txId}>
                                      {new Date(tx.createdAt).toLocaleDateString("en-AU", {
                                        day: "2-digit",
                                        month: "short",
                                      })}{" "}
                                      • {tx.email || tx.uid} • {tx.type} ({tx.delta} ⚡) — {tx.referenceId.slice(0, 50)}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div className="sm:col-span-2">
                                {!confirmTopRefundOpen && (
                                  <button
                                    type="button"
                                    disabled={!selectedOrder || refundingTxId === selectedOrder?.txId}
                                    onClick={() => {
                                      if (!selectedOrder) {
                                        setErrorMsg("Select a deduction order to refund tokens.");
                                        return;
                                      }
                                      setConfirmTopRefundOpen(true);
                                    }}
                                    className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-amber-400/40 bg-amber-500/15 px-3 py-2 font-mono text-xs font-bold text-amber-300 hover:bg-amber-500/25 disabled:opacity-40 transition"
                                    data-agent-id="trigger-top-refund-tokens-button"
                                    data-testid="trigger-top-refund-tokens-button"
                                  >
                                    <Icon name="refresh" className="size-3.5" />
                                    Refund Tokens
                                  </button>
                                )}
                              </div>
                            </div>

                            {confirmTopRefundOpen && selectedOrder && (
                              <div
                                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-amber-400/50 bg-amber-500/10 p-3"
                                data-agent-id="confirm-top-refund-dialog"
                                data-testid="confirm-top-refund-dialog"
                              >
                                <div className="flex items-center gap-2.5">
                                  <Icon name="alert" className="size-4 text-amber-300 shrink-0" />
                                  <p className="font-mono text-xs text-on-surface">
                                    Confirm refunding{" "}
                                    <strong className="text-amber-300 font-bold">
                                      +{Math.abs(selectedOrder.delta).toLocaleString("en-AU")} tokens
                                    </strong>{" "}
                                    to <strong className="text-on-surface">{selectedOrder.email || selectedOrder.uid}</strong> for{" "}
                                    <span className="text-on-surface-variant">{selectedOrder.referenceId}</span>?
                                  </p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => setConfirmTopRefundOpen(false)}
                                    className={`${btnSecondary} text-xs py-1 px-2.5`}
                                    data-agent-id="cancel-top-refund-button"
                                    data-testid="cancel-top-refund-button"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    type="button"
                                    disabled={refundingTxId === selectedOrder.txId}
                                    onClick={() => handleRefundOrder(selectedOrder.txId)}
                                    className={`${btnDanger} text-xs py-1 px-3 bg-amber-400 hover:bg-amber-300 text-black font-bold`}
                                    data-agent-id="confirm-top-refund-tokens-button"
                                    data-testid="confirm-top-refund-tokens-button"
                                  >
                                    {refundingTxId === selectedOrder.txId
                                      ? "Refunding..."
                                      : `Confirm Refund (+${Math.abs(selectedOrder.delta)} ⚡)`}
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })()
                    )}

                    {/* CONFIRMATION BANNER FOR REMOVE TOKENS */}
                    {confirmDeductOpen && tokenActionMode === "DEDUCT" && (
                      <div
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-warning/40 bg-warning/10 p-3"
                        data-agent-id="confirm-deduct-dialog"
                        data-testid="confirm-deduct-dialog"
                      >
                        <div className="flex items-center gap-2.5">
                          <Icon name="alert" className="size-4 text-warning shrink-0" />
                          <p className="font-mono text-xs text-on-surface">
                            Confirm removing{" "}
                            <strong className="text-warning font-bold">
                              {Number(giftTokensInput).toLocaleString("en-AU")} tokens
                            </strong>{" "}
                            from <strong className="text-on-surface">{giftEmail}</strong>?
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => setConfirmDeductOpen(false)}
                            className={`${btnSecondary} text-xs py-1 px-2.5`}
                            data-agent-id="cancel-deduct-button"
                            data-testid="cancel-deduct-button"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={handleDeductTokens}
                            disabled={gifting}
                            className={`${btnDanger} text-xs py-1 px-3 bg-warning hover:bg-warning/90 text-black font-bold`}
                            data-agent-id="confirm-deduct-tokens-button"
                            data-testid="confirm-deduct-tokens-button"
                          >
                            {gifting ? "Removing..." : "Confirm Remove Tokens"}
                          </button>
                        </div>
                      </div>
                    )}
                  </form>
                </div>
              )}

                  {/* MASTER ORDER LEDGER: ALL TRANSACTIONS, STRIPE PURCHASES, SEARCH ORDERS & REFUNDS */}
                  <div
                    className={`${card} p-4 space-y-3`}
                    data-agent-id="master-order-ledger-section"
                    data-testid="master-order-ledger-section"
                  >
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
                      <button
                        type="button"
                        onClick={() => setIsMasterLedgerExpanded((prev) => !prev)}
                        aria-expanded={isMasterLedgerExpanded}
                        data-agent-id="toggle-master-order-ledger-header-btn"
                        data-testid="toggle-master-order-ledger-header-btn"
                        className="flex-1 text-left group cursor-pointer"
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <Icon
                            name="chevronDown"
                            className={`size-4 text-primary transition-transform duration-200 ${
                              isMasterLedgerExpanded ? "rotate-180" : "-rotate-90"
                            }`}
                          />
                          <h4 className="text-compact font-bold text-on-surface group-hover:text-primary transition-colors">
                            Master Order Ledger (All Transactions, Stripe Purchases &amp; Search Orders)
                          </h4>
                          <span className="rounded-full bg-surface-container-highest px-2 py-0.5 font-mono text-[10px] text-on-surface-variant">
                            {orderLedger.length} Total Logged
                          </span>
                          {isSuper && (
                            <span className="rounded-full bg-primary/15 border border-primary/30 px-2 py-0.5 font-mono text-[10px] font-semibold text-primary">
                              Super Admin: Add, Remove &amp; Refund Tokens Only
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-[11px] text-on-surface-variant">
                          Complete chronological audit of every Stripe purchase, AdRadarHQ search order, AI Remix, Customize brief, Gift credit, and Token Refund.{" "}
                          {isSuper
                            ? "Super Admin can Add Tokens, Remove Tokens, or click “Refund Tokens” on any deduction order to restore tokens to the customer wallet."
                            : "Token adjustments (Add, Remove, Refund) are restricted to Super Admin only."}
                        </p>
                      </button>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        {isMasterLedgerExpanded && (
                          <input
                            type="text"
                            placeholder="Search email, brand, or tx ID..."
                            value={orderSearch}
                            onChange={(e) => setOrderSearch(e.target.value)}
                            className={`${field} !py-1.5 !text-[12px] w-48 sm:w-56`}
                            data-agent-id="master-order-ledger-search"
                            data-testid="master-order-ledger-search"
                          />
                        )}
                        <button
                          type="button"
                          onClick={reloadOrders}
                          className={btnSecondary}
                          data-agent-id="refresh-order-ledger-button"
                          data-testid="refresh-order-ledger-button"
                        >
                          <Icon name="refresh" className="size-3.5" />
                          Refresh
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsMasterLedgerExpanded((prev) => !prev)}
                          aria-expanded={isMasterLedgerExpanded}
                          data-agent-id="toggle-master-order-ledger-btn"
                          data-testid="toggle-master-order-ledger-btn"
                          className={`${btnSecondary} font-mono text-xs`}
                        >
                          <Icon
                            name="chevronDown"
                            className={`size-3.5 transition-transform duration-200 ${
                              isMasterLedgerExpanded ? "rotate-180" : ""
                            }`}
                          />
                          <span>{isMasterLedgerExpanded ? "Collapse Ledger" : "Expand Ledger"}</span>
                        </button>
                      </div>
                    </div>

                    {isMasterLedgerExpanded && (
                      <>
                        {/* Filter Tabs */}
                        <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-white/[0.06]">
                          {(
                            [
                              { id: "ALL", label: "All Orders" },
                              { id: "SEARCH", label: "Search Orders" },
                              { id: "STRIPE", label: "Stripe Purchases" },
                              { id: "SERVICES", label: "Customize & AI" },
                              { id: "GIFT_REFUND", label: "Gifts & Refunds" },
                            ] as const
                          ).map((f) => (
                            <button
                              key={f.id}
                              type="button"
                              onClick={() => setOrderFilter(f.id)}
                              className={`rounded-lg px-2.5 py-1 font-mono text-[11px] font-semibold transition ${
                                orderFilter === f.id
                                  ? "bg-primary/20 text-primary border border-primary/40"
                                  : "bg-surface-container-highest text-on-surface-variant border border-white/[0.06] hover:text-on-surface"
                              }`}
                              data-testid={`order-filter-${f.id.toLowerCase()}`}
                            >
                              {f.label}
                            </button>
                          ))}
                        </div>

                    {/* Orders Table */}
                    {(() => {
                      const q = orderSearch.trim().toLowerCase();
                      const filteredOrders = orderLedger.filter((tx) => {
                        if (orderFilter === "SEARCH" && tx.type !== "RADAR_SEARCH") return false;
                        if (orderFilter === "STRIPE" && tx.type !== "TOPUP") return false;
                        if (
                          orderFilter === "SERVICES" &&
                          tx.type !== "CUSTOMIZE_SERVICE" &&
                          tx.type !== "AI_REMIX" &&
                          tx.type !== "REGENERATE_VARIATIONS" &&
                          tx.type !== "BRAND_CLONE"
                        ) {
                          return false;
                        }
                        if (
                          orderFilter === "GIFT_REFUND" &&
                          tx.type !== "GIFT" &&
                          tx.type !== "REFUND" &&
                          tx.type !== "ADMIN_DEDUCT"
                        ) {
                          return false;
                        }
                        if (!q) return true;
                        return (
                          (tx.email || "").toLowerCase().includes(q) ||
                          tx.uid.toLowerCase().includes(q) ||
                          tx.referenceId.toLowerCase().includes(q) ||
                          tx.type.toLowerCase().includes(q) ||
                          tx.txId.toLowerCase().includes(q)
                        );
                      });

                      if (filteredOrders.length === 0) {
                        return (
                          <div className="rounded-xl border border-white/[0.06] bg-surface-container-low p-6 text-center text-on-surface-variant">
                            <p className="text-sm">No transactions match the current filter.</p>
                          </div>
                        );
                      }

                      return (
                        <div className="overflow-x-auto rounded-xl border border-white/[0.08] bg-surface-container-low max-h-[420px] overflow-y-auto">
                          <table className="w-full text-left text-[11px]">
                            <thead className="border-b border-white/[0.08] bg-surface-container-high/80 font-mono text-mono-label text-on-surface-variant sticky top-0 z-10 backdrop-blur-sm">
                              <tr>
                                <th className="px-3 py-2">Date / Time</th>
                                <th className="px-3 py-2">Customer</th>
                                <th className="px-2.5 py-2">Order Type</th>
                                <th className="px-3 py-2">Order Details</th>
                                <th className="px-2.5 py-2 text-right">Tokens</th>
                                <th className="px-2.5 py-2 text-right">Balance</th>
                                <th className="px-3 py-2 text-right">
                                  {isSuper ? "Super Admin (Add / Remove / Refund)" : "Refund Status"}
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-white/[0.04] font-mono">
                              {filteredOrders.map((tx) => {
                                const canRefund = tx.delta < 0 && !tx.refunded;
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
                                    <td
                                      className="px-3 py-2 text-on-surface truncate max-w-[150px]"
                                      title={tx.email || tx.uid}
                                    >
                                      {tx.email || tx.uid}
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
                                                : tx.type === "RADAR_SEARCH"
                                                  ? "bg-sky-500/15 text-sky-300"
                                                  : "bg-surface-container-highest text-on-surface-variant"
                                        }`}
                                      >
                                        {tx.type}
                                      </span>
                                    </td>
                                    <td
                                      className="px-3 py-2 font-sans text-on-surface max-w-[280px] truncate"
                                      title={tx.referenceId}
                                    >
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
                                    <td className="px-3 py-2 text-right whitespace-nowrap">
                                      {isSuper ? (
                                        <div className="inline-flex items-center justify-end gap-1.5">
                                          {tx.email && (
                                            <>
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  setGiftEmail(tx.email || "");
                                                  setTokenActionMode("GIFT");
                                                  setConfirmDeductOpen(false);
                                                  setConfirmTopRefundOpen(false);
                                                  if (Number(giftTokensInput) <= 0) setGiftTokensInput("100");
                                                  document.getElementById("gift-tokens-amount-input")?.focus();
                                                }}
                                                title={`Add tokens to ${tx.email}`}
                                                aria-label={`Add tokens to ${tx.email}`}
                                                data-agent-id={`ledger-add-tokens-${tx.txId}`}
                                                data-testid={`ledger-add-tokens-${tx.txId}`}
                                                className="rounded-lg border border-primary/30 bg-primary/10 px-2 py-1 font-mono text-[10px] font-semibold text-primary hover:bg-primary/20 transition"
                                              >
                                                + Add
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  setGiftEmail(tx.email || "");
                                                  setTokenActionMode("DEDUCT");
                                                  setConfirmDeductOpen(false);
                                                  setConfirmTopRefundOpen(false);
                                                  if (Number(giftTokensInput) <= 0) setGiftTokensInput("25");
                                                  document.getElementById("gift-tokens-amount-input")?.focus();
                                                }}
                                                title={`Remove tokens from ${tx.email}`}
                                                aria-label={`Remove tokens from ${tx.email}`}
                                                data-agent-id={`ledger-remove-tokens-${tx.txId}`}
                                                data-testid={`ledger-remove-tokens-${tx.txId}`}
                                                className="rounded-lg border border-warning/30 bg-warning/10 px-2 py-1 font-mono text-[10px] font-semibold text-warning hover:bg-warning/20 transition"
                                              >
                                                - Remove
                                              </button>
                                            </>
                                          )}
                                          {tx.refunded ? (
                                            <span
                                              className="rounded bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-300"
                                              title={tx.refundTxId ? `Refund TX: ${tx.refundTxId}` : "Tokens refunded"}
                                            >
                                              Refunded
                                            </span>
                                          ) : canRefund ? (
                                            confirmRefundTxId === tx.txId ? (
                                              <div className="inline-flex items-center gap-1 animate-fadeIn">
                                                <button
                                                  type="button"
                                                  disabled={refundingTxId === tx.txId}
                                                  onClick={() => handleRefundOrder(tx.txId)}
                                                  className={`${btnDanger} !px-2 !py-1 !text-[10px]`}
                                                  data-agent-id={`confirm-refund-order-${tx.txId}`}
                                                  data-testid={`confirm-refund-order-${tx.txId}`}
                                                >
                                                  {refundingTxId === tx.txId
                                                    ? "Refunding..."
                                                    : `Confirm Refund (+${Math.abs(tx.delta)} ⚡)`}
                                                </button>
                                                <button
                                                  type="button"
                                                  onClick={() => setConfirmRefundTxId(null)}
                                                  className={`${btnSecondary} !px-2 !py-1 !text-[10px]`}
                                                >
                                                  Cancel
                                                </button>
                                              </div>
                                            ) : (
                                              <button
                                                type="button"
                                                onClick={() => setConfirmRefundTxId(tx.txId)}
                                                className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-2.5 py-1 font-mono text-[10px] font-semibold text-amber-300 hover:bg-amber-500/20 transition"
                                                data-agent-id={`refund-order-${tx.txId}`}
                                                data-testid={`refund-order-${tx.txId}`}
                                              >
                                                Refund Tokens
                                              </button>
                                            )
                                          ) : null}
                                        </div>
                                      ) : tx.refunded ? (
                                        <span
                                          className="rounded bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-300"
                                          title={tx.refundTxId ? `Refund TX: ${tx.refundTxId}` : "Tokens refunded"}
                                        >
                                          Refunded
                                        </span>
                                      ) : (
                                        <span className="text-[10px] text-outline">—</span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      );
                    })()}
                      </>
                    )}
                  </div>

                  {/* ALL USERS TOKEN BALANCES (UNDER MASTER ORDER LEDGER) */}
                  <div
                    className={`${card} p-4 space-y-3 border border-primary/25`}
                    data-agent-id="all-users-token-balances-section"
                    data-testid="all-users-token-balances-section"
                  >
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Icon name="wallet" className="size-4 text-primary" />
                          <h4 className="text-compact font-bold text-on-surface">
                            All Users Token Balances
                          </h4>
                          <span className="rounded-full bg-surface-container-highest px-2 py-0.5 font-mono text-[10px] text-on-surface-variant">
                            {rbacUsers.filter((u) => Boolean(u.email)).length} Registered Users
                          </span>
                          {isSuper && (
                            <span className="rounded-full bg-primary/15 border border-primary/30 px-2 py-0.5 font-mono text-[10px] font-semibold text-primary">
                              Super Admin: Add Tokens, Minus Tokens &amp; Reset Tokens to 0 (Confirm Required)
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-[11px] text-on-surface-variant">
                          Live token balance directory for every registered user account. Hard rule: nobody can have negative tokens — accounts at 0 must buy more tokens.
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <input
                          type="text"
                          placeholder="Search user email or role..."
                          value={userBalanceSearch}
                          onChange={(e) => setUserBalanceSearch(e.target.value)}
                          className={`${field} !py-1.5 !text-[12px] w-48 sm:w-60`}
                          data-agent-id="user-token-balances-search"
                          data-testid="user-token-balances-search"
                        />
                        <button
                          type="button"
                          onClick={reloadRbac}
                          disabled={rbacLoading}
                          className={btnSecondary}
                          data-agent-id="refresh-user-token-balances-btn"
                          data-testid="refresh-user-token-balances-btn"
                        >
                          <Icon name="refresh" className={`size-3.5 ${rbacLoading ? "animate-spin" : ""}`} />
                          Refresh Balances
                        </button>
                      </div>
                    </div>

                    {(() => {
                      const q = userBalanceSearch.trim().toLowerCase();
                      const registeredUsers = rbacUsers
                        .filter((u) => Boolean(u.email))
                        .filter((u) => {
                          if (!q) return true;
                          return (
                            u.email.toLowerCase().includes(q) ||
                            (u.displayName || "").toLowerCase().includes(q) ||
                            u.role.toLowerCase().includes(q)
                          );
                        });

                      if (registeredUsers.length === 0) {
                        return (
                          <div className="rounded-xl border border-white/[0.06] bg-surface-container-low p-6 text-center text-on-surface-variant">
                            <p className="text-sm">No user accounts match the current search.</p>
                          </div>
                        );
                      }

                      return (
                        <div className="overflow-x-auto rounded-xl border border-white/[0.08] bg-surface-container-low max-h-[420px] overflow-y-auto">
                          <table className="w-full text-left text-[11px]">
                            <thead className="border-b border-white/[0.08] bg-surface-container-high/80 font-mono text-mono-label text-on-surface-variant sticky top-0 z-10 backdrop-blur-sm">
                              <tr>
                                <th className="px-3 py-2">User / Email</th>
                                <th className="px-2.5 py-2">Role</th>
                                <th className="px-3 py-2 text-right">Token Balance</th>
                                <th className="px-3 py-2 text-right">
                                  {isSuper
                                    ? "Super Admin Controls (Add Tokens / Minus Tokens / Reset to 0)"
                                    : "Status"}
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-white/[0.04] font-mono">
                              {registeredUsers.map((u) => {
                                const bal = Math.max(0, Math.round(Number(u.tokenBalance ?? 0)));
                                const isActiveRow = userRowAction?.uid === u.uid;
                                const isBusy = userRowBusyUid === u.uid;

                                return (
                                  <tr key={u.uid} className="hover:bg-white/[0.02] transition">
                                    <td className="px-3 py-2.5">
                                      <div className="font-semibold text-on-surface truncate max-w-[220px]" title={u.email}>
                                        {u.email}
                                      </div>
                                      {u.displayName && u.displayName !== u.email && (
                                        <div className="text-[10px] font-sans text-on-surface-variant truncate max-w-[220px]">
                                          {u.displayName}
                                        </div>
                                      )}
                                    </td>
                                    <td className="px-2.5 py-2.5 whitespace-nowrap">
                                      <span
                                        className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                                          u.role === "superadmin"
                                            ? "bg-primary/20 text-primary"
                                            : u.role === "admin"
                                              ? "bg-secondary/20 text-secondary"
                                              : "bg-surface-container-highest text-on-surface-variant"
                                        }`}
                                      >
                                        {u.role}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                                      <span
                                        className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-extrabold ${
                                          bal > 0
                                            ? "bg-primary/15 text-primary"
                                            : "bg-surface-container-highest text-on-surface-variant"
                                        }`}
                                        data-testid={`user-balance-value-${u.uid}`}
                                      >
                                        ⚡ {bal.toLocaleString("en-AU")} Tokens
                                      </span>
                                    </td>
                                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                                      {!isSuper ? (
                                        <span className="text-[10px] text-outline">Super Admin Only</span>
                                      ) : !isActiveRow ? (
                                        <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setErrorMsg(null);
                                              setUserRowAction({
                                                uid: u.uid,
                                                email: u.email,
                                                mode: "ADD",
                                                amountInput: "100",
                                                confirmOpen: true,
                                              });
                                            }}
                                            data-agent-id={`user-bal-add-btn-${u.uid}`}
                                            data-testid={`user-bal-add-btn-${u.uid}`}
                                            aria-label={`Add tokens to ${u.email}`}
                                            className="inline-flex items-center gap-1 rounded-lg border border-primary/40 bg-primary/10 px-2.5 py-1 font-mono text-[10px] font-semibold text-primary hover:bg-primary/20 transition"
                                          >
                                            <Icon name="plus" className="size-3" />
                                            <span>Add Tokens</span>
                                          </button>

                                          <button
                                            type="button"
                                            disabled={bal <= 0}
                                            onClick={() => {
                                              setErrorMsg(null);
                                              setUserRowAction({
                                                uid: u.uid,
                                                email: u.email,
                                                mode: "MINUS",
                                                amountInput: String(Math.min(10, Math.max(1, bal))),
                                                confirmOpen: true,
                                              });
                                            }}
                                            data-agent-id={`user-bal-minus-btn-${u.uid}`}
                                            data-testid={`user-bal-minus-btn-${u.uid}`}
                                            aria-label={`Minus tokens from ${u.email}`}
                                            className="inline-flex items-center gap-1 rounded-lg border border-warning/40 bg-warning/10 px-2.5 py-1 font-mono text-[10px] font-semibold text-warning hover:bg-warning/20 disabled:opacity-40 disabled:cursor-not-allowed transition"
                                          >
                                            <span>- Minus Tokens</span>
                                          </button>

                                          <button
                                            type="button"
                                            disabled={bal <= 0}
                                            onClick={() => {
                                              setErrorMsg(null);
                                              setUserRowAction({
                                                uid: u.uid,
                                                email: u.email,
                                                mode: "RESET",
                                                amountInput: "0",
                                                confirmOpen: true,
                                              });
                                            }}
                                            data-agent-id={`user-bal-reset-btn-${u.uid}`}
                                            data-testid={`user-bal-reset-btn-${u.uid}`}
                                            aria-label={`Reset ${u.email} tokens to 0`}
                                            className="inline-flex items-center gap-1 rounded-lg border border-rose-500/40 bg-rose-500/10 px-2.5 py-1 font-mono text-[10px] font-semibold text-rose-300 hover:bg-rose-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition"
                                          >
                                            <Icon name="refresh" className="size-2.5" />
                                            <span>Reset to 0</span>
                                          </button>
                                        </div>
                                      ) : userRowAction.mode === "ADD" ? (
                                        <div className="inline-flex flex-wrap items-center justify-end gap-1.5 rounded-xl border border-primary/40 bg-primary/10 px-2.5 py-1.5">
                                          <span className="text-[10px] font-bold text-primary">Add:</span>
                                          {[10, 50, 100].map((p) => (
                                            <button
                                              key={p}
                                              type="button"
                                              onClick={() =>
                                                setUserRowAction((prev) =>
                                                  prev ? { ...prev, amountInput: String(p) } : null
                                                )
                                              }
                                              className="rounded border border-primary/30 bg-surface-container-highest px-1.5 py-0.5 text-[10px] text-primary hover:bg-primary/20"
                                            >
                                              +{p}
                                            </button>
                                          ))}
                                          <input
                                            type="text"
                                            inputMode="numeric"
                                            value={userRowAction.amountInput}
                                            onChange={(e) =>
                                              setUserRowAction((prev) =>
                                                prev
                                                  ? { ...prev, amountInput: e.target.value.replace(/[^0-9]/g, "") }
                                                  : null
                                              )
                                            }
                                            aria-label={`Tokens to add to ${u.email}`}
                                            data-agent-id={`user-bal-add-input-${u.uid}`}
                                            data-testid={`user-bal-add-input-${u.uid}`}
                                            className="w-16 rounded border border-primary/40 bg-surface-container-highest px-2 py-0.5 text-center font-mono text-[11px] font-bold text-on-surface"
                                          />
                                          <button
                                            type="button"
                                            disabled={isBusy || (Number(userRowAction.amountInput) || 0) <= 0}
                                            onClick={handleUserRowConfirmAction}
                                            data-agent-id={`user-bal-confirm-add-btn-${u.uid}`}
                                            data-testid={`user-bal-confirm-add-btn-${u.uid}`}
                                            className="rounded-lg bg-primary px-2.5 py-1 font-mono text-[10px] font-bold text-on-primary hover:bg-primary/90 disabled:opacity-40 transition"
                                          >
                                            {isBusy
                                              ? "Adding..."
                                              : `Confirm Add (+${Math.round(Number(userRowAction.amountInput) || 0)} ⚡)`}
                                          </button>
                                          <button
                                            type="button"
                                            disabled={isBusy}
                                            onClick={() => setUserRowAction(null)}
                                            data-agent-id={`user-bal-cancel-btn-${u.uid}`}
                                            data-testid={`user-bal-cancel-btn-${u.uid}`}
                                            className="rounded-lg border border-white/15 bg-surface-container-highest px-2 py-1 font-mono text-[10px] text-on-surface-variant hover:text-on-surface"
                                          >
                                            Cancel
                                          </button>
                                        </div>
                                      ) : userRowAction.mode === "MINUS" ? (
                                        <div className="inline-flex flex-wrap items-center justify-end gap-1.5 rounded-xl border border-warning/40 bg-warning/10 px-2.5 py-1.5">
                                          <span className="text-[10px] font-bold text-warning">Minus (max {bal}):</span>
                                          {[5, 10, 25]
                                            .filter((p) => p <= bal)
                                            .map((p) => (
                                              <button
                                                key={p}
                                                type="button"
                                                onClick={() =>
                                                  setUserRowAction((prev) =>
                                                    prev ? { ...prev, amountInput: String(p) } : null
                                                  )
                                                }
                                                className="rounded border border-warning/30 bg-surface-container-highest px-1.5 py-0.5 text-[10px] text-warning hover:bg-warning/20"
                                              >
                                                -{p}
                                              </button>
                                            ))}
                                          <input
                                            type="text"
                                            inputMode="numeric"
                                            value={userRowAction.amountInput}
                                            onChange={(e) =>
                                              setUserRowAction((prev) =>
                                                prev
                                                  ? { ...prev, amountInput: e.target.value.replace(/[^0-9]/g, "") }
                                                  : null
                                              )
                                            }
                                            aria-label={`Tokens to minus from ${u.email}`}
                                            data-agent-id={`user-bal-minus-input-${u.uid}`}
                                            data-testid={`user-bal-minus-input-${u.uid}`}
                                            className="w-16 rounded border border-warning/40 bg-surface-container-highest px-2 py-0.5 text-center font-mono text-[11px] font-bold text-on-surface"
                                          />
                                          <button
                                            type="button"
                                            disabled={
                                              isBusy ||
                                              (Number(userRowAction.amountInput) || 0) <= 0 ||
                                              (Number(userRowAction.amountInput) || 0) > bal
                                            }
                                            onClick={handleUserRowConfirmAction}
                                            data-agent-id={`user-bal-confirm-minus-btn-${u.uid}`}
                                            data-testid={`user-bal-confirm-minus-btn-${u.uid}`}
                                            className="rounded-lg bg-warning px-2.5 py-1 font-mono text-[10px] font-bold text-black hover:bg-warning/90 disabled:opacity-40 transition"
                                          >
                                            {isBusy
                                              ? "Minusing..."
                                              : `Confirm Minus (-${Math.round(Number(userRowAction.amountInput) || 0)} ⚡)`}
                                          </button>
                                          <button
                                            type="button"
                                            disabled={isBusy}
                                            onClick={() => setUserRowAction(null)}
                                            data-agent-id={`user-bal-cancel-btn-${u.uid}`}
                                            data-testid={`user-bal-cancel-btn-${u.uid}`}
                                            className="rounded-lg border border-white/15 bg-surface-container-highest px-2 py-1 font-mono text-[10px] text-on-surface-variant hover:text-on-surface"
                                          >
                                            Cancel
                                          </button>
                                        </div>
                                      ) : (
                                        <div className="inline-flex flex-wrap items-center justify-end gap-1.5 rounded-xl border border-rose-500/40 bg-rose-500/10 px-2.5 py-1.5">
                                          <span className="text-[10px] font-semibold text-rose-200">
                                            Reset {bal.toLocaleString("en-AU")} ⚡ to 0?
                                          </span>
                                          <button
                                            type="button"
                                            disabled={isBusy}
                                            onClick={handleUserRowConfirmAction}
                                            data-agent-id={`user-bal-confirm-reset-btn-${u.uid}`}
                                            data-testid={`user-bal-confirm-reset-btn-${u.uid}`}
                                            className="rounded-lg bg-rose-500 px-2.5 py-1 font-mono text-[10px] font-bold text-white hover:bg-rose-400 disabled:opacity-40 transition"
                                          >
                                            {isBusy ? "Resetting..." : "Confirm Reset to 0 ⚡"}
                                          </button>
                                          <button
                                            type="button"
                                            disabled={isBusy}
                                            onClick={() => setUserRowAction(null)}
                                            data-agent-id={`user-bal-cancel-btn-${u.uid}`}
                                            data-testid={`user-bal-cancel-btn-${u.uid}`}
                                            className="rounded-lg border border-white/15 bg-surface-container-highest px-2 py-1 font-mono text-[10px] text-on-surface-variant hover:text-on-surface"
                                          >
                                            Cancel
                                          </button>
                                        </div>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      );
                    })()}
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

                      <div className="rounded-xl border border-primary/35 bg-primary/10 p-3.5 space-y-2.5">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex items-center gap-2">
                            <Icon name="sparkles" className="size-4 text-primary" />
                            <span className="text-compact font-bold text-primary">
                              Automated AI Work Reply Designer (Staff Assistant)
                            </span>
                          </div>
                          <button
                            type="button"
                            disabled={aiDrafting}
                            onClick={() => handleGenerateAiWorkReply(selectedMessage || undefined)}
                            data-testid="generate-ai-work-reply-btn"
                            data-agent-id="generate-ai-work-reply-btn"
                            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 font-mono text-xs font-semibold text-on-primary hover:bg-primary-fixed disabled:opacity-50 transition"
                          >
                            <Icon name="sparkles" className={`size-3.5 ${aiDrafting ? "animate-spin" : ""}`} />
                            {aiDrafting ? "Designing AI Reply…" : "Generate AI Work Reply ✨"}
                          </button>
                        </div>
                        <input
                          type="text"
                          maxLength={500}
                          value={aiStaffNotes}
                          onChange={(e) => setAiStaffNotes(e.target.value)}
                          placeholder="Optional staff notes / strategic direction for AI to include in the customer reply..."
                          data-testid="ai-staff-notes-input"
                          data-agent-id="ai-staff-notes-input"
                          className={`${field} bg-surface-container-lowest text-compact`}
                        />
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className={label}>Message Body (Plain Text Only)</label>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              disabled={!composeBody}
                              onClick={() => handleCopyMessageText(composeBody, "compose-body")}
                              data-testid="copy-compose-body-btn"
                              data-agent-id="copy-compose-body-btn"
                              aria-label="Copy compose message body"
                              className="inline-flex items-center gap-1 rounded-lg border border-white/15 bg-surface-container-high px-2.5 py-1 font-mono text-[11px] font-semibold text-on-surface hover:border-primary/50 hover:text-primary disabled:opacity-40 transition"
                            >
                              <Icon name={copiedMessageId === "compose-body" ? "checkCircle" : "copy"} className="size-3.5" />
                              <span>{copiedMessageId === "compose-body" ? "Copied ✓" : "Copy Text"}</span>
                            </button>
                            <span className="font-mono text-[11px] text-on-surface-variant">
                              {composeBody.length} / 10000
                            </span>
                          </div>
                        </div>
                        <textarea
                          required
                          rows={6}
                          maxLength={10000}
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
                                setConfirmDeleteMessageId(null);
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
                              <div className="mt-2 flex items-center justify-between gap-2">
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
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleCopyMessageText(msg.body, `list-${msg.messageId}`);
                                    }}
                                    data-testid={`copy-list-msg-btn-${msg.messageId}`}
                                    data-agent-id={`copy-list-msg-btn-${msg.messageId}`}
                                    aria-label={`Copy text of message ${msg.subject}`}
                                    className="inline-flex items-center gap-1 rounded-md border border-white/15 bg-surface-container-highest px-2 py-0.5 font-mono text-[10px] font-semibold text-on-surface hover:border-primary/50 hover:text-primary transition"
                                  >
                                    <Icon name={copiedMessageId === `list-${msg.messageId}` ? "checkCircle" : "copy"} className="size-3" />
                                    <span>{copiedMessageId === `list-${msg.messageId}` ? "Copied ✓" : "Copy Text"}</span>
                                  </button>
                                  <span className="text-[10px] text-on-surface-variant font-mono">
                                    Retained until: {new Date(msg.retentionUntil).toLocaleDateString("en-AU")}
                                  </span>
                                </div>
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
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[11px] font-mono uppercase text-on-surface-variant">
                                  Message Body (Plain Text • {selectedMessage.body.length} chars)
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleCopyMessageText(selectedMessage.body, `viewer-${selectedMessage.messageId}`)}
                                  data-testid="viewer-copy-message-body-btn"
                                  data-agent-id="viewer-copy-message-body-btn"
                                  aria-label="Copy complete message text"
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/15 px-3 py-1 font-mono text-xs font-bold text-primary hover:bg-primary/25 transition"
                                >
                                  <Icon name={copiedMessageId === `viewer-${selectedMessage.messageId}` ? "checkCircle" : "copy"} className="size-3.5" />
                                  <span>{copiedMessageId === `viewer-${selectedMessage.messageId}` ? "Copied Complete Text ✓" : "Copy Text"}</span>
                                </button>
                              </div>
                              <div className="rounded-xl border border-white/[0.08] bg-surface-container-lowest p-4 text-[13px] text-on-surface whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto">
                                {selectedMessage.body}
                              </div>
                            </div>

                            <div className="text-[11px] font-mono text-on-surface-variant space-y-0.5">
                              <p>Created: {new Date(selectedMessage.createdAt).toLocaleString("en-AU")}</p>
                              <p>Statutory Retention Until: {new Date(selectedMessage.retentionUntil).toLocaleString("en-AU")}</p>
                            </div>

                            <div className="flex flex-wrap items-center justify-end gap-2 pt-3 border-t border-white/[0.08]">
                              <button
                                type="button"
                                onClick={() => handleCopyMessageText(selectedMessage.body, `viewer-footer-${selectedMessage.messageId}`)}
                                data-testid="viewer-footer-copy-btn"
                                data-agent-id="viewer-footer-copy-btn"
                                aria-label="Copy complete message text"
                                className={btnSecondary}
                              >
                                <Icon name={copiedMessageId === `viewer-footer-${selectedMessage.messageId}` ? "checkCircle" : "copy"} className="size-3.5" />
                                <span>{copiedMessageId === `viewer-footer-${selectedMessage.messageId}` ? "Copied ✓" : "Copy Text"}</span>
                              </button>
                              <button
                                type="button"
                                disabled={aiDrafting}
                                onClick={() => handleGenerateAiWorkReply(selectedMessage)}
                                data-testid="viewer-generate-ai-work-reply-btn"
                                data-agent-id="viewer-generate-ai-work-reply-btn"
                                className="inline-flex items-center gap-1.5 rounded-xl border border-secondary/40 bg-secondary/15 px-3 py-2 font-mono text-xs font-bold text-secondary hover:bg-secondary/25 disabled:opacity-50 transition"
                              >
                                <Icon name="sparkles" className={`size-3.5 ${aiDrafting ? "animate-spin" : ""}`} />
                                {aiDrafting ? "Designing AI Reply…" : "Design AI Work Reply ✨"}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setComposeRecipientEmail(selectedMessage.senderEmail);
                                  setComposeSubject(`Re: ${selectedMessage.subject}`);
                                  setComposeBody("");
                                  setComposeCustomizeRequestId(selectedMessage.customizeRequestId);
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
                              {confirmDeleteMessageId === selectedMessage.messageId ? (
                                <div className="inline-flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    disabled={deletingMessageId === selectedMessage.messageId}
                                    onClick={() => handleDeleteMessage(selectedMessage.messageId)}
                                    data-testid="viewer-confirm-delete-message-btn"
                                    data-agent-id="viewer-confirm-delete-message-btn"
                                    aria-label="Confirm permanent message deletion"
                                    className="inline-flex items-center gap-1.5 rounded-xl border border-rose-500/60 bg-rose-500/25 px-3 py-2 font-mono text-xs font-bold text-rose-200 hover:bg-rose-500/35 disabled:opacity-50 transition"
                                  >
                                    <Icon
                                      name={deletingMessageId === selectedMessage.messageId ? "refresh" : "trash"}
                                      className={`size-3.5 ${deletingMessageId === selectedMessage.messageId ? "animate-spin" : ""}`}
                                    />
                                    <span>
                                      {deletingMessageId === selectedMessage.messageId ? "Deleting…" : "Confirm Delete"}
                                    </span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteMessageId(null)}
                                    data-testid="viewer-cancel-delete-message-btn"
                                    data-agent-id="viewer-cancel-delete-message-btn"
                                    aria-label="Cancel message deletion"
                                    className={btnSecondary}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteMessageId(selectedMessage.messageId)}
                                  data-testid="viewer-delete-message-btn"
                                  data-agent-id="viewer-delete-message-btn"
                                  aria-label="Delete message from database"
                                  className="inline-flex items-center gap-1.5 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 font-mono text-xs font-semibold text-rose-300 hover:bg-rose-500/20 transition"
                                >
                                  <Icon name="trash" className="size-3.5" />
                                  <span>Delete</span>
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

              {/* TAB 6: RBAC MATRIX & ROLES (Super Admin Only) */}
              {tab === "RBAC" && isSuper && (
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
                        Manage platform knowledge base FAQs explaining My Brands, Radar Feed, and Token Ledger mechanics. All FAQs start collapsed; click any FAQ to expand its answer, RAG sentences, and Google Translator.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (expandedAdminFaqIds.size > 0) {
                            setExpandedAdminFaqIds(new Set());
                          } else {
                            setExpandedAdminFaqIds(new Set(filteredAdminFaqs.map((f) => f.faqId)));
                          }
                        }}
                        data-testid="toggle-expand-all-faqs-btn"
                        data-agent-id="toggle-expand-all-faqs-btn"
                        aria-label={expandedAdminFaqIds.size > 0 ? "Collapse all FAQs" : "Expand all FAQs"}
                        className="rounded-lg border border-white/10 px-3 py-1.5 text-compact text-on-surface-variant hover:bg-white/[0.04] hover:text-on-surface transition"
                      >
                        {expandedAdminFaqIds.size > 0 ? "Collapse All" : "Expand All"}
                      </button>
                      <button
                        type="button"
                        onClick={handleResetDefaultFaqs}
                        disabled={faqsSaving}
                        data-testid="reset-default-faqs-btn"
                        data-agent-id="reset-default-faqs-btn"
                        className="rounded-lg border border-white/10 px-3 py-1.5 text-compact text-on-surface-variant hover:bg-white/[0.04] hover:text-on-surface transition"
                      >
                        Reset Defaults
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowAddFaq((v) => !v)}
                        data-testid="add-faq-button"
                        data-agent-id="add-faq-button"
                        className={btnPrimary}
                      >
                        <Icon name="plus" className="size-4" />
                        {showAddFaq ? "Cancel" : "Add FAQ"}
                      </button>
                    </div>
                  </div>

                  {/* Help & FAQ Management Search Bar & Category Filters */}
                  <div className={`${card} p-4 space-y-3`}>
                    <div className="relative">
                      <Icon
                        name="search"
                        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-on-surface-variant"
                      />
                      <input
                        type="search"
                        placeholder="Search FAQs by question, answer, keyword, or category..."
                        value={faqSearchQuery}
                        onChange={(e) => setFaqSearchQuery(e.target.value)}
                        data-testid="admin-faq-search-input"
                        data-agent-id="admin-faq-search-input"
                        aria-label="Search FAQs in Help and FAQ Management"
                        className={`${field} pl-9`}
                      />
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {faqCategories.map((cat) => {
                          const active = faqCategoryFilter.toUpperCase() === cat.toUpperCase();
                          return (
                            <button
                              key={cat}
                              type="button"
                              onClick={() => setFaqCategoryFilter(cat)}
                              data-testid={`admin-faq-cat-${cat.toLowerCase()}`}
                              data-agent-id={`admin-faq-cat-${cat.toLowerCase()}`}
                              className={`rounded-full px-3 py-1 font-mono text-xs font-semibold transition ${
                                active
                                  ? "bg-primary text-on-primary shadow-sm"
                                  : "border border-white/10 bg-surface-container text-on-surface-variant hover:border-white/20 hover:text-on-surface"
                              }`}
                            >
                              {cat}
                            </button>
                          );
                        })}
                      </div>
                      <span className="font-mono text-xs text-on-surface-variant">
                        Showing {filteredAdminFaqs.length} of {faqs.length} FAQs
                      </span>
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

                  {/* FAQ Items List (Collapsed on start, expand when needed) */}
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
                  ) : filteredAdminFaqs.length === 0 ? (
                    <div className={`${card} p-8 text-center text-on-surface-variant space-y-2`}>
                      <p className="font-medium text-on-surface">No matching FAQs found</p>
                      <p className="text-xs">Try clearing or changing your search keyword or category filter.</p>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {filteredAdminFaqs.map((faq) => {
                        const isEditing = editingFaqId === faq.faqId;
                        const isExpanded = expandedAdminFaqIds.has(faq.faqId) || isEditing;
                        const faqRagList = adminRagEntries.filter((e) => e.sourceId === faq.faqId);
                        const multilingualCount = faqRagList.filter((e) => e.languageCode !== "en").length;

                        return (
                          <div
                            key={faq.faqId}
                            data-testid={`admin-faq-card-${faq.faqId}`}
                            data-agent-id={`admin-faq-card-${faq.faqId}`}
                            className={`${card} p-3.5 transition ${
                              isExpanded
                                ? "border-primary/40 bg-surface-container-high/80 ring-1 ring-primary/20"
                                : "border-white/[0.08] hover:border-white/15"
                            }`}
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
                                  <button
                                    type="button"
                                    onClick={() => toggleAdminFaqExpand(faq.faqId)}
                                    data-testid={`admin-faq-toggle-${faq.faqId}`}
                                    data-agent-id={`admin-faq-toggle-${faq.faqId}`}
                                    aria-expanded={isExpanded}
                                    aria-label={`Toggle FAQ: ${faq.question}`}
                                    className="flex flex-1 items-start justify-between gap-3 text-left"
                                  >
                                    <div className="space-y-1">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <span className="rounded bg-primary/20 px-2 py-0.5 font-mono text-[10px] font-semibold text-primary uppercase">
                                          {faq.category}
                                        </span>
                                        <span className="text-[11px] font-mono text-on-surface-variant">
                                          Order #{faq.order}
                                        </span>
                                        <span className="rounded border border-white/10 bg-surface-container px-1.5 py-0.5 font-mono text-[10px] text-on-surface-variant">
                                          RAG Indexed
                                        </span>
                                        {multilingualCount > 0 && (
                                          <span className="rounded bg-secondary/20 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-secondary">
                                            +{multilingualCount} Lang
                                          </span>
                                        )}
                                        {!faq.enabled && (
                                          <span className="rounded bg-error/20 px-2 py-0.5 font-mono text-[10px] text-error">
                                            Draft / Hidden
                                          </span>
                                        )}
                                      </div>
                                      <h4 className="text-body font-semibold text-on-surface">{faq.question}</h4>
                                    </div>
                                    <span
                                      className={`mt-1 flex size-6 shrink-0 items-center justify-center rounded-md border border-white/10 bg-surface-container-highest transition-transform duration-200 ${
                                        isExpanded ? "rotate-180 text-primary" : "text-on-surface-variant"
                                      }`}
                                    >
                                      <Icon name="chevronDown" className="size-3.5" />
                                    </span>
                                  </button>

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

                                {isExpanded && (
                                  <div className="mt-3 border-t border-white/[0.06] pt-3 space-y-3">
                                    <p className="text-compact leading-relaxed text-on-surface-variant whitespace-pre-line">
                                      {faq.answer}
                                    </p>
                                    <PerFaqRagDrawer
                                      faq={faq}
                                      ragEntriesForFaq={faqRagList}
                                      onRagUpdated={reloadRagEntries}
                                    />
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* UNDER ALL FAQS: Global Website Sentences, AI Works & Multilingual FAQ RAG Corpus */}
                  <GlobalRagCorpusSection
                    faqs={faqs}
                    isAdmin={role === "superadmin" || role === "admin"}
                    onFaqPublished={() => {
                      reloadFaqs();
                    }}
                  />
                </div>
              )}

              {/* TAB 8: DEVELOPER DIAGNOSTICS (Super Admin Only) */}
              {tab === "DEV" && isSuper && (
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
