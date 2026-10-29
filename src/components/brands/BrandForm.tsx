"use client";

import { useRef, useState, type FormEvent } from "react";
import { BrandProfileInputSchema, ToneOfVoiceSchema, type BrandProfile } from "@/lib/contracts";
import { apiFetch, errorMessage, newIdempotencyKey } from "@/lib/api-client";
import { alertError, btnPrimary, btnSecondary, field, fieldError, hint, label } from "@/components/ui/styles";

export const TONE_LABELS: Record<BrandProfile["toneOfVoice"], string> = {
  DIRECT_RESPONSE: "Direct response",
  AUTHORITATIVE: "Authoritative",
  UGC_CASUAL: "UGC / casual",
  URGENT: "Urgent",
};

type FieldName = keyof Omit<BrandProfile, "brandId">;
type FieldErrors = Partial<Record<FieldName, string>>;

const EMPTY: Omit<BrandProfile, "brandId"> = {
  brandName: "",
  productServiceDescription: "",
  targetAudienceAvatar: "",
  corePainPoints: [],
  uniqueMechanismOrOffer: "",
  toneOfVoice: "DIRECT_RESPONSE",
  destinationUrl: "https://",
};

/** Create (no `brand`) or edit (with `brand`) a Brand Profile. */
export function BrandForm({ brand, onDone, onCancel }: { brand?: BrandProfile; onDone: () => void; onCancel: () => void }) {
  const initial = brand ?? EMPTY;
  const [values, setValues] = useState({ ...initial, corePainPoints: initial.corePainPoints.join("\n") });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // One key per create attempt, kept across retries so a double submit can't make two brands.
  const createKey = useRef<string | null>(null);

  const set = (name: keyof typeof values) => (e: { target: { value: string } }) =>
    setValues((v) => ({ ...v, [name]: e.target.value }));

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const parsed = BrandProfileInputSchema.safeParse({
      ...values,
      corePainPoints: values.corePainPoints.split("\n").map((s) => s.trim()).filter(Boolean),
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

  const err = (name: FieldName) =>
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
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="brandName" className={label}>
            Brand name
          </label>
          <input {...a11y("brandName")} className={field} maxLength={100} value={values.brandName} onChange={set("brandName")} />
          {err("brandName")}
        </div>
        <div>
          <label htmlFor="toneOfVoice" className={label}>
            Tone of voice
          </label>
          <select {...a11y("toneOfVoice")} className={field} value={values.toneOfVoice} onChange={set("toneOfVoice")}>
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
          className={field}
          rows={3}
          maxLength={2000}
          value={values.productServiceDescription}
          onChange={set("productServiceDescription")}
        />
        {err("productServiceDescription")}
      </div>

      <div>
        <label htmlFor="targetAudienceAvatar" className={label}>
          Target customer
        </label>
        <textarea
          {...a11y("targetAudienceAvatar")}
          className={field}
          rows={3}
          maxLength={2000}
          value={values.targetAudienceAvatar}
          onChange={set("targetAudienceAvatar")}
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
          className={field}
          rows={4}
          value={values.corePainPoints}
          onChange={set("corePainPoints")}
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
          className={field}
          rows={2}
          maxLength={1000}
          value={values.uniqueMechanismOrOffer}
          onChange={set("uniqueMechanismOrOffer")}
        />
        {err("uniqueMechanismOrOffer")}
      </div>

      <div>
        <label htmlFor="destinationUrl" className={label}>
          Landing page URL
        </label>
        <input
          {...a11y("destinationUrl")}
          className={field}
          type="url"
          inputMode="url"
          maxLength={2048}
          value={values.destinationUrl}
          onChange={set("destinationUrl")}
        />
        {err("destinationUrl")}
      </div>

      {submitError && <p className={alertError}>{submitError}</p>}

      <div className="flex flex-wrap gap-3">
        <button type="submit" className={btnPrimary} disabled={pending}>
          {pending ? "Saving…" : brand ? "Save changes" : "Create brand"}
        </button>
        <button type="button" className={btnSecondary} onClick={onCancel} disabled={pending}>
          Cancel
        </button>
      </div>
    </form>
  );
}
