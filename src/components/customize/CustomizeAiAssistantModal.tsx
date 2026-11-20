"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import {
  CustomizeAiAssistInputSchema,
  ToneOfVoiceSchema,
  type BrandProfile,
  type CustomizeAiAssistResponse,
} from "@/lib/contracts";
import { TONE_LABELS } from "@/components/brands/BrandForm";
import { QUICK_GEO_PRESETS } from "@/components/ad-agent/AdAgentModal";
import { apiFetch, errorMessage, newIdempotencyKey } from "@/lib/api-client";
import { autofindUserLocation } from "@/lib/geo";
import { formatTokenEstimateHover } from "@/lib/pricing";
import { Icon } from "@/components/ui/Icon";
import { alertError, btnPrimary, btnSecondary, field, hint, label } from "@/components/ui/styles";

export interface CustomizeAiAssistantInitialValues {
  brandName: string;
  toneOfVoice: BrandProfile["toneOfVoice"];
  productServiceDescription: string;
  targetAudienceAvatar: string;
  corePainPoints: string;
  uniqueMechanismOrOffer: string;
  landingUrls: string[];
  version: string;
  suburb: string;
  state: string;
  country: string;
  latitude: number;
  longitude: number;
  extraDetailsAndNotes: string;
}

export interface CustomizeAiAssistantModalProps {
  onClose: () => void;
  aiFeeTokens: number;
  audCentsPerToken: number;
  initialValues: CustomizeAiAssistantInitialValues;
  brands?: BrandProfile[] | null;
  onApplyBrief: (brief: CustomizeAiAssistResponse) => void;
}

type PreferredTone = "AUTO" | BrandProfile["toneOfVoice"];

function parseLandingUrlList(raw: string): string[] {
  const parts = raw
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((u) => {
      if (u === "https://" || u === "http://") return "";
      if (/^https:\/\//i.test(u)) return u;
      if (/^http:\/\//i.test(u)) return `https://${u.slice(7)}`;
      return `https://${u}`;
    })
    .filter(Boolean);
  return Array.from(new Set(parts)).slice(0, 10);
}

export function CustomizeAiAssistantModal({
  onClose,
  aiFeeTokens,
  audCentsPerToken,
  initialValues,
  brands,
  onApplyBrief,
}: CustomizeAiAssistantModalProps) {
  const [brandNameHint, setBrandNameHint] = useState(initialValues.brandName);
  const [urlsText, setUrlsText] = useState(() => {
    const clean = initialValues.landingUrls.filter((u) => u && u !== "https://");
    return clean.length > 0 ? clean.join("\n") : "";
  });
  const [versionHint, setVersionHint] = useState(initialValues.version);
  const [preferredTone, setPreferredTone] = useState<PreferredTone>("AUTO");
  const [whatYouSell, setWhatYouSell] = useState(initialValues.productServiceDescription);
  const [idealCustomerAndPains, setIdealCustomerAndPains] = useState(() => {
    const chunks = [
      initialValues.targetAudienceAvatar.trim(),
      initialValues.corePainPoints.trim(),
    ].filter(Boolean);
    return chunks.join("\n");
  });
  const [uniqueOfferOrMechanism, setUniqueOfferOrMechanism] = useState(
    initialValues.uniqueMechanismOrOffer,
  );
  const [strategistGoalsAndNotes, setStrategistGoalsAndNotes] = useState(
    initialValues.extraDetailsAndNotes,
  );
  const [suburb, setSuburb] = useState(initialValues.suburb || "Sydney");
  const [stateRegion, setStateRegion] = useState(initialValues.state || "NSW");
  const [country, setCountry] = useState(initialValues.country || "AU");
  const [latitude, setLatitude] = useState<number>(
    Number.isFinite(initialValues.latitude) ? initialValues.latitude : -33.8688,
  );
  const [longitude, setLongitude] = useState<number>(
    Number.isFinite(initialValues.longitude) ? initialValues.longitude : 151.2093,
  );
  const [detectingGeo, setDetectingGeo] = useState(false);

  const [generating, setGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const assistKeyRef = useRef<string | null>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !generating) {
        onClose();
      }
    }
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [generating, onClose]);

  function handleSeedFromBrand(brand: BrandProfile) {
    setBrandNameHint(brand.brandName);
    setPreferredTone(brand.toneOfVoice);
    setWhatYouSell(brand.productServiceDescription);
    setIdealCustomerAndPains(
      [brand.targetAudienceAvatar, brand.corePainPoints.join("; ")].filter(Boolean).join("\n"),
    );
    setUniqueOfferOrMechanism(brand.uniqueMechanismOrOffer);
    const urls =
      brand.landingPageUrls && brand.landingPageUrls.length > 0
        ? brand.landingPageUrls
        : [brand.destinationUrl];
    setUrlsText(urls.filter((u) => u && u !== "https://").join("\n"));
    setVersionHint(brand.version ?? "");
    setErrorMsg(null);
  }

  async function handleDetectGeo() {
    setDetectingGeo(true);
    try {
      const detected = await autofindUserLocation();
      setSuburb(detected.suburb || "Sydney");
      setStateRegion(detected.state || "NSW");
      setCountry((detected.country || "AU").toUpperCase());
      setLatitude(typeof detected.latitude === "number" ? detected.latitude : -33.8688);
      setLongitude(typeof detected.longitude === "number" ? detected.longitude : 151.2093);
    } finally {
      setDetectingGeo(false);
    }
  }

  async function handleGenerateAndFill(e: FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    const parsedUrls = parseLandingUrlList(urlsText);
    if (parsedUrls.length === 0) {
      setErrorMsg("Please enter at least one valid landing page URL (e.g. https://yourbrand.com).");
      return;
    }

    const cleanSuburb = suburb.trim() || "Sydney";
    const cleanState = stateRegion.trim() || "NSW";
    const cleanCountry = (country.trim() || "AU").toUpperCase();

    const parsed = CustomizeAiAssistInputSchema.safeParse({
      brandNameHint: brandNameHint.trim(),
      whatYouSell: whatYouSell.trim(),
      preferredTone,
      idealCustomerAndPains: idealCustomerAndPains.trim(),
      uniqueOfferOrMechanism: uniqueOfferOrMechanism.trim(),
      landingPageUrls: parsedUrls,
      ...(versionHint.trim() ? { versionHint: versionHint.trim() } : {}),
      location: {
        suburb: cleanSuburb,
        state: cleanState,
        country: cleanCountry,
        latitude: Number.isFinite(latitude) ? latitude : -33.8688,
        longitude: Number.isFinite(longitude) ? longitude : 151.2093,
        label: `${cleanSuburb}, ${cleanState}, ${cleanCountry}`,
      },
      strategistGoalsAndNotes: strategistGoalsAndNotes.trim(),
    });

    if (!parsed.success) {
      setErrorMsg(parsed.error.issues[0]?.message || "Please complete all 5 questions first.");
      return;
    }

    setGenerating(true);
    try {
      assistKeyRef.current ??= newIdempotencyKey();
      const res = await apiFetch<{
        success: boolean;
        brief: CustomizeAiAssistResponse;
        tokensCharged: number;
        balanceAfter: number;
      }>("/api/customize/ai-assist", {
        method: "POST",
        body: parsed.data,
        idempotencyKey: assistKeyRef.current,
      });
      assistKeyRef.current = null;
      window.dispatchEvent(new CustomEvent("wallet-updated"));
      onApplyBrief(res.brief);
      onClose();
    } catch (err) {
      assistKeyRef.current = null;
      setErrorMsg(errorMessage(err));
    } finally {
      setGenerating(false);
    }
  }

  const hoverFeeTitle = formatTokenEstimateHover(aiFeeTokens, false, audCentsPerToken);
  const feeBadgeLabel =
    aiFeeTokens <= 0 ? "Free (0)" : `⚡ ${aiFeeTokens} ${aiFeeTokens === 1 ? "token" : "tokens"}`;

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 sm:p-6"
      onClick={() => {
        if (!generating) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="customize-ai-assistant-title"
        data-agent-id="customize-ai-assistant-modal"
        data-testid="customize-ai-assistant-modal"
        onClick={(e) => e.stopPropagation()}
        className="relative flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-primary/40 bg-surface-container-high shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-white/[0.08] bg-surface-container px-5 py-4 shrink-0">
          <div className="flex items-start gap-3 min-w-0">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/20 text-primary">
              <Icon name="sparkles" className="size-5" />
            </span>
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2
                  id="customize-ai-assistant-title"
                  className="text-title-sm font-bold text-on-surface"
                >
                  AI Agent Customize Brief Assistant
                </h2>
                <span
                  title={hoverFeeTitle}
                  data-agent-id="customize-ai-assistant-fee-badge"
                  data-testid="customize-ai-assistant-fee-badge"
                  className="cursor-help rounded-full border border-secondary/40 bg-secondary/15 px-2.5 py-0.5 font-mono text-[11px] font-bold text-secondary"
                >
                  Customization AI Fee: {feeBadgeLabel}
                </span>
              </div>
              <p className="text-compact text-on-surface-variant">
                Answer 5 quick questions below and the AI Agent will write and fill out all 10 fields of your Customize Brief automatically.
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={generating}
            onClick={onClose}
            aria-label="Close AI Agent Assistant"
            data-agent-id="customize-ai-assistant-close-btn"
            data-testid="customize-ai-assistant-close-btn"
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-on-surface-variant hover:bg-white/[0.08] hover:text-on-surface transition"
          >
            <Icon name="x" className="size-5" />
          </button>
        </div>

        {/* Scrollable Questionnaire Body */}
        <form
          onSubmit={handleGenerateAndFill}
          noValidate
          className="flex-1 overflow-y-auto p-5 space-y-5"
        >
          {errorMsg && <p className={alertError}>{errorMsg}</p>}

          {brands && brands.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-surface-container-low px-3.5 py-2.5">
              <span className="font-mono text-[11px] text-on-surface-variant">
                Optional: pre-seed answers from one of your saved Brand Cards
              </span>
              <select
                aria-label="Seed AI Agent answers from Brand Card"
                data-agent-id="customize-ai-seed-brand-select"
                data-testid="customize-ai-seed-brand-select"
                defaultValue=""
                onChange={(e) => {
                  const chosen = brands.find((b) => b.brandId === e.target.value);
                  if (chosen) handleSeedFromBrand(chosen);
                }}
                className={`${field} !py-1 text-compact sm:w-52`}
              >
                <option value="">Seed from Brand Card…</option>
                {brands.map((b) => (
                  <option key={b.brandId} value={b.brandId}>
                    {b.brandName}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Q1: Brand, URLs & Campaign Tag */}
          <div className="rounded-xl border border-white/10 bg-surface-container-low p-4 space-y-3">
            <p className="font-mono text-xs font-bold text-primary">
              Question 1 of 5 · Brand Identity &amp; Landing Page URLs
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="ai-q-brand" className={label}>
                  What is your Brand name? *
                </label>
                <input
                  id="ai-q-brand"
                  type="text"
                  required
                  maxLength={100}
                  value={brandNameHint}
                  onChange={(e) => setBrandNameHint(e.target.value)}
                  placeholder="e.g. Acme Coffee Co."
                  data-agent-id="customize-ai-q-brand-input"
                  data-testid="customize-ai-q-brand-input"
                  className={field}
                />
              </div>
              <div>
                <label htmlFor="ai-q-version" className={label}>
                  Version or Campaign Tag (Optional)
                </label>
                <input
                  id="ai-q-version"
                  type="text"
                  maxLength={50}
                  value={versionHint}
                  onChange={(e) => setVersionHint(e.target.value)}
                  placeholder="e.g. Q4 Launch, VIP Funnel, v2"
                  data-agent-id="customize-ai-q-version-input"
                  data-testid="customize-ai-q-version-input"
                  className={field}
                />
              </div>
            </div>
            <div>
              <label htmlFor="ai-q-urls" className={label}>
                Which Landing Page URL(s) should ads send traffic to? *
              </label>
              <textarea
                id="ai-q-urls"
                rows={2}
                required
                value={urlsText}
                onChange={(e) => setUrlsText(e.target.value)}
                placeholder="https://yourbrand.com/offer (separate multiple URLs with new lines or commas)"
                data-agent-id="customize-ai-q-urls-input"
                data-testid="customize-ai-q-urls-input"
                className={field}
              />
            </div>
          </div>

          {/* Q2: Product/Service & Tone of Voice */}
          <div className="rounded-xl border border-white/10 bg-surface-container-low p-4 space-y-3">
            <p className="font-mono text-xs font-bold text-primary">
              Question 2 of 5 · Product / Service &amp; Tone of Voice
            </p>
            <div>
              <label htmlFor="ai-q-product" className={label}>
                In plain words, what product or service do you sell and who uses it? *
              </label>
              <textarea
                id="ai-q-product"
                rows={2}
                required
                maxLength={1500}
                value={whatYouSell}
                onChange={(e) => setWhatYouSell(e.target.value)}
                placeholder="e.g. Cold-brew coffee concentrate delivered monthly so busy professionals make cafe-quality iced coffee in 15 seconds."
                data-agent-id="customize-ai-q-product-textarea"
                data-testid="customize-ai-q-product-textarea"
                className={field}
              />
            </div>
            <div>
              <label htmlFor="ai-q-tone" className={label}>
                Preferred Tone of Voice
              </label>
              <select
                id="ai-q-tone"
                value={preferredTone}
                onChange={(e) => setPreferredTone(e.target.value as PreferredTone)}
                data-agent-id="customize-ai-q-tone-select"
                data-testid="customize-ai-q-tone-select"
                className={field}
              >
                <option value="AUTO">Let AI Agent Recommend Best Tone</option>
                {ToneOfVoiceSchema.options.map((tone) => (
                  <option key={tone} value={tone}>
                    {TONE_LABELS[tone]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Q3: Target Customer & Pain Points */}
          <div className="rounded-xl border border-white/10 bg-surface-container-low p-4 space-y-3">
            <p className="font-mono text-xs font-bold text-primary">
              Question 3 of 5 · Target Customer &amp; Core Pain Points
            </p>
            <div>
              <label htmlFor="ai-q-customer-pains" className={label}>
                Who is your ideal buyer, and what frustrations or problems push them to buy? *
              </label>
              <textarea
                id="ai-q-customer-pains"
                rows={3}
                required
                maxLength={1500}
                value={idealCustomerAndPains}
                onChange={(e) => setIdealCustomerAndPains(e.target.value)}
                placeholder="e.g. Remote workers and parents aged 25-45 spending \$7/day on cafe coffee, rushing mornings, and hating bitter instant coffee."
                data-agent-id="customize-ai-q-customer-pains-textarea"
                data-testid="customize-ai-q-customer-pains-textarea"
                className={field}
              />
              <p className={hint}>The AI Agent will format your Target Customer avatar and individual Pain Points automatically.</p>
            </div>
          </div>

          {/* Q4: Unique Mechanism or Offer */}
          <div className="rounded-xl border border-white/10 bg-surface-container-low p-4 space-y-3">
            <p className="font-mono text-xs font-bold text-primary">
              Question 4 of 5 · Unique Mechanism or Offer
            </p>
            <div>
              <label htmlFor="ai-q-offer" className={label}>
                What makes your offer different, faster, or lower-risk than competitors? *
              </label>
              <textarea
                id="ai-q-offer"
                rows={2}
                required
                maxLength={1000}
                value={uniqueOfferOrMechanism}
                onChange={(e) => setUniqueOfferOrMechanism(e.target.value)}
                placeholder="e.g. 20-hour cold extraction using single-origin beans + first starter kit free with a 60-day taste guarantee."
                data-agent-id="customize-ai-q-offer-textarea"
                data-testid="customize-ai-q-offer-textarea"
                className={field}
              />
            </div>
          </div>

          {/* Q5: Location (Closest Ad Agent) & Extra Details */}
          <div className="rounded-xl border border-white/10 bg-surface-container-low p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-mono text-xs font-bold text-primary">
                Question 5 of 5 · Location (Closest Ad Agent) &amp; Extra Details
              </p>
              <button
                type="button"
                disabled={detectingGeo}
                onClick={handleDetectGeo}
                data-agent-id="customize-ai-q-detect-geo-btn"
                data-testid="customize-ai-q-detect-geo-btn"
                className={`${btnSecondary} !py-1 !px-2.5 text-[11px] font-mono`}
              >
                <Icon name="mapPin" className="size-3.5 text-secondary" />
                <span>{detectingGeo ? "Detecting GPS…" : "Use My Current Geolocation"}</span>
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {QUICK_GEO_PRESETS.slice(0, 6).map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    setSuburb(preset.suburb);
                    setStateRegion(preset.state);
                    setCountry(preset.country);
                    setLatitude(preset.latitude);
                    setLongitude(preset.longitude);
                  }}
                  className="rounded-lg border border-white/10 bg-surface-container-highest px-2 py-0.5 font-mono text-[10px] text-on-surface-variant hover:border-secondary/40 hover:text-on-surface transition"
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              <div>
                <label htmlFor="ai-q-suburb" className={label}>
                  Suburb / City *
                </label>
                <input
                  id="ai-q-suburb"
                  type="text"
                  required
                  value={suburb}
                  onChange={(e) => setSuburb(e.target.value)}
                  data-agent-id="customize-ai-q-suburb-input"
                  data-testid="customize-ai-q-suburb-input"
                  className={field}
                />
              </div>
              <div>
                <label htmlFor="ai-q-state" className={label}>
                  State / Region *
                </label>
                <input
                  id="ai-q-state"
                  type="text"
                  required
                  value={stateRegion}
                  onChange={(e) => setStateRegion(e.target.value)}
                  data-agent-id="customize-ai-q-state-input"
                  data-testid="customize-ai-q-state-input"
                  className={field}
                />
              </div>
              <div>
                <label htmlFor="ai-q-country" className={label}>
                  Country *
                </label>
                <input
                  id="ai-q-country"
                  type="text"
                  required
                  maxLength={4}
                  value={country}
                  onChange={(e) => setCountry(e.target.value.toUpperCase())}
                  data-agent-id="customize-ai-q-country-input"
                  data-testid="customize-ai-q-country-input"
                  className={`${field} font-mono uppercase`}
                />
              </div>
            </div>

            <div>
              <label htmlFor="ai-q-extra-notes" className={label}>
                Any campaign goals, competitor angles, or extra notes for our Ad Agent strategist? *
              </label>
              <textarea
                id="ai-q-extra-notes"
                rows={3}
                required
                maxLength={1500}
                value={strategistGoalsAndNotes}
                onChange={(e) => setStrategistGoalsAndNotes(e.target.value)}
                placeholder="e.g. Launching Meta & TikTok video ads ahead of summer; beat cheaper competitors by focusing on quality and morning speed."
                data-agent-id="customize-ai-q-extra-notes-textarea"
                data-testid="customize-ai-q-extra-notes-textarea"
                className={field}
              />
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.08] pt-4">
            <span className="font-mono text-[11px] text-on-surface-variant">
              Auto-fills all 10 fields for your review before submitting.
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={generating}
                onClick={onClose}
                data-agent-id="customize-ai-assistant-cancel-btn"
                data-testid="customize-ai-assistant-cancel-btn"
                aria-label="Cancel AI Agent Assistant"
                className={btnSecondary}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={generating}
                title={hoverFeeTitle}
                data-agent-id="customize-ai-assistant-generate-btn"
                data-testid="customize-ai-assistant-generate-btn"
                aria-label="Generate and auto-fill Customize brief with AI Agent"
                className={`${btnPrimary} px-4 py-2`}
              >
                {generating ? (
                  <>
                    <Icon name="refresh" className="size-4 animate-spin" />
                    <span>Filling Customize Brief…</span>
                  </>
                ) : (
                  <>
                    <Icon name="sparkles" className="size-4" />
                    <span>Generate &amp; Fill Brief</span>
                    <span className="ml-1 rounded-full bg-black/25 px-2 py-0.5 font-mono text-xs font-bold text-secondary">
                      {feeBadgeLabel}
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
