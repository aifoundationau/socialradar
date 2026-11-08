"use client";

import { useRef, useState, type FormEvent } from "react";
import { BrandProfileInputSchema, ToneOfVoiceSchema, type BrandProfile } from "@/lib/contracts";
import { apiFetch, errorMessage, newIdempotencyKey } from "@/lib/api-client";
import { Icon } from "@/components/ui/Icon";
import { alertError, btnPrimary, btnSecondary, field, fieldError } from "@/components/ui/styles";

export const TONE_LABELS: Record<BrandProfile["toneOfVoice"], string> = {
  DIRECT_RESPONSE: "Direct response",
  AUTHORITATIVE: "Authoritative",
  UGC_CASUAL: "UGC / casual",
  URGENT: "Urgent",
};

type FieldName = keyof Omit<BrandProfile, "brandId">;
type FieldErrors = Partial<Record<FieldName, string>> & { landingPageUrls?: string };

const EMPTY: Omit<BrandProfile, "brandId"> = {
  brandName: "",
  productServiceDescription: "",
  targetAudienceAvatar: "",
  corePainPoints: [],
  uniqueMechanismOrOffer: "",
  toneOfVoice: "DIRECT_RESPONSE",
  destinationUrl: "https://",
  landingPageUrls: ["https://"],
  isGlobal: false,
  version: "",
};

/** Create (no `brand`) or edit (with `brand`) a Brand Profile in the slide-over panel. */
export function BrandForm({ brand, onDone, onCancel }: { brand?: BrandProfile; onDone: () => void; onCancel: () => void }) {
  const initial = brand ?? EMPTY;
  const initialUrls =
    brand?.landingPageUrls && brand.landingPageUrls.length > 0
      ? brand.landingPageUrls
      : brand?.destinationUrl
        ? [brand.destinationUrl]
        : ["https://"];

  const [values, setValues] = useState({
    ...initial,
    isGlobal: initial.isGlobal ?? false,
    version: initial.version ?? "",
    corePainPoints: initial.corePainPoints.join("\n"),
  });
  const [landingUrls, setLandingUrls] = useState<string[]>(initialUrls);
  const [primaryUrlIndex, setPrimaryUrlIndex] = useState<number>(0);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const createKey = useRef<string | null>(null);

  const set = (name: keyof typeof values) => (e: { target: { value: string } }) =>
    setValues((v) => ({ ...v, [name]: e.target.value }));

  const toggleGlobal = () => setValues((v) => ({ ...v, isGlobal: !v.isGlobal }));

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
    const cleanUrls = landingUrls.map((u) => u.trim()).filter(Boolean);
    const chosenPrimary = cleanUrls[primaryUrlIndex] || cleanUrls[0] || "https://";

    const parsed = BrandProfileInputSchema.safeParse({
      brandName: values.brandName,
      productServiceDescription: values.productServiceDescription,
      targetAudienceAvatar: values.targetAudienceAvatar,
      corePainPoints: values.corePainPoints.split("\n").map((s) => s.trim()).filter(Boolean),
      uniqueMechanismOrOffer: values.uniqueMechanismOrOffer,
      toneOfVoice: values.toneOfVoice,
      destinationUrl: chosenPrimary,
      landingPageUrls: cleanUrls.length > 0 ? cleanUrls : [chosenPrimary],
      isGlobal: values.isGlobal,
      version: values.version?.trim() || undefined,
    });

    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const name = issue.path[0] as FieldName | "landingPageUrls";
        next[name] ??= issue.message;
      }
      setErrors(next);
      return;
    }

    setErrors({});
    setSubmitError(null);
    setPending(true);
    try {
      if (brand) {
        await apiFetch("/api/brands", { method: "PUT", body: { brandId: brand.brandId, ...parsed.data } });
      } else {
        createKey.current ??= newIdempotencyKey();
        await apiFetch("/api/brands", { method: "POST", body: parsed.data, idempotencyKey: createKey.current });
      }
      onDone();
    } catch (err) {
      setSubmitError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  const err = (name: keyof FieldErrors) =>
    errors[name] ? (
      <p id={`${name}-error`} className={fieldError}>
        {errors[name]}
      </p>
    ) : null;

  const a11y = (name: FieldName) => ({
    id: name,
    "aria-invalid": errors[name] ? true : undefined,
    "aria-describedby": errors[name] ? `${name}-error` : undefined,
  });

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col justify-between"
      noValidate
      data-testid="brand-form"
      data-agent-id="brand-form"
    >
      {/* 2-Column Responsive Form Layout (Avoids Scrolling on Laptop & Desktop) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-3.5 sm:gap-y-4">
        {/* LEFT COLUMN: Identity, Avatar & Pain Points */}
        <div className="space-y-3 sm:space-y-3.5">
          {/* Brand Name & Tone of Voice */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="brandName" className="block text-xs font-semibold text-on-surface">
                Brand Name *
              </label>
              <input
                {...a11y("brandName")}
                data-testid="brand-name-input"
                data-agent-id="brand-name-input"
                className={`${field} mt-1 py-1.5 px-3 text-xs sm:text-compact`}
                maxLength={100}
                value={values.brandName}
                onChange={set("brandName")}
                placeholder="e.g. Acme Coffee Co."
              />
              {err("brandName")}
            </div>
            <div>
              <label htmlFor="toneOfVoice" className="block text-xs font-semibold text-on-surface">
                Tone of Voice *
              </label>
              <select
                {...a11y("toneOfVoice")}
                data-testid="tone-select"
                data-agent-id="tone-select"
                className={`${field} mt-1 py-1.5 px-3 text-xs sm:text-compact`}
                value={values.toneOfVoice}
                onChange={set("toneOfVoice")}
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

          {/* Product or Service */}
          <div>
            <label htmlFor="productServiceDescription" className="block text-xs font-semibold text-on-surface">
              Product or Service Description *
            </label>
            <textarea
              {...a11y("productServiceDescription")}
              data-testid="product-service-input"
              data-agent-id="product-service-input"
              className={`${field} mt-1 py-1.5 px-3 text-xs leading-relaxed`}
              rows={2}
              maxLength={2000}
              value={values.productServiceDescription}
              onChange={set("productServiceDescription")}
              placeholder="What do you sell, and what does it do?"
            />
            {err("productServiceDescription")}
          </div>

          {/* Target Customer Avatar */}
          <div>
            <div className="flex items-center justify-between">
              <label htmlFor="targetAudienceAvatar" className="block text-xs font-semibold text-on-surface">
                Target Customer Avatar *
              </label>
              <span className="text-[10px] font-mono text-outline">Ideal buyer desires & frustrations</span>
            </div>
            <textarea
              {...a11y("targetAudienceAvatar")}
              data-testid="target-customer-input"
              data-agent-id="target-customer-input"
              className={`${field} mt-1 py-1.5 px-3 text-xs leading-relaxed`}
              rows={2}
              maxLength={2000}
              value={values.targetAudienceAvatar}
              onChange={set("targetAudienceAvatar")}
              placeholder="Describe your ideal buyer avatar, who they are, and what they want..."
            />
            {err("targetAudienceAvatar")}
          </div>

          {/* Core Pain Points */}
          <div>
            <div className="flex items-center justify-between">
              <label htmlFor="corePainPoints" className="block text-xs font-semibold text-on-surface">
                Core Pain Points *
              </label>
              <span className="text-[10px] font-mono text-outline">1 per line, up to 10</span>
            </div>
            <textarea
              {...a11y("corePainPoints")}
              data-testid="pain-points-input"
              data-agent-id="pain-points-input"
              className={`${field} mt-1 py-1.5 px-3 text-xs leading-relaxed font-mono`}
              rows={2}
              value={values.corePainPoints}
              onChange={set("corePainPoints")}
              placeholder="Pain point 1&#10;Pain point 2&#10;Pain point 3"
            />
            {err("corePainPoints")}
          </div>
        </div>

        {/* RIGHT COLUMN: Unique Mechanism, Landing URLs, Versioning & Global Sharing */}
        <div className="space-y-3 sm:space-y-3.5">
          {/* Unique Mechanism or Offer */}
          <div>
            <label htmlFor="uniqueMechanismOrOffer" className="block text-xs font-semibold text-on-surface">
              Unique Mechanism or Offer *
            </label>
            <textarea
              {...a11y("uniqueMechanismOrOffer")}
              data-testid="unique-mechanism-input"
              data-agent-id="unique-mechanism-input"
              className={`${field} mt-1 py-1.5 px-3 text-xs leading-relaxed`}
              rows={2}
              maxLength={1000}
              value={values.uniqueMechanismOrOffer}
              onChange={set("uniqueMechanismOrOffer")}
              placeholder="What makes your solution faster, cheaper, or different?"
            />
            {err("uniqueMechanismOrOffer")}
          </div>

          {/* Landing Page URLs */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-on-surface">Landing Page URLs *</label>
              <button
                type="button"
                data-testid="add-landing-url-button"
                data-agent-id="add-landing-url-btn"
                onClick={addLandingUrl}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary transition-colors hover:text-primary-fixed"
              >
                <Icon name="plus" className="size-3" />
                <span>Add landing page URL</span>
              </button>
            </div>

            {/* Dropdown to pick primary landing page if multiple exist */}
            {landingUrls.length > 1 && (
              <div className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-surface-container-low px-2.5 py-1 text-xs">
                <span className="shrink-0 font-medium text-on-surface-variant text-[11px]">
                  Primary:
                </span>
                <select
                  aria-label="Select primary landing page URL"
                  data-testid="primary-landing-url-select"
                  data-agent-id="primary-landing-url-select"
                  value={primaryUrlIndex}
                  onChange={(e) => setPrimaryUrlIndex(Number(e.target.value))}
                  className={`${field} mt-0 py-0.5 px-2 text-[11px] font-mono`}
                >
                  {landingUrls.map((url, idx) => (
                    <option key={idx} value={idx}>
                      {url.trim() ? url : `Landing Page #${idx + 1}`}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="space-y-1.5 max-h-24 overflow-y-auto pr-0.5">
              {landingUrls.map((url, idx) => (
                <div key={idx} className="flex items-center gap-1.5">
                  <input
                    type="url"
                    inputMode="url"
                    maxLength={2048}
                    aria-label={`Landing page URL ${idx + 1}`}
                    data-testid={`landing-url-input-${idx}`}
                    data-agent-id={`landing-url-input-${idx}`}
                    className={`${field} mt-0 py-1.5 px-2.5 text-xs font-mono`}
                    value={url}
                    onChange={(e) => updateLandingUrl(idx, e.target.value)}
                    placeholder="https://example.com/landing-page"
                  />
                  {landingUrls.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeLandingUrl(idx)}
                      className="flex size-7.5 shrink-0 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-error/15 hover:text-error"
                      aria-label={`Remove URL ${idx + 1}`}
                      data-agent-id={`remove-landing-url-${idx}`}
                      data-testid={`remove-landing-url-${idx}`}
                      title="Remove this URL"
                    >
                      <Icon name="trash" className="size-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {err("destinationUrl")}
            {err("landingPageUrls")}
          </div>

          {/* Version / Campaign Tag */}
          <div>
            <div className="flex items-center justify-between">
              <label htmlFor="version" className="block text-xs font-semibold text-on-surface">
                Version or Campaign Tag (Optional)
              </label>
              <span className="text-[10px] font-mono text-outline">e.g. v1, Summer 2026</span>
            </div>
            <input
              id="version"
              type="text"
              maxLength={50}
              className={`${field} mt-1 py-1.5 px-3 text-xs`}
              value={values.version}
              onChange={set("version")}
              placeholder="e.g. v1, Summer 2026, Campaign B"
              data-testid="brand-version-input"
              data-agent-id="brand-version-input"
            />
          </div>

          {/* Global Brand Sharing Option */}
          <div className="rounded-xl border border-white/[0.08] bg-surface-container-low p-2.5">
            <label className="flex items-start gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={values.isGlobal}
                onChange={toggleGlobal}
                data-testid="brand-is-global-checkbox"
                data-agent-id="brand-is-global-checkbox"
                className="mt-0.5 size-4 rounded border-white/20 bg-surface-container-high text-primary focus:ring-primary/40"
              />
              <div className="min-w-0">
                <span className="text-xs font-semibold text-on-surface flex items-center gap-1.5">
                  <Icon name="globe" className="size-3.5 text-primary" />
                  Make this Brand Global (Community Discovery)
                </span>
                <p className="text-[11px] text-on-surface-variant mt-0.5 leading-snug">
                  Allows community users to discover and clone frameworks. Your brand stays private and editable in your account.
                </p>
              </div>
            </label>
          </div>
        </div>
      </div>

      {submitError && <p className={`${alertError} mt-2 text-xs py-2`}>{submitError}</p>}

      {/* Modal Actions Footer */}
      <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 pt-3 border-t border-white/[0.08] mt-3">
        <div className="text-[11px] font-mono text-on-surface-variant">
          ⚡ Saved to account • Instant synchronization for Radar searches & AI Remix
        </div>
        <div className="flex items-center justify-end gap-2.5">
          <button
            type="button"
            className={btnSecondary}
            onClick={onCancel}
            disabled={pending}
            data-testid="brand-cancel-button"
            data-agent-id="brand-cancel-btn"
          >
            Cancel
          </button>
          <button
            type="submit"
            className={`${btnPrimary} px-5`}
            disabled={pending}
            data-testid="brand-submit-button"
            data-agent-id="brand-submit-btn"
          >
            {pending ? (
              <>
                <Icon name="refresh" className="size-3.5 animate-spin mr-1" />
                Saving…
              </>
            ) : brand ? (
              "Save Changes"
            ) : (
              "Create Brand"
            )}
          </button>
        </div>
      </div>
    </form>
  );
}
