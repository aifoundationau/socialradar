"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useSession } from "@/components/auth/SessionProvider";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { Icon, type IconName } from "@/components/ui/Icon";
import { alertError, alertInfo, btnDanger, btnPrimary, btnSecondary, card, field, label } from "@/components/ui/styles";
import {
  ALL_COUNTRIES_CODE,
  WORLD_COUNTRIES,
  audToUsdCents,
  formatAllowedCountriesSummary,
  formatAud,
  formatPrice,
  formatTokenEstimateHover,
  formatUsd,
  getCountryName,
  isFreeAccessWindowActive,
  normalizeAllowedCountries,
} from "@/lib/pricing";
import type { CurrencyRateResponse } from "@/app/api/currency/route";
import type {
  AdAgentDistributionItem,
  AdAgentRedistributionPercent,
  AdminMessage,
  EquityPartner,
  FaqItem,
  FreeAccessDurationMinutes,
  FreeAccessWindow,
  MonthlySubscriptionConfig,
  RagSentenceItem,
  RbacMatrix,
  RbacPermission,
  RbacRole,
  RedistributiveLedgerSummary,
  StripePurchaseRecord,
  TokenTransactionDoc,
} from "@/lib/contracts";
import {
  AD_AGENT_REDISTRIBUTION_PERCENTS,
  LINK_URL_PATTERN,
  RBAC_PERMISSIONS_LIST,
} from "@/lib/contracts";
import { computeAdAgentDisplayItem } from "@/lib/ad-agent-display";
import { GlobalRagCorpusSection, PerFaqRagDrawer } from "@/components/faq/FaqRagWorkspace";
import { autofindUserLocation, loadDetectedGeoCountry, loadGeoConfig } from "@/lib/geo";

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
  roles?: RbacRole[];
  tier: string;
  createdAt: string;
  isPermanentSuperAdmin: boolean;
  tokenBalance?: number;
}

type AssignableRbacRole = Exclude<RbacRole, "superadmin">;

const SUPER_ADMIN_ASSIGNABLE_ROLE_OPTIONS: { value: AssignableRbacRole; label: string }[] = [
  { value: "supporter", label: "Supporter" },
  { value: "ad_agent", label: "Ad Agent" },
  { value: "agency", label: "Agency" },
  { value: "moderator", label: "Moderator" },
  { value: "admin", label: "Main Admin" },
];

const MAIN_ADMIN_ASSIGNABLE_ROLE_OPTIONS: { value: AssignableRbacRole; label: string }[] = [
  { value: "supporter", label: "Supporter" },
  { value: "ad_agent", label: "Ad Agent" },
  { value: "agency", label: "Agency" },
  { value: "moderator", label: "Moderator" },
];

function formatRbacRoleLabel(r: RbacRole): string {
  if (r === "superadmin") return "Super Admin";
  if (r === "admin") return "Main Admin";
  if (r === "ad_agent") return "Ad Agent";
  if (r === "agency") return "Agency";
  if (r === "moderator") return "Moderator";
  return "Supporter";
}

function getUserRolesList(u: RbacUserItem): RbacRole[] {
  if (Array.isArray(u.roles) && u.roles.length > 0) {
    return u.roles;
  }
  return [u.role];
}

function getUserAssignableRoles(u: RbacUserItem, allowMainAdmin = true): AssignableRbacRole[] {
  const raw = getUserRolesList(u).filter(
    (r): r is AssignableRbacRole =>
      r !== "superadmin" && (allowMainAdmin || r !== "admin")
  );
  if (raw.length > 0) return raw;
  if (!allowMainAdmin) return ["supporter"];
  return [u.role === "superadmin" ? "admin" : u.role];
}

function toggleRoleSelection(
  current: AssignableRbacRole[],
  target: AssignableRbacRole,
  allowMainAdmin = true,
): AssignableRbacRole[] {
  const order: AssignableRbacRole[] = allowMainAdmin
    ? ["admin", "ad_agent", "moderator", "agency", "supporter"]
    : ["ad_agent", "moderator", "agency", "supporter"];
  const set = new Set<AssignableRbacRole>(
    allowMainAdmin ? current : current.filter((r) => r !== "admin")
  );
  if (!allowMainAdmin && target === "admin") {
    return order.filter((r) => set.has(r));
  }
  if (set.has(target)) {
    if (set.size > 1) {
      set.delete(target);
    }
  } else {
    set.add(target);
  }
  return order.filter((r) => set.has(r));
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
  brandTxtDownload?: number;
  searchMixDownload?: number;
  deconstructDownload?: number;
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
  freeAccessWindow?: FreeAccessWindow;
  updatedAt?: string;
}

export interface SuperAdminModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: TabKey;
}

type TabKey = "CURRENCY" | "PRICING" | "PACKS" | "LEDGER" | "USERS" | "MESSAGES" | "RBAC" | "FAQS" | "DEV";

type AdminFeatureKey =
  | "currency_toggles"
  | "currency_base_price"
  | "pricing_free_access"
  | "pricing_services"
  | "pricing_subscription"
  | "packs_catalog"
  | "ledger_equity"
  | "ledger_owners"
  | "ledger_stripe"
  | "ledger_ad_agents"
  | "users_quick_assign"
  | "users_directory"
  | "messages_retention"
  | "messages_inbox"
  | "rbac_gate"
  | "rbac_matrix"
  | "rbac_assignments"
  | "faqs_list"
  | "faqs_rag"
  | "dev_claims_cache"
  | "dev_env";

export function SuperAdminModal({ isOpen, onClose, initialTab }: SuperAdminModalProps) {
  const isClient = useIsClient();
  const { user: currentSessionUser, role, isSuperAdmin, setActingRole } = useSession();
  const isSuper = role === "superadmin";
  const isMainAdmin = role === "admin";
  const canApproveRoles = isSuper || isMainAdmin;
  const assignableRoleOptions = isSuper
    ? SUPER_ADMIN_ASSIGNABLE_ROLE_OPTIONS
    : MAIN_ADMIN_ASSIGNABLE_ROLE_OPTIONS;

  const allowedTabs = useMemo<TabKey[]>(() => {
    return isSuper
      ? ["CURRENCY", "PRICING", "LEDGER", "USERS", "MESSAGES", "RBAC", "FAQS", "DEV"]
      : ["CURRENCY", "PRICING", "LEDGER", "USERS", "MESSAGES", "FAQS"];
  }, [isSuper]);

  const resolvedInitialTab: TabKey = initialTab === "PACKS" ? "PRICING" : (initialTab ?? "CURRENCY");
  const [tab, setTab] = useState<TabKey>(resolvedInitialTab);

  useEffect(() => {
    if (initialTab && isOpen) {
      const targetTab: TabKey = initialTab === "PACKS" ? "PRICING" : initialTab;
      if (allowedTabs.includes(targetTab)) {
        setTab(targetTab);
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
  const [isMasterLedgerExpanded, setIsMasterLedgerExpanded] = useState(false);
  // All features under Admin Panel categories start collapsed (false)
  const [expandedFeatures, setExpandedFeatures] = useState<Partial<Record<AdminFeatureKey, boolean>>>({});

  function isFeatureExpanded(key: AdminFeatureKey): boolean {
    return Boolean(expandedFeatures[key]);
  }

  function toggleFeatureExpanded(key: AdminFeatureKey) {
    setExpandedFeatures((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  }

  function setFeatureExpanded(key: AdminFeatureKey, open: boolean) {
    setExpandedFeatures((prev) => ({
      ...prev,
      [key]: open,
    }));
  }
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

  // Live ECB exchange rate via Frankfurter API
  const [liveEcbRate, setLiveEcbRate] = useState<CurrencyRateResponse | null>(null);
  const [isRateLoading, setIsRateLoading] = useState(false);

  async function fetchLiveEcbRate() {
    setIsRateLoading(true);
    try {
      const res = await fetch("/api/currency", { cache: "no-store" });
      if (res.ok) {
        const json = (await res.json()) as CurrencyRateResponse;
        setLiveEcbRate(json);
      }
    } catch {
      // Graceful fallback
    } finally {
      setIsRateLoading(false);
    }
  }

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
  const [showInlineReplyBox, setShowInlineReplyBox] = useState(false);
  const [composeRecipientEmail, setComposeRecipientEmail] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [composeSending, setComposeSending] = useState(false);
  const [composeCustomizeRequestId, setComposeCustomizeRequestId] = useState<string | undefined>(undefined);
  const [aiStaffNotes, setAiStaffNotes] = useState("");
  const [aiDrafting, setAiDrafting] = useState(false);

  const composeHasLinks = LINK_URL_PATTERN.test(composeSubject) || LINK_URL_PATTERN.test(composeBody);

  function openReplyToMessage(msg: AdminMessage) {
    const targetEmail = (
      msg.direction === "admin_to_user" && msg.recipientEmail
        ? msg.recipientEmail
        : msg.senderEmail
    ).trim();
    const rawSub = (msg.subject || "Message").trim();
    const cleanSub = rawSub.toLowerCase().startsWith("re:")
      ? rawSub.slice(0, 150)
      : `Re: ${rawSub}`.slice(0, 150);

    setErrorMsg(null);
    setStatusMsg(null);
    setComposeRecipientEmail(targetEmail);
    setComposeSubject(cleanSub);
    setComposeBody("");
    setComposeCustomizeRequestId(msg.customizeRequestId);
    setShowInlineReplyBox(true);
    setShowComposeMessage(true);

    setTimeout(() => {
      const el =
        (document.getElementById("inline-reply-body-textarea") as HTMLTextAreaElement | null) ||
        (document.getElementById("top-compose-body-textarea") as HTMLTextAreaElement | null);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.focus();
      }
    }, 60);
  }

  // RBAC Matrix & Role Assignment state
  const [rbacMatrix, setRbacMatrix] = useState<RbacMatrix | null>(null);
  const [rbacUsers, setRbacUsers] = useState<RbacUserItem[]>([]);
  const [rbacLoading, setRbacLoading] = useState(false);
  const [rbacSaving, setRbacSaving] = useState(false);

  // Monthly Search Subscription Price State
  const [draftSubPrice, setDraftSubPrice] = useState<string | null>(null);
  const subSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"ALL" | RbacRole>("ALL");
  const [quickAssignEmail, setQuickAssignEmail] = useState("");
  const [quickAssignRoles, setQuickAssignRoles] = useState<AssignableRbacRole[]>(["supporter"]);
  const [confirmQuickAssignOpen, setConfirmQuickAssignOpen] = useState(false);
  const [pendingUserRoles, setPendingUserRoles] = useState<Record<string, AssignableRbacRole[]>>({});
  const [confirmingRoleUid, setConfirmingRoleUid] = useState<string | null>(null);
  const [confirmResetRoleUid, setConfirmResetRoleUid] = useState<string | null>(null);
  const [confirmDeleteUserUid, setConfirmDeleteUserUid] = useState<string | null>(null);
  const [deletingUserUid, setDeletingUserUid] = useState<string | null>(null);

  useEffect(() => {
    if (!isSuper) {
      setQuickAssignRoles((prev) => {
        const filtered = prev.filter((r) => r !== "admin");
        return filtered.length > 0 ? filtered : ["supporter"];
      });
      setPendingUserRoles((prev) => {
        const next: Record<string, AssignableRbacRole[]> = {};
        for (const [uid, roles] of Object.entries(prev)) {
          const filtered = roles.filter((r) => r !== "admin");
          next[uid] = filtered.length > 0 ? filtered : ["supporter"];
        }
        return next;
      });
    }
  }, [isSuper]);
  const [confirmClearAdAgentFormOpen, setConfirmClearAdAgentFormOpen] = useState(false);
  const [confirmResetFaqsOpen, setConfirmResetFaqsOpen] = useState(false);
  const [confirmPresetPricingMode, setConfirmPresetPricingMode] = useState<"FREE" | "PAID" | null>(null);

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
      // Signed-in admin request: the server only returns the full corpus to admins.
      const data = await apiFetch<{ entries?: RagSentenceItem[] }>("/api/rag", { method: "GET" });
      if (Array.isArray(data.entries)) {
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

  // Ad Agent Distribution Ledger state
  const [adAgentLedger, setAdAgentLedger] = useState<AdAgentDistributionItem[]>([]);
  const [selectedRegisteredAgentKey, setSelectedRegisteredAgentKey] = useState<string>("");
  const [showAddAdAgent, setShowAddAdAgent] = useState(true);
  const [newAdAgent, setNewAdAgent] = useState<{
    name: string;
    email: string;
    phone: string;
    bankOrPayIdDetails: string;
    redistributionPercent: AdAgentRedistributionPercent;
    suburb: string;
    state: string;
    latitude: number;
    longitude: number;
  }>({
    name: "",
    email: "",
    phone: "",
    bankOrPayIdDetails: "",
    redistributionPercent: 30,
    suburb: "Sydney",
    state: "NSW",
    latitude: -33.8688,
    longitude: 151.2093,
  });
  const [adAgentSaving, setAdAgentSaving] = useState(false);
  const [activatingAdAgentId, setActivatingAdAgentId] = useState<string | null>(null);
  const [confirmDeleteAdAgentId, setConfirmDeleteAdAgentId] = useState<string | null>(null);
  const [confirmResetAdAgentId, setConfirmResetAdAgentId] = useState<string | null>(null);
  const [resettingAdAgentId, setResettingAdAgentId] = useState<string | null>(null);

  const customizeServiceUnitTokens = Math.max(
    0,
    Math.round(Number(config?.serviceCosts?.customizeService ?? 55))
  );
  const audCentsPerTokenUnit = Math.max(
    1,
    Math.round(Number(config?.audCentsPerToken ?? 100))
  );
  const customizeServiceAudCents = Math.round(customizeServiceUnitTokens * audCentsPerTokenUnit);
  const customizeServiceUsdCents = audToUsdCents(customizeServiceAudCents, liveEcbRate?.rate);

  const allAdAgentRecords = useMemo<AdAgentDistributionItem[]>(() => {
    const combinedLedger: AdAgentDistributionItem[] = [...adAgentLedger];
    const seenEmails = new Set(combinedLedger.map((a) => a.email.trim().toLowerCase()));

    // Every registered user approved with the "ad_agent" RBAC role is preserved in Ad Agent records
    // and available to be activated one-by-one from this panel (without auto-inserting into active rows).
    for (const u of rbacUsers) {
      const cleanEmail = (u.email || "").trim().toLowerCase();
      if (!cleanEmail || seenEmails.has(cleanEmail)) continue;
      if (getUserRolesList(u).includes("ad_agent")) {
        seenEmails.add(cleanEmail);
        const cleanUid = (u.uid || cleanEmail).replace(/[^a-zA-Z0-9_-]/g, "_");
        combinedLedger.push({
          agentId: `agent_rbac_${cleanUid}`,
          uid: u.uid,
          name: (u.displayName || cleanEmail.split("@")[0] || "Ad Agent").trim(),
          email: cleanEmail,
          phone: "Not specified",
          bankOrPayIdDetails: "",
          locationLabel: "Sydney, NSW, AU",
          latitude: -33.8688,
          longitude: 151.2093,
          customizationsCount: 0,
          totalCustomizationsTokens: customizeServiceUnitTokens,
          totalCustomizationsAudCents: customizeServiceAudCents,
          totalCustomizationsUsdCents: customizeServiceUsdCents,
          redistributionPercentage: 30,
          redistributionTokens: Math.round((customizeServiceUnitTokens * 30) / 100),
          redistributionAudCents: Math.round((customizeServiceAudCents * 30) / 100),
          redistributionUsdCents: audToUsdCents(
            Math.round((customizeServiceAudCents * 30) / 100),
            liveEcbRate?.rate
          ),
          status: "inactive",
          inActiveLedger: false,
          isSuperAdminBuiltIn: false,
        });
      }
    }

    return combinedLedger.map((agent) =>
      computeAdAgentDisplayItem(agent, {
        customizeServiceUnitTokens,
        audCentsPerTokenUnit,
        ecbRate: liveEcbRate?.rate,
      }),
    );
  }, [
    adAgentLedger,
    rbacUsers,
    customizeServiceUnitTokens,
    audCentsPerTokenUnit,
    customizeServiceAudCents,
    customizeServiceUsdCents,
    liveEcbRate?.rate,
  ]);

  const liveAdAgentLedger = useMemo<AdAgentDistributionItem[]>(
    () => allAdAgentRecords.filter((a) => a.inActiveLedger !== false),
    [allAdAgentRecords]
  );

  const savedInactiveAdAgentRecords = useMemo<AdAgentDistributionItem[]>(
    () => allAdAgentRecords.filter((a) => a.inActiveLedger === false),
    [allAdAgentRecords]
  );

  function selectAndAutofillAdAgent(
    agentKey: string,
    ledgerList: AdAgentDistributionItem[] = allAdAgentRecords
  ) {
    setSelectedRegisteredAgentKey(agentKey);
    if (!agentKey || agentKey === "__NEW__") {
      setNewAdAgent({
        name: "",
        email: "",
        phone: "",
        bankOrPayIdDetails: "",
        redistributionPercent: 30,
        suburb: "Sydney",
        state: "NSW",
        latitude: -33.8688,
        longitude: 151.2093,
      });
      return;
    }

    // 1. Check if in Ad Agent records (active or inactive saved record) by agentId or email
    const matchedLedger = ledgerList.find(
      (a) => a.agentId === agentKey || a.email.toLowerCase() === agentKey.toLowerCase()
    );
    if (matchedLedger) {
      const labelParts = (matchedLedger.locationLabel || "").split(",").map((s) => s.trim());
      setNewAdAgent({
        name: matchedLedger.name || "",
        email: matchedLedger.email || "",
        phone: matchedLedger.phone || "",
        bankOrPayIdDetails: matchedLedger.bankOrPayIdDetails || "",
        redistributionPercent: (AD_AGENT_REDISTRIBUTION_PERCENTS.includes(
          matchedLedger.redistributionPercentage as AdAgentRedistributionPercent
        )
          ? matchedLedger.redistributionPercentage
          : 30) as AdAgentRedistributionPercent,
        suburb: matchedLedger.suburb || labelParts[0] || "Sydney",
        state: matchedLedger.state || labelParts[1] || "NSW",
        latitude: typeof matchedLedger.latitude === "number" ? matchedLedger.latitude : -33.8688,
        longitude: typeof matchedLedger.longitude === "number" ? matchedLedger.longitude : 151.2093,
      });
      return;
    }

    // 2. Otherwise check rbacUsers for registered user
    const matchedUser = rbacUsers.find(
      (u) => u.uid === agentKey || u.email.toLowerCase() === agentKey.toLowerCase()
    );
    if (matchedUser) {
      setNewAdAgent({
        name: matchedUser.displayName || matchedUser.email.split("@")[0] || "Ad Agent",
        email: matchedUser.email,
        phone: "+61 400 000 000",
        bankOrPayIdDetails: "",
        redistributionPercent: 30,
        suburb: "Sydney",
        state: "NSW",
        latitude: -33.8688,
        longitude: 151.2093,
      });
    }
  }

  async function reloadAdAgents() {
    try {
      const data = await apiFetch<{ ledger?: AdAgentDistributionItem[] }>("/api/ad-agent", {
        method: "GET",
      });
      if (data.ledger) {
        setAdAgentLedger(data.ledger);
        if (!selectedRegisteredAgentKey && data.ledger.length > 0) {
          const firstActive = data.ledger.find((a) => a.inActiveLedger !== false) || data.ledger[0];
          selectAndAutofillAdAgent(firstActive.agentId, data.ledger);
        } else if (selectedRegisteredAgentKey && selectedRegisteredAgentKey !== "__NEW__") {
          const matchedInLedger = data.ledger.find(
            (a) =>
              a.agentId === selectedRegisteredAgentKey ||
              a.email.toLowerCase() === selectedRegisteredAgentKey.toLowerCase() ||
              (newAdAgent.email && a.email.toLowerCase() === newAdAgent.email.trim().toLowerCase())
          );
          if (matchedInLedger && selectedRegisteredAgentKey.includes("@")) {
            selectAndAutofillAdAgent(matchedInLedger.agentId, data.ledger);
          }
        }
      }
    } catch {
      // Non-blocking
    }
  }

  async function handleSuperAdminUpsertAdAgent(e: React.FormEvent) {
    e.preventDefault();
    const cleanName = newAdAgent.name.trim();
    const cleanEmail = newAdAgent.email.trim().toLowerCase();
    if (!cleanName || !cleanEmail) {
      setErrorMsg("Enter both Ad Agent Name and Email.");
      return;
    }
    setAdAgentSaving(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const data = await apiFetch<{
        success: boolean;
        agent?: { agentId: string };
        ledger: AdAgentDistributionItem[];
      }>("/api/ad-agent", {
        method: "POST",
        body: {
          action: "SUPERADMIN_UPSERT_AGENT",
          name: cleanName,
          email: cleanEmail,
          phone: newAdAgent.phone.trim() || "Not specified",
          bankOrPayIdDetails: newAdAgent.bankOrPayIdDetails.trim(),
          redistributionPercent: newAdAgent.redistributionPercent,
          location: {
            suburb: newAdAgent.suburb.trim() || "Sydney",
            state: newAdAgent.state.trim() || "NSW",
            country: "AU",
            latitude: Number.isFinite(Number(newAdAgent.latitude)) ? Number(newAdAgent.latitude) : -33.8688,
            longitude: Number.isFinite(Number(newAdAgent.longitude)) ? Number(newAdAgent.longitude) : 151.2093,
          },
        },
      });
      if (data.ledger) {
        setAdAgentLedger(data.ledger);
        window.dispatchEvent(new CustomEvent("ad-agent-ledger-updated", { detail: { ledger: data.ledger } }));
        const saved = data.ledger.find((a) => a.email.toLowerCase() === cleanEmail);
        if (saved) {
          selectAndAutofillAdAgent(saved.agentId, data.ledger);
        }
      }
      setStatusMsg(
        `Saved Ad Agent "${cleanName}" (${cleanEmail}) with Bank/PayID details and ${newAdAgent.redistributionPercent}% redistribution.`
      );
      reloadRbac();
    } catch (err) {
      setErrorMsg(errorMessage(err));
    } finally {
      setAdAgentSaving(false);
    }
  }

  async function handleUpdateAdAgentPercent(
    agentId: string,
    redistributionPercent: AdAgentRedistributionPercent,
    agentName: string
  ) {
    setAdAgentSaving(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const data = await apiFetch<{
        success: boolean;
        ledger: AdAgentDistributionItem[];
      }>("/api/ad-agent", {
        method: "POST",
        body: {
          action: "SUPERADMIN_UPDATE_PERCENT",
          agentId,
          redistributionPercent,
        },
      });
      if (data.ledger) {
        setAdAgentLedger(data.ledger);
        window.dispatchEvent(new CustomEvent("ad-agent-ledger-updated", { detail: { ledger: data.ledger } }));
      }
      setStatusMsg(`Updated Ad Agent "${agentName}" redistribution to ${redistributionPercent}%.`);
    } catch (err) {
      setErrorMsg(errorMessage(err));
    } finally {
      setAdAgentSaving(false);
    }
  }

  async function handleToggleAdAgentStatus(agentId: string, currentStatus: "active" | "inactive") {
    setAdAgentSaving(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const data = await apiFetch<{
        success: boolean;
        ledger: AdAgentDistributionItem[];
      }>("/api/ad-agent", {
        method: "POST",
        body: {
          action: "SUPERADMIN_TOGGLE_STATUS",
          agentId,
          status: currentStatus === "active" ? "inactive" : "active",
        },
      });
      if (data.ledger) {
        setAdAgentLedger(data.ledger);
        window.dispatchEvent(new CustomEvent("ad-agent-ledger-updated", { detail: { ledger: data.ledger } }));
      }
      setStatusMsg("Updated Ad Agent status.");
    } catch (err) {
      setErrorMsg(errorMessage(err));
    } finally {
      setAdAgentSaving(false);
    }
  }

  function handleDownloadAdAgentInvoice(agent: AdAgentDistributionItem) {
    const now = new Date();
    const dateStamp = now.toISOString().slice(0, 10);
    const invoiceId = `INV-ADAGENT-${now.getTime().toString(36).toUpperCase()}`;
    const safeName = (agent.name || agent.email.split("@")[0] || "ad-agent")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    const lines = [
      "======================================================================",
      "          ADRADARHQ — AD AGENT REDISTRIBUTION PAYOUT INVOICE          ",
      "======================================================================",
      `Invoice Reference : ${invoiceId}`,
      `Issue Date (AEST) : ${now.toLocaleString("en-AU")}`,
      "",
      "----------------------------------------------------------------------",
      "1. AD AGENT PAYEE & BANK / PAYID DETAILS",
      "----------------------------------------------------------------------",
      `Ad Agent Name     : ${agent.name}`,
      `Registered Email  : ${agent.email}`,
      `Phone Number      : ${agent.phone || "Not specified"}`,
      `Location          : ${agent.locationLabel} (${agent.latitude.toFixed(2)}, ${agent.longitude.toFixed(2)})`,
      `Bank / PayID      : ${
        agent.bankOrPayIdDetails && agent.bankOrPayIdDetails.trim()
          ? agent.bankOrPayIdDetails.trim()
          : "Not provided — please verify Bank / PayID details with Ad Agent"
      }`,
      "",
      "----------------------------------------------------------------------",
      "2. CUSTOMIZATIONS & REDISTRIBUTION SUMMARY",
      "----------------------------------------------------------------------",
      `Professional Customize Price : ${customizeServiceUnitTokens.toLocaleString("en-AU")} Tokens (${formatAud(
        customizeServiceAudCents
      )} AUD / ${formatUsd(customizeServiceUsdCents)} USD)`,
      `Customizations Completed     : ${agent.customizationsCount} Order(s)`,
      `Total Customizations Value   : ${agent.totalCustomizationsTokens.toLocaleString("en-AU")} Tokens (${formatAud(
        agent.totalCustomizationsAudCents
      )} AUD / ${formatUsd(agent.totalCustomizationsUsdCents)} USD)`,
      `Redistribution Percentage    : ${agent.redistributionPercentage}%`,
      "",
      "----------------------------------------------------------------------",
      "3. AMOUNT TO PAY AD AGENT (REDIST. AMOUNT)",
      "----------------------------------------------------------------------",
      `AMOUNT TO PAY (AUD)          : ${formatAud(agent.redistributionAudCents)} AUD`,
      `AMOUNT TO PAY (USD Equiv.)   : ${formatUsd(agent.redistributionUsdCents)} USD`,
      `Redistribution Tokens        : ${agent.redistributionTokens.toLocaleString("en-AU")} Tokens`,
      "",
      "----------------------------------------------------------------------",
      "Settlement Note: After paying this invoice amount to the Ad Agent,",
      "reset the Ad Agent's Redist. Amount to 0 in the Ad Agent Distribution Ledger.",
      "======================================================================",
    ];

    const blob = new Blob([lines.join("\r\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ad-agent-invoice-${safeName}-${dateStamp}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);

    // Automatically open the 2-step "Confirm 0 ⚡" reset button so Super Admin can immediately reset Redist. Amount to 0
    setConfirmResetAdAgentId(agent.agentId);
    setConfirmDeleteAdAgentId(null);
    setStatusMsg(
      `Downloaded payout invoice (.txt) for ${agent.name} — Amount to pay: ${formatAud(
        agent.redistributionAudCents
      )} AUD. Click "Confirm 0 ⚡" to reset Redist. Amount to 0.`
    );
  }

  async function handleResetAdAgentZero(agentId: string, email: string) {
    setResettingAdAgentId(agentId);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const data = await apiFetch<{
        success: boolean;
        ledger: AdAgentDistributionItem[];
      }>("/api/ad-agent", {
        method: "POST",
        body: {
          action: "SUPERADMIN_RESET_AGENT_ZERO",
          agentId,
        },
      });
      if (data.ledger) {
        setAdAgentLedger(data.ledger);
        window.dispatchEvent(new CustomEvent("ad-agent-ledger-updated", { detail: { ledger: data.ledger } }));
      }
      setConfirmResetAdAgentId(null);
      setStatusMsg(`Reset Ad Agent ${email} customizations redistribution balance to 0 ⚡.`);
    } catch (err) {
      setErrorMsg(errorMessage(err));
    } finally {
      setResettingAdAgentId(null);
    }
  }

  async function handleActivateAdAgent(agent: { agentId: string; email: string; name: string }) {
    setActivatingAdAgentId(agent.agentId);
    setAdAgentSaving(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const data = await apiFetch<{
        success: boolean;
        ledger: AdAgentDistributionItem[];
      }>("/api/ad-agent", {
        method: "POST",
        body: {
          action: "SUPERADMIN_ACTIVATE_AGENT",
          agentId: agent.agentId,
          email: agent.email,
          name: agent.name,
        },
      });
      if (data.ledger) {
        setAdAgentLedger(data.ledger);
        window.dispatchEvent(new CustomEvent("ad-agent-ledger-updated", { detail: { ledger: data.ledger } }));
        const activated = data.ledger.find(
          (a) => a.agentId === agent.agentId || a.email.toLowerCase() === agent.email.toLowerCase()
        );
        if (activated) {
          selectAndAutofillAdAgent(activated.agentId, data.ledger);
        }
      }
      setStatusMsg(
        `Activated "${agent.name}" (${agent.email}) and added them to the active Ad Agent & Customizations Value list.`
      );
      reloadRbac();
    } catch (err) {
      setErrorMsg(errorMessage(err));
    } finally {
      setActivatingAdAgentId(null);
      setAdAgentSaving(false);
    }
  }

  async function handleDeleteAdAgent(agentId: string, agentEmail?: string, agentName?: string) {
    setAdAgentSaving(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const data = await apiFetch<{
        success: boolean;
        ledger: AdAgentDistributionItem[];
      }>("/api/ad-agent", {
        method: "POST",
        body: {
          action: "SUPERADMIN_DELETE_AGENT",
          agentId,
          ...(agentEmail ? { email: agentEmail } : {}),
        },
      });
      if (data.ledger) {
        setAdAgentLedger(data.ledger);
        window.dispatchEvent(new CustomEvent("ad-agent-ledger-updated", { detail: { ledger: data.ledger } }));
      }
      setConfirmDeleteAdAgentId(null);
      setStatusMsg(
        `Removed "${agentName || agentEmail || "Ad Agent"}" from the active Ad Agent & Customizations Value list. All records remain saved and can be re-activated anytime.`
      );
      reloadRbac();
    } catch (err) {
      setErrorMsg(errorMessage(err));
    } finally {
      setAdAgentSaving(false);
    }
  }

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

  async function handleAssignUserRole(
    email: string,
    targetRoleOrRoles: AssignableRbacRole | AssignableRbacRole[],
    uid?: string
  ) {
    const rawArray: AssignableRbacRole[] = Array.isArray(targetRoleOrRoles)
      ? targetRoleOrRoles.length > 0
        ? targetRoleOrRoles
        : ["supporter"]
      : [targetRoleOrRoles];
    if (!isSuper && rawArray.includes("admin")) {
      setErrorMsg(
        "Main Admin cannot make people Main Admin. Main Admin can only approve: Supporter, Ad Agent, Agency, Moderator."
      );
      return;
    }
    const filteredArray = isSuper ? rawArray : rawArray.filter((r) => r !== "admin");
    const rolesArray: AssignableRbacRole[] =
      filteredArray.length > 0 ? filteredArray : ["supporter"];
    setRbacSaving(true);
    if (uid) setConfirmingRoleUid(uid);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const data = await apiFetch<{ success: boolean; users: RbacUserItem[] }>("/api/admin/rbac", {
        method: "PUT",
        body: {
          action: "ASSIGN_USER_ROLE",
          email,
          role: rolesArray[0],
          roles: rolesArray,
          actingRole: isSuper ? "superadmin" : "admin",
        },
      });
      if (data.users) setRbacUsers(data.users);
      reloadAdAgents();
      if (uid) {
        setPendingUserRoles((prev) => {
          const next = { ...prev };
          delete next[uid];
          return next;
        });
      }
      const roleLabels = rolesArray.map((r) => formatRbacRoleLabel(r)).join(", ");
      setStatusMsg(
        `Confirmed: ${rolesArray.length > 1 ? "Roles" : "Role"} [${roleLabels}] assigned to ${email} in RBAC.`
      );
      setQuickAssignEmail("");
      setConfirmQuickAssignOpen(false);
      if (uid) setConfirmResetRoleUid(null);
    } catch (err) {
      setErrorMsg(errorMessage(err));
    } finally {
      setRbacSaving(false);
      setConfirmingRoleUid(null);
    }
  }

  async function handleDeleteUser(targetUser: RbacUserItem) {
    if (targetUser.isPermanentSuperAdmin) {
      setErrorMsg("Cannot delete the permanent Super Admin account.");
      return;
    }
    setDeletingUserUid(targetUser.uid);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const data = await apiFetch<{
        success: boolean;
        deleted?: { deletedUid: string; deletedEmail: string };
        users?: RbacUserItem[];
      }>("/api/admin/rbac", {
        method: "DELETE",
        body: {
          action: "DELETE_USER",
          uid: targetUser.uid,
          ...(targetUser.email ? { email: targetUser.email } : {}),
          confirmDelete: true,
          actingRole: isSuper ? "superadmin" : "admin",
        },
      });
      if (data.users) {
        setRbacUsers(data.users);
      } else {
        setRbacUsers((prev) => prev.filter((u) => u.uid !== targetUser.uid));
      }
      setConfirmDeleteUserUid(null);
      setUserRowAction((prev) => (prev?.uid === targetUser.uid ? null : prev));
      setPendingUserRoles((prev) => {
        const next = { ...prev };
        delete next[targetUser.uid];
        return next;
      });
      reloadAdAgents();
      setStatusMsg(`Deleted user ${targetUser.email || targetUser.uid}.`);
    } catch (err) {
      setErrorMsg(errorMessage(err));
    } finally {
      setDeletingUserUid(null);
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
            note: "Added by Super Admin in All Users & Multi-Role RBAC Directory Table",
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
          setErrorMsg("Enter a positive integer of tokens to remove (1 or more).");
          return;
        }
        if (currentBal <= 0) {
          setErrorMsg(`Account "${cleanEmail}" has 0 tokens. Nobody can have negative tokens.`);
          return;
        }
        if (tokens > currentBal) {
          setErrorMsg(
            `Cannot remove ${tokens.toLocaleString("en-AU")} tokens from "${cleanEmail}" (current balance: ${currentBal.toLocaleString("en-AU")} tokens). Nobody can have negative tokens.`
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
            note: "Removed by Super Admin in All Users & Multi-Role RBAC Directory Table",
          },
        });
        const newBal = Math.max(0, Math.round(Number(data.balanceAfter ?? currentBal - tokens)));
        if (data.orders) setOrderLedger(data.orders);
        setRbacUsers((prev) =>
          prev.map((u) => (u.uid === uid || u.email.toLowerCase() === cleanEmail ? { ...u, tokenBalance: newBal } : u))
        );
        setStatusMsg(
          `Removed -${tokens.toLocaleString("en-AU")} tokens from ${cleanEmail} (new balance: ${newBal.toLocaleString("en-AU")} ⚡).`
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
            note: "Reset to zero by Super Admin in All Users & Multi-Role RBAC Directory Table",
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

      await Promise.all([reloadRbac(), reloadFaqs(), reloadOrders(), reloadAdAgents()]);
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
      apiFetch<{ ledger?: AdAgentDistributionItem[] }>("/api/ad-agent", { method: "GET" }).catch(() => null),
      fetch("/api/currency", { cache: "no-store" })
        .then((res) => (res.ok ? (res.json() as Promise<CurrencyRateResponse>) : null))
        .catch(() => null),
    ])
      .then(([adminData, msgData, rbacData, faqData, ordersData, adAgentData, currencyData]) => {
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
          if (adAgentData?.ledger) {
            setAdAgentLedger(adAgentData.ledger);
            if (adAgentData.ledger.length > 0) {
              selectAndAutofillAdAgent(adAgentData.ledger[0].agentId, adAgentData.ledger);
            }
          }
          if (currencyData) setLiveEcbRate(currencyData);
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

  // Live synchronization when an Ad Agent adds/updates their details in Ad Agent Registration & Customize Orders Panel
  useEffect(() => {
    function handleAdAgentLedgerUpdated(e: Event) {
      const custom = e as CustomEvent<{
        agent?: { agentId?: string; email?: string };
        ledger?: AdAgentDistributionItem[];
      }>;
      if (Array.isArray(custom.detail?.ledger)) {
        const nextLedger = custom.detail.ledger;
        setAdAgentLedger(nextLedger);
        const savedEmail = custom.detail?.agent?.email?.toLowerCase();
        const savedId = custom.detail?.agent?.agentId;
        if (savedId || savedEmail) {
          const matched = nextLedger.find(
            (a) => a.agentId === savedId || (savedEmail && a.email.toLowerCase() === savedEmail)
          );
          if (matched) {
            selectAndAutofillAdAgent(matched.agentId, nextLedger);
          }
        }
      }
      reloadAdAgents();
      reloadRbac();
    }

    window.addEventListener("ad-agent-ledger-updated", handleAdAgentLedgerUpdated);
    return () => {
      window.removeEventListener("ad-agent-ledger-updated", handleAdAgentLedgerUpdated);
    };
  }, []);

  // Automatically refresh Ad Agent Distribution Ledger when viewing LEDGER tab or refocusing window
  useEffect(() => {
    if (!isOpen || tab !== "LEDGER") return;
    reloadAdAgents();
    const intervalId = setInterval(() => {
      reloadAdAgents();
    }, 6000);
    const handleFocus = () => reloadAdAgents();
    window.addEventListener("focus", handleFocus);
    return () => {
      clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
    };
  }, [isOpen, tab]);

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
      if (patch.serviceCosts || patch.audCentsPerToken !== undefined) {
        reloadAdAgents();
      }
      window.dispatchEvent(new CustomEvent("adradar:config-updated"));
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

  const [freeAccessNowMs, setFreeAccessNowMs] = useState<number>(0);
  const [selectedCountryDropdown, setSelectedCountryDropdown] = useState<string>("");
  const [detectedUserGeo, setDetectedUserGeo] = useState<{
    country: string;
    suburb: string;
    state: string;
  }>({ country: "AU", suburb: "Sydney", state: "NSW" });
  const [detectingFreeAccessGeo, setDetectingFreeAccessGeo] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    function syncGeoState() {
      const cfg = loadGeoConfig();
      const country = loadDetectedGeoCountry() || cfg.country || "AU";
      setDetectedUserGeo({
        country: country.trim().toUpperCase(),
        suburb: cfg.suburb || "Sydney",
        state: cfg.state || "NSW",
      });
    }
    syncGeoState();
    window.addEventListener("adradar:geo-updated", syncGeoState);
    return () => window.removeEventListener("adradar:geo-updated", syncGeoState);
  }, [isOpen]);

  async function handleDetectFreeAccessGeo() {
    setDetectingFreeAccessGeo(true);
    try {
      const detected = await autofindUserLocation();
      setDetectedUserGeo({
        country: (detected.country || "AU").trim().toUpperCase(),
        suburb: detected.suburb || "Sydney",
        state: detected.state || "NSW",
      });
      setStatusMsg(
        `Geolocation detected: ${detected.suburb}, ${detected.state} — ${getCountryName(detected.country)} (${detected.country}).`
      );
    } catch {
      // non-blocking
    } finally {
      setDetectingFreeAccessGeo(false);
    }
  }

  useEffect(() => {
    if (!isOpen) return;
    setFreeAccessNowMs(Date.now());
    if (!config?.freeAccessWindow?.enabled) return;
    const timer = setInterval(() => {
      const now = Date.now();
      setFreeAccessNowMs(now);
      if (config.freeAccessWindow?.expiresAt && Date.parse(config.freeAccessWindow.expiresAt) <= now) {
        window.dispatchEvent(new CustomEvent("adradar:config-updated"));
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [isOpen, config?.freeAccessWindow?.enabled, config?.freeAccessWindow?.expiresAt]);

  async function handleUpdateFreeAccessCountries(nextCountriesRaw: string[]) {
    if (!isSuper) {
      setErrorMsg("Only Super Admin can configure eligible countries for Free Access.");
      return;
    }
    const nextCountries = normalizeAllowedCountries(nextCountriesRaw);
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
        body: {
          action: "SET_FREE_ACCESS_WINDOW",
          allowedCountries: nextCountries,
        },
      });
      setConfig(data.config);
      if (data.ledger) setLedger(data.ledger);
      window.dispatchEvent(new CustomEvent("adradar:config-updated"));
      setStatusMsg(
        `Free Access countries updated: ${formatAllowedCountriesSummary(nextCountries)}.`
      );
    } catch (err) {
      setErrorMsg(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  function handleSelectCountryFromDropdown(countryCode: string) {
    const code = countryCode.trim().toUpperCase();
    if (!code) return;
    setSelectedCountryDropdown("");
    if (code === ALL_COUNTRIES_CODE) {
      void handleUpdateFreeAccessCountries([ALL_COUNTRIES_CODE]);
      return;
    }
    const current = normalizeAllowedCountries(config?.freeAccessWindow?.allowedCountries).filter(
      (c) => c !== ALL_COUNTRIES_CODE
    );
    const next = current.includes(code)
      ? current.filter((c) => c !== code)
      : [...current, code];
    void handleUpdateFreeAccessCountries(next.length > 0 ? next : [ALL_COUNTRIES_CODE]);
  }

  function handleRemoveFreeAccessCountry(countryCode: string) {
    const code = countryCode.trim().toUpperCase();
    const current = normalizeAllowedCountries(config?.freeAccessWindow?.allowedCountries).filter(
      (c) => c !== ALL_COUNTRIES_CODE && c !== code
    );
    void handleUpdateFreeAccessCountries(current.length > 0 ? current : [ALL_COUNTRIES_CODE]);
  }

  async function handleToggleFreeAccess(targetDuration: FreeAccessDurationMinutes | null) {
    if (!isSuper) {
      setErrorMsg("Only Super Admin can turn the Timed Free Access Window on or off.");
      return;
    }
    const currentlyActive = isFreeAccessWindowActive(config?.freeAccessWindow, Date.now());
    const currentDuration = currentlyActive ? (config?.freeAccessWindow?.durationMinutes ?? null) : null;
    const nextDuration: FreeAccessDurationMinutes | null =
      targetDuration !== null && currentDuration === targetDuration ? null : targetDuration;
    const currentCountries = normalizeAllowedCountries(config?.freeAccessWindow?.allowedCountries);

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
        body: {
          action: "SET_FREE_ACCESS_WINDOW",
          durationMinutes: nextDuration,
          allowedCountries: currentCountries,
        },
      });
      setConfig(data.config);
      if (data.ledger) setLedger(data.ledger);
      setFreeAccessNowMs(Date.now());
      window.dispatchEvent(new CustomEvent("adradar:config-updated"));
      if (nextDuration) {
        const labelStr = nextDuration === 60 ? "Free 1 Hour" : `Free ${nextDuration} Minutes`;
        const countriesStr = formatAllowedCountriesSummary(
          data.config.freeAccessWindow?.allowedCountries
        );
        setStatusMsg(
          `${labelStr} toggled ON! The web app is now FREE to use for Monthly Subscribers in ${countriesStr}.`
        );
      } else {
        setStatusMsg("Timed Free Access turned OFF. Standard token pricing is now active.");
      }
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
      setShowInlineReplyBox(false);
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
    const resolvedMsgEmail = msg
      ? msg.direction === "admin_to_user" && msg.recipientEmail
        ? msg.recipientEmail
        : msg.senderEmail
      : "";
    const targetEmail = (resolvedMsgEmail || composeRecipientEmail).trim();
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
      if (selectedMessage) {
        setShowInlineReplyBox(true);
      }
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
      className="fixed inset-0 z-50 flex items-center justify-center p-1.5 sm:p-6"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/80 backdrop-blur-md transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Main Container */}
      <div className="relative z-10 flex w-full max-w-4xl lg:max-w-6xl xl:max-w-7xl max-h-[calc(100dvh-0.75rem)] sm:max-h-[92vh] flex-col rounded-2xl border border-white/[0.14] bg-surface-container-high shadow-2xl overflow-hidden my-auto transition-all duration-200">
        {/* Header */}
        <div className="flex min-h-14 sm:h-16 shrink-0 items-center justify-between gap-2 border-b border-white/[0.08] px-3 sm:px-6 py-2 sm:py-0">
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-2.5">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/20 text-primary">
              <Icon name="sparkles" className="size-4" />
            </span>
            <div className="min-w-0">
              <h2 id="superadmin-title" className="text-title-sm font-bold text-on-surface truncate">
                {isSuper ? "Super Admin Panel" : "Main Admin Panel"}
              </h2>
              <p className="text-[10px] sm:text-[11px] text-on-surface-variant font-mono truncate">
                {isSuper
                  ? "AdRadarHQ System Configuration, Redistributive Ledger, All Users & 7-Year Archive"
                  : "AdRadarHQ System Configuration, All Users (RBAC), User Messages & FAQ Development"}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
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
                  Main Admin (6 tabs)
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
              isSuper ? "sm:grid-cols-4 lg:grid-cols-8" : "sm:grid-cols-3 lg:grid-cols-6"
            } sm:gap-2 lg:gap-1.5`}
          >
            {[
              { id: "CURRENCY" as const, label: "Currency Controls", icon: "sliders" as IconName },
              { id: "PRICING" as const, label: "Service Pricing", icon: "zap" as IconName },
              { id: "LEDGER" as const, label: "Token Controls & Ledger", icon: "wallet" as IconName },
              { id: "USERS" as const, label: `All Users (${rbacUsers.length})`, icon: "user" as IconName },
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
        <div className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden p-2.5 sm:p-6 space-y-4 sm:space-y-6">
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
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h3 className="text-title-sm font-semibold text-on-surface">Currency Controls</h3>
                      <p className="mt-0.5 text-compact text-on-surface-variant">
                        All features start collapsed. Click any feature below to expand and configure currency &amp; base token pricing.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const allOpen =
                          isFeatureExpanded("currency_toggles") && isFeatureExpanded("currency_base_price");
                        setFeatureExpanded("currency_toggles", !allOpen);
                        setFeatureExpanded("currency_base_price", !allOpen);
                      }}
                      data-agent-id="currency-expand-all-btn"
                      data-testid="currency-expand-all-btn"
                      className={`${btnSecondary} font-mono text-xs shrink-0`}
                    >
                      <Icon
                        name="chevronDown"
                        className={`size-3.5 transition-transform duration-200 ${
                          isFeatureExpanded("currency_toggles") && isFeatureExpanded("currency_base_price")
                            ? "rotate-180"
                            : ""
                        }`}
                      />
                      <span>
                        {isFeatureExpanded("currency_toggles") && isFeatureExpanded("currency_base_price")
                          ? "Collapse All"
                          : "Expand All"}
                      </span>
                    </button>
                  </div>

                  {/* Feature 1: Currency & Ledger Toggles */}
                  <div
                    className={`${card} p-4 space-y-4`}
                    data-agent-id="feature-card-currency-toggles"
                    data-testid="feature-card-currency-toggles"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                      <button
                        type="button"
                        onClick={() => toggleFeatureExpanded("currency_toggles")}
                        aria-expanded={isFeatureExpanded("currency_toggles")}
                        data-agent-id="toggle-feature-currency-toggles-header"
                        data-testid="toggle-feature-currency-toggles-header"
                        className="flex-1 text-left group cursor-pointer"
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <Icon
                            name="chevronDown"
                            className={`size-4 text-primary transition-transform duration-200 ${
                              isFeatureExpanded("currency_toggles") ? "rotate-180" : "-rotate-90"
                            }`}
                          />
                          <h4 className="text-compact font-bold text-on-surface group-hover:text-primary transition-colors">
                            Currency &amp; Ledger Toggles
                          </h4>
                          <span className="rounded-full bg-surface-container-highest px-2 py-0.5 font-mono text-[10px] text-on-surface-variant">
                            Tokens: {config.isTokenSystemEnabled ? "ON" : "OFF"} · AUD:{" "}
                            {config.isAudEnabled ? "ON" : "OFF"} · USD: {config.isUsdEnabled ? "ON" : "OFF"}
                          </span>
                        </div>
                        <p className="mt-0.5 text-[11px] text-on-surface-variant">
                          Independently toggle token deductions, Australian Dollar display (strict AU geolocation), and US Dollar pricing.
                        </p>
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleFeatureExpanded("currency_toggles")}
                        aria-expanded={isFeatureExpanded("currency_toggles")}
                        data-agent-id="toggle-feature-currency-toggles-btn"
                        data-testid="toggle-feature-currency-toggles-btn"
                        className={`${btnSecondary} font-mono text-xs shrink-0`}
                      >
                        <Icon
                          name="chevronDown"
                          className={`size-3.5 transition-transform duration-200 ${
                            isFeatureExpanded("currency_toggles") ? "rotate-180" : ""
                          }`}
                        />
                        <span>{isFeatureExpanded("currency_toggles") ? "Collapse" : "Expand"}</span>
                      </button>
                    </div>

                    {isFeatureExpanded("currency_toggles") && (
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 pt-2 border-t border-white/[0.06]">
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
                    )}
                  </div>

                  {/* Feature 2: Token Base Price (AUD) */}
                  <div
                    className={`${card} p-4 space-y-4`}
                    data-agent-id="feature-card-currency-base-price"
                    data-testid="feature-card-currency-base-price"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                      <button
                        type="button"
                        onClick={() => toggleFeatureExpanded("currency_base_price")}
                        aria-expanded={isFeatureExpanded("currency_base_price")}
                        data-agent-id="toggle-feature-currency-base-price-header"
                        data-testid="toggle-feature-currency-base-price-header"
                        className="flex-1 text-left group cursor-pointer"
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <Icon
                            name="chevronDown"
                            className={`size-4 text-primary transition-transform duration-200 ${
                              isFeatureExpanded("currency_base_price") ? "rotate-180" : "-rotate-90"
                            }`}
                          />
                          <h4 className="text-compact font-bold text-on-surface group-hover:text-primary transition-colors">
                            Base Token Price (AUD — Default Currency)
                          </h4>
                          <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 font-mono text-[10px] font-bold text-primary">
                            {formatAud(config.audCentsPerToken ?? 100)} AUD / token
                          </span>
                        </div>
                        <p className="mt-0.5 text-[11px] text-on-surface-variant">
                          Default is 1 Token = AUD $1.00. All invoices are in AUD. Nations outside AU &amp; NZ see the AUD → USD conversion.
                        </p>
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleFeatureExpanded("currency_base_price")}
                        aria-expanded={isFeatureExpanded("currency_base_price")}
                        data-agent-id="toggle-feature-currency-base-price-btn"
                        data-testid="toggle-feature-currency-base-price-btn"
                        className={`${btnSecondary} font-mono text-xs shrink-0`}
                      >
                        <Icon
                          name="chevronDown"
                          className={`size-3.5 transition-transform duration-200 ${
                            isFeatureExpanded("currency_base_price") ? "rotate-180" : ""
                          }`}
                        />
                        <span>{isFeatureExpanded("currency_base_price") ? "Collapse" : "Expand"}</span>
                      </button>
                    </div>

                    {isFeatureExpanded("currency_base_price") && (
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-white/[0.06]">
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
                        <div className="flex flex-col sm:items-end gap-1">
                          <p className="text-xs font-mono text-outline">
                            International Conversion (Outside AU/NZ): {formatAud(config.audCentsPerToken ?? 100)} AUD ≈ {formatUsd(audToUsdCents(config.audCentsPerToken ?? 100, liveEcbRate?.rate))} USD
                          </p>
                          <div className="flex items-center gap-1.5 font-mono text-[11px] text-secondary">
                            <span className="size-1.5 rounded-full bg-secondary shrink-0 animate-pulse" />
                            <span>
                              Live ECB Rate via Frankfurter: 1 AUD = {liveEcbRate?.rate ? Number(liveEcbRate.rate).toFixed(4) : "0.6500"} USD
                              {liveEcbRate?.date ? ` (${liveEcbRate.date})` : ""}
                            </span>
                            <button
                              type="button"
                              onClick={fetchLiveEcbRate}
                              disabled={isRateLoading}
                              title="Refresh live ECB exchange rate from Frankfurter API"
                              aria-label="Refresh live ECB exchange rate from Frankfurter API"
                              data-agent-id="superadmin-refresh-ecb-rate-btn"
                              data-testid="superadmin-refresh-ecb-rate-btn"
                              className="ml-1 inline-flex items-center gap-1 rounded border border-white/10 bg-surface-container-high px-1.5 py-0.5 text-[10px] font-semibold text-on-surface hover:border-primary/40 hover:text-primary transition disabled:opacity-40"
                            >
                              <Icon name="refresh" className={`size-3 ${isRateLoading ? "animate-spin" : ""}`} />
                              <span>{isRateLoading ? "Syncing…" : "Sync ECB"}</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 2: SERVICE PRICING & TOKEN PACKS (CRUD) */}
              {tab === "PRICING" && (
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h3 className="text-title-sm font-semibold text-on-surface">Service Pricing &amp; Token Packs (CRUD)</h3>
                      <p className="mt-0.5 text-compact text-on-surface-variant">
                        All features start collapsed. Click any feature below to expand and configure timed free web app access, service token amounts, monthly subscription pricing, or Stripe checkout token packs.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const allOpen =
                          (!isSuper || isFeatureExpanded("pricing_free_access")) &&
                          isFeatureExpanded("pricing_services") &&
                          isFeatureExpanded("pricing_subscription") &&
                          showAddPack &&
                          isFeatureExpanded("packs_catalog");
                        if (isSuper) setFeatureExpanded("pricing_free_access", !allOpen);
                        setFeatureExpanded("pricing_services", !allOpen);
                        setFeatureExpanded("pricing_subscription", !allOpen);
                        setShowAddPack(!allOpen);
                        setFeatureExpanded("packs_catalog", !allOpen);
                      }}
                      data-agent-id="pricing-expand-all-btn"
                      data-testid="pricing-expand-all-btn"
                      className={`${btnSecondary} font-mono text-xs shrink-0`}
                    >
                      <Icon
                        name="chevronDown"
                        className={`size-3.5 transition-transform duration-200 ${
                          (!isSuper || isFeatureExpanded("pricing_free_access")) &&
                          isFeatureExpanded("pricing_services") &&
                          isFeatureExpanded("pricing_subscription") &&
                          showAddPack &&
                          isFeatureExpanded("packs_catalog")
                            ? "rotate-180"
                            : ""
                        }`}
                      />
                      <span>
                        {(!isSuper || isFeatureExpanded("pricing_free_access")) &&
                        isFeatureExpanded("pricing_services") &&
                        isFeatureExpanded("pricing_subscription") &&
                        showAddPack &&
                        isFeatureExpanded("packs_catalog")
                          ? "Collapse All"
                          : "Expand All"}
                      </span>
                    </button>
                  </div>

                  {/* TOP PANEL (SUPER ADMIN ONLY): Free 15 Minutes / Free 30 Minutes / Free 1 Hour */}
                  {isSuper && (() => {
                    const freeWindow = config.freeAccessWindow;
                    const isFreeWindowOn = isFreeAccessWindowActive(freeWindow, freeAccessNowMs);
                    const activeDuration = isFreeWindowOn ? (freeWindow?.durationMinutes ?? null) : null;
                    const selectedCountries = normalizeAllowedCountries(freeWindow?.allowedCountries);
                    const isAllCountriesSelected = selectedCountries.includes(ALL_COUNTRIES_CODE);
                    const selectedCountriesLabel = formatAllowedCountriesSummary(selectedCountries);
                    const remainingSec =
                      isFreeWindowOn && freeWindow?.expiresAt
                        ? Math.max(0, Math.ceil((Date.parse(freeWindow.expiresAt) - freeAccessNowMs) / 1000))
                        : 0;
                    const remMin = Math.floor(remainingSec / 60);
                    const remSec = remainingSec % 60;
                    const countdownStr = `${remMin}m ${String(remSec).padStart(2, "0")}s`;

                    return (
                      <div
                        className={`${card} p-4 space-y-4 ${
                          isFreeWindowOn
                            ? "border-2 border-winner/60 bg-winner/10 shadow-[0_0_24px_rgba(34,197,94,0.15)]"
                            : "border border-primary/30"
                        }`}
                        data-agent-id="feature-card-pricing-free-access"
                        data-testid="feature-card-pricing-free-access"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                          <button
                            type="button"
                            onClick={() => toggleFeatureExpanded("pricing_free_access")}
                            aria-expanded={isFeatureExpanded("pricing_free_access")}
                            data-agent-id="toggle-feature-pricing-free-access-header"
                            data-testid="toggle-feature-pricing-free-access-header"
                            className="flex-1 text-left group cursor-pointer"
                          >
                            <div className="flex items-center gap-2 flex-wrap">
                              <Icon
                                name="chevronDown"
                                className={`size-4 text-primary transition-transform duration-200 ${
                                  isFeatureExpanded("pricing_free_access") ? "rotate-180" : "-rotate-90"
                                }`}
                              />
                              <h4 className="text-compact font-bold text-on-surface group-hover:text-primary transition-colors">
                                Free 15 Minutes · Free 30 Minutes · Free 1 Hour
                              </h4>
                              <span
                                className={`rounded-full px-2.5 py-0.5 font-mono text-[10px] font-bold ${
                                  isFreeWindowOn
                                    ? "bg-winner/20 text-winner-soft border border-winner/40"
                                    : "bg-surface-container-highest text-on-surface-variant"
                                }`}
                              >
                                {isFreeWindowOn
                                  ? `⚡ ACTIVE: ${activeDuration === 60 ? "Free 1 Hour" : `Free ${activeDuration}m`} (${countdownStr} left)`
                                  : "Super Admin Only · Off"}
                              </span>
                              <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 font-mono text-[10px] font-semibold text-primary">
                                Countries: {selectedCountriesLabel}
                              </span>
                            </div>
                            <p className="mt-0.5 text-[11px] text-on-surface-variant">
                              When one is toggled on, the web app is 100% free to use for Monthly Subscribers in the selected countries only. Can be turned on and off by Super Admin only.
                            </p>
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleFeatureExpanded("pricing_free_access")}
                            aria-expanded={isFeatureExpanded("pricing_free_access")}
                            data-agent-id="toggle-feature-pricing-free-access-btn"
                            data-testid="toggle-feature-pricing-free-access-btn"
                            className={`${btnSecondary} font-mono text-xs shrink-0`}
                          >
                            <Icon
                              name="chevronDown"
                              className={`size-3.5 transition-transform duration-200 ${
                                isFeatureExpanded("pricing_free_access") ? "rotate-180" : ""
                              }`}
                            />
                            <span>{isFeatureExpanded("pricing_free_access") ? "Collapse" : "Expand"}</span>
                          </button>
                        </div>

                        {isFeatureExpanded("pricing_free_access") && (
                          <div className="space-y-3.5 pt-2 border-t border-white/[0.08]">
                            {/* Country Selector Dropdown (All Countries in the World) */}
                            <div
                              className="rounded-xl border border-white/10 bg-surface-container p-3.5 space-y-3"
                              data-agent-id="free-access-countries-panel"
                              data-testid="free-access-countries-panel"
                            >
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                <div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <label
                                      htmlFor="free-access-country-dropdown"
                                      className="block font-mono text-xs font-bold text-on-surface"
                                    >
                                      Select Countries That Receive Free Use (Monthly Subscribers)
                                    </label>
                                    <span className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/15 px-2 py-0.5 font-mono text-[10px] font-bold text-primary">
                                      <Icon name="mapPin" className="size-3" />
                                      <span>Based on User Geolocation</span>
                                    </span>
                                  </div>
                                  <p className="mt-0.5 text-[11px] text-on-surface-variant">
                                    Eligibility is determined automatically by the user&apos;s live geolocation (GPS &amp; IP Geolocation). Select any countries from all {WORLD_COUNTRIES.length} world countries below.
                                  </p>
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <button
                                    type="button"
                                    disabled={saving || isAllCountriesSelected}
                                    onClick={() => handleUpdateFreeAccessCountries([ALL_COUNTRIES_CODE])}
                                    data-agent-id="free-access-select-all-countries-btn"
                                    data-testid="free-access-select-all-countries-btn"
                                    className={`rounded-lg border px-2.5 py-1 font-mono text-[11px] font-semibold transition cursor-pointer ${
                                      isAllCountriesSelected
                                        ? "border-winner/50 bg-winner/20 text-winner-soft"
                                        : "border-white/15 bg-surface-container-highest text-on-surface hover:border-primary/50"
                                    }`}
                                  >
                                    All Countries (Worldwide)
                                  </button>
                                </div>
                              </div>

                              {/* Live User Geolocation Status Bar */}
                              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/25 bg-primary/10 px-3 py-2 font-mono text-[11px]">
                                <div className="flex flex-wrap items-center gap-1.5 text-on-surface">
                                  <Icon name="mapPin" className="size-3.5 text-primary shrink-0" />
                                  <span className="text-on-surface-variant">Your Detected Geolocation:</span>
                                  <span className="font-bold text-primary">
                                    {detectedUserGeo.suburb}, {detectedUserGeo.state} · {getCountryName(detectedUserGeo.country)} ({detectedUserGeo.country})
                                  </span>
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5">
                                  {!isAllCountriesSelected && !selectedCountries.includes(detectedUserGeo.country) && (
                                    <button
                                      type="button"
                                      disabled={saving}
                                      onClick={() => handleSelectCountryFromDropdown(detectedUserGeo.country)}
                                      data-agent-id="free-access-add-detected-geo-country-btn"
                                      data-testid="free-access-add-detected-geo-country-btn"
                                      className="rounded-md border border-winner/40 bg-winner/20 px-2 py-0.5 font-mono text-[10px] font-bold text-winner-soft hover:bg-winner/30 transition cursor-pointer"
                                    >
                                      + Add {getCountryName(detectedUserGeo.country)} ({detectedUserGeo.country})
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    disabled={detectingFreeAccessGeo}
                                    onClick={handleDetectFreeAccessGeo}
                                    data-agent-id="free-access-detect-geo-btn"
                                    data-testid="free-access-detect-geo-btn"
                                    className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/20 px-2 py-0.5 font-mono text-[10px] font-semibold text-primary hover:bg-primary hover:text-on-primary transition cursor-pointer disabled:opacity-50"
                                  >
                                    <Icon name="refresh" className="size-3" />
                                    <span>{detectingFreeAccessGeo ? "Detecting..." : "Detect Geolocation"}</span>
                                  </button>
                                </div>
                              </div>

                              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                                <div className="relative flex-1">
                                  <select
                                    id="free-access-country-dropdown"
                                    data-agent-id="free-access-country-dropdown"
                                    data-testid="free-access-country-dropdown"
                                    disabled={saving}
                                    value={selectedCountryDropdown}
                                    onChange={(e) => handleSelectCountryFromDropdown(e.target.value)}
                                    aria-label="Select countries that receive free use"
                                    className={`${field} w-full pr-8 font-mono text-xs cursor-pointer`}
                                  >
                                    <option value="">
                                      — Select a Country from All {WORLD_COUNTRIES.length} Countries to Add / Toggle —
                                    </option>
                                    <option value={ALL_COUNTRIES_CODE}>
                                      🌐 All Countries (Worldwide) {isAllCountriesSelected ? "✓ [Selected]" : ""}
                                    </option>
                                    {WORLD_COUNTRIES.map((country) => {
                                      const isSelected =
                                        !isAllCountriesSelected && selectedCountries.includes(country.code);
                                      return (
                                        <option key={country.code} value={country.code}>
                                          {country.name} ({country.code}){isSelected ? " ✓ [Selected]" : ""}
                                        </option>
                                      );
                                    })}
                                  </select>
                                </div>
                              </div>

                              {/* Selected Countries Pills */}
                              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                                <span className="font-mono text-[11px] font-semibold text-on-surface-variant mr-1">
                                  Active Countries Receiving Free Use:
                                </span>
                                {isAllCountriesSelected ? (
                                  <span
                                    data-agent-id="free-access-country-pill-ALL"
                                    data-testid="free-access-country-pill-ALL"
                                    className="inline-flex items-center gap-1.5 rounded-full border border-winner/40 bg-winner/15 px-3 py-1 font-mono text-xs font-bold text-winner-soft"
                                  >
                                    <span>🌐 All Countries (Worldwide)</span>
                                  </span>
                                ) : (
                                  selectedCountries.map((code) => (
                                    <span
                                      key={code}
                                      data-agent-id={`free-access-country-pill-${code}`}
                                      data-testid={`free-access-country-pill-${code}`}
                                      className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/15 px-2.5 py-1 font-mono text-xs font-semibold text-on-surface"
                                    >
                                      <span>
                                        {getCountryName(code)} ({code})
                                      </span>
                                      <button
                                        type="button"
                                        disabled={saving}
                                        onClick={() => handleRemoveFreeAccessCountry(code)}
                                        aria-label={`Remove ${getCountryName(code)}`}
                                        data-agent-id={`remove-free-access-country-${code}`}
                                        data-testid={`remove-free-access-country-${code}`}
                                        className="ml-0.5 inline-flex size-4 items-center justify-center rounded-full bg-black/30 text-[11px] font-bold text-on-surface-variant hover:bg-red-500/30 hover:text-red-200 transition cursor-pointer"
                                      >
                                        ×
                                      </button>
                                    </span>
                                  ))
                                )}
                              </div>
                            </div>

                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                              {(
                                [
                                  { minutes: 15 as const, title: "Free 15 Minutes", subtitle: "15-minute free window for Monthly Subscribers" },
                                  { minutes: 30 as const, title: "Free 30 Minutes", subtitle: "30-minute free window for Monthly Subscribers" },
                                  { minutes: 60 as const, title: "Free Hour", subtitle: "60-minute (1 hour) free window for Monthly Subscribers" },
                                ] as const
                              ).map((opt) => {
                                const isActiveOpt = isFreeWindowOn && activeDuration === opt.minutes;
                                return (
                                  <button
                                    key={opt.minutes}
                                    type="button"
                                    disabled={saving}
                                    onClick={() => handleToggleFreeAccess(opt.minutes)}
                                    aria-pressed={isActiveOpt}
                                    data-agent-id={`toggle-free-access-${opt.minutes}m`}
                                    data-testid={`toggle-free-access-${opt.minutes}m`}
                                    className={`flex flex-col justify-between gap-2 rounded-xl border p-3.5 text-left transition cursor-pointer ${
                                      isActiveOpt
                                        ? "border-winner bg-winner/20 text-on-surface ring-1 ring-winner/50 shadow-md"
                                        : "border-white/10 bg-surface-container hover:border-primary/50 hover:bg-surface-container-highest"
                                    }`}
                                  >
                                    <div className="flex items-center justify-between gap-2 w-full">
                                      <span className="font-mono text-xs font-bold text-on-surface flex items-center gap-1.5">
                                        <Icon
                                          name="zap"
                                          className={`size-3.5 ${isActiveOpt ? "text-winner-soft" : "text-primary"}`}
                                        />
                                        {opt.title}
                                      </span>
                                      <span
                                        className={`inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[10px] font-bold uppercase ${
                                          isActiveOpt
                                            ? "bg-winner text-black"
                                            : "bg-surface-container-highest text-on-surface-variant"
                                        }`}
                                      >
                                        {isActiveOpt ? "ON · Click to Turn Off" : "OFF"}
                                      </span>
                                    </div>
                                    <p className="text-[11px] text-on-surface-variant leading-snug">
                                      {isActiveOpt
                                        ? `Active right now — ${countdownStr} remaining (${selectedCountriesLabel})`
                                        : `${opt.subtitle} (${selectedCountriesLabel})`}
                                    </p>
                                  </button>
                                );
                              })}
                            </div>

                            {isFreeWindowOn && (
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl border border-winner/40 bg-winner/15 px-3.5 py-2.5 font-mono text-xs">
                                <span className="text-winner-soft font-semibold">
                                  ⚡ Web App is currently FREE for Monthly Subscribers in {selectedCountriesLabel} ({activeDuration === 60 ? "Free Hour" : `Free ${activeDuration} Minutes`} · {countdownStr} remaining).
                                </span>
                                <button
                                  type="button"
                                  disabled={saving}
                                  onClick={() => handleToggleFreeAccess(null)}
                                  data-agent-id="turn-off-free-access-btn"
                                  data-testid="turn-off-free-access-btn"
                                  className={`${btnDanger} py-1 px-3 text-xs shrink-0`}
                                >
                                  Turn Off Free Access Now
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Feature 1: Customizable Product & Service Token Amounts */}
                  <div
                    className={`${card} p-4 space-y-4`}
                    data-agent-id="feature-card-pricing-services"
                    data-testid="feature-card-pricing-services"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                      <button
                        type="button"
                        onClick={() => toggleFeatureExpanded("pricing_services")}
                        aria-expanded={isFeatureExpanded("pricing_services")}
                        data-agent-id="toggle-feature-pricing-services-header"
                        data-testid="toggle-feature-pricing-services-header"
                        className="flex-1 text-left group cursor-pointer"
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <Icon
                            name="chevronDown"
                            className={`size-4 text-primary transition-transform duration-200 ${
                              isFeatureExpanded("pricing_services") ? "rotate-180" : "-rotate-90"
                            }`}
                          />
                          <h4 className="text-compact font-bold text-on-surface group-hover:text-primary transition-colors">
                            Customizable Product &amp; Service Token Amounts
                          </h4>
                          <span className="rounded-full bg-surface-container-highest px-2 py-0.5 font-mono text-[10px] text-on-surface-variant">
                            8 Services · Customize: ⚡ {config.serviceCosts?.customizeService ?? 55}
                          </span>
                        </div>
                        <p className="mt-0.5 text-[11px] text-on-surface-variant">
                          Customize the integer token amount required for each product and service. Default rate is 1 Token = {formatAud(config.audCentsPerToken ?? 100)} AUD (≈ {formatUsd(audToUsdCents(config.audCentsPerToken ?? 100, liveEcbRate?.rate))} USD for nations outside AU &amp; NZ).
                        </p>
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleFeatureExpanded("pricing_services")}
                        aria-expanded={isFeatureExpanded("pricing_services")}
                        data-agent-id="toggle-feature-pricing-services-btn"
                        data-testid="toggle-feature-pricing-services-btn"
                        className={`${btnSecondary} font-mono text-xs shrink-0`}
                      >
                        <Icon
                          name="chevronDown"
                          className={`size-3.5 transition-transform duration-200 ${
                            isFeatureExpanded("pricing_services") ? "rotate-180" : ""
                          }`}
                        />
                        <span>{isFeatureExpanded("pricing_services") ? "Collapse" : "Expand"}</span>
                      </button>
                    </div>

                    {isFeatureExpanded("pricing_services") && (
                      <div className="space-y-4 pt-2 border-t border-white/[0.06]">
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          {confirmPresetPricingMode ? (
                            <div className="flex items-center gap-1.5 rounded-xl border border-amber-400/50 bg-amber-500/15 px-2.5 py-1">
                              <span className="font-mono text-xs font-semibold text-amber-200">
                                {confirmPresetPricingMode === "FREE"
                                  ? "Reset all services to Free (0)?"
                                  : "Reset to Standard Paid Rates?"}
                              </span>
                              <button
                                type="button"
                                disabled={saving}
                                onClick={() => {
                                  const isFree = confirmPresetPricingMode === "FREE";
                                  setConfirmPresetPricingMode(null);
                                  saveConfig({
                                    serviceCosts: isFree
                                      ? {
                                          searchStandard: 0,
                                          searchProvenWinners: 0,
                                          searchExtendedDays: 0,
                                          searchEliteScore: 0,
                                          aiRemix: 0,
                                          regenerateVariations: 0,
                                          brandClone: 0,
                                          brandTxtDownload: 0,
                                          searchMixDownload: 0,
                                          deconstructDownload: 0,
                                          customizeService: 0,
                                        }
                                      : {
                                          searchStandard: 1,
                                          searchProvenWinners: 1,
                                          searchExtendedDays: 1,
                                          searchEliteScore: 1,
                                          aiRemix: 1,
                                          regenerateVariations: 1,
                                          brandClone: 1,
                                          brandTxtDownload: 1,
                                          searchMixDownload: 1,
                                          deconstructDownload: 0,
                                          customizeService: 55,
                                        },
                                  });
                                }}
                                data-agent-id="confirm-preset-pricing-btn"
                                data-testid="confirm-preset-pricing-btn"
                                className="rounded-lg bg-amber-400 px-2.5 py-1 font-mono text-xs font-bold text-black hover:bg-amber-300 transition"
                              >
                                Confirm Reset
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmPresetPricingMode(null)}
                                data-agent-id="cancel-preset-pricing-btn"
                                data-testid="cancel-preset-pricing-btn"
                                className={`${btnSecondary} py-1 px-2 text-xs`}
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <>
                              <button
                                type="button"
                                data-testid="preset-free-services"
                                data-agent-id="preset-free-services"
                                disabled={saving}
                                onClick={() => setConfirmPresetPricingMode("FREE")}
                                className={btnSecondary}
                              >
                                Set All Free (0)
                              </button>
                              <button
                                type="button"
                                data-testid="preset-paid-services"
                                data-agent-id="preset-paid-services"
                                disabled={saving}
                                onClick={() => setConfirmPresetPricingMode("PAID")}
                                className={btnPrimary}
                              >
                                Standard Paid Rates (1 tok each)
                              </button>
                            </>
                          )}
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
                              key: "brandTxtDownload" as const,
                              label: "Download Brand Text File (.txt)",
                              desc: "Token fee to download the attached <Brand Name> - <Date>.txt brand file from a Brand Postcard",
                            },
                            {
                              key: "searchMixDownload" as const,
                              label: "SearchMix Download",
                              desc: "Token fee to download a search postcard (.txt file based on title and date)",
                            },
                            {
                              key: "deconstructDownload" as const,
                              label: "Deconstructed Anatomy (.txt) Download",
                              desc: "Token fee to download the <brandname>deconstruct.txt file next to Regenerate Variations (Default: 0 tokens / Free)",
                            },
                            {
                              key: "customizeService" as const,
                              label: "Professional Customize Service",
                              desc: "Customer submits full brand brief + extra details for SuperAdmin & Main Admin strategy reply (Default: 55 tokens — automatically updates Customizations Total & Redist. Amount in Ad Agent Distribution Ledger)",
                            },
                          ].map(({ key, label: serviceLabel, desc }) => {
                            const defaultTok = key === "customizeService" ? 55 : 0;
                            const tok = config.serviceCosts[key] ?? defaultTok;
                            const displayVal = draftCostInputs[key] !== undefined ? draftCostInputs[key] : String(tok);
                            const audCents = Math.round(tok * (config.audCentsPerToken ?? 100));
                            const usdCents = audToUsdCents(audCents, liveEcbRate?.rate);

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
                      </div>
                    )}
                  </div>

                  {/* Feature 2: MONTHLY SEARCH SUBSCRIPTION CONFIGURATION */}
                  <div
                    className="rounded-xl border border-primary/30 bg-gradient-to-br from-primary/10 via-surface-container-high to-surface-container p-4 space-y-4"
                    data-agent-id="feature-card-pricing-subscription"
                    data-testid="feature-card-pricing-subscription"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                      <button
                        type="button"
                        onClick={() => toggleFeatureExpanded("pricing_subscription")}
                        aria-expanded={isFeatureExpanded("pricing_subscription")}
                        data-agent-id="toggle-feature-pricing-subscription-header"
                        data-testid="toggle-feature-pricing-subscription-header"
                        className="flex-1 text-left group cursor-pointer"
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <Icon
                            name="chevronDown"
                            className={`size-4 text-primary transition-transform duration-200 ${
                              isFeatureExpanded("pricing_subscription") ? "rotate-180" : "-rotate-90"
                            }`}
                          />
                          <h4 className="text-compact font-bold text-on-surface group-hover:text-primary transition-colors">
                            Monthly Search Subscription (SuperAdmin &amp; MainAdmin)
                          </h4>
                          <span className="rounded bg-primary/20 px-2 py-0.5 font-mono text-[10px] font-bold text-primary uppercase">
                            Privileged Tier
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-bold border uppercase tracking-wider ${
                              config.monthlySubscription?.enabled
                                ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300"
                                : "bg-amber-500/15 border-amber-500/30 text-amber-300"
                            }`}
                          >
                            {config.monthlySubscription?.enabled ? "● ON (Visible)" : "○ OFF (Hidden)"}
                          </span>
                          <span className="rounded-full bg-surface-container-lowest/80 px-2.5 py-0.5 font-mono text-[10px] font-semibold text-primary border border-white/10">
                            1,000 Tokens / mo · {formatAud(Math.round((config.monthlySubscription?.priceAud ?? 500) * 100))} AUD
                          </span>
                        </div>
                        <p className="mt-0.5 text-[11px] text-on-surface-variant">
                          1,000 monthly tokens advertised next to FAQs in the top header (SuperAdmin &amp; MainAdmin view only).
                        </p>
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleFeatureExpanded("pricing_subscription")}
                        aria-expanded={isFeatureExpanded("pricing_subscription")}
                        data-agent-id="toggle-feature-pricing-subscription-btn"
                        data-testid="toggle-feature-pricing-subscription-btn"
                        className={`${btnSecondary} font-mono text-xs shrink-0`}
                      >
                        <Icon
                          name="chevronDown"
                          className={`size-3.5 transition-transform duration-200 ${
                            isFeatureExpanded("pricing_subscription") ? "rotate-180" : ""
                          }`}
                        />
                        <span>{isFeatureExpanded("pricing_subscription") ? "Collapse" : "Expand"}</span>
                      </button>
                    </div>

                    {isFeatureExpanded("pricing_subscription") && (
                      <div className="space-y-4 pt-2 border-t border-white/[0.06]">
                        {/* SuperAdmin Subscription (1K) On/Off Toggle Panel */}
                        <div
                          className="rounded-xl border border-white/10 bg-surface-container p-4 space-y-3"
                          data-agent-id="subscription-1k-toggle-panel"
                          data-testid="subscription-1k-toggle-panel"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="flex size-7 items-center justify-center rounded-lg bg-primary/20 text-primary">
                                  <Icon name="sparkles" className="size-4" />
                                </span>
                                <h5 className="font-mono text-sm font-bold text-on-surface">
                                  Subscription (1K) Status Toggle
                                </h5>
                                <span
                                  className={`rounded-full px-2.5 py-0.5 font-mono text-[10px] font-bold border uppercase tracking-wider ${
                                    config.monthlySubscription?.enabled
                                      ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                                      : "border-amber-500/40 bg-amber-500/15 text-amber-300"
                                  }`}
                                >
                                  {config.monthlySubscription?.enabled
                                    ? "● ON (Subscription 1K Visible)"
                                    : "○ OFF (Subscription 1K Hidden)"}
                                </span>
                              </div>
                              <p className="text-xs text-on-surface-variant leading-relaxed">
                                {config.monthlySubscription?.enabled
                                  ? "Subscription (1K) is currently ON and visible in the top header nav. Users can view and purchase the 1,000 monthly token plan."
                                  : "Subscription (1K) is currently OFF and hidden from the top header nav. Turn ON to make Subscription (1K) visible and available."}
                              </p>
                            </div>

                            {isSuper ? (
                              <button
                                type="button"
                                disabled={saving}
                                onClick={() => {
                                  const curr = config.monthlySubscription ?? {
                                    searchesPerMonth: 1000,
                                    enabled: false,
                                    priceAud: 500,
                                    name: "Monthly Search Subscription",
                                    description: "",
                                  };
                                  const nextEnabled = !Boolean(curr.enabled);
                                  saveConfig({
                                    monthlySubscription: {
                                      ...curr,
                                      enabled: nextEnabled,
                                    },
                                  });
                                }}
                                data-agent-id="toggle-subscription-1k-btn"
                                data-testid="toggle-subscription-1k-btn"
                                aria-label={
                                  config.monthlySubscription?.enabled
                                    ? "Turn OFF Subscription (1K)"
                                    : "Turn ON Subscription (1K)"
                                }
                                className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 font-mono text-xs font-bold transition shrink-0 shadow-sm ${
                                  config.monthlySubscription?.enabled
                                    ? "border-amber-500/40 bg-amber-500/20 text-amber-200 hover:bg-amber-500/30"
                                    : "border-emerald-500/40 bg-emerald-500/25 text-emerald-200 hover:bg-emerald-500/35"
                                } disabled:opacity-50`}
                              >
                                <Icon name="sliders" className="size-4" />
                                <span>
                                  {config.monthlySubscription?.enabled
                                    ? "Turn OFF Subscription (1K)"
                                    : "Turn ON Subscription (1K)"}
                                </span>
                              </button>
                            ) : (
                              <span className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 font-mono text-[11px] text-outline">
                                Super Admin Control Only
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="rounded-lg border border-primary/20 bg-surface-container-lowest/70 p-3 font-mono text-xs text-on-surface leading-relaxed">
                          <span className="font-bold text-primary">Value Proposition: </span>
                          Options for every search: Every option is one token. This gives you 1,000 of those. Get Access to &apos;Free to Use&apos; Times. Can also be used to pay for Customize your Brand Strategy with Professional Experts ({config.serviceCosts?.customizeService ?? 55} {(config.serviceCosts?.customizeService ?? 55) === 1 ? "token" : "tokens"}).
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

                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 pt-1">
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
                                      ...(config.monthlySubscription ?? { searchesPerMonth: 1000, enabled: false, name: "Monthly Search Subscription", description: "" }),
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
                                        ...(config.monthlySubscription ?? { searchesPerMonth: 1000, enabled: false, name: "Monthly Search Subscription", description: "" }),
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
                                      ...(config.monthlySubscription ?? { searchesPerMonth: 1000, enabled: false, name: "Monthly Search Subscription", description: "" }),
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
                                      ...(config.monthlySubscription ?? { searchesPerMonth: 1000, enabled: false, name: "Monthly Search Subscription", description: "" }),
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
                                  ≈ {formatUsd(audToUsdCents(Math.round((config.monthlySubscription?.priceAud ?? 500) * 100), liveEcbRate?.rate))} / mo
                                </span>
                              </div>
                              <div className="flex items-center justify-between text-outline pt-1 border-t border-white/[0.06]">
                                <span>Tokens Allowance:</span>
                                <span className="font-bold text-on-surface">1,000 tokens/mo</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Feature 3: Create New Token Pack (Token Packs CRUD) */}
                  <div
                    className={`${card} p-4 space-y-4 border border-primary/25`}
                    data-agent-id="feature-card-packs-create"
                    data-testid="feature-card-packs-create"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                      <button
                        type="button"
                        onClick={() => setShowAddPack((prev) => !prev)}
                        aria-expanded={showAddPack}
                        data-agent-id="toggle-feature-packs-create-header"
                        data-testid="toggle-feature-packs-create-header"
                        className="flex-1 text-left group cursor-pointer"
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <Icon
                            name="chevronDown"
                            className={`size-4 text-primary transition-transform duration-200 ${
                              showAddPack ? "rotate-180" : "-rotate-90"
                            }`}
                          />
                          <h4 className="text-compact font-bold text-on-surface group-hover:text-primary transition-colors">
                            Create New Token Pack
                          </h4>
                          <span className="rounded-full bg-primary/15 px-2 py-0.5 font-mono text-[10px] font-semibold text-primary">
                            Add Pack Form
                          </span>
                        </div>
                        <p className="mt-0.5 text-[11px] text-on-surface-variant">
                          Add a new integer token pack and AUD cent price to the Stripe checkout catalog.
                        </p>
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowAddPack((prev) => !prev)}
                        aria-expanded={showAddPack}
                        className={showAddPack ? btnSecondary : btnPrimary}
                        data-testid="toggle-add-pack-button"
                      >
                        <Icon name={showAddPack ? "chevronDown" : "plus"} className="size-4" />
                        <span>{showAddPack ? "Collapse" : "Add Token Pack"}</span>
                      </button>
                    </div>

                    {showAddPack && (
                      <div className="space-y-4 pt-2 border-t border-white/[0.06]">
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
                  </div>

                  {/* Feature 4: Token Packs (CRUD) — Token Pack Catalog List */}
                  <div
                    className={`${card} p-4 space-y-4`}
                    data-agent-id="feature-card-packs-catalog"
                    data-testid="feature-card-packs-catalog"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                      <button
                        type="button"
                        onClick={() => toggleFeatureExpanded("packs_catalog")}
                        aria-expanded={isFeatureExpanded("packs_catalog")}
                        data-agent-id="toggle-feature-packs-catalog-header"
                        data-testid="toggle-feature-packs-catalog-header"
                        className="flex-1 text-left group cursor-pointer"
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <Icon
                            name="chevronDown"
                            className={`size-4 text-primary transition-transform duration-200 ${
                              isFeatureExpanded("packs_catalog") ? "rotate-180" : "-rotate-90"
                            }`}
                          />
                          <h4 className="text-compact font-bold text-on-surface group-hover:text-primary transition-colors">
                            Token Packs (CRUD) — Token Pack Catalog
                          </h4>
                          <span className="rounded-full bg-surface-container-highest px-2 py-0.5 font-mono text-[10px] text-on-surface-variant">
                            {config.tokenPacks.length} Active {config.tokenPacks.length === 1 ? "Pack" : "Packs"}
                          </span>
                        </div>
                        <p className="mt-0.5 text-[11px] text-on-surface-variant">
                          Manage existing token packs and pricing for Stripe checkout.
                        </p>
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleFeatureExpanded("packs_catalog")}
                        aria-expanded={isFeatureExpanded("packs_catalog")}
                        data-agent-id="toggle-feature-packs-catalog-btn"
                        data-testid="toggle-feature-packs-catalog-btn"
                        className={`${btnSecondary} font-mono text-xs shrink-0`}
                      >
                        <Icon
                          name="chevronDown"
                          className={`size-3.5 transition-transform duration-200 ${
                            isFeatureExpanded("packs_catalog") ? "rotate-180" : ""
                          }`}
                        />
                        <span>{isFeatureExpanded("packs_catalog") ? "Collapse" : "Expand"}</span>
                      </button>
                    </div>

                    {isFeatureExpanded("packs_catalog") && (
                      <div className="space-y-3 pt-2 border-t border-white/[0.06]">
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
                                  {pack.id} • {pack.tokens.toLocaleString("en-AU")} tokens • {formatAud(pack.priceCents)} AUD (≈ {formatUsd(audToUsdCents(pack.priceCents, liveEcbRate?.rate))} USD)
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
                    )}
                  </div>
                </div>
              )}

              {/* TAB 4: TOKEN CONTROLS & LEDGER (Super Admin & Main Admin) */}
              {tab === "LEDGER" && (
                <div className="space-y-4 lg:space-y-3.5 min-w-0 max-w-full">
                  {/* Category Header + Expand All / Collapse All */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 min-w-0">
                    <div className="min-w-0">
                      <h3 className="text-title-sm font-semibold text-on-surface">Token Controls &amp; Ledger</h3>
                      <p className="mt-0.5 text-[12px] text-on-surface-variant">
                        All features start collapsed. Click any feature below to expand and inspect equity splits, platform owners, Stripe purchases, Ad Agents, and orders.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const allOpen =
                          isFeatureExpanded("ledger_equity") &&
                          isFeatureExpanded("ledger_owners") &&
                          isFeatureExpanded("ledger_stripe") &&
                          isFeatureExpanded("ledger_ad_agents") &&
                          isMasterLedgerExpanded;
                        setFeatureExpanded("ledger_equity", !allOpen);
                        setFeatureExpanded("ledger_owners", !allOpen);
                        setFeatureExpanded("ledger_stripe", !allOpen);
                        setFeatureExpanded("ledger_ad_agents", !allOpen);
                        setIsMasterLedgerExpanded(!allOpen);
                      }}
                      data-agent-id="ledger-expand-all-btn"
                      data-testid="ledger-expand-all-btn"
                      className={`${btnSecondary} font-mono text-xs shrink-0`}
                    >
                      <Icon
                        name="chevronDown"
                        className={`size-3.5 transition-transform duration-200 ${
                          isFeatureExpanded("ledger_equity") &&
                          isFeatureExpanded("ledger_owners") &&
                          isFeatureExpanded("ledger_stripe") &&
                          isFeatureExpanded("ledger_ad_agents") &&
                          isMasterLedgerExpanded
                            ? "rotate-180"
                            : ""
                        }`}
                      />
                      <span>
                        {isFeatureExpanded("ledger_equity") &&
                        isFeatureExpanded("ledger_owners") &&
                        isFeatureExpanded("ledger_stripe") &&
                        isFeatureExpanded("ledger_ad_agents") &&
                        isMasterLedgerExpanded
                          ? "Collapse All"
                          : "Expand All"}
                      </span>
                    </button>
                  </div>

                  {/* Feature 1: Redistributive Equity Ledger & Summary Stats */}
                  <div
                    className={`${card} p-3 sm:p-4 space-y-3.5 min-w-0`}
                    data-agent-id="feature-card-ledger-equity"
                    data-testid="feature-card-ledger-equity"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 min-w-0">
                      <button
                        type="button"
                        onClick={() => toggleFeatureExpanded("ledger_equity")}
                        aria-expanded={isFeatureExpanded("ledger_equity")}
                        data-agent-id="toggle-feature-ledger-equity-header"
                        data-testid="toggle-feature-ledger-equity-header"
                        className="flex-1 text-left group cursor-pointer min-w-0"
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <Icon
                            name="chevronDown"
                            className={`size-4 text-primary transition-transform duration-200 ${
                              isFeatureExpanded("ledger_equity") ? "rotate-180" : "-rotate-90"
                            }`}
                          />
                          <h4 className="text-compact font-bold text-on-surface group-hover:text-primary transition-colors">
                            Redistributive Equity Ledger
                          </h4>
                          <span className="rounded-full bg-secondary/15 px-2 py-0.5 font-mono text-[10px] font-semibold text-secondary">
                            Live Statutory Splits
                          </span>
                          <span className="rounded-full bg-surface-container-highest px-2 py-0.5 font-mono text-[10px] text-primary">
                            ⚡ {(ledger?.totalTokens ?? 0).toLocaleString("en-AU")} ·{" "}
                            {formatAud(ledger?.totalGrossAudCents ?? ledger?.totalGrossCents ?? 0)}
                          </span>
                        </div>
                        <p className="mt-0.5 text-[11px] text-on-surface-variant">
                          Calculates equity partner ownership from total Stripe token revenue and purchased tokens.
                        </p>
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleFeatureExpanded("ledger_equity")}
                        aria-expanded={isFeatureExpanded("ledger_equity")}
                        data-agent-id="toggle-feature-ledger-equity-btn"
                        data-testid="toggle-feature-ledger-equity-btn"
                        className={`${btnSecondary} font-mono text-xs shrink-0`}
                      >
                        <Icon
                          name="chevronDown"
                          className={`size-3.5 transition-transform duration-200 ${
                            isFeatureExpanded("ledger_equity") ? "rotate-180" : ""
                          }`}
                        />
                        <span>{isFeatureExpanded("ledger_equity") ? "Collapse" : "Expand"}</span>
                      </button>
                    </div>

                    {isFeatureExpanded("ledger_equity") && (
                      <div className="space-y-3.5 pt-2 border-t border-white/[0.06]">
                        <div className="grid grid-cols-1 xs:grid-cols-2 sm:flex sm:items-center justify-end gap-2 shrink-0 sm:flex-wrap w-full">
                          <button
                            type="button"
                            onClick={() => setConfirmResetLedgerOpen(true)}
                            disabled={saving || ((ledger?.totalTokens ?? 0) === 0 && (ledger?.totalPurchasesCount ?? 0) === 0)}
                            className={`${btnDanger} text-xs py-1.5 px-3 flex items-center justify-center gap-1.5 w-full sm:w-auto`}
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
                            onClick={() => setShowAddPartner(!showAddPartner)}
                            className={`${btnPrimary} justify-center w-full sm:w-auto`}
                            data-testid="toggle-add-partner-button"
                          >
                            <Icon name="plus" className="size-4" />
                            Add Equity Partner
                          </button>
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
                            <span className="text-[10px] font-mono text-on-surface-variant uppercase tracking-wider" title="Total Tokens from Stripe (Stripe purchases only · Integers only · Gifted tokens excluded)">
                              Total Tokens from Stripe
                            </span>
                            <p className="mt-0.5 text-title-sm lg:text-title-md font-bold text-primary flex items-center gap-1.5">
                              <Icon name="zap" className="size-4 lg:size-5" />
                              {(ledger?.totalTokens ?? 0).toLocaleString("en-AU")}
                            </p>
                            <span className="text-[10px] text-on-surface-variant truncate block" title="Only Stripe purchased tokens are counted · Gifted tokens never show">
                              Stripe · Integers only
                            </span>
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
                      </div>
                    )}
                  </div>

                  {/* Dual-Pane Grid on Desktop / Stacks on Mobile & Tablet */}
                  <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-12 lg:items-start min-w-0">
                    {/* LEFT PANE (7 COLS): Owner Redistribution Breakdown */}
                    <div
                      className={`${card} p-3 sm:p-4 space-y-3 min-w-0 lg:col-span-7`}
                      data-agent-id="feature-card-ledger-owners"
                      data-testid="feature-card-ledger-owners"
                    >
                      <div className="flex items-center justify-between gap-2 min-w-0">
                        <button
                          type="button"
                          onClick={() => toggleFeatureExpanded("ledger_owners")}
                          aria-expanded={isFeatureExpanded("ledger_owners")}
                          data-agent-id="toggle-feature-ledger-owners-header"
                          data-testid="toggle-feature-ledger-owners-header"
                          className="flex-1 text-left group cursor-pointer min-w-0"
                        >
                          <div className="flex items-center gap-2 flex-wrap">
                            <Icon
                              name="chevronDown"
                              className={`size-4 text-primary transition-transform duration-200 ${
                                isFeatureExpanded("ledger_owners") ? "rotate-180" : "-rotate-90"
                              }`}
                            />
                            <h4 className="text-compact font-bold text-on-surface group-hover:text-primary transition-colors truncate">
                              Owner Redistribution Breakdown
                            </h4>
                            <span className="rounded-full bg-surface-container-highest px-2 py-0.5 font-mono text-[10px] text-on-surface-variant shrink-0">
                              {config.equityPartners?.length ?? 0} Partner(s)
                            </span>
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleFeatureExpanded("ledger_owners")}
                          aria-expanded={isFeatureExpanded("ledger_owners")}
                          data-agent-id="toggle-feature-ledger-owners-btn"
                          data-testid="toggle-feature-ledger-owners-btn"
                          className={`${btnSecondary} font-mono text-xs shrink-0`}
                        >
                          <Icon
                            name="chevronDown"
                            className={`size-3.5 transition-transform duration-200 ${
                              isFeatureExpanded("ledger_owners") ? "rotate-180" : ""
                            }`}
                          />
                          <span>{isFeatureExpanded("ledger_owners") ? "Collapse" : "Expand"}</span>
                        </button>
                      </div>

                      {isFeatureExpanded("ledger_owners") && (
                        config.equityPartners?.length === 0 ? (
                          <div className={`${card} p-6 text-center text-on-surface-variant`}>
                            <p className="text-sm">No owners or equity partners added yet.</p>
                            <p className="text-[11px] mt-1 text-outline">
                              Click &ldquo;Add Equity Partner&rdquo; to add someone by email address and configure their percentage.
                            </p>
                          </div>
                        ) : (
                          <div className="overflow-x-auto rounded-xl border border-white/[0.08] bg-surface-container-low max-h-[360px] overflow-y-auto">
                            <table className="w-full block md:table text-left text-[12px]">
                              <thead className="hidden md:table-header-group border-b border-white/[0.08] bg-surface-container-high/60 font-mono text-mono-label text-on-surface-variant sticky top-0 z-10 backdrop-blur-sm">
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
                              <tbody className="block md:table-row-group divide-y divide-white/[0.08] md:divide-white/[0.04]">
                                {ledger?.distributions.map((dist) => {
                                  const partner = config.equityPartners.find((p) => p.partnerId === dist.partnerId);
                                  if (!partner) return null;
                                  return (
                                    <tr key={dist.partnerId} className="block md:table-row p-3 md:p-0 space-y-1.5 md:space-y-0 hover:bg-white/[0.02] transition">
                                      <td className="flex items-center justify-between gap-2 md:table-cell md:px-3 md:py-2">
                                        <span className="md:hidden font-mono text-[10px] uppercase tracking-wider text-on-surface-variant">Owner</span>
                                        <div className="min-w-0 text-right md:text-left">
                                          <div className="font-semibold text-on-surface font-mono text-[11px] truncate max-w-[200px] sm:max-w-[180px]" title={dist.email}>
                                            {dist.email}
                                          </div>
                                          {dist.name && dist.name !== dist.email && (
                                            <div className="text-[10px] text-on-surface-variant truncate max-w-[180px]">{dist.name}</div>
                                          )}
                                        </div>
                                      </td>
                                      <td className="flex items-center justify-between gap-2 md:table-cell md:px-2.5 md:py-2 font-mono font-bold text-secondary text-[11px]">
                                        <span className="md:hidden font-mono text-[10px] font-normal uppercase tracking-wider text-on-surface-variant">Equity %</span>
                                        <span>{dist.percentage}%</span>
                                      </td>
                                      <td className="flex items-center justify-between gap-2 md:table-cell md:px-2.5 md:py-2 font-mono text-primary font-semibold text-[11px] whitespace-nowrap">
                                        <span className="md:hidden font-mono text-[10px] font-normal uppercase tracking-wider text-on-surface-variant">Tokens</span>
                                        <div className="text-right md:text-left">
                                          <div>⚡ {dist.ownedTokens.toLocaleString("en-AU")}</div>
                                          {partner.lastResetAt && (
                                            <div className="text-[9px] font-mono text-secondary">
                                              {dist.ownedTokens === 0 ? "Refreshed to 0" : `Reset ${new Date(partner.lastResetAt).toLocaleDateString("en-AU")}`}
                                            </div>
                                          )}
                                        </div>
                                      </td>
                                      <td className="flex items-center justify-between gap-2 md:table-cell md:px-2.5 md:py-2 font-mono font-semibold text-on-surface text-[11px] whitespace-nowrap">
                                        <span className="md:hidden font-mono text-[10px] font-normal uppercase tracking-wider text-on-surface-variant">AUD</span>
                                        <span>{formatAud(dist.ownedAudCents ?? dist.ownedCents)}</span>
                                      </td>
                                      <td className="flex items-center justify-between gap-2 md:table-cell md:px-2.5 md:py-2 font-mono font-semibold text-on-surface-variant text-[10px] whitespace-nowrap">
                                        <span className="md:hidden font-mono text-[10px] font-normal uppercase tracking-wider text-on-surface-variant">USD</span>
                                        <span>{formatUsd(dist.ownedUsdCents ?? Math.round(dist.ownedCents * 0.65))}</span>
                                      </td>
                                      <td className="flex items-center justify-between gap-2 md:table-cell md:px-2 md:py-2">
                                        <span className="md:hidden font-mono text-[10px] uppercase tracking-wider text-on-surface-variant">Status</span>
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
                                      <td className="flex items-center justify-between gap-2 pt-1 md:pt-0 border-t border-white/[0.06] md:border-0 md:table-cell md:px-3 md:py-2 text-right whitespace-nowrap">
                                        <span className="md:hidden font-mono text-[10px] uppercase tracking-wider text-on-surface-variant">Actions</span>
                                        <div className="flex flex-wrap items-center justify-end gap-1.5">
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
                        )
                      )}
                    </div>

                    {/* RIGHT PANE (5 COLS): Recent Stripe Purchases */}
                    <div
                      className={`${card} p-3 sm:p-4 space-y-3 min-w-0 lg:col-span-5`}
                      data-agent-id="feature-card-ledger-stripe"
                      data-testid="feature-card-ledger-stripe"
                    >
                      <div className="flex items-center justify-between gap-2 min-w-0">
                        <button
                          type="button"
                          onClick={() => toggleFeatureExpanded("ledger_stripe")}
                          aria-expanded={isFeatureExpanded("ledger_stripe")}
                          data-agent-id="toggle-feature-ledger-stripe-header"
                          data-testid="toggle-feature-ledger-stripe-header"
                          className="flex-1 text-left group cursor-pointer min-w-0"
                        >
                          <div className="flex items-center gap-2 flex-wrap">
                            <Icon
                              name="chevronDown"
                              className={`size-4 text-primary transition-transform duration-200 ${
                                isFeatureExpanded("ledger_stripe") ? "rotate-180" : "-rotate-90"
                              }`}
                            />
                            <h4 className="text-compact font-bold text-on-surface group-hover:text-primary transition-colors truncate">
                              Recent Stripe Purchases
                            </h4>
                            <span className="rounded-full bg-surface-container-highest px-2 py-0.5 font-mono text-[10px] text-on-surface-variant shrink-0">
                              {recentPurchases.length} Logged
                            </span>
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleFeatureExpanded("ledger_stripe")}
                          aria-expanded={isFeatureExpanded("ledger_stripe")}
                          data-agent-id="toggle-feature-ledger-stripe-btn"
                          data-testid="toggle-feature-ledger-stripe-btn"
                          className={`${btnSecondary} font-mono text-xs shrink-0`}
                        >
                          <Icon
                            name="chevronDown"
                            className={`size-3.5 transition-transform duration-200 ${
                              isFeatureExpanded("ledger_stripe") ? "rotate-180" : ""
                            }`}
                          />
                          <span>{isFeatureExpanded("ledger_stripe") ? "Collapse" : "Expand"}</span>
                        </button>
                      </div>

                      {isFeatureExpanded("ledger_stripe") && (
                        recentPurchases.length === 0 ? (
                          <div className={`${card} p-6 text-center text-on-surface-variant`}>
                            <p className="text-sm italic">No Stripe purchases recorded yet.</p>
                            <p className="text-[11px] mt-1 text-outline">
                              Purchases appear here once customers buy tokens through the Wallet.
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
                        )
                      )}
                    </div>

                    {/* FULL-WIDTH DESKTOP / LAPTOP ROW (12 COLS): COMPACT AD AGENT DISTRIBUTION LEDGER (NO SCROLLBAR) */}
                    <div
                      className="lg:col-span-12 min-w-0 space-y-2.5 rounded-xl border border-tertiary/30 bg-surface-container-low p-3 sm:p-4"
                      data-agent-id="ad-agent-distribution-ledger-section"
                      data-testid="ad-agent-distribution-ledger-section"
                    >
                      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center justify-between gap-2 min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
                          <button
                            type="button"
                            onClick={() => toggleFeatureExpanded("ledger_ad_agents")}
                            aria-expanded={isFeatureExpanded("ledger_ad_agents")}
                            data-agent-id="toggle-feature-ledger-ad-agents-header"
                            data-testid="toggle-feature-ledger-ad-agents-header"
                            className="inline-flex items-center gap-1.5 sm:gap-2 text-left group cursor-pointer"
                          >
                            <Icon
                              name="chevronDown"
                              className={`size-4 text-tertiary transition-transform duration-200 ${
                                isFeatureExpanded("ledger_ad_agents") ? "rotate-180" : "-rotate-90"
                              }`}
                            />
                            <Icon name="sparkles" className="size-3.5 text-tertiary shrink-0" />
                            <h4 className="text-compact font-bold text-on-surface group-hover:text-tertiary transition-colors">
                              Ad Agent Distribution Ledger
                            </h4>
                            <span className="rounded-full border border-tertiary/40 bg-tertiary/15 px-2 py-0.5 font-mono text-[10px] font-bold text-tertiary">
                              {liveAdAgentLedger.length} Active
                            </span>
                            <span
                              className="rounded-full border border-white/15 bg-surface-container-highest px-2 py-0.5 font-mono text-[10px] font-semibold text-on-surface-variant"
                              title="Total registered and approved Ad Agent records preserved on file"
                            >
                              {allAdAgentRecords.length} In Records
                              {savedInactiveAdAgentRecords.length > 0
                                ? ` (${savedInactiveAdAgentRecords.length} Inactive)`
                                : ""}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setTab("PRICING");
                              setFeatureExpanded("pricing_services", true);
                            }}
                            data-agent-id="ad-agent-ledger-customize-price-badge"
                            data-testid="ad-agent-ledger-customize-price-badge"
                            title="Live price from Service Pricing tab — click to edit Professional Customize Service price"
                            className="inline-flex flex-wrap items-center gap-1 rounded-xl sm:rounded-full border border-primary/40 bg-primary/15 px-2.5 py-1 sm:py-0.5 font-mono text-[10px] font-bold text-primary hover:bg-primary/25 transition text-left max-w-full"
                          >
                            <span>
                              Professional Customize Service: ⚡{" "}
                              {customizeServiceUnitTokens.toLocaleString("en-AU")} (
                              {formatAud(customizeServiceAudCents)} · {formatUsd(customizeServiceUsdCents)})
                            </span>
                            <span className="underline text-[9px] text-secondary ml-0.5">
                              Service Pricing ↗
                            </span>
                          </button>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto shrink-0">
                          {isSuper && isFeatureExpanded("ledger_ad_agents") && (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  selectAndAutofillAdAgent("__NEW__");
                                  setShowAddAdAgent(true);
                                }}
                                data-agent-id="quick-new-ad-agent-btn"
                                data-testid="quick-new-ad-agent-btn"
                                aria-label="Add a new Ad Agent one by one"
                                className="inline-flex flex-1 sm:flex-initial shrink-0 items-center justify-center gap-1 rounded-lg border border-primary/40 bg-primary/15 px-2.5 py-1.5 sm:py-1 font-mono text-[10px] font-bold text-primary hover:bg-primary/25 transition"
                              >
                                <Icon name="plus" className="size-3" />
                                <span>+ Add Agent</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setShowAddAdAgent((prev) => !prev)}
                                data-agent-id="toggle-add-ad-agent-btn"
                                data-testid="toggle-add-ad-agent-btn"
                                aria-label="Toggle Ad Agent Auto-Fill & Bank/PayID Form"
                                className="inline-flex flex-1 sm:flex-initial shrink-0 items-center justify-center gap-1 rounded-lg border border-tertiary/40 bg-tertiary/15 px-2.5 py-1.5 sm:py-1 font-mono text-[10px] font-bold text-tertiary hover:bg-tertiary/25 transition"
                              >
                                <Icon name={showAddAdAgent ? "chevronDown" : "plus"} className="size-3" />
                                <span>
                                  {showAddAdAgent
                                    ? "Hide Agent Form"
                                    : "Open Agent Dropdown & Bank/PayID"}
                                </span>
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            onClick={() => toggleFeatureExpanded("ledger_ad_agents")}
                            aria-expanded={isFeatureExpanded("ledger_ad_agents")}
                            data-agent-id="toggle-feature-ledger-ad-agents-btn"
                            data-testid="toggle-feature-ledger-ad-agents-btn"
                            className={`${btnSecondary} font-mono text-xs flex-1 sm:flex-initial justify-center`}
                          >
                            <Icon
                              name="chevronDown"
                              className={`size-3.5 transition-transform duration-200 ${
                                isFeatureExpanded("ledger_ad_agents") ? "rotate-180" : ""
                              }`}
                            />
                            <span>{isFeatureExpanded("ledger_ad_agents") ? "Collapse" : "Expand"}</span>
                          </button>
                        </div>
                      </div>

                      {isFeatureExpanded("ledger_ad_agents") && (
                        <>

                      {showAddAdAgent && isSuper && (() => {
                        const selectedRecordItem = allAdAgentRecords.find(
                          (a) =>
                            a.agentId === selectedRegisteredAgentKey ||
                            (newAdAgent.email && a.email.toLowerCase() === newAdAgent.email.trim().toLowerCase())
                        );
                        const selectedLedgerItem =
                          selectedRecordItem && selectedRecordItem.inActiveLedger !== false
                            ? selectedRecordItem
                            : undefined;
                        const unlinkedRbacAgents = rbacUsers.filter((u) => {
                          const roles = getUserRolesList(u);
                          const hasAgentRole =
                            roles.includes("ad_agent") ||
                            roles.includes("admin") ||
                            roles.includes("superadmin");
                          return (
                            hasAgentRole &&
                            !allAdAgentRecords.some((a) => a.email.toLowerCase() === u.email.toLowerCase())
                          );
                        });
                        const compactInput =
                          "w-full rounded-md border border-white/10 bg-surface-container-lowest px-2 py-1 text-[11px] text-on-surface placeholder:text-outline focus:border-primary focus:outline-none";
                        const compactLabel =
                          "block font-mono text-[9px] uppercase tracking-wider text-on-surface-variant mb-0.5";

                        return (
                          <form
                            onSubmit={handleSuperAdminUpsertAdAgent}
                            data-agent-id="superadmin-add-ad-agent-form"
                            data-testid="superadmin-add-ad-agent-form"
                            className="rounded-lg border border-tertiary/35 bg-surface-container-highest/60 p-2 space-y-1.5"
                          >
                            {/* 1. REGISTERED AD AGENTS DROPDOWN BAR (Auto-fills all fields below) */}
                            <div
                              className="flex flex-col gap-1.5 lg:flex-row lg:items-center lg:justify-between rounded-md border border-tertiary/30 bg-surface-container-lowest px-2.5 py-1.5"
                              data-agent-id="ad-agent-selector-autofill-panel"
                              data-testid="ad-agent-selector-autofill-panel"
                            >
                              <div className="flex flex-wrap items-center gap-2 lg:flex-1">
                                <label
                                  htmlFor="select-registered-ad-agent-dropdown"
                                  className="shrink-0 font-mono text-[10px] font-bold uppercase tracking-wider text-tertiary"
                                >
                                  Ad Agent Records:
                                </label>
                                <select
                                  id="select-registered-ad-agent-dropdown"
                                  value={selectedRegisteredAgentKey}
                                  onChange={(e) => selectAndAutofillAdAgent(e.target.value)}
                                  data-agent-id="select-registered-ad-agent-dropdown"
                                  data-testid="select-registered-ad-agent-dropdown"
                                  aria-label="Select a registered or approved Ad Agent record to auto-fill or activate"
                                  className={`${compactInput} flex-1 font-mono text-[11px] border-tertiary/40`}
                                >
                                  <option value="__NEW__">+ Add New Ad Agent One-by-One…</option>
                                  {savedInactiveAdAgentRecords.length > 0 && (
                                    <optgroup
                                      label={`Saved & Approved Ad Agent Records — Available to Activate (${savedInactiveAdAgentRecords.length})`}
                                    >
                                      {savedInactiveAdAgentRecords.map((agent) => (
                                        <option key={agent.agentId} value={agent.agentId}>
                                          [SAVED RECORD] {agent.name} — {agent.email} | 📍 {agent.locationLabel} | ⚡{" "}
                                          {agent.totalCustomizationsTokens} Tokens (
                                          {formatAud(agent.totalCustomizationsAudCents)}) | {agent.redistributionPercentage}%
                                          {agent.bankOrPayIdDetails ? " | 🏦 Bank/PayID Saved" : ""}
                                        </option>
                                      ))}
                                    </optgroup>
                                  )}
                                  {liveAdAgentLedger.length > 0 && (
                                    <optgroup
                                      label={`Active List — Ad Agent & Customizations Value (${liveAdAgentLedger.length})`}
                                    >
                                      {liveAdAgentLedger.map((agent) => (
                                        <option key={agent.agentId} value={agent.agentId}>
                                          [ACTIVE] {agent.name} — {agent.email} | 📍 {agent.locationLabel} | ⚡{" "}
                                          {agent.totalCustomizationsTokens} Tokens (
                                          {formatAud(agent.totalCustomizationsAudCents)}) | {agent.redistributionPercentage}%
                                          {agent.bankOrPayIdDetails ? " | 🏦 Bank/PayID Saved" : ""}
                                        </option>
                                      ))}
                                    </optgroup>
                                  )}
                                  {unlinkedRbacAgents.length > 0 && (
                                    <optgroup label="Other Registered Admin Accounts">
                                      {unlinkedRbacAgents.map((u) => (
                                        <option key={u.uid} value={u.email}>
                                          {u.displayName || u.email.split("@")[0]} — {u.email} ({u.role})
                                        </option>
                                      ))}
                                    </optgroup>
                                  )}
                                </select>
                              </div>

                              {selectedRecordItem && selectedRecordItem.inActiveLedger === false && (
                                <button
                                  type="button"
                                  disabled={adAgentSaving}
                                  onClick={() =>
                                    handleActivateAdAgent({
                                      agentId: selectedRecordItem.agentId,
                                      email: selectedRecordItem.email,
                                      name: selectedRecordItem.name,
                                    })
                                  }
                                  data-agent-id="quick-activate-selected-ad-agent-btn"
                                  data-testid="quick-activate-selected-ad-agent-btn"
                                  aria-label={`Activate ${selectedRecordItem.name} to the active Ad Agent list`}
                                  className="inline-flex shrink-0 items-center gap-1 rounded border border-primary/50 bg-primary/20 px-2.5 py-1 font-mono text-[10px] font-bold text-primary hover:bg-primary/30 disabled:opacity-50 transition"
                                >
                                  <Icon name="plus" className="size-3" />
                                  <span>
                                    {activatingAdAgentId === selectedRecordItem.agentId
                                      ? "Activating…"
                                      : "+ Activate to Active List"}
                                  </span>
                                </button>
                              )}

                              {selectedRecordItem && (
                                <div className="inline-flex shrink-0 flex-wrap items-center gap-1.5 rounded border border-primary/40 bg-primary/15 px-2 py-0.5 font-mono text-[10px] font-bold text-primary">
                                  <span>
                                    Customizations Total: ⚡{" "}
                                    {selectedRecordItem.totalCustomizationsTokens.toLocaleString("en-AU")} ·{" "}
                                    {formatAud(selectedRecordItem.totalCustomizationsAudCents)} (
                                    {Math.max(1, selectedRecordItem.customizationsCount)} × ⚡{" "}
                                    {customizeServiceUnitTokens})
                                  </span>
                                  <span className="opacity-50">|</span>
                                  <span className="text-tertiary">
                                    Redist. Amount ({selectedRecordItem.redistributionPercentage}%):{" "}
                                    ⚡ {selectedRecordItem.redistributionTokens.toLocaleString("en-AU")} ·{" "}
                                    {formatAud(selectedRecordItem.redistributionAudCents)}
                                  </span>
                                </div>
                              )}
                            </div>

                            {/* 2. COMPACT DESKTOP / LAPTOP 12-COLUMN GRID: Left (Auto-Filled Agent Info) + Right (Bank Details / PayID Box) */}
                            <div className="grid grid-cols-1 gap-2 lg:grid-cols-12 lg:items-stretch">
                              {/* Left 7 Columns: Auto-Filled Ad Agent Information */}
                              <div className="lg:col-span-7 space-y-1.5 rounded-md border border-white/[0.08] bg-surface-container-low/60 p-2">
                                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
                                  <div>
                                    <label className={compactLabel}>Ad Agent Name *</label>
                                    <input
                                      type="text"
                                      required
                                      placeholder="e.g. Jordan Vance"
                                      value={newAdAgent.name}
                                      onChange={(e) => setNewAdAgent({ ...newAdAgent, name: e.target.value })}
                                      data-agent-id="new-ad-agent-name-input"
                                      data-testid="new-ad-agent-name-input"
                                      className={compactInput}
                                    />
                                  </div>
                                  <div>
                                    <label className={compactLabel}>Registered Email *</label>
                                    <input
                                      type="email"
                                      required
                                      placeholder="agent@agency.com"
                                      value={newAdAgent.email}
                                      onChange={(e) => setNewAdAgent({ ...newAdAgent, email: e.target.value })}
                                      data-agent-id="new-ad-agent-email-input"
                                      data-testid="new-ad-agent-email-input"
                                      className={compactInput}
                                    />
                                  </div>
                                  <div>
                                    <label className={compactLabel}>Redistribution (%)</label>
                                    <select
                                      value={newAdAgent.redistributionPercent}
                                      onChange={(e) =>
                                        setNewAdAgent({
                                          ...newAdAgent,
                                          redistributionPercent: Number(e.target.value) as AdAgentRedistributionPercent,
                                        })
                                      }
                                      data-agent-id="new-ad-agent-percent-select"
                                      data-testid="new-ad-agent-percent-select"
                                      className={compactInput}
                                    >
                                      {AD_AGENT_REDISTRIBUTION_PERCENTS.map((pct) => (
                                        <option key={pct} value={pct}>
                                          {pct}% Redistribution
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                </div>

                                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                                  <div>
                                    <label className={compactLabel}>Phone Number</label>
                                    <input
                                      type="tel"
                                      placeholder="+61 400 000 000"
                                      value={newAdAgent.phone}
                                      onChange={(e) => setNewAdAgent({ ...newAdAgent, phone: e.target.value })}
                                      data-agent-id="new-ad-agent-phone-input"
                                      data-testid="new-ad-agent-phone-input"
                                      className={compactInput}
                                    />
                                  </div>
                                  <div>
                                    <label className={compactLabel}>Suburb / City</label>
                                    <input
                                      type="text"
                                      placeholder="Sydney"
                                      value={newAdAgent.suburb}
                                      onChange={(e) => setNewAdAgent({ ...newAdAgent, suburb: e.target.value })}
                                      data-agent-id="new-ad-agent-suburb-input"
                                      data-testid="new-ad-agent-suburb-input"
                                      className={compactInput}
                                    />
                                  </div>
                                  <div>
                                    <label className={compactLabel}>State / Region</label>
                                    <input
                                      type="text"
                                      placeholder="NSW"
                                      value={newAdAgent.state}
                                      onChange={(e) => setNewAdAgent({ ...newAdAgent, state: e.target.value })}
                                      data-agent-id="new-ad-agent-state-input"
                                      data-testid="new-ad-agent-state-input"
                                      className={compactInput}
                                    />
                                  </div>
                                  <div>
                                    <label className={compactLabel}>Geolocation</label>
                                    <div className="rounded-md border border-white/10 bg-surface-container-lowest px-2 py-1 font-mono text-[10px] text-on-surface-variant truncate">
                                      📍 {Number(newAdAgent.latitude).toFixed(2)}, {Number(newAdAgent.longitude).toFixed(2)}
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* Right 5 Columns: BANK DETAILS OR PAYID DETAILS BOX + Submit Controls */}
                              <div className="lg:col-span-5 flex flex-col justify-between rounded-md border border-primary/30 bg-surface-container-lowest p-2 space-y-1.5">
                                <div className="space-y-1 flex-1 flex flex-col">
                                  <div className="flex flex-wrap items-center justify-between gap-1">
                                    <label
                                      htmlFor="ad-agent-bank-payid-details-box"
                                      className="font-mono text-[9px] font-bold uppercase tracking-wider text-primary"
                                    >
                                      Bank Details or PayID Details
                                    </label>
                                    <div className="flex items-center gap-1.5">
                                      <span className="font-mono text-[9px] text-on-surface-variant hidden sm:inline">
                                        BSB / Account # or PayID
                                      </span>
                                      <button
                                        type="button"
                                        disabled={!newAdAgent.bankOrPayIdDetails.trim()}
                                        onClick={() =>
                                          handleCopyMessageText(
                                            newAdAgent.bankOrPayIdDetails.trim(),
                                            "form-ad-agent-bank"
                                          )
                                        }
                                        data-agent-id="copy-form-ad-agent-bank-btn"
                                        data-testid="copy-form-ad-agent-bank-btn"
                                        aria-label="Copy Bank Details or PayID details from box"
                                        title={
                                          newAdAgent.bankOrPayIdDetails.trim()
                                            ? `Copy: ${newAdAgent.bankOrPayIdDetails.trim()}`
                                            : "No Bank / PayID details entered yet"
                                        }
                                        className="inline-flex items-center gap-1 rounded border border-primary/40 bg-primary/15 px-1.5 py-0.5 font-mono text-[9px] font-bold text-primary hover:bg-primary/25 disabled:opacity-40 transition"
                                      >
                                        <Icon
                                          name={copiedMessageId === "form-ad-agent-bank" ? "checkCircle" : "copy"}
                                          className="size-2.5"
                                        />
                                        <span>
                                          {copiedMessageId === "form-ad-agent-bank" ? "Copied ✓" : "Copy"}
                                        </span>
                                      </button>
                                    </div>
                                  </div>
                                  <textarea
                                    id="ad-agent-bank-payid-details-box"
                                    rows={2}
                                    maxLength={500}
                                    title={
                                      newAdAgent.bankOrPayIdDetails.trim() ||
                                      "Enter BSB, Account Number, Account Name or PayID details"
                                    }
                                    placeholder="BSB, Account Number, Account Name or PayID (Email / Mobile / ABN)..."
                                    value={newAdAgent.bankOrPayIdDetails}
                                    onChange={(e) =>
                                      setNewAdAgent({ ...newAdAgent, bankOrPayIdDetails: e.target.value })
                                    }
                                    data-agent-id="ad-agent-bank-payid-details-box"
                                    data-testid="ad-agent-bank-payid-details-box"
                                    className={`${compactInput} font-mono text-[11px] flex-1 min-h-[42px] resize-none`}
                                  />
                                </div>

                                <div className="flex items-center justify-end gap-1.5">
                                  {confirmClearAdAgentFormOpen ? (
                                    <div className="inline-flex items-center gap-1">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          selectAndAutofillAdAgent("__NEW__");
                                          setConfirmClearAdAgentFormOpen(false);
                                        }}
                                        data-agent-id="confirm-clear-ad-agent-form-btn"
                                        data-testid="confirm-clear-ad-agent-form-btn"
                                        className="rounded border border-amber-500/60 bg-amber-500/25 px-2 py-1 font-mono text-[10px] font-bold text-amber-200 hover:bg-amber-500/35 transition"
                                      >
                                        Confirm Reset
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setConfirmClearAdAgentFormOpen(false)}
                                        data-agent-id="cancel-clear-ad-agent-form-btn"
                                        data-testid="cancel-clear-ad-agent-form-btn"
                                        className={`${btnSecondary} px-1.5 py-1 text-[10px]`}
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => setConfirmClearAdAgentFormOpen(true)}
                                      data-agent-id="clear-ad-agent-form-btn"
                                      data-testid="clear-ad-agent-form-btn"
                                      className={`${btnSecondary} px-2 py-1 text-[10px]`}
                                    >
                                      Clear / Reset
                                    </button>
                                  )}
                                  <button
                                    type="submit"
                                    disabled={adAgentSaving || !newAdAgent.name.trim() || !newAdAgent.email.trim()}
                                    data-agent-id="submit-add-ad-agent-btn"
                                    data-testid="submit-add-ad-agent-btn"
                                    className={`${btnPrimary} px-2.5 py-1 text-[10px]`}
                                  >
                                    {adAgentSaving
                                      ? "Saving…"
                                      : selectedLedgerItem
                                        ? "Update Agent & Bank / PayID"
                                        : selectedRecordItem
                                          ? "+ Activate & Add to Active List"
                                          : "+ Add Ad Agent to Active List"}
                                  </button>
                                </div>
                              </div>
                            </div>
                          </form>
                        );
                      })()}

                      {/* SAVED & APPROVED AD AGENT RECORDS POOL (Available to Activate One-by-One) */}
                      {isSuper && (
                        <div
                          className="rounded-xl border border-white/10 bg-surface-container-highest/40 p-2.5 space-y-2"
                          data-agent-id="ad-agent-saved-records-panel"
                          data-testid="ad-agent-saved-records-panel"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-1.5">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Icon name="users" className="size-3.5 text-primary shrink-0" />
                              <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-on-surface">
                                Registered &amp; Approved Ad Agent Records
                              </span>
                              <span className="rounded-full border border-primary/35 bg-primary/15 px-2 py-0.5 font-mono text-[9px] font-bold text-primary">
                                {savedInactiveAdAgentRecords.length} Available to Activate · {allAdAgentRecords.length} Total Kept on File
                              </span>
                            </div>
                            <span className="font-mono text-[9px] text-on-surface-variant">
                              Deleting an agent from the active table below keeps all their records here for instant activation.
                            </span>
                          </div>

                          {savedInactiveAdAgentRecords.length === 0 ? (
                            <p className="font-mono text-[10px] text-on-surface-variant">
                              All {allAdAgentRecords.length} registered/approved Ad Agent record
                              {allAdAgentRecords.length === 1 ? " is" : "s are"} currently in the active{" "}
                              <strong className="text-on-surface">Ad Agent &amp; Customizations Value</strong> list below.
                            </p>
                          ) : (
                            <div className="grid grid-cols-1 gap-1.5 md:grid-cols-2">
                              {savedInactiveAdAgentRecords.map((record) => (
                                <div
                                  key={record.agentId}
                                  data-agent-id={`saved-ad-agent-record-${record.agentId}`}
                                  data-testid={`saved-ad-agent-record-${record.agentId}`}
                                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg border border-white/10 bg-surface-container-lowest px-2.5 py-2"
                                >
                                  <div className="min-w-0 space-y-0.5">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      <span className="font-semibold text-on-surface text-[11px] truncate">
                                        {record.name}
                                      </span>
                                      <span className="rounded border border-white/15 bg-surface-container-highest px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase text-on-surface-variant">
                                        Saved Record
                                      </span>
                                      <span className="rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5 font-mono text-[8px] font-bold text-primary">
                                        ⚡ {record.totalCustomizationsTokens.toLocaleString("en-AU")} ({record.customizationsCount}) · {record.redistributionPercentage}%
                                      </span>
                                      {record.bankOrPayIdDetails && (
                                        <span className="rounded border border-tertiary/30 bg-tertiary/10 px-1.5 py-0.5 font-mono text-[8px] font-semibold text-tertiary">
                                          🏦 Bank/PayID Saved
                                        </span>
                                      )}
                                    </div>
                                    <div className="font-mono text-[10px] text-on-surface-variant break-all sm:truncate">
                                      {record.email}
                                      {record.phone && record.phone !== "Not specified" ? ` · ${record.phone}` : ""} · 📍{" "}
                                      {record.locationLabel}
                                    </div>
                                  </div>
                                  <div className="flex shrink-0 items-center justify-end gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        selectAndAutofillAdAgent(record.agentId);
                                        setShowAddAdAgent(true);
                                      }}
                                      data-agent-id={`edit-saved-ad-agent-${record.agentId}`}
                                      data-testid={`edit-saved-ad-agent-${record.agentId}`}
                                      aria-label={`Load saved record details for ${record.name}`}
                                      className={`${btnSecondary} px-2 py-1 text-[9px] font-mono`}
                                    >
                                      Edit / View
                                    </button>
                                    <button
                                      type="button"
                                      disabled={adAgentSaving}
                                      onClick={() =>
                                        handleActivateAdAgent({
                                          agentId: record.agentId,
                                          email: record.email,
                                          name: record.name,
                                        })
                                      }
                                      data-agent-id={`activate-saved-ad-agent-${record.agentId}`}
                                      data-testid={`activate-saved-ad-agent-${record.agentId}`}
                                      aria-label={`Activate ${record.name} into active Ad Agent and Customizations Value list`}
                                      className="inline-flex items-center gap-1 rounded-md border border-primary/50 bg-primary/20 px-2 py-1 font-mono text-[9px] font-bold text-primary hover:bg-primary/30 disabled:opacity-50 transition"
                                    >
                                      <Icon name="plus" className="size-2.5" />
                                      <span>
                                        {activatingAdAgentId === record.agentId ? "Activating…" : "+ Activate"}
                                      </span>
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {liveAdAgentLedger.length === 0 ? (
                        <div className={`${card} p-3.5 text-center text-on-surface-variant`}>
                          <p className="text-xs italic">
                            No active Ad Agents in the Ad Agent &amp; Customizations Value list right now. Activate a saved record above or add a new Ad Agent one by one.
                          </p>
                        </div>
                      ) : (
                        <div
                          role="region"
                          tabIndex={0}
                          aria-label="Active Ad Agent and Customizations Value distribution ledger"
                          className="overflow-x-auto lg:overflow-visible rounded-xl border border-white/[0.08] bg-surface-container"
                        >
                          <table
                            className="w-full block md:table table-auto text-left text-[11px]"
                            data-agent-id="ad-agent-distribution-ledger-table"
                            data-testid="ad-agent-distribution-ledger-table"
                          >
                            <thead className="hidden md:table-header-group border-b border-white/[0.08] bg-surface-container-high/60 font-mono text-[10px] uppercase tracking-wider text-on-surface-variant">
                              <tr>
                                <th className="px-2.5 py-1.5">
                                  Ad Agent &amp; Customizations Value
                                </th>
                                <th className="px-2 py-1.5 hidden md:table-cell">
                                  Bank Details / PayID
                                </th>
                                <th className="px-2 py-1.5">Customizations Total</th>
                                <th className="px-2 py-1.5">Redist. %</th>
                                <th className="px-2 py-1.5">Redist. Amount</th>
                                <th className="px-2 py-1.5">Status</th>
                                <th className="px-2.5 py-1.5 text-right">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="block md:table-row-group divide-y divide-white/[0.08] md:divide-white/[0.04]">
                              {liveAdAgentLedger.map((agent) => {
                                const isSelectedRow = selectedRegisteredAgentKey === agent.agentId;
                                const effectiveOrdersCount = Math.max(1, Math.round(Number(agent.customizationsCount || 1)));
                                return (
                                  <tr
                                    key={agent.agentId}
                                    onClick={() => {
                                      selectAndAutofillAdAgent(agent.agentId);
                                      setShowAddAdAgent(true);
                                    }}
                                    data-agent-id={`ad-agent-ledger-row-${agent.agentId}`}
                                    data-testid={`ad-agent-ledger-row-${agent.agentId}`}
                                    className={`block md:table-row p-3 md:p-0 space-y-2 md:space-y-0 cursor-pointer transition ${
                                      isSelectedRow
                                        ? "bg-tertiary/10 hover:bg-tertiary/15"
                                        : "hover:bg-white/[0.02]"
                                    }`}
                                  >
                                    {/* 1. Name + Total Customizations Value Next to Name + Email & Location */}
                                    <td className="block md:table-cell md:px-2.5 md:py-2">
                                      <div className="flex flex-wrap items-center gap-1.5">
                                        <span className="font-semibold text-on-surface text-[11px]">
                                          {agent.name}
                                        </span>
                                        <span
                                          className="inline-flex items-center gap-1 rounded border border-primary/40 bg-primary/15 px-1.5 py-0.5 font-mono text-[9px] font-bold text-primary"
                                          title={`Professional Customize Service: ⚡ ${customizeServiceUnitTokens} (${formatAud(customizeServiceAudCents)}) × ${effectiveOrdersCount}`}
                                        >
                                          <span>⚡ {agent.totalCustomizationsTokens.toLocaleString("en-AU")}</span>
                                          <span>·</span>
                                          <span>{formatAud(agent.totalCustomizationsAudCents)}</span>
                                          <span className="text-on-surface-variant">
                                            ({agent.customizationsCount})
                                          </span>
                                        </span>
                                        {agent.isSuperAdminBuiltIn && (
                                          <span className="rounded border border-tertiary/40 bg-tertiary/15 px-1 py-0.5 font-mono text-[8px] font-bold uppercase text-tertiary">
                                            Super Admin
                                          </span>
                                        )}
                                      </div>
                                      <div className="mt-0.5 font-mono text-[10px] text-on-surface-variant break-all sm:truncate sm:max-w-[260px]">
                                        {agent.email}
                                        {agent.phone && agent.phone !== "Not specified" ? ` · ${agent.phone}` : ""} · 📍{" "}
                                        {agent.locationLabel}
                                      </div>
                                      {/* Mobile-only fallback for Bank/PayID with Copy & Hover */}
                                      <div
                                        className="mt-1 flex items-center gap-1.5 font-mono text-[9px] md:hidden"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        {agent.bankOrPayIdDetails ? (
                                          <>
                                            <span
                                              className="text-primary truncate max-w-[180px]"
                                              title={agent.bankOrPayIdDetails}
                                            >
                                              🏦 {agent.bankOrPayIdDetails}
                                            </span>
                                            <button
                                              type="button"
                                              onClick={() =>
                                                handleCopyMessageText(
                                                  agent.bankOrPayIdDetails!,
                                                  `bank-mob-${agent.agentId}`
                                                )
                                              }
                                              data-agent-id={`copy-ad-agent-bank-mobile-${agent.agentId}`}
                                              data-testid={`copy-ad-agent-bank-mobile-${agent.agentId}`}
                                              className="inline-flex items-center gap-0.5 rounded border border-primary/40 bg-primary/15 px-1.5 py-0.5 text-[8px] font-bold text-primary"
                                            >
                                              <Icon
                                                name={
                                                  copiedMessageId === `bank-mob-${agent.agentId}`
                                                    ? "checkCircle"
                                                    : "copy"
                                                }
                                                className="size-2.5"
                                              />
                                              <span>
                                                {copiedMessageId === `bank-mob-${agent.agentId}`
                                                  ? "Copied ✓"
                                                  : "Copy"}
                                              </span>
                                            </button>
                                          </>
                                        ) : (
                                          <span className="text-outline italic">No Bank / PayID</span>
                                        )}
                                      </div>
                                    </td>

                                    {/* 2. Dedicated Desktop/Laptop Column: Bank Details / PayID with Hover Preview & Copy Button */}
                                    <td
                                      className="px-2 py-2 hidden md:table-cell font-mono text-[10px] max-w-[220px]"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      {agent.bankOrPayIdDetails ? (
                                        <div
                                          className="group/bank relative flex items-center gap-1.5"
                                          data-agent-id={`ad-agent-bank-cell-${agent.agentId}`}
                                          data-testid={`ad-agent-bank-cell-${agent.agentId}`}
                                        >
                                          <div
                                            className="rounded border border-primary/30 bg-primary/10 px-2 py-1 text-primary truncate max-w-[145px] cursor-help"
                                            title={agent.bankOrPayIdDetails}
                                          >
                                            🏦 {agent.bankOrPayIdDetails}
                                          </div>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              handleCopyMessageText(
                                                agent.bankOrPayIdDetails!,
                                                `bank-${agent.agentId}`
                                              )
                                            }
                                            data-agent-id={`copy-ad-agent-bank-${agent.agentId}`}
                                            data-testid={`copy-ad-agent-bank-${agent.agentId}`}
                                            aria-label={`Copy Bank or PayID details for ${agent.name}`}
                                            title={`Copy Bank / PayID: ${agent.bankOrPayIdDetails}`}
                                            className="inline-flex shrink-0 items-center gap-1 rounded border border-primary/40 bg-primary/15 px-1.5 py-1 font-mono text-[9px] font-bold text-primary hover:bg-primary/25 transition"
                                          >
                                            <Icon
                                              name={
                                                copiedMessageId === `bank-${agent.agentId}`
                                                  ? "checkCircle"
                                                  : "copy"
                                              }
                                              className="size-2.5"
                                            />
                                            <span>
                                              {copiedMessageId === `bank-${agent.agentId}`
                                                ? "Copied ✓"
                                                : "Copy"}
                                            </span>
                                          </button>

                                          {/* Hover Tooltip Popover showing Full Bank Details / PayID Details */}
                                          <div
                                            role="tooltip"
                                            data-agent-id={`ad-agent-bank-hover-tooltip-${agent.agentId}`}
                                            data-testid={`ad-agent-bank-hover-tooltip-${agent.agentId}`}
                                            className="pointer-events-none invisible opacity-0 group-hover/bank:visible group-hover/bank:opacity-100 transition-all duration-150 absolute bottom-full left-0 z-50 mb-1.5 w-72 rounded-xl border border-primary/40 bg-surface-container-highest p-2.5 shadow-2xl"
                                          >
                                            <div className="flex items-center justify-between border-b border-white/10 pb-1 mb-1">
                                              <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-primary">
                                                🏦 Bank / PayID — {agent.name}
                                              </span>
                                              <span className="font-mono text-[9px] text-on-surface-variant">
                                                Hover Preview
                                              </span>
                                            </div>
                                            <p className="font-mono text-[11px] text-on-surface whitespace-pre-wrap break-words leading-relaxed">
                                              {agent.bankOrPayIdDetails}
                                            </p>
                                          </div>
                                        </div>
                                      ) : (
                                        <span className="text-outline italic text-[10px]">
                                          Click row to add Bank / PayID
                                        </span>
                                      )}
                                    </td>

                                    {/* 3. Total Customizations Value */}
                                    <td
                                      className="flex items-center justify-between gap-2 md:table-cell md:px-2 md:py-2 font-mono text-[10px]"
                                      data-testid={`ad-agent-customizations-total-${agent.agentId}`}
                                    >
                                      <span className="md:hidden font-mono text-[10px] uppercase tracking-wider text-on-surface-variant">
                                        Customizations Total
                                      </span>
                                      <div className="text-right md:text-left">
                                        <div className="font-bold text-on-surface">
                                          ⚡ {agent.totalCustomizationsTokens.toLocaleString("en-AU")} ({agent.customizationsCount})
                                        </div>
                                        <div className="text-[9px] text-secondary font-semibold">
                                          {formatAud(agent.totalCustomizationsAudCents)} ·{" "}
                                          {formatUsd(agent.totalCustomizationsUsdCents)}
                                        </div>
                                        <div className="text-[8px] text-on-surface-variant">
                                          {effectiveOrdersCount} × ⚡ {customizeServiceUnitTokens} ({formatAud(customizeServiceAudCents)})
                                        </div>
                                      </div>
                                    </td>

                                    {/* 4. Redistribution % Dropdown (10%, 20%, 30%, 40%, 50%, 60%, 70%) */}
                                    <td
                                      className="flex items-center justify-between gap-2 md:table-cell md:px-2 md:py-2"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <span className="md:hidden font-mono text-[10px] uppercase tracking-wider text-on-surface-variant">
                                        Redist. %
                                      </span>
                                      {isSuper ? (
                                        <select
                                          value={agent.redistributionPercentage}
                                          disabled={adAgentSaving}
                                          onChange={(e) =>
                                            handleUpdateAdAgentPercent(
                                              agent.agentId,
                                              Number(e.target.value) as AdAgentRedistributionPercent,
                                              agent.name
                                            )
                                          }
                                          data-agent-id={`ad-agent-percent-select-${agent.agentId}`}
                                          data-testid={`ad-agent-percent-select-${agent.agentId}`}
                                          aria-label={`Set redistribution percentage for ${agent.name}`}
                                          className="rounded border border-tertiary/40 bg-surface-container-lowest px-1.5 py-1 font-mono text-[10px] font-bold text-tertiary focus:border-primary focus:outline-none"
                                        >
                                          {AD_AGENT_REDISTRIBUTION_PERCENTS.map((pct) => (
                                            <option key={pct} value={pct}>
                                              {pct}%
                                            </option>
                                          ))}
                                        </select>
                                      ) : (
                                        <span className="font-mono text-[10px] font-bold text-tertiary">
                                          {agent.redistributionPercentage}%
                                        </span>
                                      )}
                                    </td>

                                    {/* 5. Redistribution Amount */}
                                    <td
                                      className="flex items-center justify-between gap-2 md:table-cell md:px-2 md:py-2 font-mono text-[10px]"
                                      data-testid={`ad-agent-redist-amount-${agent.agentId}`}
                                    >
                                      <span className="md:hidden font-mono text-[10px] uppercase tracking-wider text-on-surface-variant">
                                        Redist. Amount
                                      </span>
                                      <div className="text-right md:text-left">
                                        <div className="font-bold text-primary">
                                          ⚡ {agent.redistributionTokens.toLocaleString("en-AU")}
                                        </div>
                                        <div className="font-semibold text-on-surface text-[9px]">
                                          {formatAud(agent.redistributionAudCents)} ·{" "}
                                          {formatUsd(agent.redistributionUsdCents)}
                                        </div>
                                        {agent.lastResetAt ? (
                                          <div className="text-[8px] text-secondary">
                                            {agent.redistributionTokens === 0
                                              ? "Refreshed to 0"
                                              : `Reset ${new Date(agent.lastResetAt).toLocaleDateString("en-AU")}`}
                                          </div>
                                        ) : (
                                          <div className="text-[8px] text-on-surface-variant">
                                            {agent.redistributionPercentage}% of ⚡{" "}
                                            {agent.totalCustomizationsTokens.toLocaleString("en-AU")}
                                          </div>
                                        )}
                                      </div>
                                    </td>

                                    {/* 6. Status */}
                                    <td
                                      className="flex items-center justify-between gap-2 md:table-cell md:px-2 md:py-2"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <span className="md:hidden font-mono text-[10px] uppercase tracking-wider text-on-surface-variant">
                                        Status
                                      </span>
                                      <button
                                        type="button"
                                        disabled={!isSuper || adAgentSaving}
                                        onClick={() => handleToggleAdAgentStatus(agent.agentId, agent.status)}
                                        data-agent-id={`toggle-ad-agent-status-${agent.agentId}`}
                                        data-testid={`toggle-ad-agent-status-${agent.agentId}`}
                                        className={`rounded px-1.5 py-0.5 text-[9px] font-mono font-semibold transition ${
                                          agent.status === "active"
                                            ? "bg-primary/20 text-primary hover:bg-primary/30"
                                            : "bg-surface-container-highest text-on-surface-variant hover:bg-white/[0.08]"
                                        }`}
                                      >
                                        {agent.status.toUpperCase()}
                                      </button>
                                    </td>

                                    {/* 7. Actions (Invoice .txt, Reset 0 ⚡ & Confirm Delete) */}
                                    <td
                                      className="flex items-center justify-between gap-2 pt-1.5 md:pt-0 border-t border-white/[0.06] md:border-0 md:table-cell md:px-2.5 md:py-2 text-right whitespace-nowrap"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <span className="md:hidden font-mono text-[10px] uppercase tracking-wider text-on-surface-variant">
                                        Actions
                                      </span>
                                      {(isSuper || isSuperAdmin) && (
                                        <div className="flex flex-wrap items-center justify-end gap-1">
                                          <button
                                            type="button"
                                            onClick={() => handleDownloadAdAgentInvoice(agent)}
                                            data-agent-id={`download-ad-agent-invoice-${agent.agentId}`}
                                            data-testid={`download-ad-agent-invoice-${agent.agentId}`}
                                            aria-label={`Download payout invoice text file for ${agent.name}`}
                                            title={`Download payout invoice (.txt) for ${agent.name} (${formatAud(agent.redistributionAudCents)} AUD)`}
                                            className="inline-flex items-center gap-1 rounded border border-primary/40 bg-primary/15 px-1.5 py-0.5 font-mono text-[9px] font-bold text-primary hover:bg-primary/25 transition"
                                          >
                                            <Icon name="download" className="size-2.5" />
                                            <span>Invoice</span>
                                          </button>

                                          {confirmResetAdAgentId === agent.agentId ? (
                                            <div className="flex items-center gap-1 animate-fadeIn">
                                              <button
                                                type="button"
                                                disabled={resettingAdAgentId === agent.agentId}
                                                onClick={() => handleResetAdAgentZero(agent.agentId, agent.email)}
                                                data-agent-id={`confirm-reset-ad-agent-${agent.agentId}`}
                                                data-testid={`confirm-reset-ad-agent-${agent.agentId}`}
                                                aria-label={`Confirm reset ${agent.email} redistribution to 0 tokens`}
                                                className="inline-flex items-center gap-1 rounded border border-amber-500/60 bg-amber-500/25 px-1.5 py-0.5 font-mono text-[9px] font-bold text-amber-200 hover:bg-amber-500/35 disabled:opacity-50 transition"
                                              >
                                                <Icon
                                                  name="refresh"
                                                  className={`size-2.5 ${resettingAdAgentId === agent.agentId ? "animate-spin" : ""}`}
                                                />
                                                <span>
                                                  {resettingAdAgentId === agent.agentId ? "…" : "Confirm Reset 0 ⚡"}
                                                </span>
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() => setConfirmResetAdAgentId(null)}
                                                className="rounded border border-white/10 bg-surface-container-highest px-1 py-0.5 font-mono text-[9px] text-on-surface-variant hover:text-on-surface"
                                              >
                                                Cancel
                                              </button>
                                            </div>
                                          ) : (
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setConfirmResetAdAgentId(agent.agentId);
                                                setConfirmDeleteAdAgentId(null);
                                              }}
                                              data-agent-id={`reset-ad-agent-${agent.agentId}`}
                                              data-testid={`reset-ad-agent-${agent.agentId}`}
                                              aria-label={`Reset ${agent.email} redistribution to 0`}
                                              className="inline-flex items-center gap-1 rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-amber-300 hover:bg-amber-500/20 transition"
                                            >
                                              <Icon name="refresh" className="size-2.5" />
                                              <span>Reset 0 ⚡</span>
                                            </button>
                                          )}

                                          {confirmDeleteAdAgentId === agent.agentId ? (
                                            <div className="flex items-center gap-1 animate-fadeIn">
                                              <button
                                                type="button"
                                                disabled={adAgentSaving}
                                                onClick={() =>
                                                  handleDeleteAdAgent(
                                                    agent.agentId,
                                                    agent.email,
                                                    agent.name
                                                  )
                                                }
                                                data-agent-id={`confirm-delete-ad-agent-${agent.agentId}`}
                                                data-testid={`confirm-delete-ad-agent-${agent.agentId}`}
                                                aria-label={`Confirm remove Ad Agent ${agent.email} from active list while keeping records`}
                                                className={`${btnDanger} px-1.5 py-0.5 text-[9px]`}
                                              >
                                                Confirm
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() => setConfirmDeleteAdAgentId(null)}
                                                data-agent-id={`cancel-delete-ad-agent-${agent.agentId}`}
                                                data-testid={`cancel-delete-ad-agent-${agent.agentId}`}
                                                aria-label={`Cancel removing Ad Agent ${agent.email}`}
                                                className={`${btnSecondary} px-1 py-0.5 text-[9px]`}
                                              >
                                                Cancel
                                              </button>
                                            </div>
                                          ) : (
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setConfirmDeleteAdAgentId(agent.agentId);
                                                setConfirmResetAdAgentId(null);
                                              }}
                                              data-agent-id={`delete-ad-agent-${agent.agentId}`}
                                              data-testid={`delete-ad-agent-${agent.agentId}`}
                                              aria-label={`Delete Ad Agent ${agent.email} from active list`}
                                              className="text-error hover:text-error/80 font-mono text-[9px] underline ml-0.5"
                                            >
                                              Delete
                                            </button>
                                          )}
                                        </div>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                        </>
                      )}
                    </div>
                  </div>

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
                              Super Admin: Order Refunds
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-[11px] text-on-surface-variant">
                          Complete chronological audit of every Stripe purchase, AdRadarHQ search order, AI Remix, Customize brief, Gift credit, and Token Refund.{" "}
                          {isSuper
                            ? "Super Admin can click “Refund Tokens” on any deduction order to restore tokens to the customer wallet."
                            : "Order refunds are restricted to Super Admin only."}
                        </p>
                      </button>

                      <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto shrink-0">
                        {isMasterLedgerExpanded && (
                          <input
                            type="text"
                            placeholder="Search email, brand, or tx ID..."
                            value={orderSearch}
                            onChange={(e) => setOrderSearch(e.target.value)}
                            className={`${field} !py-1.5 !text-[12px] w-full sm:w-56`}
                            data-agent-id="master-order-ledger-search"
                            data-testid="master-order-ledger-search"
                          />
                        )}
                        <button
                          type="button"
                          onClick={reloadOrders}
                          className={`${btnSecondary} flex-1 sm:flex-initial justify-center`}
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
                          className={`${btnSecondary} font-mono text-xs flex-1 sm:flex-initial justify-center`}
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
                          tx.type !== "BRAND_CLONE" &&
                          tx.type !== "BRAND_TXT_DOWNLOAD" &&
                          tx.type !== "SEARCHMIX_DOWNLOAD" &&
                          tx.type !== "DECONSTRUCT_DOWNLOAD"
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
                                  {isSuper ? "Super Admin (Refund)" : "Refund Status"}
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
                                          ) : (
                                            <span className="text-[10px] text-outline">—</span>
                                          )}
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
                </div>
              )}

              {/* TAB 5: USER MESSAGES (7-YEAR COMPLIANCE ARCHIVE) */}
              {tab === "MESSAGES" && (
                <div className="space-y-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="text-title-sm font-semibold text-on-surface">User Messages & Communications</h3>
                      <p className="mt-1 text-compact text-on-surface-variant">
                        Inspect incoming user communications or message anyone. Immutable 7-year statutory retention. Plain text only, no upload links.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
                      {(() => {
                        const allExpanded =
                          showComposeMessage &&
                          isFeatureExpanded("messages_retention") &&
                          isFeatureExpanded("messages_inbox");
                        return (
                          <button
                            type="button"
                            onClick={() => {
                              const next = !allExpanded;
                              setShowComposeMessage(next);
                              setFeatureExpanded("messages_retention", next);
                              setFeatureExpanded("messages_inbox", next);
                            }}
                            data-agent-id="messages-expand-all-btn"
                            data-testid="messages-expand-all-btn"
                            className="inline-flex items-center gap-1.5 rounded-lg border border-primary/35 bg-primary/10 px-3 py-1.5 font-mono text-xs font-semibold text-primary hover:bg-primary/20 transition"
                          >
                            <Icon name="chevronDown" className={`size-3.5 transition-transform ${allExpanded ? "rotate-180" : ""}`} />
                            <span>{allExpanded ? "Collapse All" : "Expand All"}</span>
                          </button>
                        );
                      })()}
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
                  </div>

                  {/* Collapsible Feature 1: Compose Message to Anyone */}
                  <div className={`${card} p-4 space-y-4 border border-primary/25`}>
                    <div
                      role="button"
                      tabIndex={0}
                      aria-expanded={showComposeMessage}
                      onClick={() => setShowComposeMessage((v) => !v)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setShowComposeMessage((v) => !v);
                        }
                      }}
                      data-agent-id="messages-compose-collapse-header"
                      data-testid="messages-compose-collapse-header"
                      className="flex cursor-pointer select-none flex-wrap items-center justify-between gap-2 rounded-lg py-0.5 hover:opacity-95"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex size-6 items-center justify-center rounded-md border border-primary/35 bg-primary/10 text-primary transition-transform duration-200 ${
                            showComposeMessage ? "rotate-180" : "-rotate-90"
                          }`}
                        >
                          <Icon name="chevronDown" className="size-3.5" />
                        </span>
                        <Icon name="sparkles" className="size-4 text-primary" />
                        <h4 className="text-compact font-bold text-on-surface">Compose Message to Anyone</h4>
                        <span className="rounded bg-primary/20 px-2 py-0.5 font-mono text-[11px] text-primary">
                          7-Year Compliance Archive
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowComposeMessage((v) => !v);
                        }}
                        aria-expanded={showComposeMessage}
                        data-agent-id="toggle-messages-compose-btn"
                        data-testid="toggle-messages-compose-btn"
                        className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-surface-container-high px-2.5 py-1 font-mono text-[11px] font-semibold text-on-surface-variant hover:border-primary/40 hover:text-on-surface transition"
                      >
                        <span>{showComposeMessage ? "Collapse" : "Expand"}</span>
                        <Icon name="chevronDown" className={`size-3 transition-transform duration-200 ${showComposeMessage ? "rotate-180" : "-rotate-90"}`} />
                      </button>
                    </div>

                    {showComposeMessage && (
                      <form onSubmit={handleSendSuperadminMessage} className="space-y-4 border-t border-white/[0.08] pt-3">
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
                            id="top-compose-body-textarea"
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
                  </div>

                  {/* Collapsible Feature 2: 7-Year Statutory Compliance Badge */}
                  <div className="rounded-xl border border-secondary/30 bg-secondary/10 p-3.5 space-y-2.5">
                    <div
                      role="button"
                      tabIndex={0}
                      aria-expanded={isFeatureExpanded("messages_retention")}
                      onClick={() => toggleFeatureExpanded("messages_retention")}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          toggleFeatureExpanded("messages_retention");
                        }
                      }}
                      data-agent-id="messages-retention-collapse-header"
                      data-testid="messages-retention-collapse-header"
                      className="flex cursor-pointer select-none flex-wrap items-center justify-between gap-2 rounded-lg py-0.5 hover:opacity-95"
                    >
                      <div className="flex items-center gap-2.5">
                        <span
                          className={`inline-flex size-6 items-center justify-center rounded-md border border-secondary/40 bg-secondary/20 text-secondary transition-transform duration-200 ${
                            isFeatureExpanded("messages_retention") ? "rotate-180" : "-rotate-90"
                          }`}
                        >
                          <Icon name="chevronDown" className="size-3.5" />
                        </span>
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-secondary/20 text-secondary">
                          <Icon name="shield" className="size-3.5" />
                        </span>
                        <p className="text-compact font-semibold text-secondary">
                          Statutory Record Retention Guarantee (7 Years)
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFeatureExpanded("messages_retention");
                        }}
                        aria-expanded={isFeatureExpanded("messages_retention")}
                        data-agent-id="toggle-messages-retention-btn"
                        data-testid="toggle-messages-retention-btn"
                        className="inline-flex items-center gap-1 rounded-lg border border-secondary/35 bg-surface-container-high px-2.5 py-1 font-mono text-[11px] font-semibold text-secondary hover:bg-secondary/20 transition"
                      >
                        <span>{isFeatureExpanded("messages_retention") ? "Collapse" : "Expand"}</span>
                        <Icon name="chevronDown" className={`size-3 transition-transform duration-200 ${isFeatureExpanded("messages_retention") ? "rotate-180" : "-rotate-90"}`} />
                      </button>
                    </div>

                    {isFeatureExpanded("messages_retention") && (
                      <div className="border-t border-secondary/25 pt-2.5 text-[12px] text-on-surface-variant leading-relaxed">
                        In adherence with the Australian Corporations Act and financial record regulations, all user communications are cryptographically indexed with an immutable <code>retentionUntil</code> timestamp set 7 years from arrival. Messages cannot be destroyed before statutory expiry.
                      </div>
                    )}
                  </div>

                  {/* Collapsible Feature 3: User Messages Inbox & Compliance Viewer */}
                  <div className={`${card} p-4 space-y-4`}>
                    <div
                      role="button"
                      tabIndex={0}
                      aria-expanded={isFeatureExpanded("messages_inbox")}
                      onClick={() => toggleFeatureExpanded("messages_inbox")}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          toggleFeatureExpanded("messages_inbox");
                        }
                      }}
                      data-agent-id="messages-inbox-collapse-header"
                      data-testid="messages-inbox-collapse-header"
                      className="flex cursor-pointer select-none flex-wrap items-center justify-between gap-2 rounded-lg py-0.5 hover:opacity-95"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex size-6 items-center justify-center rounded-md border border-primary/35 bg-primary/10 text-primary transition-transform duration-200 ${
                            isFeatureExpanded("messages_inbox") ? "rotate-180" : "-rotate-90"
                          }`}
                        >
                          <Icon name="chevronDown" className="size-3.5" />
                        </span>
                        <h4 className="text-compact font-bold text-on-surface">
                          User Messages Inbox &amp; Compliance Viewer
                        </h4>
                        <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-primary">
                          {adminMessages.length} {adminMessages.length === 1 ? "Message" : "Messages"}
                        </span>
                        {adminMessages.filter((m) => m.status === "unread").length > 0 && (
                          <span className="rounded-full bg-amber-500/20 px-2 py-0.5 font-mono text-[10px] font-bold text-amber-300">
                            {adminMessages.filter((m) => m.status === "unread").length} Unread
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFeatureExpanded("messages_inbox");
                        }}
                        aria-expanded={isFeatureExpanded("messages_inbox")}
                        data-agent-id="toggle-messages-inbox-btn"
                        data-testid="toggle-messages-inbox-btn"
                        className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-surface-container-high px-2.5 py-1 font-mono text-[11px] font-semibold text-on-surface-variant hover:border-primary/40 hover:text-on-surface transition"
                      >
                        <span>{isFeatureExpanded("messages_inbox") ? "Collapse" : "Expand"}</span>
                        <Icon name="chevronDown" className={`size-3 transition-transform duration-200 ${isFeatureExpanded("messages_inbox") ? "rotate-180" : "-rotate-90"}`} />
                      </button>
                    </div>

                    {isFeatureExpanded("messages_inbox") && (
                      <div className="border-t border-white/[0.08] pt-3">
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

                                  {showInlineReplyBox && (
                                    <form
                                      onSubmit={handleSendSuperadminMessage}
                                      data-testid="inline-reply-to-sender-form"
                                      data-agent-id="inline-reply-to-sender-form"
                                      className="rounded-xl border border-primary/40 bg-primary/10 p-3.5 space-y-3 animate-fadeIn"
                                    >
                                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2">
                                        <div className="flex items-center gap-1.5">
                                          <Icon name="sparkles" className="size-3.5 text-primary" />
                                          <span className="font-mono text-xs font-bold text-primary">
                                            Reply to Sender ({composeRecipientEmail || selectedMessage.senderEmail})
                                          </span>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => setShowInlineReplyBox(false)}
                                          data-testid="close-inline-reply-btn"
                                          data-agent-id="close-inline-reply-btn"
                                          className="font-mono text-[10px] text-on-surface-variant hover:text-on-surface"
                                        >
                                          Close Reply ✕
                                        </button>
                                      </div>

                                      {composeHasLinks && (
                                        <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-2.5 text-[11px] text-red-300">
                                          Please remove clickable URLs (`http://`, `https://`, `www.`). Plain text communication only.
                                        </div>
                                      )}

                                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                        <div>
                                          <label className="block font-mono text-[10px] uppercase text-on-surface-variant mb-1">
                                            To (Recipient Email)
                                          </label>
                                          <input
                                            type="email"
                                            required
                                            value={composeRecipientEmail}
                                            onChange={(e) => setComposeRecipientEmail(e.target.value)}
                                            data-testid="inline-reply-recipient-input"
                                            data-agent-id="inline-reply-recipient-input"
                                            className={`${field} py-1.5 text-xs font-mono`}
                                          />
                                        </div>
                                        <div>
                                          <label className="block font-mono text-[10px] uppercase text-on-surface-variant mb-1">
                                            Reply Subject
                                          </label>
                                          <input
                                            type="text"
                                            required
                                            maxLength={150}
                                            value={composeSubject}
                                            onChange={(e) => setComposeSubject(e.target.value)}
                                            data-testid="inline-reply-subject-input"
                                            data-agent-id="inline-reply-subject-input"
                                            className={`${field} py-1.5 text-xs`}
                                          />
                                        </div>
                                      </div>

                                      <div>
                                        <div className="flex items-center justify-between mb-1">
                                          <label
                                            htmlFor="inline-reply-body-textarea"
                                            className="font-mono text-[10px] uppercase text-on-surface-variant"
                                          >
                                            Reply Message Body (Plain Text) *
                                          </label>
                                          <span className="font-mono text-[10px] text-on-surface-variant">
                                            {composeBody.length} / 10000
                                          </span>
                                        </div>
                                        <textarea
                                          id="inline-reply-body-textarea"
                                          required
                                          rows={5}
                                          maxLength={10000}
                                          placeholder={`Write your reply to ${composeRecipientEmail || selectedMessage.senderEmail}...`}
                                          value={composeBody}
                                          onChange={(e) => setComposeBody(e.target.value)}
                                          data-testid="inline-reply-body-textarea"
                                          data-agent-id="inline-reply-body-textarea"
                                          className={`${field} font-sans text-xs leading-relaxed`}
                                        />
                                      </div>

                                      <div className="flex flex-wrap items-center justify-end gap-2">
                                        <button
                                          type="button"
                                          onClick={() => setShowInlineReplyBox(false)}
                                          className={`${btnSecondary} !py-1.5 !text-xs`}
                                        >
                                          Cancel
                                        </button>
                                        <button
                                          type="submit"
                                          disabled={
                                            composeSending ||
                                            composeHasLinks ||
                                            !composeRecipientEmail.trim() ||
                                            !composeSubject.trim() ||
                                            !composeBody.trim()
                                          }
                                          data-testid="inline-reply-send-btn"
                                          data-agent-id="inline-reply-send-btn"
                                          className={`${btnPrimary} !py-1.5 !text-xs`}
                                        >
                                          <Icon
                                            name={composeSending ? "refresh" : "sparkles"}
                                            className={`size-3.5 ${composeSending ? "animate-spin" : ""}`}
                                          />
                                          <span>
                                            {composeSending ? "Sending Reply…" : "Send Reply"}
                                          </span>
                                        </button>
                                      </div>
                                    </form>
                                  )}

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
                                      onClick={() => openReplyToMessage(selectedMessage)}
                                      data-testid="viewer-reply-to-sender-btn"
                                      data-agent-id="viewer-reply-to-sender-btn"
                                      aria-label={`Reply to ${selectedMessage.senderEmail}`}
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
                                    {/* Permanent deletion overrides 7-year retention: Super Admin only (server-enforced too). */}
                                    {isSuper && (confirmDeleteMessageId === selectedMessage.messageId ? (
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
                                    ))}
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
                  </div>
                </div>
              )}

              {/* TAB: ALL USERS & RBAC ROLE ASSIGNMENT (In Main Admin Panel & Super Admin Panel) */}
              {tab === "USERS" && (
                <div
                  className="space-y-4"
                  data-agent-id="all-users-rbac-tab-panel"
                  data-testid="all-users-rbac-tab-panel"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Icon name="user" className="size-4 text-primary" />
                        <h3 className="text-title-sm font-semibold text-on-surface">
                          All Users &amp; Multi-Role RBAC Assignment
                        </h3>
                        <span className="rounded-full border border-primary/40 bg-primary/15 px-2.5 py-0.5 font-mono text-[11px] font-bold text-primary">
                          {rbacUsers.length} Registered {rbacUsers.length === 1 ? "User" : "Users"}
                        </span>
                      </div>
                      <p className="mt-1 text-compact text-on-surface-variant">
                        {isSuper ? (
                          <>
                            View all registered users across AdRadarHQ. Super Admin can manage user token balances (<strong>+ Add Tokens</strong>, <strong>- Tokens</strong>, <strong>Reset to Zero</strong>) and toggle{" "}
                            <strong>multiple RBAC roles</strong> (Supporter, Ad Agent, Agency, Moderator, Main Admin) for any user and click <strong>Confirm</strong> to update their roles.
                          </>
                        ) : (
                          <>
                            View all registered users across AdRadarHQ. Main Admin can only approve{" "}
                            <strong>Supporter, Ad Agent, Agency, and Moderator</strong> roles (Main Admin cannot make people Main Admin).
                          </>
                        )}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {(() => {
                        const allExpanded =
                          (!canApproveRoles || isFeatureExpanded("users_quick_assign")) &&
                          isFeatureExpanded("users_directory");
                        return (
                          <button
                            type="button"
                            onClick={() => {
                              const next = !allExpanded;
                              if (canApproveRoles) {
                                setFeatureExpanded("users_quick_assign", next);
                              }
                              setFeatureExpanded("users_directory", next);
                            }}
                            data-agent-id="users-expand-all-btn"
                            data-testid="users-expand-all-btn"
                            className="inline-flex items-center gap-1.5 rounded-lg border border-primary/35 bg-primary/10 px-3 py-1.5 font-mono text-xs font-semibold text-primary hover:bg-primary/20 transition"
                          >
                            <Icon name="chevronDown" className={`size-3.5 transition-transform ${allExpanded ? "rotate-180" : ""}`} />
                            <span>{allExpanded ? "Collapse All" : "Expand All"}</span>
                          </button>
                        );
                      })()}
                      <input
                        type="search"
                        placeholder="Search users by email, name, or UID..."
                        value={userSearchQuery}
                        onChange={(e) => {
                          setUserSearchQuery(e.target.value);
                          if (!isFeatureExpanded("users_directory")) {
                            setFeatureExpanded("users_directory", true);
                          }
                        }}
                        data-agent-id="all-users-search-input"
                        data-testid="all-users-search-input"
                        className="rounded-lg border border-white/10 bg-surface-container px-3 py-1.5 text-compact text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:outline-none sm:w-64"
                      />
                      <button
                        type="button"
                        onClick={reloadRbac}
                        disabled={rbacLoading}
                        data-agent-id="refresh-all-users-btn"
                        data-testid="refresh-all-users-btn"
                        className={`${btnSecondary} px-3 py-1.5 text-xs`}
                      >
                        <Icon name="refresh" className={`size-3.5 ${rbacLoading ? "animate-spin" : ""}`} />
                        <span>Refresh Users</span>
                      </button>
                    </div>
                  </div>

                  {/* Collapsible Feature 1: Quick Assign Multiple Roles by Email with Confirm Button (Super Admin & Main Admin) */}
                  {canApproveRoles && (
                    <div
                      className={`${card} p-3.5 border border-primary/30 bg-primary/[0.04] space-y-3`}
                      data-agent-id="users-tab-quick-assign-card"
                      data-testid="users-tab-quick-assign-card"
                    >
                      <div
                        role="button"
                        tabIndex={0}
                        aria-expanded={isFeatureExpanded("users_quick_assign")}
                        onClick={() => toggleFeatureExpanded("users_quick_assign")}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            toggleFeatureExpanded("users_quick_assign");
                          }
                        }}
                        data-agent-id="users-quick-assign-collapse-header"
                        data-testid="users-quick-assign-collapse-header"
                        className="flex cursor-pointer select-none flex-wrap items-center justify-between gap-2 rounded-lg py-0.5 hover:opacity-95"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`inline-flex size-6 items-center justify-center rounded-md border border-primary/35 bg-primary/10 text-primary transition-transform duration-200 ${
                              isFeatureExpanded("users_quick_assign") ? "rotate-180" : "-rotate-90"
                            }`}
                          >
                            <Icon name="chevronDown" className="size-3.5" />
                          </span>
                          <span className="font-mono text-xs font-bold uppercase tracking-wider text-primary">
                            {isSuper
                              ? "Super Admin Quick Assign Multiple Roles by Email"
                              : "Main Admin Quick Approve Roles by Email (Supporter, Ad Agent, Agency, Moderator)"}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFeatureExpanded("users_quick_assign");
                          }}
                          aria-expanded={isFeatureExpanded("users_quick_assign")}
                          data-agent-id="toggle-users-quick-assign-btn"
                          data-testid="toggle-users-quick-assign-btn"
                          className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-surface-container-high px-2.5 py-1 font-mono text-[11px] font-semibold text-on-surface-variant hover:border-primary/40 hover:text-on-surface transition"
                        >
                          <span>{isFeatureExpanded("users_quick_assign") ? "Collapse" : "Expand"}</span>
                          <Icon name="chevronDown" className={`size-3 transition-transform duration-200 ${isFeatureExpanded("users_quick_assign") ? "rotate-180" : "-rotate-90"}`} />
                        </button>
                      </div>

                      {isFeatureExpanded("users_quick_assign") && (
                        <div className="space-y-2.5 border-t border-white/[0.08] pt-3">
                          <p className="font-mono text-[10px] text-on-surface-variant">
                            {isSuper
                              ? "Select user email & toggle one or multiple RBAC roles, then click Confirm"
                              : "Main Admin can only approve Supporter, Ad Agent, Agency, and Moderator (cannot make people Main Admin)"}
                          </p>
                          <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center">
                            <input
                              type="email"
                              list="all-users-email-datalist"
                              placeholder="Select or enter user email (e.g. user@example.com)..."
                              value={quickAssignEmail}
                              onChange={(e) => {
                                const val = e.target.value;
                                setQuickAssignEmail(val);
                                setConfirmQuickAssignOpen(false);
                                const matched = rbacUsers.find(
                                  (u) => u.email.toLowerCase() === val.trim().toLowerCase()
                                );
                                if (matched && !matched.isPermanentSuperAdmin) {
                                  setQuickAssignRoles(getUserAssignableRoles(matched, isSuper));
                                }
                              }}
                              data-agent-id="users-quick-assign-email-input"
                              data-testid="users-quick-assign-email-input"
                              className={`w-full lg:w-72 ${field} py-1.5 text-xs`}
                            />
                            <datalist id="all-users-email-datalist">
                              {rbacUsers
                                .filter((u) => !u.isPermanentSuperAdmin)
                                .map((u) => (
                                  <option key={u.uid} value={u.email}>
                                    {u.displayName
                                      ? `${u.displayName} (${getUserRolesList(u).join(", ")})`
                                      : getUserRolesList(u).join(", ")}
                                  </option>
                                ))}
                            </datalist>

                            <div
                              className="flex flex-wrap items-center gap-1.5 flex-1"
                              role="group"
                              aria-label="Select one or multiple RBAC roles to assign"
                              data-agent-id="users-quick-assign-roles-group"
                              data-testid="users-quick-assign-roles-group"
                            >
                              {assignableRoleOptions.map((opt) => {
                                const isSelected = quickAssignRoles.includes(opt.value);
                                return (
                                  <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => {
                                      setQuickAssignRoles((prev) =>
                                        toggleRoleSelection(prev, opt.value, isSuper)
                                      );
                                      setConfirmQuickAssignOpen(false);
                                    }}
                                    aria-pressed={isSelected}
                                    data-agent-id={`users-quick-role-pill-${opt.value}`}
                                    data-testid={`users-quick-role-pill-${opt.value}`}
                                    className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 font-mono text-[11px] font-semibold transition ${
                                      isSelected
                                        ? "border-primary bg-primary/20 text-primary shadow-sm"
                                        : "border-white/10 bg-surface-container-low text-on-surface-variant hover:border-white/25 hover:text-on-surface"
                                    }`}
                                  >
                                    <span>{isSelected ? "☑" : "☐"}</span>
                                    <span>{opt.label}</span>
                                  </button>
                                );
                              })}
                            </div>

                            {confirmQuickAssignOpen ? (
                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (!quickAssignEmail.trim()) return;
                                    handleAssignUserRole(quickAssignEmail.trim(), quickAssignRoles);
                                  }}
                                  disabled={rbacSaving || !quickAssignEmail.trim()}
                                  data-agent-id="users-confirm-quick-assign-btn"
                                  data-testid="users-confirm-quick-assign-btn"
                                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 font-mono text-xs font-bold text-on-primary hover:bg-primary-fixed disabled:opacity-50 transition"
                                >
                                  <Icon name="checkCircle" className="size-3.5" />
                                  <span>{rbacSaving ? "Saving…" : `Confirm (${quickAssignRoles.length})`}</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmQuickAssignOpen(false)}
                                  data-agent-id="users-cancel-quick-assign-btn"
                                  data-testid="users-cancel-quick-assign-btn"
                                  className={`${btnSecondary} px-2.5 py-1.5 text-xs`}
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  if (!quickAssignEmail.trim()) return;
                                  setConfirmQuickAssignOpen(true);
                                }}
                                disabled={rbacSaving || !quickAssignEmail.trim()}
                                data-agent-id="users-quick-assign-btn"
                                data-testid="users-quick-assign-btn"
                                className={`${btnPrimary} shrink-0 py-1.5 text-xs`}
                              >
                                Assign {quickAssignRoles.length > 1 ? `Roles (${quickAssignRoles.length})` : "Role"}
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Collapsible Feature 2: All Users Table with Multi-Role Toggles & Confirm Button */}
                  <div className={`${card} p-3.5 space-y-3`}>
                    <div
                      role="button"
                      tabIndex={0}
                      aria-expanded={isFeatureExpanded("users_directory")}
                      onClick={() => toggleFeatureExpanded("users_directory")}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          toggleFeatureExpanded("users_directory");
                        }
                      }}
                      data-agent-id="users-directory-collapse-header"
                      data-testid="users-directory-collapse-header"
                      className="flex cursor-pointer select-none flex-wrap items-center justify-between gap-2 rounded-lg py-0.5 hover:opacity-95"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex size-6 items-center justify-center rounded-md border border-primary/35 bg-primary/10 text-primary transition-transform duration-200 ${
                            isFeatureExpanded("users_directory") ? "rotate-180" : "-rotate-90"
                          }`}
                        >
                          <Icon name="chevronDown" className="size-3.5" />
                        </span>
                        <h4 className="text-compact font-bold text-on-surface">
                          All Users &amp; Multi-Role RBAC Directory Table
                        </h4>
                        <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-primary">
                          {rbacUsers.length} {rbacUsers.length === 1 ? "User" : "Users"}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFeatureExpanded("users_directory");
                        }}
                        aria-expanded={isFeatureExpanded("users_directory")}
                        data-agent-id="toggle-users-directory-btn"
                        data-testid="toggle-users-directory-btn"
                        className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-surface-container-high px-2.5 py-1 font-mono text-[11px] font-semibold text-on-surface-variant hover:border-primary/40 hover:text-on-surface transition"
                      >
                        <span>{isFeatureExpanded("users_directory") ? "Collapse" : "Expand"}</span>
                        <Icon name="chevronDown" className={`size-3 transition-transform duration-200 ${isFeatureExpanded("users_directory") ? "rotate-180" : "-rotate-90"}`} />
                      </button>
                    </div>

                    {isFeatureExpanded("users_directory") && (
                      <div className="space-y-3 border-t border-white/[0.08] pt-3">
                        {/* Role Filter Pills */}
                        <div className="flex flex-wrap items-center gap-1.5">
                          {(
                            [
                              { key: "ALL" as const, label: `All (${rbacUsers.length})` },
                              {
                                key: "superadmin" as const,
                                label: `Super Admin (${rbacUsers.filter((u) => getUserRolesList(u).includes("superadmin")).length})`,
                              },
                              {
                                key: "admin" as const,
                                label: `Main Admin (${rbacUsers.filter((u) => getUserRolesList(u).includes("admin")).length})`,
                              },
                              {
                                key: "ad_agent" as const,
                                label: `Ad Agent (${rbacUsers.filter((u) => getUserRolesList(u).includes("ad_agent")).length})`,
                              },
                              {
                                key: "agency" as const,
                                label: `Agency (${rbacUsers.filter((u) => getUserRolesList(u).includes("agency")).length})`,
                              },
                              {
                                key: "moderator" as const,
                                label: `Moderator (${rbacUsers.filter((u) => getUserRolesList(u).includes("moderator")).length})`,
                              },
                              {
                                key: "supporter" as const,
                                label: `Supporter (${rbacUsers.filter((u) => getUserRolesList(u).includes("supporter")).length})`,
                              },
                            ]
                          ).map((f) => {
                            const active = roleFilter === f.key;
                            return (
                              <button
                                key={f.key}
                                type="button"
                                onClick={() => setRoleFilter(f.key)}
                                data-agent-id={`users-role-filter-${f.key.toLowerCase()}`}
                                data-testid={`users-role-filter-${f.key.toLowerCase()}`}
                                className={`rounded-lg px-2.5 py-1 font-mono text-[11px] font-semibold transition ${
                                  active
                                    ? "bg-primary text-on-primary shadow-sm"
                                    : "border border-white/10 bg-surface-container text-on-surface-variant hover:text-on-surface"
                                }`}
                              >
                                {f.label}
                              </button>
                            );
                          })}
                        </div>

                        <div className="overflow-x-auto rounded-xl border border-white/[0.08] bg-surface-container">
                          <table
                            className="w-full table-auto text-left text-compact border-collapse"
                            data-agent-id="all-users-rbac-table"
                            data-testid="all-users-rbac-table"
                          >
                            <thead>
                              <tr className="border-b border-white/[0.08] bg-surface-container-high/60 font-mono text-[11px] text-on-surface-variant">
                                <th className="px-3.5 py-2.5 font-semibold text-on-surface">User Account</th>
                                <th className="px-3 py-2.5">
                                  {isSuper ? "Token Balance & Controls" : "Token Balance"}
                                </th>
                                <th className="px-3 py-2.5">Current RBAC Roles</th>
                                <th className="px-3 py-2.5 hidden xl:table-cell">Tier</th>
                                <th className="px-3.5 py-2.5 text-right">
                                  {canApproveRoles ? "Toggle Multiple Roles & Confirm" : "Actions"}
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-white/[0.04]">
                              {rbacUsers
                                .filter((u) => {
                                  const userRoles = getUserRolesList(u);
                                  if (roleFilter !== "ALL" && !userRoles.includes(roleFilter)) return false;
                                  const q = userSearchQuery.trim().toLowerCase();
                                  if (!q) return true;
                                  return (
                                    u.email.toLowerCase().includes(q) ||
                                    (u.displayName || "").toLowerCase().includes(q) ||
                                    u.uid.toLowerCase().includes(q) ||
                                    userRoles.some((r) => r.toLowerCase().includes(q))
                                  );
                                })
                                .map((user) => {
                                  const currentRoles = getUserAssignableRoles(user, isSuper);
                                  const selectedRoles = pendingUserRoles[user.uid] ?? currentRoles;
                                  const isRoleChanged =
                                    selectedRoles.length !== currentRoles.length ||
                                    selectedRoles.some((r) => !currentRoles.includes(r));
                                  const isRowSaving = rbacSaving && confirmingRoleUid === user.uid;
                                  const displayRoles = getUserRolesList(user);
                                  const bal = Math.max(0, Math.round(Number(user.tokenBalance ?? 0)));
                                  const isActiveTokenRow = userRowAction?.uid === user.uid;
                                  const isTokenBusy = userRowBusyUid === user.uid;
                                  const isSelfUser = Boolean(
                                    currentSessionUser &&
                                      (user.uid === currentSessionUser.uid ||
                                        (user.email &&
                                          currentSessionUser.email &&
                                          user.email.toLowerCase() === currentSessionUser.email.toLowerCase()))
                                  );
                                  const canDeleteThisUser =
                                    !user.isPermanentSuperAdmin &&
                                    !isSelfUser &&
                                    (isSuper ||
                                      (isMainAdmin &&
                                        !displayRoles.includes("admin") &&
                                        !displayRoles.includes("superadmin") &&
                                        ((rbacMatrix?.admin ?? []).includes("manage_users") ||
                                          (rbacMatrix?.admin ?? []).includes("manage_rbac"))));

                                  return (
                                    <tr
                                      key={user.uid}
                                      data-agent-id={`all-users-row-${user.uid}`}
                                      data-testid={`all-users-row-${user.uid}`}
                                      className="hover:bg-white/[0.02] transition-colors"
                                    >
                                      <td className="px-3.5 py-2.5">
                                        <div className="flex flex-wrap items-center gap-1.5">
                                          <span className="font-semibold text-on-surface">{user.email}</span>
                                          {user.displayName && (
                                            <span className="text-xs text-on-surface-variant">
                                              ({user.displayName})
                                            </span>
                                          )}
                                        </div>
                                        <div className="text-[11px] text-on-surface-variant font-mono">
                                          UID: {user.uid.slice(0, 12)}… • Joined{" "}
                                          {new Date(user.createdAt).toLocaleDateString("en-AU")}
                                        </div>
                                      </td>

                                      <td className="px-3 py-2.5 font-mono text-xs">
                                        <div className="flex flex-col gap-1.5 min-w-[215px]">
                                          <div className="flex items-center gap-1.5">
                                            <span
                                              className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-extrabold whitespace-nowrap ${
                                                bal > 0
                                                  ? "bg-primary/15 text-primary"
                                                  : "bg-surface-container-highest text-on-surface-variant"
                                              }`}
                                              data-agent-id={`user-balance-value-${user.uid}`}
                                              data-testid={`user-balance-value-${user.uid}`}
                                            >
                                              ⚡ {bal.toLocaleString("en-AU")}
                                            </span>
                                          </div>

                                          {isSuper && (
                                            !isActiveTokenRow ? (
                                              <div className="flex flex-wrap items-center gap-1">
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    setErrorMsg(null);
                                                    setUserRowAction({
                                                      uid: user.uid,
                                                      email: user.email,
                                                      mode: "ADD",
                                                      amountInput: "100",
                                                      confirmOpen: true,
                                                    });
                                                  }}
                                                  data-agent-id={`user-bal-add-btn-${user.uid}`}
                                                  data-testid={`user-bal-add-btn-${user.uid}`}
                                                  aria-label={`Add tokens to ${user.email}`}
                                                  className="inline-flex items-center gap-1 rounded-lg border border-primary/40 bg-primary/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-primary hover:bg-primary/20 transition whitespace-nowrap"
                                                >
                                                  <span>+ Add Tokens</span>
                                                </button>

                                                <button
                                                  type="button"
                                                  disabled={bal <= 0}
                                                  title={bal <= 0 ? "Account already has 0 tokens" : `Remove tokens from ${user.email}`}
                                                  onClick={() => {
                                                    setErrorMsg(null);
                                                    setUserRowAction({
                                                      uid: user.uid,
                                                      email: user.email,
                                                      mode: "MINUS",
                                                      amountInput: String(Math.min(10, Math.max(1, bal))),
                                                      confirmOpen: true,
                                                    });
                                                  }}
                                                  data-agent-id={`user-bal-minus-btn-${user.uid}`}
                                                  data-testid={`user-bal-minus-btn-${user.uid}`}
                                                  aria-label={`Remove tokens from ${user.email}`}
                                                  className="inline-flex items-center gap-1 rounded-lg border border-warning/40 bg-warning/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-warning hover:bg-warning/20 disabled:opacity-40 disabled:cursor-not-allowed transition whitespace-nowrap"
                                                >
                                                  <span>- Tokens</span>
                                                </button>

                                                <button
                                                  type="button"
                                                  disabled={bal <= 0}
                                                  title={bal <= 0 ? "Account already has 0 tokens" : `Reset ${user.email} tokens to zero`}
                                                  onClick={() => {
                                                    setErrorMsg(null);
                                                    setUserRowAction({
                                                      uid: user.uid,
                                                      email: user.email,
                                                      mode: "RESET",
                                                      amountInput: "0",
                                                      confirmOpen: true,
                                                    });
                                                  }}
                                                  data-agent-id={`user-bal-reset-btn-${user.uid}`}
                                                  data-testid={`user-bal-reset-btn-${user.uid}`}
                                                  aria-label={`Reset ${user.email} tokens to zero`}
                                                  className="inline-flex items-center gap-1 rounded-lg border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-rose-300 hover:bg-rose-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition whitespace-nowrap"
                                                >
                                                  <Icon name="refresh" className="size-2.5" />
                                                  <span>Reset to Zero</span>
                                                </button>
                                              </div>
                                            ) : userRowAction.mode === "ADD" ? (
                                              <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-primary/40 bg-primary/10 px-2 py-1.5">
                                                <span className="text-[10px] font-bold text-primary">+ Add:</span>
                                                {[10, 50, 100, 500].map((p) => (
                                                  <button
                                                    key={p}
                                                    type="button"
                                                    onClick={() =>
                                                      setUserRowAction((prev) =>
                                                        prev ? { ...prev, amountInput: String(p) } : null
                                                      )
                                                    }
                                                    data-agent-id={`user-bal-add-preset-${user.uid}-${p}`}
                                                    data-testid={`user-bal-add-preset-${user.uid}-${p}`}
                                                    aria-label={`Set add tokens preset +${p} for ${user.email}`}
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
                                                  aria-label={`Tokens to add to ${user.email}`}
                                                  data-agent-id={`user-bal-add-input-${user.uid}`}
                                                  data-testid={`user-bal-add-input-${user.uid}`}
                                                  className="w-16 rounded border border-primary/40 bg-surface-container-highest px-2 py-0.5 text-center font-mono text-[11px] font-bold text-on-surface"
                                                />
                                                <button
                                                  type="button"
                                                  disabled={isTokenBusy || (Number(userRowAction.amountInput) || 0) <= 0}
                                                  onClick={handleUserRowConfirmAction}
                                                  aria-label={`Confirm adding tokens to ${user.email}`}
                                                  data-agent-id={`user-bal-confirm-add-btn-${user.uid}`}
                                                  data-testid={`user-bal-confirm-add-btn-${user.uid}`}
                                                  className="rounded-lg bg-primary px-2 py-0.5 font-mono text-[10px] font-bold text-on-primary hover:bg-primary/90 disabled:opacity-40 transition whitespace-nowrap"
                                                >
                                                  {isTokenBusy
                                                    ? "Adding..."
                                                    : `Confirm Add (+${Math.round(Number(userRowAction.amountInput) || 0)} ⚡)`}
                                                </button>
                                                <button
                                                  type="button"
                                                  disabled={isTokenBusy}
                                                  onClick={() => setUserRowAction(null)}
                                                  aria-label={`Cancel token action for ${user.email}`}
                                                  data-agent-id={`user-bal-cancel-btn-${user.uid}`}
                                                  data-testid={`user-bal-cancel-btn-${user.uid}`}
                                                  className="rounded-lg border border-white/15 bg-surface-container-highest px-2 py-0.5 font-mono text-[10px] text-on-surface-variant hover:text-on-surface"
                                                >
                                                  Cancel
                                                </button>
                                              </div>
                                            ) : userRowAction.mode === "MINUS" ? (
                                              <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-warning/40 bg-warning/10 px-2 py-1.5">
                                                <span className="text-[10px] font-bold text-warning">
                                                  - Tokens (max {bal}):
                                                </span>
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
                                                      data-agent-id={`user-bal-minus-preset-${user.uid}-${p}`}
                                                      data-testid={`user-bal-minus-preset-${user.uid}-${p}`}
                                                      aria-label={`Set remove tokens preset -${p} for ${user.email}`}
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
                                                  aria-label={`Tokens to remove from ${user.email}`}
                                                  data-agent-id={`user-bal-minus-input-${user.uid}`}
                                                  data-testid={`user-bal-minus-input-${user.uid}`}
                                                  className="w-16 rounded border border-warning/40 bg-surface-container-highest px-2 py-0.5 text-center font-mono text-[11px] font-bold text-on-surface"
                                                />
                                                <button
                                                  type="button"
                                                  disabled={
                                                    isTokenBusy ||
                                                    (Number(userRowAction.amountInput) || 0) <= 0 ||
                                                    (Number(userRowAction.amountInput) || 0) > bal
                                                  }
                                                  onClick={handleUserRowConfirmAction}
                                                  aria-label={`Confirm removing tokens from ${user.email}`}
                                                  data-agent-id={`user-bal-confirm-minus-btn-${user.uid}`}
                                                  data-testid={`user-bal-confirm-minus-btn-${user.uid}`}
                                                  className="rounded-lg bg-warning px-2 py-0.5 font-mono text-[10px] font-bold text-black hover:bg-warning/90 disabled:opacity-40 transition whitespace-nowrap"
                                                >
                                                  {isTokenBusy
                                                    ? "Removing..."
                                                    : `Confirm (-${Math.round(Number(userRowAction.amountInput) || 0)} ⚡)`}
                                                </button>
                                                <button
                                                  type="button"
                                                  disabled={isTokenBusy}
                                                  onClick={() => setUserRowAction(null)}
                                                  aria-label={`Cancel token action for ${user.email}`}
                                                  data-agent-id={`user-bal-cancel-btn-${user.uid}`}
                                                  data-testid={`user-bal-cancel-btn-${user.uid}`}
                                                  className="rounded-lg border border-white/15 bg-surface-container-highest px-2 py-0.5 font-mono text-[10px] text-on-surface-variant hover:text-on-surface"
                                                >
                                                  Cancel
                                                </button>
                                              </div>
                                            ) : (
                                              <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-rose-500/40 bg-rose-500/10 px-2 py-1.5">
                                                <span className="text-[10px] font-semibold text-rose-200 whitespace-nowrap">
                                                  Reset {bal.toLocaleString("en-AU")} ⚡ to 0?
                                                </span>
                                                <button
                                                  type="button"
                                                  disabled={isTokenBusy}
                                                  onClick={handleUserRowConfirmAction}
                                                  aria-label={`Confirm resetting ${user.email} tokens to zero`}
                                                  data-agent-id={`user-bal-confirm-reset-btn-${user.uid}`}
                                                  data-testid={`user-bal-confirm-reset-btn-${user.uid}`}
                                                  className="rounded-lg bg-rose-500 px-2 py-0.5 font-mono text-[10px] font-bold text-white hover:bg-rose-400 disabled:opacity-40 transition whitespace-nowrap"
                                                >
                                                  {isTokenBusy ? "Resetting..." : "Confirm Reset to Zero"}
                                                </button>
                                                <button
                                                  type="button"
                                                  disabled={isTokenBusy}
                                                  onClick={() => setUserRowAction(null)}
                                                  aria-label={`Cancel token reset for ${user.email}`}
                                                  data-agent-id={`user-bal-cancel-btn-${user.uid}`}
                                                  data-testid={`user-bal-cancel-btn-${user.uid}`}
                                                  className="rounded-lg border border-white/15 bg-surface-container-highest px-2 py-0.5 font-mono text-[10px] text-on-surface-variant hover:text-on-surface"
                                                >
                                                  Cancel
                                                </button>
                                              </div>
                                            )
                                          )}
                                        </div>
                                      </td>

                                      <td className="px-3 py-2.5">
                                        <div className="flex flex-wrap items-center gap-1">
                                          {displayRoles.map((r) => (
                                            <span
                                              key={r}
                                              className={`inline-block rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase ${
                                                r === "superadmin"
                                                  ? "border border-primary/40 bg-primary/20 text-primary"
                                                  : r === "admin"
                                                    ? "border border-secondary/40 bg-secondary/20 text-secondary"
                                                    : r === "ad_agent"
                                                      ? "border border-tertiary/40 bg-tertiary/20 text-tertiary"
                                                      : r === "moderator"
                                                        ? "border border-amber-400/40 bg-amber-500/15 text-amber-300"
                                                        : r === "agency"
                                                          ? "border border-sky-400/40 bg-sky-500/15 text-sky-300"
                                                          : "border border-white/10 bg-surface-container-highest text-on-surface-variant"
                                              }`}
                                            >
                                              {formatRbacRoleLabel(r)}
                                            </span>
                                          ))}
                                        </div>
                                      </td>

                                      <td className="px-3 py-2.5 hidden xl:table-cell font-mono text-[11px] text-on-surface-variant uppercase">
                                        {user.tier}
                                      </td>

                                      <td className="px-3.5 py-2.5 text-right">
                                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                                          <button
                                            type="button"
                                            title={`Message ${user.email}`}
                                            onClick={() => {
                                              setTab("MESSAGES");
                                              setComposeRecipientEmail(user.email);
                                              setComposeSubject("Direct Notice from Admin");
                                              setComposeBody("");
                                              setShowComposeMessage(true);
                                            }}
                                            data-agent-id={`all-users-message-btn-${user.uid}`}
                                            data-testid={`all-users-message-btn-${user.uid}`}
                                            className="rounded-lg border border-primary/30 bg-primary/10 px-2 py-1 text-[11px] font-mono text-primary hover:bg-primary/20 transition"
                                          >
                                            Message
                                          </button>

                                          {user.isPermanentSuperAdmin ? (
                                            <span className="inline-flex items-center gap-1 rounded-lg bg-primary/20 px-2.5 py-1 text-xs font-mono font-semibold text-primary">
                                              Permanent Super Admin 🔒
                                            </span>
                                          ) : canApproveRoles ? (
                                            <div className="inline-flex flex-wrap items-center justify-end gap-1">
                                              {assignableRoleOptions.map((opt) => {
                                                const isChecked = selectedRoles.includes(opt.value);
                                                return (
                                                  <button
                                                    key={opt.value}
                                                    type="button"
                                                    disabled={rbacSaving}
                                                    onClick={() =>
                                                      setPendingUserRoles((prev) => ({
                                                        ...prev,
                                                        [user.uid]: toggleRoleSelection(
                                                          prev[user.uid] ?? currentRoles,
                                                          opt.value,
                                                          isSuper
                                                        ),
                                                      }))
                                                    }
                                                    aria-pressed={isChecked}
                                                    aria-label={`Toggle ${opt.label} role for ${user.email}`}
                                                    data-agent-id={`all-users-role-toggle-${user.uid}-${opt.value}`}
                                                    data-testid={`all-users-role-toggle-${user.uid}-${opt.value}`}
                                                    className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-[10px] font-semibold transition ${
                                                      isChecked
                                                        ? "border-primary bg-primary/20 text-primary"
                                                        : "border-white/10 bg-surface-container-low text-on-surface-variant hover:border-white/25 hover:text-on-surface"
                                                    }`}
                                                  >
                                                    <span>{isChecked ? "☑" : "☐"}</span>
                                                    <span>{opt.label}</span>
                                                  </button>
                                                );
                                              })}
                                              <button
                                                type="button"
                                                disabled={rbacSaving}
                                                onClick={() =>
                                                  handleAssignUserRole(user.email, selectedRoles, user.uid)
                                                }
                                                data-agent-id={`confirm-user-role-btn-${user.uid}`}
                                                data-testid={`confirm-user-role-btn-${user.uid}`}
                                                aria-label={`Confirm RBAC roles (${selectedRoles.join(", ")}) for ${user.email}`}
                                                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 font-mono text-[11px] font-bold transition ${
                                                  isRoleChanged
                                                    ? "bg-primary text-on-primary shadow-sm ring-1 ring-primary/50 hover:bg-primary-fixed"
                                                    : "border border-primary/40 bg-primary/15 text-primary hover:bg-primary/25"
                                                } disabled:opacity-50`}
                                              >
                                                <Icon
                                                  name={isRowSaving ? "refresh" : "checkCircle"}
                                                  className={`size-3 ${isRowSaving ? "animate-spin" : ""}`}
                                                />
                                                <span>{isRowSaving ? "Saving…" : "Confirm"}</span>
                                              </button>
                                              {confirmResetRoleUid === user.uid ? (
                                                <div className="inline-flex items-center gap-1">
                                                  <button
                                                    type="button"
                                                    disabled={rbacSaving}
                                                    onClick={() =>
                                                      handleAssignUserRole(user.email, ["supporter"], user.uid)
                                                    }
                                                    data-agent-id={`confirm-reset-user-role-btn-${user.uid}`}
                                                    data-testid={`confirm-reset-user-role-btn-${user.uid}`}
                                                    aria-label={`Confirm reset ${user.email} role to Supporter`}
                                                    className="inline-flex items-center gap-1 rounded-lg border border-amber-500/60 bg-amber-500/25 px-2 py-1 font-mono text-[10px] font-bold text-amber-200 hover:bg-amber-500/35 disabled:opacity-50 transition"
                                                  >
                                                    <Icon name="refresh" className="size-2.5" />
                                                    <span>Confirm Reset</span>
                                                  </button>
                                                  <button
                                                    type="button"
                                                    onClick={() => setConfirmResetRoleUid(null)}
                                                    data-agent-id={`cancel-reset-user-role-btn-${user.uid}`}
                                                    data-testid={`cancel-reset-user-role-btn-${user.uid}`}
                                                    className="rounded-lg border border-white/10 bg-surface-container-highest px-1.5 py-1 font-mono text-[10px] text-on-surface-variant hover:text-on-surface"
                                                  >
                                                    Cancel
                                                  </button>
                                                </div>
                                              ) : (
                                                <button
                                                  type="button"
                                                  disabled={rbacSaving}
                                                  onClick={() => {
                                                    setConfirmDeleteUserUid(null);
                                                    setConfirmResetRoleUid(user.uid);
                                                  }}
                                                  data-agent-id={`reset-user-role-btn-${user.uid}`}
                                                  data-testid={`reset-user-role-btn-${user.uid}`}
                                                  aria-label={`Reset ${user.email} role to Supporter`}
                                                  className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1 font-mono text-[10px] font-semibold text-amber-300 hover:bg-amber-500/20 transition"
                                                >
                                                  Reset
                                                </button>
                                              )}
                                              {canDeleteThisUser &&
                                                (confirmDeleteUserUid === user.uid ? (
                                                  <div className="inline-flex items-center gap-1">
                                                    <button
                                                      type="button"
                                                      disabled={deletingUserUid === user.uid}
                                                      onClick={() => handleDeleteUser(user)}
                                                      data-agent-id={`confirm-delete-user-btn-${user.uid}`}
                                                      data-testid={`confirm-delete-user-btn-${user.uid}`}
                                                      aria-label={`Confirm delete user ${user.email || user.uid}`}
                                                      className="inline-flex items-center gap-1 rounded-lg bg-rose-500 px-2.5 py-1 font-mono text-[10px] font-bold text-white hover:bg-rose-400 disabled:opacity-50 transition whitespace-nowrap"
                                                    >
                                                      <Icon name="trash" className="size-2.5" />
                                                      <span>
                                                        {deletingUserUid === user.uid
                                                          ? "Deleting…"
                                                          : "Confirm Delete"}
                                                      </span>
                                                    </button>
                                                    <button
                                                      type="button"
                                                      disabled={deletingUserUid === user.uid}
                                                      onClick={() => setConfirmDeleteUserUid(null)}
                                                      data-agent-id={`cancel-delete-user-btn-${user.uid}`}
                                                      data-testid={`cancel-delete-user-btn-${user.uid}`}
                                                      aria-label={`Cancel deleting user ${user.email || user.uid}`}
                                                      className="rounded-lg border border-white/15 bg-surface-container-highest px-2 py-1 font-mono text-[10px] text-on-surface-variant hover:text-on-surface"
                                                    >
                                                      Cancel
                                                    </button>
                                                  </div>
                                                ) : (
                                                  <button
                                                    type="button"
                                                    disabled={deletingUserUid === user.uid || rbacSaving}
                                                    onClick={() => {
                                                      setConfirmResetRoleUid(null);
                                                      setConfirmDeleteUserUid(user.uid);
                                                    }}
                                                    data-agent-id={`delete-user-btn-${user.uid}`}
                                                    data-testid={`delete-user-btn-${user.uid}`}
                                                    aria-label={`Delete user ${user.email || user.uid}`}
                                                    className="inline-flex items-center gap-1 rounded-lg border border-rose-500/40 bg-rose-500/10 px-2 py-1 font-mono text-[10px] font-semibold text-rose-300 hover:bg-rose-500/20 disabled:opacity-50 transition whitespace-nowrap"
                                                  >
                                                    <Icon name="trash" className="size-3" />
                                                    <span>Delete</span>
                                                  </button>
                                                ))}
                                            </div>
                                          ) : (
                                            <span className="font-mono text-[11px] text-on-surface-variant">
                                              Super Admin Only
                                            </span>
                                          )}
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 6: RBAC MATRIX & ROLES (Super Admin Only) */}
              {tab === "RBAC" && isSuper && (
                <div className="space-y-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="text-title-sm font-semibold text-on-surface">
                        Role-Based Access Control (RBAC) Matrix
                      </h3>
                      <p className="mt-1 text-compact text-on-surface-variant">
                        Cryptographically enforced permissions matrix across system roles. Superadmin holds full immutable privileges.
                      </p>
                    </div>
                    {(() => {
                      const allExpanded =
                        isFeatureExpanded("rbac_gate") &&
                        isFeatureExpanded("rbac_matrix") &&
                        isFeatureExpanded("rbac_assignments");
                      return (
                        <button
                          type="button"
                          onClick={() => {
                            const next = !allExpanded;
                            setFeatureExpanded("rbac_gate", next);
                            setFeatureExpanded("rbac_matrix", next);
                            setFeatureExpanded("rbac_assignments", next);
                          }}
                          data-agent-id="rbac-expand-all-btn"
                          data-testid="rbac-expand-all-btn"
                          className="inline-flex items-center gap-1.5 self-start sm:self-auto rounded-lg border border-primary/35 bg-primary/10 px-3 py-1.5 font-mono text-xs font-semibold text-primary hover:bg-primary/20 transition"
                        >
                          <Icon name="chevronDown" className={`size-3.5 transition-transform ${allExpanded ? "rotate-180" : ""}`} />
                          <span>{allExpanded ? "Collapse All" : "Expand All"}</span>
                        </button>
                      );
                    })()}
                  </div>

                  {/* Collapsible Feature 1: Strict Database Superadmin Gate */}
                  <div className="rounded-xl border border-primary/30 bg-primary/10 p-3.5 text-compact text-on-surface space-y-2.5">
                    <div
                      role="button"
                      tabIndex={0}
                      aria-expanded={isFeatureExpanded("rbac_gate")}
                      onClick={() => toggleFeatureExpanded("rbac_gate")}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          toggleFeatureExpanded("rbac_gate");
                        }
                      }}
                      data-agent-id="rbac-gate-collapse-header"
                      data-testid="rbac-gate-collapse-header"
                      className="flex cursor-pointer select-none flex-wrap items-center justify-between gap-2 rounded-lg py-0.5 hover:opacity-95"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex size-6 items-center justify-center rounded-md border border-primary/40 bg-primary/20 text-primary transition-transform duration-200 ${
                            isFeatureExpanded("rbac_gate") ? "rotate-180" : "-rotate-90"
                          }`}
                        >
                          <Icon name="chevronDown" className="size-3.5" />
                        </span>
                        <Icon name="sparkles" className="size-4 text-primary shrink-0" />
                        <strong className="text-primary font-semibold">Strict Database Superadmin Gate</strong>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFeatureExpanded("rbac_gate");
                        }}
                        aria-expanded={isFeatureExpanded("rbac_gate")}
                        data-agent-id="toggle-rbac-gate-btn"
                        data-testid="toggle-rbac-gate-btn"
                        className="inline-flex items-center gap-1 rounded-lg border border-primary/35 bg-surface-container-high px-2.5 py-1 font-mono text-[11px] font-semibold text-primary hover:bg-primary/20 transition"
                      >
                        <span>{isFeatureExpanded("rbac_gate") ? "Collapse" : "Expand"}</span>
                        <Icon name="chevronDown" className={`size-3 transition-transform duration-200 ${isFeatureExpanded("rbac_gate") ? "rotate-180" : "-rotate-90"}`} />
                      </button>
                    </div>
                    {isFeatureExpanded("rbac_gate") && (
                      <p className="border-t border-primary/25 pt-2.5 text-[12px] text-on-surface-variant leading-relaxed">
                        Only the authenticated Firebase database administrator email holds permanent Super Admin status. All permissions for Super Admin are locked. Non-admin users start at Supporter level and can be granted one or multiple operational or administrative roles below.
                      </p>
                    )}
                  </div>

                  {/* Collapsible Feature 2: 1. Feature Permission Matrix */}
                  <div className={`${card} p-4 space-y-3`}>
                    <div
                      role="button"
                      tabIndex={0}
                      aria-expanded={isFeatureExpanded("rbac_matrix")}
                      onClick={() => toggleFeatureExpanded("rbac_matrix")}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          toggleFeatureExpanded("rbac_matrix");
                        }
                      }}
                      data-agent-id="rbac-matrix-collapse-header"
                      data-testid="rbac-matrix-collapse-header"
                      className="flex cursor-pointer select-none flex-wrap items-center justify-between gap-2 rounded-lg py-0.5 hover:opacity-95"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex size-6 items-center justify-center rounded-md border border-primary/35 bg-primary/10 text-primary transition-transform duration-200 ${
                            isFeatureExpanded("rbac_matrix") ? "rotate-180" : "-rotate-90"
                          }`}
                        >
                          <Icon name="chevronDown" className="size-3.5" />
                        </span>
                        <h4 className="text-compact font-semibold text-on-surface">
                          1. Feature Permission Matrix
                        </h4>
                        <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-primary">
                          {RBAC_PERMISSIONS_LIST.length} Capabilities
                        </span>
                      </div>
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={reloadRbac}
                          disabled={rbacLoading}
                          className="text-xs text-primary hover:underline flex items-center gap-1"
                        >
                          <Icon name="refresh" className={`size-3 ${rbacLoading ? "animate-spin" : ""}`} />
                          Refresh Matrix
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleFeatureExpanded("rbac_matrix")}
                          aria-expanded={isFeatureExpanded("rbac_matrix")}
                          data-agent-id="toggle-rbac-matrix-btn"
                          data-testid="toggle-rbac-matrix-btn"
                          className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-surface-container-high px-2.5 py-1 font-mono text-[11px] font-semibold text-on-surface-variant hover:border-primary/40 hover:text-on-surface transition"
                        >
                          <span>{isFeatureExpanded("rbac_matrix") ? "Collapse" : "Expand"}</span>
                          <Icon name="chevronDown" className={`size-3 transition-transform duration-200 ${isFeatureExpanded("rbac_matrix") ? "rotate-180" : "-rotate-90"}`} />
                        </button>
                      </div>
                    </div>

                    {isFeatureExpanded("rbac_matrix") && (
                      <div className="overflow-x-auto rounded-xl border border-white/[0.08] bg-surface-container mt-2">
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
                              {(["admin", "ad_agent", "moderator", "agency", "supporter"] as const).map((role) => (
                                <th key={role} className="p-3 text-center min-w-[130px]">
                                  <div className="font-semibold text-on-surface capitalize">
                                    {role === "ad_agent" ? "Ad Agent" : role}
                                  </div>
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
                                  {(["admin", "ad_agent", "moderator", "agency", "supporter"] as const).map((role) => {
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
                    )}
                  </div>

                  {/* Collapsible Feature 3: 2. User Multi-Role Assignments */}
                  <div className={`${card} p-4 space-y-4`}>
                    <div
                      role="button"
                      tabIndex={0}
                      aria-expanded={isFeatureExpanded("rbac_assignments")}
                      onClick={() => toggleFeatureExpanded("rbac_assignments")}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          toggleFeatureExpanded("rbac_assignments");
                        }
                      }}
                      data-agent-id="rbac-assignments-collapse-header"
                      data-testid="rbac-assignments-collapse-header"
                      className="flex cursor-pointer select-none flex-wrap items-center justify-between gap-2 rounded-lg py-0.5 hover:opacity-95"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex size-6 items-center justify-center rounded-md border border-primary/35 bg-primary/10 text-primary transition-transform duration-200 ${
                            isFeatureExpanded("rbac_assignments") ? "rotate-180" : "-rotate-90"
                          }`}
                        >
                          <Icon name="chevronDown" className="size-3.5" />
                        </span>
                        <h4 className="text-compact font-semibold text-on-surface">
                          2. User Multi-Role Assignments
                        </h4>
                        <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-primary">
                          {rbacUsers.length} {rbacUsers.length === 1 ? "User" : "Users"}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFeatureExpanded("rbac_assignments");
                        }}
                        aria-expanded={isFeatureExpanded("rbac_assignments")}
                        data-agent-id="toggle-rbac-assignments-btn"
                        data-testid="toggle-rbac-assignments-btn"
                        className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-surface-container-high px-2.5 py-1 font-mono text-[11px] font-semibold text-on-surface-variant hover:border-primary/40 hover:text-on-surface transition"
                      >
                        <span>{isFeatureExpanded("rbac_assignments") ? "Collapse" : "Expand"}</span>
                        <Icon name="chevronDown" className={`size-3 transition-transform duration-200 ${isFeatureExpanded("rbac_assignments") ? "rotate-180" : "-rotate-90"}`} />
                      </button>
                    </div>

                    {isFeatureExpanded("rbac_assignments") && (
                      <div className="space-y-4 border-t border-white/[0.08] pt-3">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <p className="text-[12px] text-on-surface-variant">
                            Toggle one or multiple roles for any user and click <strong>Confirm</strong> to update their RBAC roles in Firebase custom claims.
                          </p>
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
                          <span className="font-mono text-mono-label text-on-surface-variant">
                            Quick Assign Multiple Roles by Email
                          </span>
                          <div className="mt-2 flex flex-col gap-2.5 lg:flex-row lg:items-center">
                            <input
                              type="email"
                              placeholder="user@example.com"
                              value={quickAssignEmail}
                              onChange={(e) => {
                                const val = e.target.value;
                                setQuickAssignEmail(val);
                                setConfirmQuickAssignOpen(false);
                                const matched = rbacUsers.find(
                                  (u) => u.email.toLowerCase() === val.trim().toLowerCase()
                                );
                                if (matched && !matched.isPermanentSuperAdmin) {
                                  setQuickAssignRoles(getUserAssignableRoles(matched, isSuper));
                                }
                              }}
                              className={`w-full lg:w-72 ${field}`}
                            />
                            <div
                              className="flex flex-wrap items-center gap-1.5 flex-1"
                              role="group"
                              aria-label="Select one or multiple RBAC roles to assign"
                              data-agent-id="rbac-quick-assign-roles-group"
                              data-testid="rbac-quick-assign-roles-group"
                            >
                              {assignableRoleOptions.map((opt) => {
                                const isSelected = quickAssignRoles.includes(opt.value);
                                return (
                                  <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => {
                                      setQuickAssignRoles((prev) =>
                                        toggleRoleSelection(prev, opt.value, isSuper)
                                      );
                                      setConfirmQuickAssignOpen(false);
                                    }}
                                    aria-pressed={isSelected}
                                    data-agent-id={`rbac-quick-role-pill-${opt.value}`}
                                    data-testid={`rbac-quick-role-pill-${opt.value}`}
                                    className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 font-mono text-[11px] font-semibold transition ${
                                      isSelected
                                        ? "border-primary bg-primary/20 text-primary shadow-sm"
                                        : "border-white/10 bg-surface-container-low text-on-surface-variant hover:border-white/25 hover:text-on-surface"
                                    }`}
                                  >
                                    <span>{isSelected ? "☑" : "☐"}</span>
                                    <span>{opt.label}</span>
                                  </button>
                                );
                              })}
                            </div>
                            {confirmQuickAssignOpen ? (
                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (!quickAssignEmail.trim()) return;
                                    handleAssignUserRole(quickAssignEmail.trim(), quickAssignRoles);
                                  }}
                                  disabled={rbacSaving || !quickAssignEmail.trim()}
                                  data-testid="confirm-quick-assign-button"
                                  data-agent-id="confirm-quick-assign-btn"
                                  className={btnPrimary}
                                >
                                  {rbacSaving ? "Saving…" : `Confirm (${quickAssignRoles.length})`}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmQuickAssignOpen(false)}
                                  className={btnSecondary}
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  if (!quickAssignEmail.trim()) return;
                                  setConfirmQuickAssignOpen(true);
                                }}
                                disabled={rbacSaving || !quickAssignEmail.trim()}
                                data-testid="quick-assign-button"
                                data-agent-id="quick-assign-btn"
                                className={`${btnPrimary} shrink-0`}
                              >
                                Assign {quickAssignRoles.length > 1 ? `Roles (${quickAssignRoles.length})` : "Role"}
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Users List Table */}
                        <div className="overflow-x-auto rounded-xl border border-white/[0.08] bg-surface-container">
                          <table className="w-full text-left text-compact border-collapse">
                            <thead>
                              <tr className="border-b border-white/[0.08] bg-surface-container-high/60 font-mono text-[11px] text-on-surface-variant">
                                <th className="p-3 font-semibold text-on-surface">User Account</th>
                                <th className="p-3">Current Roles</th>
                                <th className="p-3">Tier</th>
                                <th className="p-3 text-right">Toggle Multiple Roles &amp; Confirm</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-white/[0.04]">
                              {rbacUsers
                                .filter((u) =>
                                  u.email.toLowerCase().includes(userSearchQuery.toLowerCase()) ||
                                  (u.displayName || "").toLowerCase().includes(userSearchQuery.toLowerCase())
                                )
                                .map((user) => {
                                  const currentRoles = getUserAssignableRoles(user, isSuper);
                                  const selectedRoles = pendingUserRoles[user.uid] ?? currentRoles;
                                  const isRoleChanged =
                                    selectedRoles.length !== currentRoles.length ||
                                    selectedRoles.some((r) => !currentRoles.includes(r));
                                  const isRowSaving = rbacSaving && confirmingRoleUid === user.uid;
                                  const displayRoles = getUserRolesList(user);

                                  return (
                                    <tr key={user.uid} className="hover:bg-white/[0.02] transition-colors">
                                      <td className="p-3">
                                        <div className="font-medium text-on-surface">{user.email}</div>
                                        <div className="text-[11px] text-on-surface-variant font-mono">
                                          UID: {user.uid.slice(0, 12)}… • Created {new Date(user.createdAt).toLocaleDateString("en-AU")}
                                        </div>
                                      </td>
                                      <td className="p-3">
                                        <div className="flex flex-wrap items-center gap-1">
                                          {displayRoles.map((r) => (
                                            <span
                                              key={r}
                                              className={`inline-block rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase ${
                                                r === "superadmin"
                                                  ? "border border-primary/40 bg-primary/20 text-primary"
                                                  : r === "admin"
                                                    ? "border border-secondary/40 bg-secondary/20 text-secondary"
                                                    : r === "ad_agent"
                                                      ? "border border-tertiary/40 bg-tertiary/20 text-tertiary"
                                                      : r === "moderator"
                                                        ? "border border-amber-400/40 bg-amber-500/15 text-amber-300"
                                                        : r === "agency"
                                                          ? "border border-sky-400/40 bg-sky-500/15 text-sky-300"
                                                          : "border border-white/10 bg-surface-container-highest text-on-surface-variant"
                                              }`}
                                            >
                                              {formatRbacRoleLabel(r)}
                                            </span>
                                          ))}
                                        </div>
                                      </td>
                                      <td className="p-3 font-mono text-[12px] text-on-surface-variant uppercase">
                                        {user.tier}
                                      </td>
                                      <td className="p-3 text-right">
                                        <div className="flex flex-wrap items-center justify-end gap-1.5">
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
                                            className="rounded border border-primary/30 bg-primary/10 px-2 py-1 text-xs font-mono text-primary hover:bg-primary/20 transition"
                                          >
                                            Message
                                          </button>
                                          {user.isPermanentSuperAdmin ? (
                                            <span className="inline-flex items-center gap-1 rounded bg-primary/20 px-2 py-1 text-xs font-mono font-semibold text-primary">
                                              Permanent Super Admin 🔒
                                            </span>
                                          ) : (
                                            <div className="inline-flex flex-wrap items-center justify-end gap-1">
                                              {assignableRoleOptions.map((opt) => {
                                                const isChecked = selectedRoles.includes(opt.value);
                                                return (
                                                  <button
                                                    key={opt.value}
                                                    type="button"
                                                    disabled={rbacSaving}
                                                    onClick={() =>
                                                      setPendingUserRoles((prev) => ({
                                                        ...prev,
                                                        [user.uid]: toggleRoleSelection(
                                                          prev[user.uid] ?? currentRoles,
                                                          opt.value,
                                                          isSuper
                                                        ),
                                                      }))
                                                    }
                                                    aria-pressed={isChecked}
                                                    aria-label={`Toggle ${opt.label} role for ${user.email}`}
                                                    data-agent-id={`rbac-user-role-toggle-${user.uid}-${opt.value}`}
                                                    data-testid={`rbac-user-role-toggle-${user.uid}-${opt.value}`}
                                                    className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-[10px] font-semibold transition ${
                                                      isChecked
                                                        ? "border-primary bg-primary/20 text-primary"
                                                        : "border-white/10 bg-surface-container-low text-on-surface-variant hover:border-white/25 hover:text-on-surface"
                                                    }`}
                                                  >
                                                    <span>{isChecked ? "☑" : "☐"}</span>
                                                    <span>{opt.label}</span>
                                                  </button>
                                                );
                                              })}
                                              <button
                                                type="button"
                                                disabled={rbacSaving}
                                                onClick={() =>
                                                  handleAssignUserRole(user.email, selectedRoles, user.uid)
                                                }
                                                data-agent-id={`rbac-confirm-user-role-btn-${user.uid}`}
                                                data-testid={`rbac-confirm-user-role-btn-${user.uid}`}
                                                aria-label={`Confirm RBAC roles (${selectedRoles.join(", ")}) for ${user.email}`}
                                                className={`inline-flex items-center gap-1 rounded px-2.5 py-1 font-mono text-xs font-bold transition ${
                                                  isRoleChanged
                                                    ? "bg-primary text-on-primary shadow-sm ring-1 ring-primary/50 hover:bg-primary-fixed"
                                                    : "border border-primary/40 bg-primary/15 text-primary hover:bg-primary/25"
                                                } disabled:opacity-50`}
                                              >
                                                <Icon
                                                  name={isRowSaving ? "refresh" : "checkCircle"}
                                                  className={`size-3 ${isRowSaving ? "animate-spin" : ""}`}
                                                />
                                                <span>{isRowSaving ? "Saving…" : "Confirm"}</span>
                                              </button>
                                              {confirmResetRoleUid === user.uid ? (
                                                <div className="inline-flex items-center gap-1">
                                                  <button
                                                    type="button"
                                                    disabled={rbacSaving}
                                                    onClick={() =>
                                                      handleAssignUserRole(user.email, ["supporter"], user.uid)
                                                    }
                                                    data-agent-id={`rbac-confirm-reset-user-role-btn-${user.uid}`}
                                                    data-testid={`rbac-confirm-reset-user-role-btn-${user.uid}`}
                                                    aria-label={`Confirm reset ${user.email} role to Supporter`}
                                                    className="inline-flex items-center gap-1 rounded border border-amber-500/60 bg-amber-500/25 px-2 py-1 font-mono text-[10px] font-bold text-amber-200 hover:bg-amber-500/35 disabled:opacity-50 transition"
                                                  >
                                                    <Icon name="refresh" className="size-2.5" />
                                                    <span>Confirm Reset</span>
                                                  </button>
                                                  <button
                                                    type="button"
                                                    onClick={() => setConfirmResetRoleUid(null)}
                                                    data-agent-id={`rbac-cancel-reset-user-role-btn-${user.uid}`}
                                                    data-testid={`rbac-cancel-reset-user-role-btn-${user.uid}`}
                                                    className="rounded border border-white/10 bg-surface-container-highest px-1.5 py-1 font-mono text-[10px] text-on-surface-variant hover:text-on-surface"
                                                  >
                                                    Cancel
                                                  </button>
                                                </div>
                                              ) : (
                                                <button
                                                  type="button"
                                                  disabled={rbacSaving}
                                                  onClick={() => setConfirmResetRoleUid(user.uid)}
                                                  data-agent-id={`rbac-reset-user-role-btn-${user.uid}`}
                                                  data-testid={`rbac-reset-user-role-btn-${user.uid}`}
                                                  aria-label={`Reset ${user.email} role to Supporter`}
                                                  className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 font-mono text-[10px] font-semibold text-amber-300 hover:bg-amber-500/20 transition"
                                                >
                                                  Reset
                                                </button>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 7: FAQS MANAGEMENT */}
              {tab === "FAQS" && (
                <div className="space-y-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="text-title-sm font-semibold text-on-surface">Help & FAQ Management</h3>
                      <p className="mt-1 text-compact text-on-surface-variant">
                        Manage platform knowledge base FAQs explaining My Brands, Radar Feed, and Token Ledger mechanics. All features and FAQs start collapsed; click any section to expand.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {(() => {
                        const allExpanded =
                          showAddFaq &&
                          isFeatureExpanded("faqs_list") &&
                          isFeatureExpanded("faqs_rag");
                        return (
                          <button
                            type="button"
                            onClick={() => {
                              const next = !allExpanded;
                              setShowAddFaq(next);
                              setFeatureExpanded("faqs_list", next);
                              setFeatureExpanded("faqs_rag", next);
                            }}
                            data-testid="toggle-expand-all-faqs-btn"
                            data-agent-id="toggle-expand-all-faqs-btn"
                            aria-label={allExpanded ? "Collapse all FAQ sections" : "Expand all FAQ sections"}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-primary/35 bg-primary/10 px-3 py-1.5 font-mono text-xs font-semibold text-primary hover:bg-primary/20 transition"
                          >
                            <Icon name="chevronDown" className={`size-3.5 transition-transform ${allExpanded ? "rotate-180" : ""}`} />
                            <span>{allExpanded ? "Collapse All" : "Expand All"}</span>
                          </button>
                        );
                      })()}
                      {confirmResetFaqsOpen ? (
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setConfirmResetFaqsOpen(false);
                              handleResetDefaultFaqs();
                            }}
                            disabled={faqsSaving}
                            data-testid="confirm-reset-default-faqs-btn"
                            data-agent-id="confirm-reset-default-faqs-btn"
                            className="rounded-lg border border-amber-500/60 bg-amber-500/25 px-3 py-1.5 font-mono text-xs font-bold text-amber-200 hover:bg-amber-500/35 transition"
                          >
                            {faqsSaving ? "Resetting…" : "Confirm Reset Defaults"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmResetFaqsOpen(false)}
                            data-testid="cancel-reset-default-faqs-btn"
                            data-agent-id="cancel-reset-default-faqs-btn"
                            className="rounded-lg border border-white/10 bg-surface-container-highest px-2.5 py-1.5 font-mono text-xs text-on-surface-variant hover:text-on-surface transition"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmResetFaqsOpen(true)}
                          disabled={faqsSaving}
                          data-testid="reset-default-faqs-btn"
                          data-agent-id="reset-default-faqs-btn"
                          className="rounded-lg border border-white/10 px-3 py-1.5 text-compact text-on-surface-variant hover:bg-white/[0.04] hover:text-on-surface transition"
                        >
                          Reset Defaults
                        </button>
                      )}
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

                  {/* Collapsible Feature 1: Create New FAQ Item */}
                  <div className={`${card} p-4 space-y-4 border border-primary/25`}>
                    <div
                      role="button"
                      tabIndex={0}
                      aria-expanded={showAddFaq}
                      onClick={() => setShowAddFaq((v) => !v)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setShowAddFaq((v) => !v);
                        }
                      }}
                      data-agent-id="faqs-create-collapse-header"
                      data-testid="faqs-create-collapse-header"
                      className="flex cursor-pointer select-none flex-wrap items-center justify-between gap-2 rounded-lg py-0.5 hover:opacity-95"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex size-6 items-center justify-center rounded-md border border-primary/35 bg-primary/10 text-primary transition-transform duration-200 ${
                            showAddFaq ? "rotate-180" : "-rotate-90"
                          }`}
                        >
                          <Icon name="chevronDown" className="size-3.5" />
                        </span>
                        <h4 className="text-compact font-semibold text-on-surface">Create New FAQ Item</h4>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowAddFaq((v) => !v);
                        }}
                        aria-expanded={showAddFaq}
                        data-agent-id="toggle-faqs-create-btn"
                        data-testid="toggle-faqs-create-btn"
                        className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-surface-container-high px-2.5 py-1 font-mono text-[11px] font-semibold text-on-surface-variant hover:border-primary/40 hover:text-on-surface transition"
                      >
                        <span>{showAddFaq ? "Collapse" : "Expand"}</span>
                        <Icon name="chevronDown" className={`size-3 transition-transform duration-200 ${showAddFaq ? "rotate-180" : "-rotate-90"}`} />
                      </button>
                    </div>

                    {showAddFaq && (
                      <form onSubmit={handleCreateFaq} className="space-y-4 border-t border-white/[0.08] pt-3">
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
                  </div>

                  {/* Collapsible Feature 2: Help & FAQ Knowledge Base Items */}
                  <div className={`${card} p-4 space-y-4`}>
                    <div
                      role="button"
                      tabIndex={0}
                      aria-expanded={isFeatureExpanded("faqs_list")}
                      onClick={() => toggleFeatureExpanded("faqs_list")}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          toggleFeatureExpanded("faqs_list");
                        }
                      }}
                      data-agent-id="faqs-list-collapse-header"
                      data-testid="faqs-list-collapse-header"
                      className="flex cursor-pointer select-none flex-wrap items-center justify-between gap-2 rounded-lg py-0.5 hover:opacity-95"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex size-6 items-center justify-center rounded-md border border-primary/35 bg-primary/10 text-primary transition-transform duration-200 ${
                            isFeatureExpanded("faqs_list") ? "rotate-180" : "-rotate-90"
                          }`}
                        >
                          <Icon name="chevronDown" className="size-3.5" />
                        </span>
                        <h4 className="text-compact font-bold text-on-surface">
                          Help &amp; FAQ Knowledge Base Items
                        </h4>
                        <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-primary">
                          {faqs.length} FAQs
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFeatureExpanded("faqs_list");
                        }}
                        aria-expanded={isFeatureExpanded("faqs_list")}
                        data-agent-id="toggle-faqs-list-btn"
                        data-testid="toggle-faqs-list-btn"
                        className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-surface-container-high px-2.5 py-1 font-mono text-[11px] font-semibold text-on-surface-variant hover:border-primary/40 hover:text-on-surface transition"
                      >
                        <span>{isFeatureExpanded("faqs_list") ? "Collapse" : "Expand"}</span>
                        <Icon name="chevronDown" className={`size-3 transition-transform duration-200 ${isFeatureExpanded("faqs_list") ? "rotate-180" : "-rotate-90"}`} />
                      </button>
                    </div>

                    {isFeatureExpanded("faqs_list") && (
                      <div className="space-y-4 border-t border-white/[0.08] pt-3">
                        {/* Help & FAQ Management Search Bar & Category Filters */}
                        <div className="rounded-xl border border-white/[0.08] bg-surface-container-low p-3.5 space-y-3">
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
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  if (expandedAdminFaqIds.size > 0) {
                                    setExpandedAdminFaqIds(new Set());
                                  } else {
                                    setExpandedAdminFaqIds(new Set(filteredAdminFaqs.map((f) => f.faqId)));
                                  }
                                }}
                                className="rounded-lg border border-white/10 px-2.5 py-1 font-mono text-[11px] text-on-surface-variant hover:bg-white/[0.04] hover:text-on-surface transition"
                              >
                                {expandedAdminFaqIds.size > 0 ? "Collapse All Answers" : "Expand All Answers"}
                              </button>
                              <span className="font-mono text-xs text-on-surface-variant">
                                Showing {filteredAdminFaqs.length} of {faqs.length} FAQs
                              </span>
                            </div>
                          </div>
                        </div>

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
                      </div>
                    )}
                  </div>

                  {/* Collapsible Feature 3: Global Website Sentences, AI Works & Multilingual FAQ RAG Corpus */}
                  <div className={`${card} p-4 space-y-4 border border-secondary/25`}>
                    <div
                      role="button"
                      tabIndex={0}
                      aria-expanded={isFeatureExpanded("faqs_rag")}
                      onClick={() => toggleFeatureExpanded("faqs_rag")}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          toggleFeatureExpanded("faqs_rag");
                        }
                      }}
                      data-agent-id="faqs-rag-collapse-header"
                      data-testid="faqs-rag-collapse-header"
                      className="flex cursor-pointer select-none flex-wrap items-center justify-between gap-2 rounded-lg py-0.5 hover:opacity-95"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex size-6 items-center justify-center rounded-md border border-secondary/35 bg-secondary/10 text-secondary transition-transform duration-200 ${
                            isFeatureExpanded("faqs_rag") ? "rotate-180" : "-rotate-90"
                          }`}
                        >
                          <Icon name="chevronDown" className="size-3.5" />
                        </span>
                        <h4 className="text-compact font-bold text-on-surface">
                          Website Sentences, AI Works &amp; Multilingual FAQ RAG Studio
                        </h4>
                        <span className="rounded-full border border-secondary/30 bg-secondary/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-secondary">
                          RAG &amp; Translation Corpus
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFeatureExpanded("faqs_rag");
                        }}
                        aria-expanded={isFeatureExpanded("faqs_rag")}
                        data-agent-id="toggle-faqs-rag-btn"
                        data-testid="toggle-faqs-rag-btn"
                        className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-surface-container-high px-2.5 py-1 font-mono text-[11px] font-semibold text-on-surface-variant hover:border-secondary/40 hover:text-on-surface transition"
                      >
                        <span>{isFeatureExpanded("faqs_rag") ? "Collapse" : "Expand"}</span>
                        <Icon name="chevronDown" className={`size-3 transition-transform duration-200 ${isFeatureExpanded("faqs_rag") ? "rotate-180" : "-rotate-90"}`} />
                      </button>
                    </div>

                    {isFeatureExpanded("faqs_rag") && (
                      <div className="border-t border-white/[0.08] pt-2">
                        <GlobalRagCorpusSection
                          faqs={faqs}
                          isAdmin={role === "superadmin" || role === "admin"}
                          onFaqPublished={() => {
                            reloadFaqs();
                          }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 8: DEVELOPER DIAGNOSTICS (Super Admin Only) */}
              {tab === "DEV" && isSuper && (
                <div className="space-y-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="text-title-sm font-semibold text-on-surface">Developer Diagnostics & Next.js Controls</h3>
                      <p className="mt-1 text-compact text-on-surface-variant">
                        Developer tooling relocated from public preview. Grant admin custom claims, inspect system runtime, and flush query cache.
                      </p>
                    </div>
                    {(() => {
                      const allExpanded =
                        isFeatureExpanded("dev_claims_cache") &&
                        isFeatureExpanded("dev_env");
                      return (
                        <button
                          type="button"
                          onClick={() => {
                            const next = !allExpanded;
                            setFeatureExpanded("dev_claims_cache", next);
                            setFeatureExpanded("dev_env", next);
                          }}
                          data-agent-id="dev-expand-all-btn"
                          data-testid="dev-expand-all-btn"
                          className="inline-flex items-center gap-1.5 self-start sm:self-auto rounded-lg border border-primary/35 bg-primary/10 px-3 py-1.5 font-mono text-xs font-semibold text-primary hover:bg-primary/20 transition"
                        >
                          <Icon name="chevronDown" className={`size-3.5 transition-transform ${allExpanded ? "rotate-180" : ""}`} />
                          <span>{allExpanded ? "Collapse All" : "Expand All"}</span>
                        </button>
                      );
                    })()}
                  </div>

                  {/* Collapsible Feature 1: Admin Custom Claim & Radar Query Cache */}
                  <div className={`${card} p-4 space-y-3`}>
                    <div
                      role="button"
                      tabIndex={0}
                      aria-expanded={isFeatureExpanded("dev_claims_cache")}
                      onClick={() => toggleFeatureExpanded("dev_claims_cache")}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          toggleFeatureExpanded("dev_claims_cache");
                        }
                      }}
                      data-agent-id="dev-claims-cache-collapse-header"
                      data-testid="dev-claims-cache-collapse-header"
                      className="flex cursor-pointer select-none flex-wrap items-center justify-between gap-2 rounded-lg py-0.5 hover:opacity-95"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex size-6 items-center justify-center rounded-md border border-primary/35 bg-primary/10 text-primary transition-transform duration-200 ${
                            isFeatureExpanded("dev_claims_cache") ? "rotate-180" : "-rotate-90"
                          }`}
                        >
                          <Icon name="chevronDown" className="size-3.5" />
                        </span>
                        <span className="text-compact font-bold text-on-surface">
                          Admin Custom Claim &amp; Radar Query Cache
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFeatureExpanded("dev_claims_cache");
                        }}
                        aria-expanded={isFeatureExpanded("dev_claims_cache")}
                        data-agent-id="toggle-dev-claims-cache-btn"
                        data-testid="toggle-dev-claims-cache-btn"
                        className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-surface-container-high px-2.5 py-1 font-mono text-[11px] font-semibold text-on-surface-variant hover:border-primary/40 hover:text-on-surface transition"
                      >
                        <span>{isFeatureExpanded("dev_claims_cache") ? "Collapse" : "Expand"}</span>
                        <Icon name="chevronDown" className={`size-3 transition-transform duration-200 ${isFeatureExpanded("dev_claims_cache") ? "rotate-180" : "-rotate-90"}`} />
                      </button>
                    </div>

                    {isFeatureExpanded("dev_claims_cache") && (
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 border-t border-white/[0.08] pt-3">
                        <div className="rounded-xl border border-white/[0.08] bg-surface-container-low p-4 space-y-3">
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

                        <div className="rounded-xl border border-white/[0.08] bg-surface-container-low p-4 space-y-3">
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
                    )}
                  </div>

                  {/* Collapsible Feature 2: Environment Diagnostics */}
                  <div className={`${card} p-4 space-y-3`}>
                    <div
                      role="button"
                      tabIndex={0}
                      aria-expanded={isFeatureExpanded("dev_env")}
                      onClick={() => toggleFeatureExpanded("dev_env")}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          toggleFeatureExpanded("dev_env");
                        }
                      }}
                      data-agent-id="dev-env-collapse-header"
                      data-testid="dev-env-collapse-header"
                      className="flex cursor-pointer select-none flex-wrap items-center justify-between gap-2 rounded-lg py-0.5 hover:opacity-95"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex size-6 items-center justify-center rounded-md border border-primary/35 bg-primary/10 text-primary transition-transform duration-200 ${
                            isFeatureExpanded("dev_env") ? "rotate-180" : "-rotate-90"
                          }`}
                        >
                          <Icon name="chevronDown" className="size-3.5" />
                        </span>
                        <span className="text-compact font-bold text-on-surface">
                          Environment Diagnostics
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFeatureExpanded("dev_env");
                        }}
                        aria-expanded={isFeatureExpanded("dev_env")}
                        data-agent-id="toggle-dev-env-btn"
                        data-testid="toggle-dev-env-btn"
                        className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-surface-container-high px-2.5 py-1 font-mono text-[11px] font-semibold text-on-surface-variant hover:border-primary/40 hover:text-on-surface transition"
                      >
                        <span>{isFeatureExpanded("dev_env") ? "Collapse" : "Expand"}</span>
                        <Icon name="chevronDown" className={`size-3 transition-transform duration-200 ${isFeatureExpanded("dev_env") ? "rotate-180" : "-rotate-90"}`} />
                      </button>
                    </div>

                    {isFeatureExpanded("dev_env") && (
                      <div className="grid grid-cols-2 gap-2 border-t border-white/[0.08] pt-3 text-[12px] font-mono text-on-surface sm:grid-cols-4">
                        <div>Node Env: <span className="text-primary">{process.env.NODE_ENV}</span></div>
                        <div>Indicator: <span className="text-primary">Dev-Hidden</span></div>
                        <div>Updated: <span className="text-primary">{config.updatedAt ? new Date(config.updatedAt).toLocaleTimeString("en-AU") : "–"}</span></div>
                        <div>Ledger: <span className="text-primary">Active</span></div>
                      </div>
                    )}
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
