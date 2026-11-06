"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSession } from "@/components/auth/SessionProvider";
import {
  CustomizeRequestInputSchema,
  ToneOfVoiceSchema,
  type AdminMessage,
  type BrandProfile,
  type CustomizeRequestDoc,
  type CustomizeRequestInput,
} from "@/lib/contracts";
import { TONE_LABELS } from "@/components/brands/BrandForm";
import { AdAgentModal, QUICK_GEO_PRESETS } from "@/components/ad-agent/AdAgentModal";
import { apiFetch, errorMessage, newIdempotencyKey } from "@/lib/api-client";
import { autofindUserLocation, loadGeoConfig } from "@/lib/geo";
import { formatTokenEstimateHover } from "@/lib/pricing";
import { Icon } from "@/components/ui/Icon";
import {
  alertError,
  btnPrimary,
  btnSecondary,
  card,
  field,
  fieldError,
  hint,
  label,
  monoLabel,
} from "@/components/ui/styles";

type FieldName = keyof CustomizeRequestInput;
type FieldErrors = Partial<Record<FieldName, string>>;

interface PublicAdAgent {
  agentId: string;
  name: string;
  email: string;
  phone: string;
  locationLabel: string;
  latitude: number;
  longitude: number;
  isSuperAdminBuiltIn?: boolean;
}

function haversineKmClient(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

export function CustomizeView() {
  const { brands, profile, activeBrand } = useSession();

  const [selectedBrandId, setSelectedBrandId] = useState<string>("");
  const [brandName, setBrandName] = useState("");
  const [toneOfVoice, setToneOfVoice] = useState<BrandProfile["toneOfVoice"]>("DIRECT_RESPONSE");
  const [productServiceDescription, setProductServiceDescription] = useState("");
  const [targetAudienceAvatar, setTargetAudienceAvatar] = useState("");
  const [corePainPoints, setCorePainPoints] = useState("");
  const [uniqueMechanismOrOffer, setUniqueMechanismOrOffer] = useState("");
  const [landingUrls, setLandingUrls] = useState<string[]>(["https://"]);
  const [primaryUrlIndex, setPrimaryUrlIndex] = useState<number>(0);
  const [version, setVersion] = useState("");
  const [extraDetailsAndNotes, setExtraDetailsAndNotes] = useState("");

  // Customer Geolocation State (used to match the closest Ad Agent)
  const [custSuburb, setCustSuburb] = useState("Sydney");
  const [custState, setCustState] = useState("NSW");
  const [custCountry, setCustCountry] = useState("AU");
  const [custLat, setCustLat] = useState<number>(-33.8688);
  const [custLon, setCustLon] = useState<number>(151.2093);
  const [detectingGeo, setDetectingGeo] = useState(false);

  const [agents, setAgents] = useState<PublicAdAgent[]>([]);
  const [lastAssignedRequest, setLastAssignedRequest] = useState<CustomizeRequestDoc | null>(null);
  const [isAdAgentModalOpen, setIsAdAgentModalOpen] = useState(false);

  const [costTokens, setCostTokens] = useState<number>(55);
  const [audCentsPerToken, setAudCentsPerToken] = useState<number>(100);
  const [requests, setRequests] = useState<CustomizeRequestDoc[]>([]);
  const [messages, setMessages] = useState<AdminMessage[]>([]);
  const [loadingData, setLoadingData] = useState<boolean>(true);

  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [pending, setPending] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const submitKey = useRef<string | null>(null);

  const closestAgentPreview = useMemo(() => {
    if (!agents || agents.length === 0) return null;
    let best = agents[0];
    let bestDist = haversineKmClient(custLat, custLon, best.latitude, best.longitude);
    for (let i = 1; i < agents.length; i++) {
      const candidate = agents[i];
      const d = haversineKmClient(custLat, custLon, candidate.latitude, candidate.longitude);
      if (d < bestDist) {
        bestDist = d;
        best = candidate;
      }
    }
    return { agent: best, distanceKm: bestDist };
  }, [agents, custLat, custLon]);

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

  async function loadCustomizeState() {
    setLoadingData(true);
    try {
      const data = await apiFetch<{
        requests: CustomizeRequestDoc[];
        messages: AdminMessage[];
        costTokens: number;
        audCentsPerToken: number;
        agents?: PublicAdAgent[];
      }>("/api/customize", { method: "GET" });
      if (typeof data.costTokens === "number") setCostTokens(Math.round(data.costTokens));
      if (typeof data.audCentsPerToken === "number") setAudCentsPerToken(Math.round(data.audCentsPerToken));
      if (Array.isArray(data.requests)) setRequests(data.requests);
      if (Array.isArray(data.messages)) setMessages(data.messages);
      if (Array.isArray(data.agents)) setAgents(data.agents);
    } catch {
      // Keep default tokens if offline
    } finally {
      setLoadingData(false);
    }
  }

  useEffect(() => {
    const savedGeo = loadGeoConfig();
    setCustSuburb(savedGeo.suburb || "Sydney");
    setCustState(savedGeo.state || "NSW");
    setCustCountry(savedGeo.country || "AU");
    setCustLat(typeof savedGeo.latitude === "number" ? savedGeo.latitude : -33.8688);
    setCustLon(typeof savedGeo.longitude === "number" ? savedGeo.longitude : 151.2093);
    loadCustomizeState();
  }, []);

  async function handleDetectCustomerGeo() {
    setDetectingGeo(true);
    try {
      const detected = await autofindUserLocation();
      setCustSuburb(detected.suburb || "Sydney");
      setCustState(detected.state || "NSW");
      setCustCountry(detected.country || "AU");
      setCustLat(typeof detected.latitude === "number" ? detected.latitude : -33.8688);
      setCustLon(typeof detected.longitude === "number" ? detected.longitude : 151.2093);
    } finally {
      setDetectingGeo(false);
    }
  }

  function applyBrandTemplate(brand: BrandProfile) {
    setSelectedBrandId(brand.brandId);
    setBrandName(brand.brandName);
    setToneOfVoice(brand.toneOfVoice);
    setProductServiceDescription(brand.productServiceDescription);
    setTargetAudienceAvatar(brand.targetAudienceAvatar);
    setCorePainPoints(brand.corePainPoints.join("\n"));
    setUniqueMechanismOrOffer(brand.uniqueMechanismOrOffer);
    const urls =
      brand.landingPageUrls && brand.landingPageUrls.length > 0
        ? brand.landingPageUrls
        : [brand.destinationUrl || "https://"];
    setLandingUrls(urls);
    setPrimaryUrlIndex(0);
    setVersion(brand.version ?? "");
    setErrors({});
  }

  function addLandingUrl() {
    setLandingUrls((prev) => [...prev, "https://"]);
  }

  function updateLandingUrl(index: number, val: string) {
    setLandingUrls((prev) => {
      const next = [...prev];
      next[index] = val;
      return next;
    });
  }

  function removeLandingUrl(index: number) {
    if (landingUrls.length <= 1) return;
    setLandingUrls((prev) => prev.filter((_, i) => i !== index));
    if (primaryUrlIndex >= index && primaryUrlIndex > 0) {
      setPrimaryUrlIndex((p) => p - 1);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    setSubmitSuccess(null);

    const cleanUrls = landingUrls.map((u) => u.trim()).filter(Boolean);
    const chosenPrimary = cleanUrls[primaryUrlIndex] || cleanUrls[0] || "https://";

    const parsed = CustomizeRequestInputSchema.safeParse({
      brandName,
      productServiceDescription,
      targetAudienceAvatar,
      corePainPoints: corePainPoints
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
      uniqueMechanismOrOffer,
      toneOfVoice,
      destinationUrl: chosenPrimary,
      landingPageUrls: cleanUrls.length > 0 ? cleanUrls : [chosenPrimary],
      version: version.trim() || undefined,
      extraDetailsAndNotes,
      sourceBrandId: selectedBrandId || undefined,
      customerLocation: {
        suburb: custSuburb.trim() || "Sydney",
        state: custState.trim() || "NSW",
        country: (custCountry.trim() || "AU").toUpperCase(),
        latitude: Number.isFinite(Number(custLat)) ? Number(custLat) : -33.8688,
        longitude: Number.isFinite(Number(custLon)) ? Number(custLon) : 151.2093,
        label: `${custSuburb.trim() || "Sydney"}, ${custState.trim() || "NSW"}, ${(custCountry.trim() || "AU").toUpperCase()}`,
      },
    });

    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const name = issue.path[0] as FieldName;
        next[name] ??= issue.message;
      }
      setErrors(next);
      return;
    }

    setErrors({});
    setPending(true);
    try {
      submitKey.current ??= newIdempotencyKey();
      const res = await apiFetch<{
        success: boolean;
        request: CustomizeRequestDoc;
        customerConfirmationMessage: AdminMessage;
        requests: CustomizeRequestDoc[];
        messages: AdminMessage[];
        balanceAfter: number;
      }>("/api/customize", {
        method: "POST",
        body: parsed.data,
        idempotencyKey: submitKey.current,
      });

      submitKey.current = null;
      if (Array.isArray(res.requests)) setRequests(res.requests);
      if (Array.isArray(res.messages)) setMessages(res.messages);
      setLastAssignedRequest(res.request);
      setExtraDetailsAndNotes("");
      const assignedName = res.request.assignedAgentName || "Super Admin Strategy Lead";
      const assignedEmail = res.request.assignedAgentEmail || "support@aifoundation.net.au";
      const assignedLoc = res.request.assignedAgentLocation || "Sydney, NSW, AU";
      const assignedDist =
        typeof res.request.assignedDistanceKm === "number"
          ? ` (${res.request.assignedDistanceKm} km from your location)`
          : "";
      setSubmitSuccess(
        `Your Customize brief for "${res.request.brandName}" has been submitted! Based on your geolocation, we have selected your closest Ad Agent — ${assignedName} (${assignedEmail}, ${assignedLoc}${assignedDist}) — to handle your customization.`
      );
    } catch (err) {
      submitKey.current = null;
      setSubmitError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  const err = (name: FieldName) =>
    errors[name] ? (
      <p id={`customize-${name}-error`} className={fieldError}>
        {errors[name]}
      </p>
    ) : null;

  const hoverPrice = formatTokenEstimateHover(costTokens, false, audCentsPerToken);

  return (
    <div
      className="mx-auto w-full max-w-6xl px-3 py-6 sm:px-6 sm:py-8 space-y-8"
      data-testid="customize-page-container"
      data-agent-id="customize-page-container"
    >
      {/* Top Hero Banner */}
      <section className={`${card} p-5 sm:p-6 border border-primary/25 bg-gradient-to-br from-surface-container-high to-surface-container`}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/15 px-3 py-1 font-mono text-xs font-semibold text-primary">
                <Icon name="sparkles" className="size-3.5" />
                <span>Professional Strategist Concierge</span>
              </div>
              <button
                type="button"
                onClick={() => setIsAdAgentModalOpen(true)}
                data-agent-id="open-ad-agent-modal-hero-btn"
                data-testid="open-ad-agent-modal-hero-btn"
                className="inline-flex items-center gap-1.5 rounded-full border border-secondary/40 bg-secondary/15 px-3 py-1 font-mono text-xs font-semibold text-secondary hover:bg-secondary/25 transition"
              >
                <Icon name="mapPin" className="size-3.5" />
                <span>Ad Agent Registration &amp; Orders Panel</span>
              </button>
            </div>
            <h1 className="text-headline-md sm:text-headline-lg font-bold text-on-surface">
              Customize your Brand Strategy with Professional Experts
            </h1>
            <p className="text-body text-on-surface-variant leading-relaxed">
              Submit your brand details and geolocation below. When you submit your Customize order, we match you with the closest Ad Agent to handle your customization and deliver your bespoke positioning &amp; ad script package back to your Message Panel.
            </p>
          </div>

          <div className="flex flex-col items-start lg:items-end gap-2 shrink-0 rounded-xl border border-white/10 bg-surface-container-lowest p-4">
            <span className={monoLabel}>Professional Service Fee</span>
            <div
              title={hoverPrice}
              data-testid="customize-service-fee-badge"
              data-agent-id="customize-service-fee-badge"
              className="cursor-help flex items-center gap-1.5 font-mono text-title-md font-bold text-secondary"
            >
              <Icon name="zap" className="size-5 text-secondary" />
              <span>{costTokens} tokens</span>
            </div>
            <span className="text-[11px] font-mono text-on-surface-variant">
              Hover token badge for AUD / USD rate
            </span>
            {profile && profile.tokenBalance < costTokens && (
              <Link
                href="/wallet#packs"
                data-testid="customize-topup-link"
                data-agent-id="customize-topup-link"
                className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
              >
                <Icon name="plus" className="size-3.5" />
                Top up tokens ({profile.tokenBalance} available)
              </Link>
            )}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
        {/* LEFT COLUMN (7 COLS): Complete Customize Form */}
        <section className={`${card} p-5 sm:p-6 lg:col-span-7 space-y-5`}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-white/[0.08] pb-4">
            <div>
              <h2 className="text-title-sm font-bold text-on-surface">
                1. Complete Your Customize Brief
              </h2>
              <p className="text-compact text-on-surface-variant mt-0.5">
                Same core details as your Brand Cards, plus an extra details & descriptions box for our strategists.
              </p>
            </div>

            {brands && brands.length > 0 && (
              <div className="flex items-center gap-2">
                <select
                  aria-label="Pre-fill from an existing brand card"
                  data-testid="customize-prefill-brand-select"
                  data-agent-id="customize-prefill-brand-select"
                  value={selectedBrandId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setSelectedBrandId(id);
                    const found = brands.find((b) => b.brandId === id);
                    if (found) applyBrandTemplate(found);
                  }}
                  className={`${field} py-1.5 text-compact sm:w-52`}
                >
                  <option value="">Pre-fill from Brand Card…</option>
                  {brands.map((b) => (
                    <option key={b.brandId} value={b.brandId}>
                      {b.brandName}
                    </option>
                  ))}
                </select>
                {activeBrand && !selectedBrandId && (
                  <button
                    type="button"
                    onClick={() => applyBrandTemplate(activeBrand)}
                    data-testid="customize-use-active-brand-btn"
                    data-agent-id="customize-use-active-brand-btn"
                    className="shrink-0 rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1.5 font-mono text-[11px] font-semibold text-primary hover:bg-primary/20 transition"
                  >
                    Use Active
                  </button>
                )}
              </div>
            )}
          </div>

          {submitError && <p className={alertError}>{submitError}</p>}
          {submitSuccess && (
            <div
              role="status"
              aria-live="polite"
              data-testid="customize-submit-success-banner"
              className="flex items-start gap-2.5 rounded-xl border border-secondary/40 bg-secondary/15 p-4 text-compact font-medium text-secondary"
            >
              <Icon name="checkCircle" className="size-5 shrink-0 mt-0.5" />
              <span>{submitSuccess}</span>
            </div>
          )}

          <form
            onSubmit={handleSubmit}
            noValidate
            className="space-y-5"
            data-testid="customize-form"
            data-agent-id="customize-form"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="customize-brandName" className={label}>
                  Brand name
                </label>
                <input
                  id="customize-brandName"
                  data-testid="customize-brand-name-input"
                  data-agent-id="customize-brand-name-input"
                  className={field}
                  maxLength={100}
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                  placeholder="e.g. Acme Coffee Co."
                />
                {err("brandName")}
              </div>

              <div>
                <label htmlFor="customize-toneOfVoice" className={label}>
                  Tone of voice
                </label>
                <select
                  id="customize-toneOfVoice"
                  data-testid="customize-tone-select"
                  data-agent-id="customize-tone-select"
                  className={field}
                  value={toneOfVoice}
                  onChange={(e) => setToneOfVoice(e.target.value as BrandProfile["toneOfVoice"])}
                >
                  {ToneOfVoiceSchema.options.map((tone) => (
                    <option key={tone} value={tone}>
                      {TONE_LABELS[tone]}
                    </option>
                  ))}
                </select>
                {err("toneOfVoice")}
              </div>
            </div>

            <div>
              <label htmlFor="customize-productServiceDescription" className={label}>
                Product or service
              </label>
              <textarea
                id="customize-productServiceDescription"
                data-testid="customize-product-service-input"
                data-agent-id="customize-product-service-input"
                className={field}
                rows={3}
                maxLength={2000}
                value={productServiceDescription}
                onChange={(e) => setProductServiceDescription(e.target.value)}
                placeholder="What do you sell, and what does it do?"
              />
              {err("productServiceDescription")}
            </div>

            <div>
              <label htmlFor="customize-targetAudienceAvatar" className={label}>
                Target customer
              </label>
              <textarea
                id="customize-targetAudienceAvatar"
                data-testid="customize-target-customer-input"
                data-agent-id="customize-target-customer-input"
                className={field}
                rows={3}
                maxLength={2000}
                value={targetAudienceAvatar}
                onChange={(e) => setTargetAudienceAvatar(e.target.value)}
                placeholder="Describe your ideal buyer avatar..."
              />
              <p className={hint}>Who they are, what they want, and what they have already tried.</p>
              {err("targetAudienceAvatar")}
            </div>

            <div>
              <label htmlFor="customize-corePainPoints" className={label}>
                Pain points
              </label>
              <textarea
                id="customize-corePainPoints"
                data-testid="customize-pain-points-input"
                data-agent-id="customize-pain-points-input"
                className={field}
                rows={3}
                value={corePainPoints}
                onChange={(e) => setCorePainPoints(e.target.value)}
                placeholder={"Pain point 1\nPain point 2\nPain point 3"}
              />
              <p className={hint}>One per line, up to 10.</p>
              {err("corePainPoints")}
            </div>

            <div>
              <label htmlFor="customize-uniqueMechanismOrOffer" className={label}>
                Unique mechanism or offer
              </label>
              <textarea
                id="customize-uniqueMechanismOrOffer"
                data-testid="customize-unique-mechanism-input"
                data-agent-id="customize-unique-mechanism-input"
                className={field}
                rows={2}
                maxLength={1000}
                value={uniqueMechanismOrOffer}
                onChange={(e) => setUniqueMechanismOrOffer(e.target.value)}
                placeholder="What makes your solution faster, cheaper, or different?"
              />
              {err("uniqueMechanismOrOffer")}
            </div>

            {/* Landing page URLs */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <label className={label}>Landing page URLs</label>
                <button
                  type="button"
                  onClick={addLandingUrl}
                  data-testid="customize-add-landing-url-btn"
                  data-agent-id="customize-add-landing-url-btn"
                  className="flex items-center gap-1.5 text-compact font-semibold text-primary transition-colors hover:text-primary-fixed"
                >
                  <Icon name="plus" className="size-3.5" />
                  Add landing page URL
                </button>
              </div>
              <div className="space-y-2">
                {landingUrls.map((url, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="url"
                      inputMode="url"
                      maxLength={2048}
                      aria-label={`Customize landing page URL ${idx + 1}`}
                      data-testid={`customize-landing-url-input-${idx}`}
                      data-agent-id={`customize-landing-url-input-${idx}`}
                      className={field}
                      value={url}
                      onChange={(e) => updateLandingUrl(idx, e.target.value)}
                      placeholder="https://example.com/landing-page"
                    />
                    {landingUrls.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeLandingUrl(idx)}
                        className="flex size-10 shrink-0 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-error/15 hover:text-error"
                        aria-label={`Remove URL ${idx + 1}`}
                        data-agent-id={`customize-remove-landing-url-${idx}`}
                        data-testid={`customize-remove-landing-url-${idx}`}
                      >
                        <Icon name="trash" className="size-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {err("destinationUrl")}
              {err("landingPageUrls")}
            </div>

            <div>
              <label htmlFor="customize-version" className={label}>
                Version or Campaign Tag (Optional)
              </label>
              <input
                id="customize-version"
                type="text"
                maxLength={50}
                className={field}
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                placeholder="e.g. Q4 Launch, VIP Funnel, v2"
                data-testid="customize-version-input"
                data-agent-id="customize-version-input"
              />
            </div>

            {/* Customer Geolocation for Closest Ad Agent Selection */}
            <div
              className="rounded-xl border border-secondary/35 bg-secondary/[0.06] p-4 space-y-3"
              data-agent-id="customize-customer-geolocation-box"
              data-testid="customize-customer-geolocation-box"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-compact font-bold text-on-surface flex items-center gap-1.5">
                    <Icon name="mapPin" className="size-4 text-secondary" />
                    <span>Your Location (Geolocation for Closest Ad Agent Matching) *</span>
                  </h3>
                  <p className="text-[11px] text-on-surface-variant">
                    We use your geolocation to automatically select and assign the closest Ad Agent to handle your customization.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDetectCustomerGeo}
                  disabled={detectingGeo}
                  data-agent-id="customize-detect-geo-btn"
                  data-testid="customize-detect-geo-btn"
                  className={`${btnSecondary} shrink-0 flex items-center gap-1.5 font-mono text-xs`}
                >
                  <Icon name="mapPin" className="size-3.5 text-secondary" />
                  <span>{detectingGeo ? "Detecting GPS..." : "Use My Current Geolocation"}</span>
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-mono text-[10px] text-outline mr-1">Quick Locations:</span>
                {QUICK_GEO_PRESETS.slice(0, 8).map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      setCustSuburb(preset.suburb);
                      setCustState(preset.state);
                      setCustCountry(preset.country);
                      setCustLat(preset.latitude);
                      setCustLon(preset.longitude);
                    }}
                    className="rounded-lg border border-white/10 bg-surface-container-highest px-2 py-0.5 font-mono text-[10px] text-on-surface-variant hover:border-secondary/40 hover:text-on-surface transition"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                <div className="sm:col-span-2">
                  <label htmlFor="customize-cust-suburb" className={label}>
                    Your Suburb / City *
                  </label>
                  <input
                    id="customize-cust-suburb"
                    type="text"
                    required
                    value={custSuburb}
                    onChange={(e) => setCustSuburb(e.target.value)}
                    className={field}
                    data-agent-id="customize-cust-suburb-input"
                    data-testid="customize-cust-suburb-input"
                  />
                </div>
                <div>
                  <label htmlFor="customize-cust-state" className={label}>
                    State / Region *
                  </label>
                  <input
                    id="customize-cust-state"
                    type="text"
                    required
                    value={custState}
                    onChange={(e) => setCustState(e.target.value)}
                    className={field}
                    data-agent-id="customize-cust-state-input"
                    data-testid="customize-cust-state-input"
                  />
                </div>
                <div>
                  <label htmlFor="customize-cust-country" className={label}>
                    Country *
                  </label>
                  <input
                    id="customize-cust-country"
                    type="text"
                    required
                    maxLength={4}
                    value={custCountry}
                    onChange={(e) => setCustCountry(e.target.value.toUpperCase())}
                    className={`${field} font-mono uppercase`}
                    data-agent-id="customize-cust-country-input"
                    data-testid="customize-cust-country-input"
                  />
                </div>
              </div>

              {closestAgentPreview && (
                <div
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/35 bg-primary/10 px-3 py-2 font-mono text-xs"
                  data-agent-id="customize-closest-agent-preview"
                  data-testid="customize-closest-agent-preview"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-primary font-bold">Closest Ad Agent to Handle Your Customization:</span>
                    <span className="font-semibold text-on-surface">{closestAgentPreview.agent.name}</span>
                    <span className="text-on-surface-variant">({closestAgentPreview.agent.email})</span>
                  </div>
                  <span className="rounded bg-primary/20 px-2 py-0.5 text-[11px] font-bold text-primary">
                    📍 {closestAgentPreview.agent.locationLabel} · {closestAgentPreview.distanceKm} km away
                  </span>
                </div>
              )}
            </div>

            {/* Extra Details & Descriptions to Think About Box */}
            <div className="rounded-xl border border-primary/35 bg-primary/5 p-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="customize-extraDetailsAndNotes" className="text-body font-bold text-primary flex items-center gap-1.5">
                  <Icon name="sparkles" className="size-4" />
                  <span>Extra Details & Descriptions to Think About *</span>
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={!extraDetailsAndNotes}
                    onClick={() => handleCopyText(extraDetailsAndNotes, "extra-details")}
                    data-testid="copy-extra-details-btn"
                    data-agent-id="copy-extra-details-btn"
                    aria-label="Copy extra details text"
                    className="inline-flex items-center gap-1 rounded-lg border border-white/15 bg-surface-container-high px-2.5 py-0.5 font-mono text-[11px] font-semibold text-on-surface hover:border-primary/50 hover:text-primary disabled:opacity-40 transition"
                  >
                    <Icon name={copiedId === "extra-details" ? "checkCircle" : "copy"} className="size-3.5" />
                    <span>{copiedId === "extra-details" ? "Copied ✓" : "Copy Text"}</span>
                  </button>
                  <span className="font-mono text-[11px] text-on-surface-variant">
                    {extraDetailsAndNotes.length} / 2000
                  </span>
                </div>
              </div>
              <p className="text-[12px] text-on-surface-variant leading-relaxed">
                Share any extra context, competitor angles, creative ideas, specific hooks, objections, seasonal offers, or special instructions you want our professional strategists to think about when crafting your customized reply.
              </p>
              <textarea
                id="customize-extraDetailsAndNotes"
                data-testid="customize-extra-details-textarea"
                data-agent-id="customize-extra-details-textarea"
                className={`${field} bg-surface-container-lowest`}
                rows={5}
                maxLength={2000}
                value={extraDetailsAndNotes}
                onChange={(e) => setExtraDetailsAndNotes(e.target.value)}
                placeholder="Write all extra details, campaign goals, creative angles, and descriptions for our team to think about..."
              />
              {err("extraDetailsAndNotes")}
            </div>

            {lastAssignedRequest && lastAssignedRequest.assignedAgentName && (
              <div
                className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 space-y-1.5"
                data-agent-id="customize-assigned-agent-confirmation"
                data-testid="customize-assigned-agent-confirmation"
              >
                <div className="flex items-center gap-2 font-mono text-xs font-bold text-emerald-300 uppercase">
                  <Icon name="checkCircle" className="size-4" />
                  <span>Assigned Closest Ad Agent Handling Your Customization</span>
                </div>
                <p className="text-body-sm text-on-surface">
                  <strong>{lastAssignedRequest.assignedAgentName}</strong> (
                  <span className="font-mono text-primary">{lastAssignedRequest.assignedAgentEmail}</span>
                  {lastAssignedRequest.assignedAgentPhone ? ` · ${lastAssignedRequest.assignedAgentPhone}` : ""}) in{" "}
                  <strong>{lastAssignedRequest.assignedAgentLocation}</strong>
                  {typeof lastAssignedRequest.assignedDistanceKm === "number"
                    ? ` (${lastAssignedRequest.assignedDistanceKm} km from your location)`
                    : ""}{" "}
                  has been assigned to handle your customization for <strong>{lastAssignedRequest.brandName}</strong>.
                </p>
              </div>
            )}

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2 border-t border-white/[0.08]">
              <div className="text-xs text-on-surface-variant">
                Matched to <strong className="text-on-surface">Closest Ad Agent</strong> • Delivered to your <strong className="text-on-surface">Message Panel</strong>
              </div>
              <button
                type="submit"
                disabled={pending}
                title={hoverPrice}
                data-testid="customize-submit-button"
                data-agent-id="customize-submit-button"
                className={`${btnPrimary} px-5 py-2.5`}
              >
                {pending ? (
                  <>
                    <Icon name="refresh" className="size-4 animate-spin" />
                    Submitting Brief…
                  </>
                ) : (
                  <>
                    <Icon name="sparkles" className="size-4" />
                    <span>Submit Customize Request</span>
                    <span className="ml-1.5 rounded-full bg-black/25 px-2 py-0.5 font-mono text-xs font-bold text-secondary">
                      ⚡ {costTokens} {costTokens === 1 ? "token" : "tokens"}
                    </span>
                  </>
                )}
              </button>
            </div>
          </form>
        </section>

        {/* RIGHT COLUMN (5 COLS): Customer Message Panel & Customize Replies */}
        <section className="space-y-5 lg:col-span-5">
          {/* Active Customize Requests Status */}
          <div className={`${card} p-5 space-y-4`} data-testid="customize-requests-status-card">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
              <div>
                <h2 className="text-title-sm font-bold text-on-surface">
                  2. Your Customize Requests
                </h2>
                <p className="text-[12px] text-on-surface-variant">
                  Live status of briefs &amp; your assigned closest Ad Agent.
                </p>
              </div>
              <button
                type="button"
                onClick={loadCustomizeState}
                aria-label="Refresh customize requests"
                data-agent-id="customize-refresh-button"
                data-testid="customize-refresh-button"
                className="flex size-8 items-center justify-center rounded-lg text-on-surface-variant hover:bg-white/[0.08] hover:text-on-surface transition"
              >
                <Icon name="refresh" className={`size-4 ${loadingData ? "animate-spin" : ""}`} />
              </button>
            </div>

            {requests.length === 0 ? (
              <div className="rounded-xl border border-white/10 bg-surface-container-low p-5 text-center text-compact text-on-surface-variant">
                No Customize briefs submitted yet. Fill out the form on the left to have our team craft your custom strategy.
              </div>
            ) : (
              <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                {requests.map((req) => (
                  <div
                    key={req.requestId}
                    data-testid={`customize-request-item-${req.requestId}`}
                    className="rounded-xl border border-white/10 bg-surface-container-low p-3.5 space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-compact text-on-surface truncate">
                        {req.brandName}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleCopyText(req.extraDetailsAndNotes, `req-${req.requestId}`)}
                          data-testid={`copy-customize-req-btn-${req.requestId}`}
                          data-agent-id={`copy-customize-req-btn-${req.requestId}`}
                          aria-label={`Copy brief text for ${req.brandName}`}
                          className="inline-flex items-center gap-1 rounded-md border border-white/15 bg-surface-container-highest px-2 py-0.5 font-mono text-[10px] font-semibold text-on-surface hover:border-primary/50 hover:text-primary transition"
                        >
                          <Icon name={copiedId === `req-${req.requestId}` ? "checkCircle" : "copy"} className="size-3" />
                          <span>{copiedId === `req-${req.requestId}` ? "Copied ✓" : "Copy Text"}</span>
                        </button>
                        <span
                          className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-bold uppercase ${
                            req.status === "completed"
                              ? "bg-secondary/20 text-secondary border border-secondary/30"
                              : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                          }`}
                        >
                          {req.status === "completed" ? "Reply Delivered ✓" : "With Ad Agent"}
                        </span>
                      </div>
                    </div>
                    {req.assignedAgentName && (
                      <div className="rounded-lg border border-primary/25 bg-primary/10 px-2.5 py-1 font-mono text-[11px] text-primary">
                        Assigned Ad Agent: <strong className="text-on-surface">{req.assignedAgentName}</strong> ({req.assignedAgentEmail})
                        {req.assignedAgentLocation ? ` · ${req.assignedAgentLocation}` : ""}
                        {typeof req.assignedDistanceKm === "number" ? ` (${req.assignedDistanceKm} km)` : ""}
                      </div>
                    )}
                    <p className="text-[12px] text-on-surface-variant line-clamp-2">
                      {req.extraDetailsAndNotes}
                    </p>
                    <div className="flex items-center justify-between pt-1 text-[11px] font-mono text-outline">
                      <span>Fee: ⚡ {req.tokensCharged} tokens</span>
                      <span>{new Date(req.createdAt).toLocaleDateString("en-AU")}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Customer Message Panel (Replies from SuperAdmin & Main Admin) */}
          <div className={`${card} p-5 space-y-4`} data-testid="customize-messages-panel">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
              <div className="flex items-center gap-2">
                <span className="flex size-7 items-center justify-center rounded-lg bg-primary/20 text-primary">
                  <Icon name="sparkles" className="size-4" />
                </span>
                <div>
                  <h3 className="text-title-sm font-bold text-on-surface">
                    Customized Replies & Message Panel
                  </h3>
                  <p className="text-[11px] font-mono text-on-surface-variant">
                    Direct replies from Super Admin & Main Admin (7-Year Archive)
                  </p>
                </div>
              </div>
              <span className="rounded-full bg-primary/20 px-2 py-0.5 font-mono text-xs font-bold text-primary">
                {messages.length}
              </span>
            </div>

            {messages.length === 0 ? (
              <div className="rounded-xl border border-white/10 bg-surface-container-low p-6 text-center text-compact text-on-surface-variant">
                Your customized confirmation and completed strategy replies from our team will appear right here and in your account Message Panel.
              </div>
            ) : (
              <div className="space-y-3 max-h-[36rem] overflow-y-auto pr-1">
                {messages.map((m) => {
                  const isFromAdmin = m.direction === "admin_to_user";
                  return (
                    <div
                      key={m.messageId}
                      data-testid={`customize-message-card-${m.messageId}`}
                      className={`rounded-xl border p-3.5 space-y-2 ${
                        isFromAdmin
                          ? "border-primary/40 bg-primary/10"
                          : "border-white/10 bg-surface-container-low"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 text-[11px] font-mono">
                        <span className={`font-bold ${isFromAdmin ? "text-primary" : "text-on-surface-variant"}`}>
                          {isFromAdmin ? "★ Strategy Team / Super Admin Reply" : "Your Submitted Brief"}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleCopyText(m.body, `msg-${m.messageId}`)}
                            data-testid={`copy-customize-msg-btn-${m.messageId}`}
                            data-agent-id={`copy-customize-msg-btn-${m.messageId}`}
                            aria-label={`Copy complete text of ${m.subject}`}
                            className="inline-flex items-center gap-1 rounded-lg border border-primary/40 bg-primary/15 px-2.5 py-0.5 font-mono text-[11px] font-bold text-primary hover:bg-primary/25 transition"
                          >
                            <Icon name={copiedId === `msg-${m.messageId}` ? "checkCircle" : "copy"} className="size-3.5" />
                            <span>{copiedId === `msg-${m.messageId}` ? "Copied ✓" : "Copy Text"}</span>
                          </button>
                          <span className="text-on-surface-variant">
                            {new Date(m.createdAt).toLocaleDateString("en-AU")}
                          </span>
                        </div>
                      </div>
                      <h4 className="text-compact font-bold text-on-surface">{m.subject}</h4>
                      <p className="text-[12px] text-on-surface-variant whitespace-pre-wrap leading-relaxed">
                        {m.body}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>

      <AdAgentModal
        isOpen={isAdAgentModalOpen}
        onClose={() => {
          setIsAdAgentModalOpen(false);
          loadCustomizeState();
        }}
      />
    </div>
  );
}

