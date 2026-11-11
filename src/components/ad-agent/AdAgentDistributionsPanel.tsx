"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { clientDb } from "@/lib/firebase-client";
import { useSession } from "@/components/auth/SessionProvider";
import { Icon } from "@/components/ui/Icon";
import { alertError, btnSecondary, card } from "@/components/ui/styles";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { computeAdAgentDisplayItem } from "@/lib/ad-agent-display";
import { audToUsdCents, formatAud, formatUsd } from "@/lib/pricing";
import { loadDetectedGeoCountry, loadGeoConfig } from "@/lib/geo";
import type { CurrencyRateResponse } from "@/app/api/currency/route";
import type {
  AdAgentDistributionItem,
  AdAgentDistributionPricingMeta,
  AdAgentProfile,
} from "@/lib/contracts";

export interface AdAgentDistributionsPanelProps {
  /** Optional email override when Super Admin inspects a specific agent inside AdAgentModal. */
  targetEmail?: string;
}

export function AdAgentDistributionsPanel({ targetEmail }: AdAgentDistributionsPanelProps) {
  const { user, isSuperAdmin } = useSession();
  const signedInUid = user?.uid || "";
  const signedInEmail = (user?.email || "").trim().toLowerCase();
  const lookupEmail = (targetEmail || signedInEmail).trim().toLowerCase();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [rawItem, setRawItem] = useState<AdAgentDistributionItem | null>(null);
  const [pricingMeta, setPricingMeta] = useState<AdAgentDistributionPricingMeta>({
    audCentsPerToken: 100,
    customizeServiceTokens: 55,
    isTokenSystemEnabled: true,
    isAudEnabled: true,
    isUsdEnabled: true,
  });
  const [ecbRate, setEcbRate] = useState<number | undefined>(undefined);
  const [userCountry, setUserCountry] = useState<string>(() => {
    const detected = loadDetectedGeoCountry();
    const cfg = loadGeoConfig();
    return (detected || cfg.country || "AU").trim().toUpperCase();
  });
  const watchedAgentIdRef = useRef<string | null>(null);
  const initialSnapshotSkippedRef = useRef(false);

  useEffect(() => {
    function syncGeo() {
      const detected = loadDetectedGeoCountry();
      const cfg = loadGeoConfig();
      setUserCountry((detected || cfg.country || "AU").trim().toUpperCase());
    }
    window.addEventListener("adradar:geo-updated", syncGeo);
    return () => window.removeEventListener("adradar:geo-updated", syncGeo);
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/currency", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<CurrencyRateResponse>) : null))
      .then((json) => {
        if (active && json && typeof json.rate === "number" && Number.isFinite(json.rate)) {
          setEcbRate(json.rate);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const fetchDistributions = useCallback(
    async (silent = false) => {
      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setErrorMsg(null);
      try {
        const queryStr =
          isSuperAdmin && lookupEmail ? `?email=${encodeURIComponent(lookupEmail)}` : "";
        const data = await apiFetch<{
          myAgentProfile: AdAgentProfile | null;
          adAgentLedger?: AdAgentDistributionItem[];
          ledger?: AdAgentDistributionItem[];
          pricingMeta?: AdAgentDistributionPricingMeta;
        }>(`/api/ad-agent${queryStr}`, { method: "GET" });

        if (data.pricingMeta) {
          setPricingMeta(data.pricingMeta);
        }

        const list = Array.isArray(data.adAgentLedger)
          ? data.adAgentLedger
          : Array.isArray(data.ledger)
            ? data.ledger
            : [];

        const matched =
          (data.myAgentProfile
            ? list.find((r) => r.agentId === data.myAgentProfile?.agentId)
            : undefined) ||
          (lookupEmail ? list.find((r) => r.email.toLowerCase() === lookupEmail) : undefined) ||
          (signedInEmail ? list.find((r) => r.email.toLowerCase() === signedInEmail) : undefined) ||
          (signedInUid ? list.find((r) => r.uid === signedInUid) : undefined) ||
          (isSuperAdmin ? list.find((r) => r.isSuperAdminBuiltIn) : undefined) ||
          (!isSuperAdmin ? list[0] : undefined) ||
          null;

        setRawItem(matched);
      } catch (err) {
        setErrorMsg(errorMessage(err));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [isSuperAdmin, lookupEmail, signedInEmail, signedInUid],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchDistributions(false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [fetchDistributions]);

  // Listen for same-window Super Admin ledger resets/updates, profile saves, and window focus
  useEffect(() => {
    const onRefresh = () => {
      void fetchDistributions(true);
    };
    window.addEventListener("ad-agent-ledger-updated", onRefresh);
    window.addEventListener("adradar:agent-registered", onRefresh);
    window.addEventListener("adradar:config-updated", onRefresh);
    window.addEventListener("focus", onRefresh);
    return () => {
      window.removeEventListener("ad-agent-ledger-updated", onRefresh);
      window.removeEventListener("adradar:agent-registered", onRefresh);
      window.removeEventListener("adradar:config-updated", onRefresh);
      window.removeEventListener("focus", onRefresh);
    };
  }, [fetchDistributions]);

  // Real-time Firestore listener on this Ad Agent's document so when Super Admin resets to 0
  // or updates Redistribution Percentage, Redistribution Amount updates live immediately.
  const activeAgentId = rawItem?.agentId || null;
  useEffect(() => {
    if (!activeAgentId || !user) return;
    watchedAgentIdRef.current = activeAgentId;
    initialSnapshotSkippedRef.current = false;

    const unsub = onSnapshot(
      doc(clientDb(), "ad_agents", activeAgentId),
      () => {
        if (!initialSnapshotSkippedRef.current) {
          initialSnapshotSkippedRef.current = true;
          return;
        }
        void fetchDistributions(true);
      },
      () => {
        // Graceful fallback to REST fetch on transient offline state
      },
    );
    return () => unsub();
  }, [activeAgentId, user, fetchDistributions]);

  const item = useMemo<AdAgentDistributionItem | null>(() => {
    if (!rawItem) return null;
    return computeAdAgentDisplayItem(rawItem, {
      customizeServiceUnitTokens: pricingMeta.customizeServiceTokens,
      audCentsPerTokenUnit: pricingMeta.audCentsPerToken,
      ecbRate,
    });
  }, [rawItem, pricingMeta.customizeServiceTokens, pricingMeta.audCentsPerToken, ecbRate]);

  const customizeServiceUnitTokens = Math.max(
    0,
    Math.round(Number(pricingMeta.customizeServiceTokens ?? 55)),
  );
  const audCentsPerTokenUnit = Math.max(1, Math.round(Number(pricingMeta.audCentsPerToken ?? 100)));
  const customizeServiceAudCents = Math.round(customizeServiceUnitTokens * audCentsPerTokenUnit);
  const customizeServiceUsdCents = audToUsdCents(customizeServiceAudCents, ecbRate);

  const showAud = pricingMeta.isAudEnabled && (userCountry === "AU" || !pricingMeta.isUsdEnabled);
  const showUsd = pricingMeta.isUsdEnabled;

  function formatHoverCurrency(audCents: number, usdCents: number): string {
    const parts: string[] = [];
    if (pricingMeta.isAudEnabled) parts.push(formatAud(audCents));
    if (pricingMeta.isUsdEnabled) parts.push(formatUsd(usdCents));
    return parts.join(" · ");
  }

  function renderCurrencySubtext(audCents: number, usdCents: number): string {
    const parts: string[] = [];
    if (showAud) parts.push(formatAud(audCents));
    if (showUsd) parts.push(formatUsd(usdCents));
    if (parts.length === 0) return formatAud(audCents);
    return parts.join(" · ");
  }

  return (
    <div
      className="space-y-4 min-w-0"
      data-agent-id="ad-agent-distributions-panel"
      data-testid="ad-agent-distributions-panel"
    >
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/[0.08] pb-3.5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-tertiary/20 text-tertiary shrink-0">
              <Icon name="layers" className="size-4" />
            </span>
            <h3 className="text-title-sm font-semibold text-on-surface">
              Ad Agent &amp; Customizations Value
            </h3>
            <span className="rounded-full border border-tertiary/35 bg-tertiary/15 px-2 py-0.5 font-mono text-[10px] font-bold text-tertiary uppercase tracking-wider">
              Live Synced with Super Admin
            </span>
          </div>
          <p className="mt-1 text-compact text-on-surface-variant">
            Displays your Ad Agent Name, Redistribution Percentage, Customizations Total, and live Redistribution Amount. When Super Admin settles a payout and resets to zero, your Redistribution Amount updates automatically.
          </p>
        </div>

        <button
          type="button"
          disabled={loading || refreshing}
          onClick={() => void fetchDistributions(true)}
          data-agent-id="refresh-agent-distributions-btn"
          data-testid="refresh-agent-distributions-btn"
          aria-label="Refresh Ad Agent distributions from Super Admin ledger"
          className={`${btnSecondary} shrink-0 self-start sm:self-center font-mono text-xs flex items-center gap-1.5`}
        >
          <Icon name="refresh" className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} />
          <span>{refreshing ? "Refreshing…" : "Refresh"}</span>
        </button>
      </div>

      {errorMsg && <p className={alertError}>{errorMsg}</p>}

      {loading && !item ? (
        <div className={`${card} p-8 text-center font-mono text-xs text-on-surface-variant`}>
          <Icon name="refresh" className="size-4 animate-spin text-primary inline mr-2" />
          Loading your Ad Agent &amp; Customizations Value distribution record…
        </div>
      ) : !item ? (
        <div className={`${card} p-6 text-center space-y-2 border border-dashed border-white/15`}>
          <p className="font-mono text-xs font-semibold text-on-surface">
            No Ad Agent distribution record found yet.
          </p>
          <p className="text-compact text-on-surface-variant max-w-md mx-auto">
            Complete your Ad Agent Registration profile or ask Super Admin to activate your Ad Agent record in the Ad Agent &amp; Customizations Value ledger.
          </p>
        </div>
      ) : (
        <>
          {/* 4 Summary KPI Cards: Name, Redistribution Percentage, Customizations Total, Redistribution Amount */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* 1. Ad Agent Name */}
            <div
              className={`${card} p-4 border border-white/10 bg-surface-container-high/60 space-y-1.5 min-w-0`}
              data-agent-id="agent-dist-name-card"
              data-testid="agent-dist-name-card"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                  Ad Agent Name
                </span>
                <span
                  className={`rounded px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase ${
                    item.status === "active" && item.inActiveLedger !== false
                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/35"
                      : "bg-amber-500/15 text-amber-300 border border-amber-500/35"
                  }`}
                >
                  {item.inActiveLedger === false ? "Saved Record" : item.status}
                </span>
              </div>
              <p
                className="text-body font-bold text-on-surface truncate"
                title={item.name}
                data-testid="agent-dist-name-value"
              >
                {item.name}
              </p>
              <p className="font-mono text-[11px] text-on-surface-variant truncate" title={item.email}>
                {item.email}
              </p>
              <p className="font-mono text-[10px] text-outline truncate" title={item.locationLabel}>
                📍 {item.locationLabel}
              </p>
            </div>

            {/* 2. Redistribution Percentage */}
            <div
              className={`${card} p-4 border border-tertiary/30 bg-surface-container-high/60 space-y-1.5 min-w-0`}
              data-agent-id="agent-dist-percent-card"
              data-testid="agent-dist-percent-card"
            >
              <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-on-surface-variant block">
                Redistribution Percentage
              </span>
              <div
                className="font-mono text-2xl sm:text-3xl font-extrabold text-tertiary tabular-nums"
                data-testid="agent-dist-percent-value"
              >
                {item.redistributionPercentage}%
              </div>
              <p className="font-mono text-[10px] text-on-surface-variant leading-snug">
                Assigned tier in Super Admin Ad Agent &amp; Customizations Value
              </p>
            </div>

            {/* 3. Customizations Total */}
            <div
              className={`${card} p-4 border border-secondary/30 bg-surface-container-high/60 space-y-1.5 min-w-0`}
              data-agent-id="agent-dist-customizations-total-card"
              data-testid="agent-dist-customizations-total-card"
              title={`Hover Estimate: ${formatHoverCurrency(item.totalCustomizationsAudCents, item.totalCustomizationsUsdCents)} (${Math.max(1, item.customizationsCount)} × ⚡ ${customizeServiceUnitTokens})`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                  Customizations Total
                </span>
                <span className="rounded bg-secondary/15 border border-secondary/30 px-1.5 py-0.5 font-mono text-[9px] font-bold text-secondary">
                  {item.customizationsCount} {item.customizationsCount === 1 ? "Order" : "Orders"}
                </span>
              </div>
              <div
                className="flex items-center gap-1.5 font-mono text-2xl sm:text-3xl font-extrabold text-on-surface tabular-nums"
                data-testid="agent-dist-customizations-total-value"
              >
                <Icon name="zap" className="size-5 text-secondary shrink-0" />
                <span>{item.totalCustomizationsTokens.toLocaleString("en-AU")}</span>
              </div>
              <p className="font-mono text-[11px] font-semibold text-secondary">
                {renderCurrencySubtext(item.totalCustomizationsAudCents, item.totalCustomizationsUsdCents)}
              </p>
              <p
                className="font-mono text-[10px] text-outline"
                title={`${formatAud(customizeServiceAudCents)} / ${formatUsd(customizeServiceUsdCents)} per Customize order`}
              >
                {Math.max(1, item.customizationsCount)} × ⚡ {customizeServiceUnitTokens.toLocaleString("en-AU")}
              </p>
            </div>

            {/* 4. Redistribution Amount (Updates to 0 when Super Admin resets to zero) */}
            <div
              className={`${card} p-4 border ${
                item.lastResetAt && item.redistributionTokens === 0
                  ? "border-amber-500/40 bg-amber-500/[0.06]"
                  : "border-primary/40 bg-primary/[0.08]"
              } space-y-1.5 min-w-0`}
              data-agent-id="agent-dist-redistribution-amount-card"
              data-testid="agent-dist-redistribution-amount-card"
              title={`Hover Estimate: ${formatHoverCurrency(item.redistributionAudCents, item.redistributionUsdCents)}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-primary">
                  Redistribution Amount
                </span>
                {item.lastResetAt && item.redistributionTokens === 0 && (
                  <span
                    className="rounded bg-amber-500/20 border border-amber-500/40 px-1.5 py-0.5 font-mono text-[9px] font-bold text-amber-300"
                    data-testid="agent-dist-reset-zero-badge"
                  >
                    Refreshed to 0
                  </span>
                )}
              </div>
              <div
                className="flex items-center gap-1.5 font-mono text-2xl sm:text-3xl font-extrabold text-primary tabular-nums"
                data-testid="agent-dist-redistribution-amount-value"
              >
                <Icon name="zap" className="size-5 text-primary shrink-0" />
                <span>{item.redistributionTokens.toLocaleString("en-AU")}</span>
              </div>
              <p className="font-mono text-[11px] font-semibold text-on-surface">
                {renderCurrencySubtext(item.redistributionAudCents, item.redistributionUsdCents)}
              </p>
              <p className="font-mono text-[10px] text-on-surface-variant leading-snug">
                {item.lastResetAt
                  ? item.redistributionTokens === 0
                    ? `Reset to 0 ⚡ by Super Admin (${new Date(item.lastResetAt).toLocaleDateString("en-AU")})`
                    : `Accrued since Super Admin reset (${new Date(item.lastResetAt).toLocaleDateString("en-AU")})`
                  : `${item.redistributionPercentage}% of ⚡ ${item.totalCustomizationsTokens.toLocaleString("en-AU")}`}
              </p>
            </div>
          </div>

          {/* Super Admin Mirror Row: Ad Agent & Customizations Value Table */}
          <div
            role="region"
            tabIndex={0}
            aria-label="Ad Agent and Customizations Value ledger record"
            className="overflow-x-auto rounded-xl border border-white/[0.08] bg-surface-container"
          >
            <table
              className="w-full block md:table table-auto text-left text-[11px]"
              data-agent-id="agent-own-distributions-table"
              data-testid="agent-own-distributions-table"
            >
              <thead className="hidden md:table-header-group border-b border-white/[0.08] bg-surface-container-high/70 font-mono text-[10px] uppercase tracking-wider text-on-surface-variant">
                <tr>
                  <th className="px-3 py-2">Ad Agent &amp; Customizations Value</th>
                  <th className="px-3 py-2">Customizations Total</th>
                  <th className="px-3 py-2">Redistribution %</th>
                  <th className="px-3 py-2">Redistribution Amount</th>
                  <th className="px-3 py-2 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="block md:table-row-group divide-y divide-white/[0.06]">
                <tr
                  className="block md:table-row p-3.5 md:p-0 space-y-2.5 md:space-y-0 hover:bg-white/[0.02] transition"
                  data-agent-id={`agent-own-ledger-row-${item.agentId}`}
                  data-testid={`agent-own-ledger-row-${item.agentId}`}
                >
                  {/* 1. Ad Agent & Customizations Value */}
                  <td className="block md:table-cell md:px-3 md:py-2.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-semibold text-on-surface text-xs">{item.name}</span>
                      <span
                        className="inline-flex items-center gap-1 rounded border border-primary/40 bg-primary/15 px-1.5 py-0.5 font-mono text-[10px] font-bold text-primary"
                        title={`Hover Estimate: ${formatHoverCurrency(item.totalCustomizationsAudCents, item.totalCustomizationsUsdCents)}`}
                      >
                        <span>⚡ {item.totalCustomizationsTokens.toLocaleString("en-AU")}</span>
                        {showAud && (
                          <>
                            <span>·</span>
                            <span>{formatAud(item.totalCustomizationsAudCents)}</span>
                          </>
                        )}
                        <span className="text-on-surface-variant">({item.customizationsCount})</span>
                      </span>
                    </div>
                    <div className="mt-0.5 font-mono text-[10px] text-on-surface-variant break-all sm:truncate">
                      {item.email}
                      {item.phone && item.phone !== "Not specified" ? ` · ${item.phone}` : ""} · 📍{" "}
                      {item.locationLabel}
                    </div>
                  </td>

                  {/* 2. Customizations Total */}
                  <td className="flex items-center justify-between gap-2 md:table-cell md:px-3 md:py-2.5 font-mono">
                    <span className="md:hidden text-[10px] uppercase tracking-wider text-on-surface-variant">
                      Customizations Total
                    </span>
                    <div
                      className="text-right md:text-left"
                      title={`Hover Estimate: ${formatHoverCurrency(item.totalCustomizationsAudCents, item.totalCustomizationsUsdCents)}`}
                    >
                      <div className="font-bold text-on-surface">
                        ⚡ {item.totalCustomizationsTokens.toLocaleString("en-AU")} ({item.customizationsCount})
                      </div>
                      <div className="text-[10px] text-secondary font-semibold">
                        {renderCurrencySubtext(
                          item.totalCustomizationsAudCents,
                          item.totalCustomizationsUsdCents,
                        )}
                      </div>
                      <div className="text-[9px] text-on-surface-variant">
                        {Math.max(1, item.customizationsCount)} × ⚡{" "}
                        {customizeServiceUnitTokens.toLocaleString("en-AU")}
                      </div>
                    </div>
                  </td>

                  {/* 3. Redistribution Percentage */}
                  <td className="flex items-center justify-between gap-2 md:table-cell md:px-3 md:py-2.5 font-mono">
                    <span className="md:hidden text-[10px] uppercase tracking-wider text-on-surface-variant">
                      Redistribution %
                    </span>
                    <span className="inline-flex items-center rounded border border-tertiary/40 bg-tertiary/15 px-2 py-0.5 font-mono text-[11px] font-bold text-tertiary">
                      {item.redistributionPercentage}%
                    </span>
                  </td>

                  {/* 4. Redistribution Amount */}
                  <td className="flex items-center justify-between gap-2 md:table-cell md:px-3 md:py-2.5 font-mono">
                    <span className="md:hidden text-[10px] uppercase tracking-wider text-on-surface-variant">
                      Redistribution Amount
                    </span>
                    <div
                      className="text-right md:text-left"
                      title={`Hover Estimate: ${formatHoverCurrency(item.redistributionAudCents, item.redistributionUsdCents)}`}
                    >
                      <div className="font-bold text-primary">
                        ⚡ {item.redistributionTokens.toLocaleString("en-AU")}
                      </div>
                      <div className="text-[10px] font-semibold text-on-surface">
                        {renderCurrencySubtext(item.redistributionAudCents, item.redistributionUsdCents)}
                      </div>
                      {item.lastResetAt ? (
                        <div className="text-[9px] text-amber-300">
                          {item.redistributionTokens === 0
                            ? "Refreshed to 0"
                            : `Reset ${new Date(item.lastResetAt).toLocaleDateString("en-AU")}`}
                        </div>
                      ) : (
                        <div className="text-[9px] text-on-surface-variant">
                          {item.redistributionPercentage}% of ⚡{" "}
                          {item.totalCustomizationsTokens.toLocaleString("en-AU")}
                        </div>
                      )}
                    </div>
                  </td>

                  {/* 5. Status */}
                  <td className="flex items-center justify-between gap-2 md:table-cell md:px-3 md:py-2.5 md:text-right font-mono">
                    <span className="md:hidden text-[10px] uppercase tracking-wider text-on-surface-variant">
                      Status
                    </span>
                    <span
                      className={`inline-block rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${
                        item.status === "active" && item.inActiveLedger !== false
                          ? "bg-primary/20 text-primary"
                          : "bg-surface-container-highest text-on-surface-variant"
                      }`}
                    >
                      {item.inActiveLedger === false ? "SAVED RECORD" : item.status.toUpperCase()}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
