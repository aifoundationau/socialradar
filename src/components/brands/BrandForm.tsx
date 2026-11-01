"use client";

import { useRef, useState, type FormEvent } from "react";
import { BrandProfileInputSchema, ToneOfVoiceSchema, type BrandProfile } from "@/lib/contracts";
import { apiFetch, errorMessage, newIdempotencyKey } from "@/lib/api-client";
import { Icon } from "@/components/ui/Icon";
import { alertError, btnPrimary, btnSecondary, field, fieldError, hint, label } from "@/components/ui/styles";

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
      className="space-y-5"
      noValidate
      data-testid="brand-form"
      data-agent-id="brand-form"
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="brandName" className={label}>
            Brand name
          </label>
          <input
            {...a11y("brandName")}
            data-testid="brand-name-input"
            data-agent-id="brand-name-input"
            className={field}
            maxLength={100}
            value={values.brandName}
            onChange={set("brandName")}
            placeholder="e.g. Acme Coffee Co."
          />
          {err("brandName")}
        </div>
        <div>
          <label htmlFor="toneOfVoice" className={label}>
            Tone of voice
          </label>
          <select
            {...a11y("toneOfVoice")}
            data-testid="tone-select"
            data-agent-id="tone-select"
            className={field}
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

      <div>
        <label htmlFor="productServiceDescription" className={label}>
          Product or service
        </label>
        <textarea
          {...a11y("productServiceDescription")}
          data-testid="product-service-input"
          data-agent-id="product-service-input"
          className={field}
          rows={3}
          maxLength={2000}
          value={values.productServiceDescription}
          onChange={set("productServiceDescription")}
          placeholder="What do you sell, and what does it do?"
        />
        {err("productServiceDescription")}
      </div>

      <div>
        <label htmlFor="targetAudienceAvatar" className={label}>
          Target customer
        </label>
        <textarea
          {...a11y("targetAudienceAvatar")}
          data-testid="target-customer-input"
          data-agent-id="target-customer-input"
          className={field}
          rows={3}
          maxLength={2000}
          value={values.targetAudienceAvatar}
          onChange={set("targetAudienceAvatar")}
          placeholder="Describe your ideal buyer avatar..."
        />
        <p className={hint}>Who they are, what they want, and what they have already tried.</p>
        {err("targetAudienceAvatar")}
      </div>

      <div>
        <label htmlFor="corePainPoints" className={label}>
          Pain points
        </label>
        <textarea
          {...a11y("corePainPoints")}
          data-testid="pain-points-input"
          data-agent-id="pain-points-input"
          className={field}
          rows={4}
          value={values.corePainPoints}
          onChange={set("corePainPoints")}
          placeholder="Pain point 1&#10;Pain point 2&#10;Pain point 3"
        />
        <p className={hint}>One per line, up to 10.</p>
        {err("corePainPoints")}
      </div>

      <div>
        <label htmlFor="uniqueMechanismOrOffer" className={label}>
          Unique mechanism or offer
        </label>
        <textarea
          {...a11y("uniqueMechanismOrOffer")}
          data-testid="unique-mechanism-input"
          data-agent-id="unique-mechanism-input"
          className={field}
          rows={2}
          maxLength={1000}
          value={values.uniqueMechanismOrOffer}
          onChange={set("uniqueMechanismOrOffer")}
          placeholder="What makes your solution faster, cheaper, or different?"
        />
        {err("uniqueMechanismOrOffer")}
      </div>

      {/* Landing page URLs with Dropdown selector & dynamic creator */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className={label}>Landing page URLs</label>
          <button
            type="button"
            data-testid="add-landing-url-button"
            data-agent-id="add-landing-url-btn"
            onClick={addLandingUrl}
            className="flex items-center gap-1.5 text-compact font-semibold text-primary transition-colors hover:text-primary-fixed"
          >
            <Icon name="plus" className="size-3.5" />
            Add landing page URL
          </button>
        </div>
        <p className={hint}>Create as many landing page URLs as you want for this brand.</p>

        {/* Dropdown to pick primary landing page if multiple exist */}
        {landingUrls.length > 1 && (
          <div className="flex flex-col gap-1.5 rounded-lg border border-white/[0.08] bg-surface-container-low p-3 sm:flex-row sm:items-center">
            <span className="shrink-0 text-compact font-medium text-on-surface-variant">
              Primary destination:
            </span>
            <select
              aria-label="Select primary landing page URL"
              data-testid="primary-landing-url-select"
              data-agent-id="primary-landing-url-select"
              value={primaryUrlIndex}
              onChange={(e) => setPrimaryUrlIndex(Number(e.target.value))}
              className={`${field} py-1 text-compact`}
            >
              {landingUrls.map((url, idx) => (
                <option key={idx} value={idx}>
                  {url.trim() ? url : `Landing Page #${idx + 1}`}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="space-y-2">
          {landingUrls.map((url, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <input
                type="url"
                inputMode="url"
                maxLength={2048}
                aria-label={`Landing page URL ${idx + 1}`}
                data-testid={`landing-url-input-${idx}`}
                data-agent-id={`landing-url-input-${idx}`}
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
                  data-testid={`remove-landing-url-${idx}`}
                  title="Remove this URL"
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

      {/* Version / Campaign Tag (Optional) */}
      <div>
        <label htmlFor="version" className={label}>
          Version or Campaign Tag (Optional)
        </label>
        <input
          id="version"
          type="text"
          maxLength={50}
          className={field}
          value={values.version}
          onChange={set("version")}
          placeholder="e.g. v1, Summer 2026, Campaign B"
          data-testid="brand-version-input"
          data-agent-id="brand-version-input"
        />
        <p className={hint}>
          Useful when creating multiple iterations or versions of the same brand.
        </p>
      </div>

      {/* Global Brand Sharing Option */}
      <div className="rounded-xl border border-white/[0.08] bg-surface-container-low p-3.5 space-y-2">
        <label className="flex items-start gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={values.isGlobal}
            onChange={toggleGlobal}
            data-testid="brand-is-global-checkbox"
            data-agent-id="brand-is-global-checkbox"
            className="mt-0.5 size-4 rounded border-white/20 bg-surface-container-high text-primary focus:ring-primary/40"
          />
          <div className="min-w-0">
            <span className="text-body font-semibold text-on-surface flex items-center gap-1.5">
              <Icon name="globe" className="size-4 text-primary" />
              Make this Brand Global (Community Discovery)
            </span>
            <p className="text-[12px] text-on-surface-variant mt-0.5 leading-relaxed">
              When enabled, anyone can search for this brand in the Global Brand Library and make a copy for themselves. Your brand stays personal and editable in your account.
            </p>
          </div>
        </label>
      </div>

      {submitError && <p className={alertError}>{submitError}</p>}

      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:gap-3">
        <button
          type="submit"
          className={btnPrimary}
          disabled={pending}
          data-testid="brand-submit-button"
          data-agent-id="brand-submit-btn"
        >
          {pending ? "Saving…" : brand ? "Save changes" : "Create brand"}
        </button>
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
      </div>
    </form>
  );
}
