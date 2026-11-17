"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { useSession } from "@/components/auth/SessionProvider";
import { Icon } from "@/components/ui/Icon";
import { btnPrimary, btnSecondary, card, field, label } from "@/components/ui/styles";
import { SUPPORTED_RAG_LANGUAGES, getRagLanguageMeta } from "@/lib/rag-languages";
import type { FaqItem, RagSentenceItem, RagSourceType } from "@/lib/contracts";

export interface RagStats {
  total: number;
  faqCount: number;
  websiteUiCount: number;
  radarSearchCount: number;
  aiRemixCount: number;
  customizeAiCount: number;
  multilingualCount: number;
  pendingCount?: number;
}

export interface RagViewerCapabilities {
  canSubmitTranslations: boolean;
  canApproveTranslations: boolean;
  canPublishAsFaq: boolean;
  canSyncCorpus: boolean;
  viewerRole: string;
  viewerEmail: string;
}

/** Response of POST /api/rag/translate (single text mode). */
interface TranslateResult {
  translatedText: string;
  translatedQuestion?: string;
  languageName: string;
}

/** Corpus returned by /api/rag (GET, and after every write). */
interface CorpusResult {
  item?: RagSentenceItem;
  entries?: RagSentenceItem[];
  stats?: RagStats;
  viewerCapabilities?: RagViewerCapabilities;
}

function normalizeCompareText(s: string): string {
  return s.normalize("NFKC").trim().replace(/\s+/g, " ");
}

const SOURCE_BADGES: Record<RagSourceType, { label: string; style: string }> = {
  FAQ: {
    label: "FAQ Knowledge",
    style: "border-primary/40 bg-primary/15 text-primary",
  },
  WEBSITE_UI: {
    label: "Website Sentence",
    style: "border-secondary/40 bg-secondary/15 text-secondary",
  },
  RADAR_SEARCH: {
    label: "Radar Feed Search (AI)",
    style: "border-emerald-400/40 bg-emerald-500/15 text-emerald-300",
  },
  AI_REMIX: {
    label: "AI Creative Remix",
    style: "border-amber-400/40 bg-amber-500/15 text-amber-300",
  },
  CUSTOMIZE_AI: {
    label: "Customize AI Strategy",
    style: "border-purple-400/40 bg-purple-500/15 text-purple-300",
  },
};

/**
 * Per-FAQ RAG Sentences & Multilingual Google Translate -> Human Edit -> Add to RAG Drawer.
 * Rendered inside each expanded FAQ card.
 */
export function PerFaqRagDrawer({
  faq,
  ragEntriesForFaq,
  onRagUpdated,
}: {
  faq: FaqItem;
  ragEntriesForFaq: RagSentenceItem[];
  onRagUpdated: () => void;
}) {
  const { role } = useSession();
  const canSeeIndividualSentences = role === "superadmin" || role === "admin";
  const isApproverRole = role === "superadmin" || role === "admin" || role === "ad_agent";
  const [targetLang, setTargetLang] = useState<string>("id");
  const [translating, setTranslating] = useState(false);
  const [savingToRag, setSavingToRag] = useState(false);
  const [hasTranslatedDraft, setHasTranslatedDraft] = useState(false);
  const [draftQuestion, setDraftQuestion] = useState("");
  const [draftAnswer, setDraftAnswer] = useState("");
  const [lastAutoTranslatedQuestion, setLastAutoTranslatedQuestion] = useState("");
  const [lastAutoTranslatedAnswer, setLastAutoTranslatedAnswer] = useState("");
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const atomicSentences = useMemo(
    () =>
      ragEntriesForFaq.filter(
        (e) => e.languageCode === "en" && e.ragId.startsWith("rag_faq_sent_")
      ),
    [ragEntriesForFaq]
  );

  const multilingualEntries = useMemo(
    () => ragEntriesForFaq.filter((e) => e.languageCode !== "en" || e.ragId.startsWith("rag_faq_human_")),
    [ragEntriesForFaq]
  );

  const isSameAsSource =
    targetLang.toLowerCase() !== "en" &&
    Boolean(faq.answer.trim()) &&
    normalizeCompareText(draftAnswer) === normalizeCompareText(faq.answer);
  const isUneditedAuto =
    Boolean(lastAutoTranslatedAnswer) &&
    normalizeCompareText(draftAnswer) === normalizeCompareText(lastAutoTranslatedAnswer);
  const isHumanEditValid =
    Boolean(draftAnswer.trim()) && !isSameAsSource && !isUneditedAuto;

  async function handleGoogleTranslateFaq() {
    setTranslating(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const data = await apiFetch<TranslateResult>("/api/rag/translate", {
        method: "POST",
        body: {
          question: faq.question,
          text: faq.answer,
          sourceLang: "en",
          targetLang,
        },
      });
      setDraftQuestion(data.translatedQuestion || faq.question);
      setDraftAnswer(data.translatedText || "");
      setLastAutoTranslatedQuestion(data.translatedQuestion || "");
      setLastAutoTranslatedAnswer(data.translatedText || "");
      setHasTranslatedDraft(true);
      setStatusMsg(
        `Instant Google Translate completed (${data.languageName}). You must edit the translated text below before submitting — raw auto-translations cannot be stored in the RAG.`
      );
    } catch (err) {
      setErrorMsg(errorMessage(err));
    } finally {
      setTranslating(false);
    }
  }

  async function handleSaveHumanEditedFaqToRag() {
    if (!isHumanEditValid) {
      setErrorMsg(
        "Registered users must edit the translation — do not submit raw auto-translation or unchanged source text.",
      );
      return;
    }
    setSavingToRag(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const langMeta = getRagLanguageMeta(targetLang);
      const data = await apiFetch<CorpusResult>("/api/rag", {
        method: "POST",
        body: {
          action: "ADD_ENTRY",
          sourceType: "FAQ",
          sourceId: faq.faqId,
          section: `FAQ: ${faq.category} (${langMeta.name})`,
          originalText: faq.answer,
          question: faq.question,
          answer: faq.answer,
          languageCode: langMeta.code,
          languageName: `${langMeta.name} (${langMeta.nativeName})`,
          translatedQuestion: draftQuestion.trim() || faq.question,
          translatedText: draftAnswer.trim(),
          autoTranslatedQuestion: lastAutoTranslatedQuestion || undefined,
          autoTranslatedText: lastAutoTranslatedAnswer || undefined,
          actingRole: role,
        },
      });
      if (data.item?.approvalStatus === "pending") {
        setStatusMsg(
          `Human-edited ${langMeta.name} translation submitted for approval by Main Admin, Super Admin, or Ad Agent.`
        );
      } else {
        setStatusMsg(
          `Human-edited ${langMeta.name} (${langMeta.nativeName}) FAQ added & approved in RAG corpus!`
        );
      }
      setLastAutoTranslatedAnswer("");
      setLastAutoTranslatedQuestion("");
      setHasTranslatedDraft(false);
      onRagUpdated();
    } catch (err) {
      setErrorMsg(errorMessage(err));
    } finally {
      setSavingToRag(false);
    }
  }

  function handleCopy(text: string, id: string) {
    navigator.clipboard?.writeText(text).catch(() => null);
    setCopiedId(id);
    setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 2000);
  }

  return (
    <div
      data-agent-id={`faq-rag-drawer-${faq.faqId}`}
      data-testid={`faq-rag-drawer-${faq.faqId}`}
      className="mt-3 rounded-xl border border-primary/25 bg-surface-container-lowest/90 p-3.5 space-y-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] pb-2.5">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded bg-primary/20 px-2 py-0.5 font-mono text-[10px] font-bold text-primary uppercase">
            <Icon name="layers" className="size-3" />
            {canSeeIndividualSentences ? "FAQ RAG & Multilingual Translator" : "FAQ Multilingual Translator"}
          </span>
          <span className="font-mono text-[11px] text-on-surface-variant">
            {canSeeIndividualSentences
              ? `${atomicSentences.length} Indexed Sentences • ${multilingualEntries.length} Multilingual RAG Translations`
              : `${multilingualEntries.length} Multilingual FAQ Translations`}
          </span>
        </div>
      </div>

      {/* 1. Indexed RAG Sentences for this FAQ (Strictly hidden from Supporter role) */}
      {canSeeIndividualSentences && atomicSentences.length > 0 && (
        <div className="space-y-1.5">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
            Indexed RAG Sentences for this FAQ:
          </p>
          <div className="grid grid-cols-1 gap-1.5">
            {atomicSentences.map((sent, idx) => (
              <div
                key={sent.ragId}
                className="flex items-start justify-between gap-2 rounded-lg border border-white/[0.06] bg-surface-container px-2.5 py-1.5 text-xs text-on-surface"
              >
                <div className="min-w-0 flex-1">
                  <span className="mr-1.5 font-mono text-[10px] text-primary">
                    [S{idx + 1}]
                  </span>
                  <span>{sent.originalText}</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopy(sent.originalText, sent.ragId)}
                  data-agent-id={`copy-faq-rag-sent-${sent.ragId}`}
                  data-testid={`copy-faq-rag-sent-${sent.ragId}`}
                  aria-label="Copy RAG sentence"
                  className="shrink-0 rounded border border-white/10 bg-surface-container-high px-2 py-0.5 font-mono text-[10px] text-on-surface-variant hover:text-on-surface transition"
                >
                  {copiedId === sent.ragId ? "Copied ✓" : "Copy"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2. Existing Multilingual Human-Verified RAG Translations for this FAQ */}
      {multilingualEntries.length > 0 && (
        <div className="space-y-1.5">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-secondary">
            Human-Verified Multilingual RAG Entries ({multilingualEntries.length}):
          </p>
          <div className="space-y-1.5">
            {multilingualEntries.map((entry) => {
              const langMeta = getRagLanguageMeta(entry.languageCode);
              return (
                <div
                  key={entry.ragId}
                  className="rounded-lg border border-secondary/30 bg-secondary/10 p-2.5 text-xs space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono text-[10px] font-bold text-secondary">
                        {langMeta.flag} {entry.languageName}
                      </span>
                      {entry.approvalStatus === "pending" ? (
                        <span className="rounded bg-amber-500/20 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-amber-300">
                          ⏳ Pending Approval
                        </span>
                      ) : (
                        <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-emerald-300">
                          Human Verified ✓
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        handleCopy(
                          `${entry.translatedQuestion ? `${entry.translatedQuestion}\n` : ""}${entry.translatedText}`,
                          entry.ragId
                        )
                      }
                      data-agent-id={`copy-faq-multilingual-${entry.ragId}`}
                      data-testid={`copy-faq-multilingual-${entry.ragId}`}
                      aria-label="Copy translated FAQ"
                      className="rounded border border-secondary/30 bg-secondary/20 px-2 py-0.5 font-mono text-[10px] text-secondary hover:bg-secondary/30 transition"
                    >
                      {copiedId === entry.ragId ? "Copied ✓" : "Copy Text"}
                    </button>
                  </div>
                  {entry.translatedQuestion && (
                    <p className="font-semibold text-on-surface">{entry.translatedQuestion}</p>
                  )}
                  <p className="text-on-surface-variant whitespace-pre-line">{entry.translatedText}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 3. Google Translate -> Human Edit -> Add to RAG */}
      <div className="rounded-xl border border-white/10 bg-surface-container p-3 space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Icon name="globe" className="size-4 text-primary" />
            <span className="text-xs font-semibold text-on-surface">
              Translate FAQ via Google Translator → Human Edit → Add to RAG
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={targetLang}
              onChange={(e) => {
                setTargetLang(e.target.value);
                setLastAutoTranslatedAnswer("");
                setLastAutoTranslatedQuestion("");
              }}
              data-agent-id={`faq-translate-lang-${faq.faqId}`}
              data-testid={`faq-translate-lang-${faq.faqId}`}
              aria-label="Select target language for Google Translate"
              className="rounded-lg border border-white/15 bg-surface-container-lowest px-2.5 py-1.5 font-mono text-xs text-on-surface focus:border-primary focus:outline-none"
            >
              <optgroup label="ASEAN Languages (All Member States & Timor-Leste)">
                {SUPPORTED_RAG_LANGUAGES.filter((l) => l.isAsean).map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.flag} {lang.name} ({lang.nativeName})
                  </option>
                ))}
              </optgroup>
              <optgroup label="Additional Global Languages">
                {SUPPORTED_RAG_LANGUAGES.filter((l) => !l.isAsean).map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.flag} {lang.name} ({lang.nativeName})
                  </option>
                ))}
              </optgroup>
            </select>
            <button
              type="button"
              onClick={handleGoogleTranslateFaq}
              disabled={translating}
              data-agent-id={`faq-google-translate-btn-${faq.faqId}`}
              data-testid={`faq-google-translate-btn-${faq.faqId}`}
              aria-label="Instant Google Translate FAQ"
              className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/20 px-3 py-1.5 font-mono text-xs font-bold text-primary hover:bg-primary/30 disabled:opacity-50 transition"
            >
              <Icon name={translating ? "refresh" : "globe"} className={`size-3.5 ${translating ? "animate-spin" : ""}`} />
              <span>{translating ? "Google Translating…" : "1. Instant Google Translate"}</span>
            </button>
            {!hasTranslatedDraft && (
              <button
                type="button"
                onClick={() => {
                  setDraftQuestion("");
                  setDraftAnswer("");
                  setLastAutoTranslatedQuestion("");
                  setLastAutoTranslatedAnswer("");
                  setHasTranslatedDraft(true);
                }}
                data-agent-id={`faq-manual-write-btn-${faq.faqId}`}
                data-testid={`faq-manual-write-btn-${faq.faqId}`}
                aria-label="Write translation manually"
                className="rounded-lg border border-white/10 bg-surface-container-high px-2.5 py-1.5 font-mono text-[11px] text-on-surface-variant hover:text-on-surface transition"
              >
                Or Write Manually
              </button>
            )}
          </div>
        </div>

        {statusMsg && (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
            {statusMsg}
          </div>
        )}
        {errorMsg && (
          <div className="rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-xs text-error">
            {errorMsg}
          </div>
        )}

        {hasTranslatedDraft && (
          <div className="space-y-2.5 pt-1 border-t border-white/[0.06]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[11px] font-bold text-amber-300 uppercase">
                  Step 2: Mandatory Human Edit Before Adding to RAG
                </span>
                {isUneditedAuto ? (
                  <span className="rounded bg-amber-500/20 border border-amber-500/40 px-2 py-0.5 font-mono text-[10px] font-semibold text-amber-300">
                    Edit Required — Modify auto-translation before saving
                  </span>
                ) : isSameAsSource ? (
                  <span className="rounded bg-amber-500/20 border border-amber-500/40 px-2 py-0.5 font-mono text-[10px] font-semibold text-amber-300">
                    Translate &amp; Edit Required
                  </span>
                ) : isHumanEditValid ? (
                  <span className="rounded bg-emerald-500/20 border border-emerald-500/40 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-300">
                    Human Edited ✓
                  </span>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setHasTranslatedDraft(false)}
                data-agent-id={`faq-close-editor-btn-${faq.faqId}`}
                data-testid={`faq-close-editor-btn-${faq.faqId}`}
                aria-label="Close translation editor"
                className="font-mono text-[11px] text-on-surface-variant hover:text-on-surface"
              >
                Close Editor
              </button>
            </div>
            <div>
              <label className={label}>Translated Question (Human Editable)</label>
              <input
                type="text"
                value={draftQuestion}
                onChange={(e) => setDraftQuestion(e.target.value)}
                data-agent-id={`faq-human-edit-question-${faq.faqId}`}
                data-testid={`faq-human-edit-question-${faq.faqId}`}
                aria-label="Human-edited translated question"
                className={field}
              />
            </div>
            <div>
              <label className={label}>Translated Answer / RAG Content (Human Editable)</label>
              <textarea
                rows={3}
                value={draftAnswer}
                onChange={(e) => setDraftAnswer(e.target.value)}
                placeholder="Write or refine the translated text here..."
                data-agent-id={`faq-human-edit-answer-${faq.faqId}`}
                data-testid={`faq-human-edit-answer-${faq.faqId}`}
                aria-label="Human-edited translated answer"
                className={field}
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              {!isApproverRole && (
                <span className="font-mono text-[10px] text-on-surface-variant">
                  Requires approval by Main Admin, Super Admin, or Ad Agent.
                </span>
              )}
              <button
                type="button"
                onClick={handleSaveHumanEditedFaqToRag}
                disabled={savingToRag || !isHumanEditValid}
                data-agent-id={`faq-add-to-rag-btn-${faq.faqId}`}
                data-testid={`faq-add-to-rag-btn-${faq.faqId}`}
                aria-label="Submit human-edited FAQ translation"
                className={`${btnPrimary} ml-auto`}
              >
                <Icon name="checkCircle" className="size-3.5" />
                <span>
                  {savingToRag
                    ? "Submitting to RAG…"
                    : isApproverRole
                      ? "2. Approve Human Edit & Add to RAG"
                      : "2. Submit Human-Edited Translation"}
                </span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Rendered across all Admin Panels (Super Admin, Main Admin, Ad Agent, Supporter) & FAQ Suite:
 * Purpose 1: Complete list of all sentences used in this website and from AI works (Radar Feed Searches, AI Remixes, Customize Strategies, FAQs).
 * Purpose 2: Allows any registered user (with RBAC permission) to create translations with mandatory Human Edit (pending approval by Main Admin, Super Admin, or Ad Agent).
 */
export function GlobalRagCorpusSection({
  faqs,
  isAdmin = false,
  onFaqPublished,
}: {
  faqs?: FaqItem[];
  isAdmin?: boolean;
  onFaqPublished?: () => void;
}) {
  const { role, user } = useSession();
  const [loadedFaqs, setLoadedFaqs] = useState<FaqItem[]>([]);
  useEffect(() => {
    if (faqs !== undefined) return;
    fetch("/api/faqs", { method: "GET", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (Array.isArray(data?.faqs)) setLoadedFaqs(data.faqs);
      })
      .catch(() => null);
  }, [faqs]);
  const effectiveFaqs = faqs ?? loadedFaqs;

  const [viewerCaps, setViewerCaps] = useState<RagViewerCapabilities | null>(null);
  const isFallbackApprover = role === "superadmin" || role === "admin" || role === "ad_agent";
  const canSubmitTranslations = viewerCaps ? viewerCaps.canSubmitTranslations : true;
  const canApproveTranslations = viewerCaps ? viewerCaps.canApproveTranslations : isFallbackApprover;
  const canPublishAsFaq = viewerCaps
    ? viewerCaps.canPublishAsFaq
    : Boolean(isAdmin && (role === "superadmin" || role === "admin"));
  const canSyncCorpus = viewerCaps
    ? viewerCaps.canSyncCorpus
    : Boolean(isAdmin && (role === "superadmin" || role === "admin"));
  const viewerEmailNorm = (viewerCaps?.viewerEmail || user?.email || "").toLowerCase().trim();

  const [entries, setEntries] = useState<RagSentenceItem[]>([]);
  const [stats, setStats] = useState<RagStats>({
    total: 0,
    faqCount: 0,
    websiteUiCount: 0,
    radarSearchCount: 0,
    aiRemixCount: 0,
    customizeAiCount: 0,
    multilingualCount: 0,
    pendingCount: 0,
  });
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [approvingRagId, setApprovingRagId] = useState<string | null>(null);
  const [ragSearch, setRagSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<string>("ALL");
  const [langFilter, setLangFilter] = useState<string>("ALL");
  const [showAllSentences, setShowAllSentences] = useState(false);

  // Studio State: Google Translate -> Mandatory Human Edit -> Submit / Approve to RAG
  const [selectedTemplateFaqId, setSelectedTemplateFaqId] = useState<string>("");
  const [sourceQuestion, setSourceQuestion] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [sourceCategory, setSourceCategory] = useState("Radar Search");
  const [sourceType, setSourceType] = useState<RagSourceType>("FAQ");
  const [targetLang, setTargetLang] = useState("id");
  const [translating, setTranslating] = useState(false);
  const [lastAutoTranslatedQuestion, setLastAutoTranslatedQuestion] = useState("");
  const [lastAutoTranslatedText, setLastAutoTranslatedText] = useState("");
  const [humanEditedQuestion, setHumanEditedQuestion] = useState("");
  const [humanEditedText, setHumanEditedText] = useState("");
  const [publishAsFaq, setPublishAsFaq] = useState(false);
  const [savingRag, setSavingRag] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Inline Edit & Two-Step Confirm Delete on RAG Sentence Items
  const [editingRagKey, setEditingRagKey] = useState<string | null>(null);
  const [editRagQuestion, setEditRagQuestion] = useState("");
  const [editRagText, setEditRagText] = useState("");
  const [confirmDeleteKey, setConfirmDeleteKey] = useState<string | null>(null);
  const [copiedRagId, setCopiedRagId] = useState<string | null>(null);

  const loadRagCorpus = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<CorpusResult>(
        `/api/rag?actingRole=${encodeURIComponent(role)}`,
        { method: "GET" },
      );
      if (Array.isArray(data.entries)) {
        setEntries(data.entries);
        if (data.stats) setStats(data.stats);
      }
      if (data.viewerCapabilities) {
        setViewerCaps(data.viewerCapabilities);
      }
    } catch (err) {
      console.warn("[GlobalRagCorpusSection] failed to load RAG corpus", err);
    } finally {
      setLoading(false);
    }
  }, [role]);

  useEffect(() => {
    loadRagCorpus();
  }, [loadRagCorpus]);

  const pendingEntries = useMemo(
    () => entries.filter((entry) => entry.approvalStatus === "pending"),
    [entries],
  );

  const isSameAsSource =
    targetLang.toLowerCase() !== "en" &&
    Boolean(sourceText.trim()) &&
    normalizeCompareText(humanEditedText) === normalizeCompareText(sourceText);
  const isUneditedAuto =
    Boolean(lastAutoTranslatedText) &&
    normalizeCompareText(humanEditedText) === normalizeCompareText(lastAutoTranslatedText);
  const isHumanEditValid =
    Boolean(humanEditedText.trim()) && !isSameAsSource && !isUneditedAuto;

  const filteredEntries = useMemo(() => {
    const q = ragSearch.trim().toLowerCase();
    return entries.filter((entry) => {
      if (sourceFilter !== "ALL") {
        if (sourceFilter === "MULTILINGUAL") {
          if (entry.languageCode === "en" || entry.approvalStatus === "pending") return false;
        } else if (sourceFilter === "PENDING") {
          if (entry.approvalStatus !== "pending") return false;
        } else if (entry.sourceType !== sourceFilter) {
          return false;
        }
      }
      if (langFilter !== "ALL" && entry.languageCode.toLowerCase() !== langFilter.toLowerCase()) {
        return false;
      }
      if (!q) return true;
      const hay = `${entry.section} ${entry.question ?? ""} ${entry.translatedQuestion ?? ""} ${entry.originalText} ${entry.translatedText} ${entry.languageName} ${entry.contributorEmail ?? ""} ${entry.keywords.join(" ")}`.toLowerCase();
      return hay.includes(q);
    });
  }, [entries, ragSearch, sourceFilter, langFilter]);

  const visibleEntries = useMemo(
    () => (showAllSentences ? filteredEntries : filteredEntries.slice(0, 20)),
    [filteredEntries, showAllSentences]
  );

  function handleSelectTemplateFaq(faqId: string) {
    setSelectedTemplateFaqId(faqId);
    setLastAutoTranslatedQuestion("");
    setLastAutoTranslatedText("");
    const found = effectiveFaqs.find((f) => f.faqId === faqId);
    if (found) {
      setSourceType("FAQ");
      setSourceQuestion(found.question);
      setSourceText(found.answer);
      setSourceCategory(found.category);
      setHumanEditedQuestion("");
      setHumanEditedText("");
    }
  }

  function handleLoadSentenceIntoTranslator(entry: RagSentenceItem) {
    setSelectedTemplateFaqId(entry.sourceId || "");
    setSourceType(entry.sourceType);
    setSourceQuestion(entry.question || "");
    setSourceText(entry.originalText);
    setSourceCategory(entry.section);
    setLastAutoTranslatedQuestion("");
    setLastAutoTranslatedText("");
    if (entry.languageCode !== "en") {
      setTargetLang(entry.languageCode);
      setHumanEditedQuestion(entry.translatedQuestion || "");
      setHumanEditedText(entry.translatedText || "");
    } else {
      setHumanEditedQuestion("");
      setHumanEditedText("");
    }
    setFeedbackMsg(
      `Loaded "${entry.section}" into the translator below. Click "Instant Google Translate" or write a translation, then edit it before saving.`
    );
  }

  async function handleSyncCorpus() {
    setSyncing(true);
    setErrorMsg(null);
    setFeedbackMsg(null);
    try {
      const data = await apiFetch<CorpusResult>("/api/rag", {
        method: "POST",
        body: { action: "SYNC_CORPUS", actingRole: role },
      });
      if (Array.isArray(data.entries)) setEntries(data.entries);
      if (data.stats) setStats(data.stats);
      if (data.viewerCapabilities) setViewerCaps(data.viewerCapabilities);
      setFeedbackMsg(
        `RAG Synchronized: ${data.stats?.total ?? data.entries?.length ?? 0} total sentences indexed across FAQs, Website UI, Radar Feed Searches, and AI Works.`
      );
    } catch (err) {
      setErrorMsg(errorMessage(err));
    } finally {
      setSyncing(false);
    }
  }

  async function handleRunGoogleTranslate() {
    if (!sourceText.trim()) {
      setErrorMsg("Enter or select an FAQ answer or website sentence to translate first.");
      return;
    }
    setTranslating(true);
    setErrorMsg(null);
    setFeedbackMsg(null);
    try {
      const data = await apiFetch<TranslateResult>("/api/rag/translate", {
        method: "POST",
        body: {
          question: sourceQuestion.trim() || undefined,
          text: sourceText.trim(),
          sourceLang: "en",
          targetLang,
        },
      });
      setLastAutoTranslatedQuestion(data.translatedQuestion || "");
      setLastAutoTranslatedText(data.translatedText || "");
      setHumanEditedQuestion(data.translatedQuestion || sourceQuestion);
      setHumanEditedText(data.translatedText || "");
      setFeedbackMsg(
        `Instant Google Translate (${data.languageName}) complete! You MUST edit the translated text in Step 2 before submitting — raw auto-translations cannot be saved to the RAG.`
      );
    } catch (err) {
      setErrorMsg(errorMessage(err));
    } finally {
      setTranslating(false);
    }
  }

  async function handleAddHumanEditedToRag(e: React.FormEvent) {
    e.preventDefault();
    const finalBody = humanEditedText.trim();
    if (!finalBody) {
      setErrorMsg("Please translate and human-edit the text in Step 2 before submitting.");
      return;
    }
    if (isSameAsSource) {
      setErrorMsg("Translation must differ from the original source text and be human-edited.");
      return;
    }
    if (isUneditedAuto) {
      setErrorMsg(
        "Registered users must edit a translation, not simply use auto translation, for the translation to store in the RAG.",
      );
      return;
    }
    setSavingRag(true);
    setErrorMsg(null);
    setFeedbackMsg(null);
    try {
      const langMeta = getRagLanguageMeta(targetLang);
      const data = await apiFetch<CorpusResult>("/api/rag", {
        method: "POST",
        body: {
          action: "ADD_ENTRY",
          sourceType,
          sourceId: selectedTemplateFaqId || undefined,
          section:
            sourceType === "FAQ"
              ? `FAQ: ${sourceCategory} (${langMeta.name})`
              : `${sourceCategory} (${langMeta.name})`,
          originalText: sourceText.trim() || undefined,
          question: sourceQuestion.trim() || undefined,
          answer: sourceText.trim() || undefined,
          languageCode: langMeta.code,
          languageName: `${langMeta.name} (${langMeta.nativeName})`,
          translatedQuestion: humanEditedQuestion.trim() || sourceQuestion.trim() || undefined,
          translatedText: finalBody,
          autoTranslatedQuestion: lastAutoTranslatedQuestion || undefined,
          autoTranslatedText: lastAutoTranslatedText || undefined,
          category: sourceCategory,
          publishAsFaq: canPublishAsFaq ? publishAsFaq : false,
          actingRole: role,
        },
      });
      if (Array.isArray(data.entries)) setEntries(data.entries);
      if (data.stats) setStats(data.stats);
      if (data.viewerCapabilities) setViewerCaps(data.viewerCapabilities);

      setHumanEditedQuestion("");
      setHumanEditedText("");
      setLastAutoTranslatedQuestion("");
      setLastAutoTranslatedText("");

      if (data.item?.approvalStatus === "pending") {
        setFeedbackMsg(
          `Human-edited ${langMeta.name} (${langMeta.nativeName}) translation submitted for approval. It will be stored in the active RAG once approved by Main Admin, Super Admin, or Ad Agent.`
        );
      } else {
        setFeedbackMsg(
          `Human-edited ${langMeta.name} (${langMeta.nativeName}) entry verified and approved in the RAG corpus!`
        );
      }
      if (publishAsFaq && canPublishAsFaq && canApproveTranslations && onFaqPublished) {
        onFaqPublished();
      }
    } catch (err) {
      setErrorMsg(errorMessage(err));
    } finally {
      setSavingRag(false);
    }
  }

  async function handleApproveRagEntry(entry: RagSentenceItem) {
    setApprovingRagId(entry.ragId);
    setErrorMsg(null);
    setFeedbackMsg(null);
    try {
      const data = await apiFetch<CorpusResult>("/api/rag", {
        method: "PUT",
        body: {
          action: "APPROVE_ENTRY",
          ragId: entry.ragId,
          actingRole: role,
        },
      });
      if (Array.isArray(data.entries)) setEntries(data.entries);
      if (data.stats) setStats(data.stats);
      if (data.viewerCapabilities) setViewerCaps(data.viewerCapabilities);
      setFeedbackMsg(`Approved ${entry.languageName} translation into the active RAG corpus.`);
    } catch (err) {
      setErrorMsg(errorMessage(err));
    } finally {
      setApprovingRagId(null);
    }
  }

  async function handleSaveInlineRagEdit(ragId: string) {
    if (!editRagText.trim()) return;
    setSavingRag(true);
    setErrorMsg(null);
    try {
      const data = await apiFetch<CorpusResult>("/api/rag", {
        method: "PUT",
        body: {
          action: "UPDATE_ENTRY",
          ragId,
          translatedQuestion: editRagQuestion.trim() || undefined,
          translatedText: editRagText.trim(),
          actingRole: role,
        },
      });
      if (Array.isArray(data.entries)) setEntries(data.entries);
      if (data.stats) setStats(data.stats);
      if (data.viewerCapabilities) setViewerCaps(data.viewerCapabilities);
      setEditingRagKey(null);
      setFeedbackMsg(
        canApproveTranslations
          ? "Human-edited RAG sentence updated and approved."
          : "Pending translation updated and kept in approval queue.",
      );
    } catch (err) {
      setErrorMsg(errorMessage(err));
    } finally {
      setSavingRag(false);
    }
  }

  async function handleDeleteRagEntry(ragId: string) {
    setSavingRag(true);
    setErrorMsg(null);
    try {
      const data = await apiFetch<{ entries: RagSentenceItem[]; stats: RagStats; viewerCapabilities?: RagViewerCapabilities }>("/api/rag", {
        method: "DELETE",
        body: { ragId, actingRole: role },
      });
      if (Array.isArray(data.entries)) setEntries(data.entries);
      if (data.stats) setStats(data.stats);
      if (data.viewerCapabilities) setViewerCaps(data.viewerCapabilities);
      setConfirmDeleteKey(null);
      setFeedbackMsg("RAG entry permanently deleted.");
    } catch (err) {
      setErrorMsg(errorMessage(err));
    } finally {
      setSavingRag(false);
    }
  }

  function handleCopyRagSentence(text: string, ragId: string) {
    navigator.clipboard?.writeText(text).catch(() => null);
    setCopiedRagId(ragId);
    setTimeout(() => setCopiedRagId((prev) => (prev === ragId ? null : prev)), 2000);
  }

  return (
    <div
      data-agent-id="global-rag-corpus-section"
      data-testid="global-rag-corpus-section"
      className="mt-6 space-y-6 border-t border-white/10 pt-6"
    >
      {/* Header Banner */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/15 px-2.5 py-0.5 font-mono text-[11px] font-bold text-primary uppercase">
              <Icon name="layers" className="size-3.5" />
              RAG Knowledge &amp; Multilingual Engine
            </span>
            <span className="rounded-md border border-secondary/40 bg-secondary/15 px-2 py-0.5 font-mono text-[11px] font-semibold text-secondary">
              {stats.total} Indexed Sentences
            </span>
            {(stats.pendingCount ?? 0) > 0 && (
              <span className="rounded-md border border-amber-400/40 bg-amber-500/15 px-2 py-0.5 font-mono text-[11px] font-semibold text-amber-300">
                {stats.pendingCount} Pending Approval
              </span>
            )}
          </div>
          <h4 className="mt-1.5 text-title-sm font-bold text-on-surface">
            Website Sentences, AI Works &amp; Multilingual FAQ RAG Studio
          </h4>
          <p className="mt-0.5 text-compact text-on-surface-variant">
            1) Browse Website Sentences, FAQs, and AI Works indexed in the RAG corpus. 2) Registered users may generate translations, must human-edit every translation before submission, and require Main Admin, Super Admin, or Ad Agent approval before storing in the active RAG.
          </p>
        </div>
        {canSyncCorpus && (
          <button
            type="button"
            onClick={handleSyncCorpus}
            disabled={syncing}
            data-agent-id="sync-rag-corpus-btn"
            data-testid="sync-rag-corpus-btn"
            aria-label="Sync live website and AI works into RAG corpus"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-secondary/40 bg-secondary/15 px-3.5 py-2 font-mono text-xs font-bold text-secondary hover:bg-secondary/25 disabled:opacity-50 transition"
          >
            <Icon name="refresh" className={`size-3.5 ${syncing ? "animate-spin" : ""}`} />
            <span>{syncing ? "Syncing Live AI Works…" : "Sync Website & AI Works ⚡"}</span>
          </button>
        )}
      </div>

      {/* RAG Telemetry Summary Cards */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-xl border border-white/[0.08] bg-surface-container p-3">
          <div className="font-mono text-[10px] text-on-surface-variant uppercase">Total RAG Sentences</div>
          <div className="mt-1 font-mono text-lg font-bold text-on-surface">{stats.total}</div>
        </div>
        <div className="rounded-xl border border-primary/25 bg-primary/10 p-3">
          <div className="font-mono text-[10px] text-primary uppercase">FAQ Sentences</div>
          <div className="mt-1 font-mono text-lg font-bold text-primary">{stats.faqCount}</div>
        </div>
        <div className="rounded-xl border border-secondary/25 bg-secondary/10 p-3">
          <div className="font-mono text-[10px] text-secondary uppercase">Website UI Copy</div>
          <div className="mt-1 font-mono text-lg font-bold text-secondary">{stats.websiteUiCount}</div>
        </div>
        <div className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 p-3">
          <div className="font-mono text-[10px] text-emerald-300 uppercase">Radar Feed Searches</div>
          <div className="mt-1 font-mono text-lg font-bold text-emerald-300">{stats.radarSearchCount}</div>
        </div>
        <div className="rounded-xl border border-amber-400/25 bg-amber-500/10 p-3">
          <div className="font-mono text-[10px] text-amber-300 uppercase">AI Remixes &amp; Customize</div>
          <div className="mt-1 font-mono text-lg font-bold text-amber-300">
            {stats.aiRemixCount + stats.customizeAiCount}
          </div>
        </div>
        <div className="rounded-xl border border-purple-400/25 bg-purple-500/10 p-3">
          <div className="font-mono text-[10px] text-purple-300 uppercase">Multilingual RAG</div>
          <div className="mt-1 font-mono text-lg font-bold text-purple-300">{stats.multilingualCount}</div>
        </div>
      </div>

      {feedbackMsg && (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 text-compact text-emerald-300">
          {feedbackMsg}
        </div>
      )}
      {errorMsg && (
        <div className="rounded-xl border border-error/40 bg-error/10 px-4 py-2.5 text-compact text-error">
          {errorMsg}
        </div>
      )}

      {/* PURPOSE 2: MULTILINGUAL FAQ & SENTENCE AUTHORING STUDIO (Google Translate -> Mandatory Human Edit -> Submit / Approve) */}
      {canSubmitTranslations ? (
      <form
        onSubmit={handleAddHumanEditedToRag}
        data-agent-id="multilingual-rag-authoring-form"
        data-testid="multilingual-rag-authoring-form"
        className={`${card} p-5 space-y-4 border border-primary/30`}
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-white/[0.08] pb-3">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg border border-primary/40 bg-primary/20 text-primary">
              <Icon name="globe" className="size-4" />
            </span>
            <div>
              <h5 className="text-body font-bold text-on-surface">
                Multilingual FAQ &amp; Sentence Translator (Google Translator → Mandatory Human Edit → {canApproveTranslations ? "Add to RAG" : "Approval Queue"})
              </h5>
              <p className="text-xs text-on-surface-variant">
                Select any FAQ or website sentence (or write your own), optionally run Instant Google Translate, and human-edit the result. Unedited auto-translations cannot be saved to the RAG.
              </p>
            </div>
          </div>
        </div>

        {/* Step 1: Source FAQ / Sentence & Target Language */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div>
            <label className={label}>1. Load Existing FAQ or Write Custom</label>
            <select
              value={selectedTemplateFaqId}
              onChange={(e) => handleSelectTemplateFaq(e.target.value)}
              data-agent-id="rag-template-faq-select"
              data-testid="rag-template-faq-select"
              aria-label="Select an existing FAQ to translate or write custom"
              className={field}
            >
              <option value="">
                ✍️ Write Custom FAQ / Website Sentence…
              </option>
              {effectiveFaqs.map((f) => (
                <option key={f.faqId} value={f.faqId}>
                  [{f.category}] {f.question}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={label}>2. Target Language (All ASEAN &amp; Global Languages)</label>
            <select
              value={targetLang}
              onChange={(e) => {
                setTargetLang(e.target.value);
                setLastAutoTranslatedQuestion("");
                setLastAutoTranslatedText("");
              }}
              data-agent-id="rag-target-language-select"
              data-testid="rag-target-language-select"
              aria-label="Select target language for Google Translator"
              className={field}
            >
              <optgroup label="ASEAN Languages (All Member States & Timor-Leste)">
                {SUPPORTED_RAG_LANGUAGES.filter((l) => l.isAsean).map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.flag} {lang.name} — {lang.nativeName} ({lang.code})
                  </option>
                ))}
              </optgroup>
              <optgroup label="Additional Global Languages">
                {SUPPORTED_RAG_LANGUAGES.filter((l) => !l.isAsean).map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.flag} {lang.name} — {lang.nativeName} ({lang.code})
                  </option>
                ))}
              </optgroup>
            </select>
          </div>

          <div>
            <label className={label}>3. Category / Section Tag</label>
            <input
              type="text"
              value={sourceCategory}
              onChange={(e) => setSourceCategory(e.target.value)}
              placeholder="e.g. Radar Search, AI Creative Remix"
              data-agent-id="rag-source-category-input"
              data-testid="rag-source-category-input"
              aria-label="Category or section tag"
              className={field}
            />
          </div>
        </div>

        {/* Source Input Fields */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="space-y-2.5 rounded-xl border border-white/[0.08] bg-surface-container-lowest/70 p-3.5">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] font-bold text-primary uppercase">
                Source Question &amp; Text (English or Base Language)
              </span>
              <button
                type="button"
                onClick={handleRunGoogleTranslate}
                disabled={translating || !sourceText.trim()}
                data-agent-id="rag-instant-google-translate-btn"
                data-testid="rag-instant-google-translate-btn"
                aria-label="Run Instant Google Translate"
                className="inline-flex items-center gap-1.5 rounded-lg border border-primary/50 bg-primary/20 px-3 py-1 font-mono text-xs font-bold text-primary hover:bg-primary/30 disabled:opacity-50 transition"
              >
                <Icon
                  name={translating ? "refresh" : "globe"}
                  className={`size-3.5 ${translating ? "animate-spin" : ""}`}
                />
                <span>{translating ? "Translating…" : "Instant Google Translate 🌐"}</span>
              </button>
            </div>
            <div>
              <label className={label}>Source FAQ Question (Optional for Website Sentences)</label>
              <input
                type="text"
                value={sourceQuestion}
                onChange={(e) => {
                  setSourceQuestion(e.target.value);
                  setLastAutoTranslatedQuestion("");
                  setLastAutoTranslatedText("");
                }}
                placeholder="e.g. How do I search for winning competitor ads in my niche?"
                data-agent-id="rag-source-question-input"
                data-testid="rag-source-question-input"
                aria-label="Source FAQ question"
                className={field}
              />
            </div>
            <div>
              <label className={label}>Source Answer / Website or AI Sentence</label>
              <textarea
                rows={4}
                value={sourceText}
                onChange={(e) => {
                  setSourceText(e.target.value);
                  setLastAutoTranslatedQuestion("");
                  setLastAutoTranslatedText("");
                }}
                placeholder="Enter or select an FAQ answer or website sentence, then click 'Instant Google Translate'..."
                data-agent-id="rag-source-text-input"
                data-testid="rag-source-text-input"
                aria-label="Source answer or website sentence"
                className={field}
              />
            </div>
          </div>

          {/* Step 2: Mandatory Human Edit Before Adding to RAG */}
          <div className="space-y-2.5 rounded-xl border border-amber-400/30 bg-amber-500/[0.05] p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-1.5">
              <span className="font-mono text-[11px] font-bold text-amber-300 uppercase">
                Mandatory Human Edit (Edit Before Saving)
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                {isUneditedAuto ? (
                  <span
                    data-agent-id="rag-edit-required-badge"
                    className="rounded border border-amber-500/40 bg-amber-500/20 px-2 py-0.5 font-mono text-[10px] font-semibold text-amber-300"
                  >
                    Edit Required — Modify auto-translation
                  </span>
                ) : isSameAsSource ? (
                  <span
                    data-agent-id="rag-translate-required-badge"
                    className="rounded border border-amber-500/40 bg-amber-500/20 px-2 py-0.5 font-mono text-[10px] font-semibold text-amber-300"
                  >
                    Translate &amp; Edit Required
                  </span>
                ) : isHumanEditValid ? (
                  <span
                    data-agent-id="rag-human-edited-badge"
                    className="rounded border border-emerald-500/40 bg-emerald-500/20 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-300"
                  >
                    Human Edited ✓
                  </span>
                ) : null}
                <span className="rounded bg-amber-500/20 px-2 py-0.5 font-mono text-[10px] font-semibold text-amber-300">
                  {getRagLanguageMeta(targetLang).flag} {getRagLanguageMeta(targetLang).name}
                </span>
              </div>
            </div>
            <div>
              <label className={label}>Human-Edited Question ({getRagLanguageMeta(targetLang).nativeName})</label>
              <input
                type="text"
                value={humanEditedQuestion}
                onChange={(e) => setHumanEditedQuestion(e.target.value)}
                placeholder="Google Translate output appears here for human editing..."
                data-agent-id="rag-human-edited-question-input"
                data-testid="rag-human-edited-question-input"
                aria-label="Human-edited translated question"
                className={field}
              />
            </div>
            <div>
              <label className={label}>Human-Edited Answer / RAG Sentence ({getRagLanguageMeta(targetLang).nativeName})</label>
              <textarea
                rows={4}
                value={humanEditedText}
                onChange={(e) => setHumanEditedText(e.target.value)}
                placeholder="Translate and human-edit the text here before submitting..."
                data-agent-id="rag-human-edited-text-input"
                data-testid="rag-human-edited-text-input"
                aria-label="Human-edited translated answer or sentence"
                className={field}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          {canPublishAsFaq ? (
            <label className="flex items-center gap-2 text-xs text-on-surface cursor-pointer">
              <input
                type="checkbox"
                checked={publishAsFaq}
                onChange={(e) => setPublishAsFaq(e.target.checked)}
                data-agent-id="rag-publish-as-faq-checkbox"
                data-testid="rag-publish-as-faq-checkbox"
                aria-label="Also publish as standalone FAQ card"
                className="size-4 rounded border-white/20 bg-surface-container-lowest text-primary"
              />
              <span>Also publish this human-edited translation as a standalone FAQ card in the FAQ list</span>
            </label>
          ) : (
            <span className="font-mono text-[11px] text-on-surface-variant">
              {canApproveTranslations
                ? "Your role can directly approve human-edited translations into the RAG corpus."
                : "Submitted translations require approval by Main Admin, Super Admin, or Ad Agent before storing in the active RAG."}
            </span>
          )}
          <button
            type="submit"
            disabled={savingRag || !isHumanEditValid}
            data-agent-id="rag-approve-and-add-btn"
            data-testid="rag-approve-and-add-btn"
            aria-label={
              canApproveTranslations
                ? "Approve Human Edit and Add to RAG"
                : "Submit Human-Edited Translation for Approval"
            }
            className={btnPrimary}
          >
            <Icon name="checkCircle" className="size-4" />
            <span>
              {savingRag
                ? "Submitting to RAG…"
                : canApproveTranslations
                  ? "Approve Human Edit & Add to RAG ✓"
                  : "Submit Human-Edited Translation for Approval"}
            </span>
          </button>
        </div>
      </form>
      ) : (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
          Your role does not currently have the <strong>Create RAG Translations</strong> permission enabled in the RBAC Matrix.
        </div>
      )}

      {/* PENDING APPROVAL QUEUE (Shown when pending entries exist) */}
      {pendingEntries.length > 0 && (
        <div
          data-agent-id="rag-pending-approval-queue"
          data-testid="rag-pending-approval-queue"
          className={`${card} p-5 space-y-3 border border-amber-400/40 bg-amber-500/[0.04]`}
        >
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h5 className="text-body font-bold text-amber-300 flex items-center gap-2">
                <span>⏳ Pending RAG Translations Awaiting Approval ({pendingEntries.length})</span>
              </h5>
              <p className="text-xs text-on-surface-variant">
                {canApproveTranslations
                  ? "Review human-edited translations submitted by registered users. Approve into the active RAG, human-edit, or reject."
                  : "Your human-edited submissions below await approval by Main Admin, Super Admin, or an Ad Agent before entering the active RAG."}
              </p>
            </div>
          </div>

          <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1">
            {pendingEntries.map((entry) => {
              const langMeta = getRagLanguageMeta(entry.languageCode);
              const badge = SOURCE_BADGES[entry.sourceType] ?? SOURCE_BADGES.WEBSITE_UI;
              const editKey = `queue:${entry.ragId}`;
              const isEditingThis = editingRagKey === editKey;
              const deleteKey = `queue:${entry.ragId}`;
              const isBusyApproving = approvingRagId === entry.ragId;
              return (
                <div
                  key={deleteKey}
                  data-agent-id={`rag-pending-entry-${entry.ragId}`}
                  data-testid={`rag-pending-entry-${entry.ragId}`}
                  className="rounded-xl border border-amber-400/30 bg-surface-container p-3 space-y-2"
                >
                  {isEditingThis ? (
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[11px] font-bold text-amber-300 uppercase">
                          Human Edit Pending Translation ({langMeta.flag} {entry.languageName})
                        </span>
                      </div>
                      {(entry.question || entry.translatedQuestion) && (
                        <input
                          type="text"
                          value={editRagQuestion}
                          onChange={(e) => setEditRagQuestion(e.target.value)}
                          placeholder="Question..."
                          data-agent-id={`rag-queue-edit-question-${entry.ragId}`}
                          data-testid={`rag-queue-edit-question-${entry.ragId}`}
                          aria-label="Edit pending translated question"
                          className={field}
                        />
                      )}
                      <textarea
                        rows={3}
                        value={editRagText}
                        onChange={(e) => setEditRagText(e.target.value)}
                        data-agent-id={`rag-queue-edit-text-${entry.ragId}`}
                        data-testid={`rag-queue-edit-text-${entry.ragId}`}
                        aria-label="Edit pending translated text"
                        className={field}
                      />
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingRagKey(null)}
                          data-agent-id={`rag-queue-cancel-edit-${entry.ragId}`}
                          data-testid={`rag-queue-cancel-edit-${entry.ragId}`}
                          aria-label="Cancel editing pending translation"
                          className={btnSecondary}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSaveInlineRagEdit(entry.ragId)}
                          disabled={savingRag}
                          data-agent-id={`rag-queue-save-edit-${entry.ragId}`}
                          data-testid={`rag-queue-save-edit-${entry.ragId}`}
                          aria-label="Save edited pending translation"
                          className={btnPrimary}
                        >
                          {canApproveTranslations ? "Save & Approve to RAG" : "Save Pending Edit"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className={`rounded border px-2 py-0.5 font-mono text-[10px] font-bold uppercase ${badge.style}`}>
                            {badge.label}
                          </span>
                          <span className="rounded border border-white/10 bg-surface-container-high px-2 py-0.5 font-mono text-[10px] text-on-surface">
                            {langMeta.flag} {entry.languageName}
                          </span>
                          <span className="rounded bg-amber-500/20 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-amber-300">
                            ⏳ Pending Approval
                          </span>
                          {entry.contributorEmail && entry.contributorEmail !== "system@adradarhq.com" && (
                            <span className="font-mono text-[10px] text-on-surface-variant">
                              by {entry.contributorEmail}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {canApproveTranslations && (
                            <button
                              type="button"
                              onClick={() => handleApproveRagEntry(entry)}
                              disabled={isBusyApproving}
                              data-agent-id={`rag-approve-entry-${entry.ragId}`}
                              data-testid={`rag-approve-entry-${entry.ragId}`}
                              aria-label="Approve pending translation into RAG corpus"
                              className="inline-flex items-center gap-1 rounded border border-emerald-500/50 bg-emerald-500/20 px-2.5 py-1 font-mono text-[10px] font-bold text-emerald-300 hover:bg-emerald-500/30 disabled:opacity-50 transition"
                            >
                              <Icon name="checkCircle" className="size-3" />
                              <span>{isBusyApproving ? "Approving…" : "Approve for RAG ✓"}</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setEditingRagKey(editKey);
                              setEditRagQuestion(entry.translatedQuestion || entry.question || "");
                              setEditRagText(entry.translatedText || entry.originalText);
                            }}
                            data-agent-id={`rag-queue-edit-${entry.ragId}`}
                            data-testid={`rag-queue-edit-${entry.ragId}`}
                            aria-label="Human edit pending translation"
                            className="inline-flex items-center gap-1 rounded border border-white/10 bg-surface-container-high px-2 py-1 font-mono text-[10px] text-on-surface-variant hover:text-on-surface transition"
                          >
                            <Icon name="pencil" className="size-3" />
                            <span>Human Edit</span>
                          </button>
                          {confirmDeleteKey === deleteKey ? (
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleDeleteRagEntry(entry.ragId)}
                                disabled={savingRag}
                                data-agent-id={`rag-queue-confirm-delete-${entry.ragId}`}
                                data-testid={`rag-queue-confirm-delete-${entry.ragId}`}
                                aria-label="Confirm delete pending translation"
                                className="rounded bg-error px-2 py-1 font-mono text-[10px] font-bold text-white hover:bg-error/90 transition"
                              >
                                Confirm Delete
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteKey(null)}
                                data-agent-id={`rag-queue-cancel-delete-${entry.ragId}`}
                                data-testid={`rag-queue-cancel-delete-${entry.ragId}`}
                                aria-label="Cancel delete pending translation"
                                className="rounded bg-surface-container-highest px-1.5 py-1 font-mono text-[10px] text-on-surface-variant"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteKey(deleteKey)}
                              data-agent-id={`rag-queue-delete-${entry.ragId}`}
                              data-testid={`rag-queue-delete-${entry.ragId}`}
                              aria-label={canApproveTranslations ? "Reject and delete translation" : "Delete pending translation"}
                              className="inline-flex items-center gap-1 rounded border border-error/30 bg-error/10 px-2 py-1 font-mono text-[10px] text-error hover:bg-error/20 transition"
                            >
                              <Icon name="trash" className="size-3" />
                              <span>{canApproveTranslations ? "Reject" : "Delete"}</span>
                            </button>
                          )}
                        </div>
                      </div>
                      {entry.translatedQuestion && (
                        <p className="text-xs font-semibold text-on-surface">
                          Q: {entry.translatedQuestion}
                        </p>
                      )}
                      <p className="text-xs leading-relaxed text-on-surface-variant whitespace-pre-line">
                        {entry.translatedText}
                      </p>
                      {entry.originalText && entry.originalText !== entry.translatedText && (
                        <p className="text-[11px] font-mono text-outline">
                          Original (EN): {entry.originalText}
                        </p>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* PURPOSE 1: COMPLETE LIST OF ALL SENTENCES IN THIS WEBSITE & AI WORKS */}
      <div className={`${card} p-5 space-y-4`}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h5 className="text-body font-bold text-on-surface">
              Complete RAG Sentence Index (Website UI, FAQs, Radar Feed Searches &amp; AI Works)
            </h5>
            <p className="text-xs text-on-surface-variant">
              Search, filter, copy, or load any website or AI sentence into the Google Translator + Mandatory Human Editor above.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={langFilter}
              onChange={(e) => setLangFilter(e.target.value)}
              data-agent-id="rag-corpus-lang-filter"
              data-testid="rag-corpus-lang-filter"
              aria-label="Filter RAG corpus by language"
              className="rounded-lg border border-white/15 bg-surface-container-lowest px-2.5 py-1.5 font-mono text-xs text-on-surface focus:border-primary focus:outline-none"
            >
              <option value="ALL">🌐 All Languages</option>
              {SUPPORTED_RAG_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.flag} {l.name} ({l.code})
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setShowAllSentences((v) => !v)}
              data-agent-id="rag-toggle-show-all-btn"
              data-testid="rag-toggle-show-all-btn"
              aria-label={showAllSentences ? "Show compact top 20 sentences" : "Show all filtered sentences"}
              className={btnSecondary}
            >
              {showAllSentences
                ? "Show Compact (Top 20)"
                : `Show All (${filteredEntries.length}) Sentences`}
            </button>
          </div>
        </div>

        {/* Search Bar & Source Filter Pills */}
        <div className="space-y-2.5">
          <div className="relative">
            <Icon
              name="search"
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-on-surface-variant"
            />
            <input
              type="search"
              value={ragSearch}
              onChange={(e) => setRagSearch(e.target.value)}
              placeholder="Search all website sentences, FAQ sentences, Radar Feed Searches, AI Remixes, or translations..."
              data-agent-id="rag-corpus-search-input"
              data-testid="rag-corpus-search-input"
              aria-label="Search RAG sentence corpus"
              className={`${field} pl-9`}
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: "ALL", label: `All Sentences (${stats.total})` },
                { id: "FAQ", label: `FAQs (${stats.faqCount})` },
                { id: "WEBSITE_UI", label: `Website Sentences (${stats.websiteUiCount})` },
                { id: "RADAR_SEARCH", label: `Radar Feed Searches (${stats.radarSearchCount})` },
                { id: "AI_REMIX", label: `AI Creative Remixes (${stats.aiRemixCount})` },
                { id: "CUSTOMIZE_AI", label: `Customize AI Works (${stats.customizeAiCount})` },
                { id: "MULTILINGUAL", label: `Multilingual RAG (${stats.multilingualCount})` },
                { id: "PENDING", label: `Pending Approval (${stats.pendingCount ?? 0})` },
              ] as const
            ).map((pill) => {
              const active = sourceFilter === pill.id;
              return (
                <button
                  key={pill.id}
                  type="button"
                  onClick={() => setSourceFilter(pill.id)}
                  data-agent-id={`rag-filter-${pill.id.toLowerCase()}`}
                  data-testid={`rag-filter-${pill.id.toLowerCase()}`}
                  aria-pressed={active}
                  aria-label={`Filter by ${pill.label}`}
                  className={`rounded-full px-3 py-1 font-mono text-[11px] font-semibold transition ${
                    active
                      ? "bg-primary text-on-primary shadow-sm"
                      : "border border-white/10 bg-surface-container-low text-on-surface-variant hover:border-white/20 hover:text-on-surface"
                  }`}
                >
                  {pill.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* RAG Sentences List */}
        {loading ? (
          <div className="flex h-28 items-center justify-center text-on-surface-variant">
            <Icon name="refresh" className="size-5 animate-spin text-primary" />
          </div>
        ) : visibleEntries.length === 0 ? (
          <div className="rounded-xl border border-white/[0.06] bg-surface-container-low p-6 text-center text-compact text-on-surface-variant">
            No RAG sentences match your current filter.
          </div>
        ) : (
          <div className="max-h-[420px] overflow-y-auto space-y-2 pr-1">
            {visibleEntries.map((entry) => {
              const badge = SOURCE_BADGES[entry.sourceType] ?? SOURCE_BADGES.WEBSITE_UI;
              const langMeta = getRagLanguageMeta(entry.languageCode);
              const editKey = `list:${entry.ragId}`;
              const isEditingThis = editingRagKey === editKey;
              const isPending = entry.approvalStatus === "pending";
              const isOwnPending =
                isPending &&
                (!entry.contributorEmail || entry.contributorEmail.toLowerCase() === viewerEmailNorm);
              const canEditRow = canApproveTranslations || isOwnPending;
              const canDeleteRow =
                entry.ragId.startsWith("rag_") &&
                (canApproveTranslations || isOwnPending);
              const deleteKey = `list:${entry.ragId}`;

              return (
                <div
                  key={entry.ragId}
                  data-agent-id={`rag-entry-${entry.ragId}`}
                  data-testid={`rag-entry-${entry.ragId}`}
                  className="rounded-xl border border-white/[0.08] bg-surface-container-low p-3 transition hover:border-white/15"
                >
                  {isEditingThis ? (
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[11px] font-bold text-amber-300 uppercase">
                          Human Edit RAG Sentence ({langMeta.flag} {entry.languageName})
                        </span>
                      </div>
                      {(entry.question || entry.translatedQuestion) && (
                        <input
                          type="text"
                          value={editRagQuestion}
                          onChange={(e) => setEditRagQuestion(e.target.value)}
                          placeholder="Question..."
                          data-agent-id={`rag-edit-question-${entry.ragId}`}
                          data-testid={`rag-edit-question-${entry.ragId}`}
                          aria-label="Edit RAG translated question"
                          className={field}
                        />
                      )}
                      <textarea
                        rows={3}
                        value={editRagText}
                        onChange={(e) => setEditRagText(e.target.value)}
                        data-agent-id={`rag-edit-text-${entry.ragId}`}
                        data-testid={`rag-edit-text-${entry.ragId}`}
                        aria-label="Edit RAG translated sentence"
                        className={field}
                      />
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingRagKey(null)}
                          data-agent-id={`rag-cancel-edit-${entry.ragId}`}
                          data-testid={`rag-cancel-edit-${entry.ragId}`}
                          aria-label="Cancel editing RAG sentence"
                          className={btnSecondary}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSaveInlineRagEdit(entry.ragId)}
                          disabled={savingRag}
                          data-agent-id={`rag-save-edit-${entry.ragId}`}
                          data-testid={`rag-save-edit-${entry.ragId}`}
                          aria-label="Save human-edited RAG sentence"
                          className={btnPrimary}
                        >
                          Save Human Edit to RAG
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={`rounded border px-2 py-0.5 font-mono text-[10px] font-bold uppercase ${badge.style}`}
                          >
                            {badge.label}
                          </span>
                          <span className="rounded border border-white/10 bg-surface-container px-2 py-0.5 font-mono text-[10px] text-on-surface">
                            {langMeta.flag} {entry.languageName}
                          </span>
                          <span className="font-mono text-[11px] text-on-surface-variant">
                            {entry.section}
                          </span>
                          {isPending ? (
                            <span className="rounded bg-amber-500/15 px-1.5 py-0.5 font-mono text-[10px] text-amber-300">
                              ⏳ Pending Approval
                            </span>
                          ) : (
                            entry.isHumanVerified && (
                              <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[10px] text-emerald-300">
                                RAG Verified ✓
                              </span>
                            )
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                          {canApproveTranslations && isPending && (
                            <button
                              type="button"
                              onClick={() => handleApproveRagEntry(entry)}
                              disabled={approvingRagId === entry.ragId}
                              data-agent-id={`rag-approve-row-${entry.ragId}`}
                              data-testid={`rag-approve-row-${entry.ragId}`}
                              aria-label="Approve pending translation into RAG corpus"
                              className="inline-flex items-center gap-1 rounded border border-emerald-500/40 bg-emerald-500/20 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-300 hover:bg-emerald-500/30 disabled:opacity-50 transition"
                            >
                              <Icon name="checkCircle" className="size-3" />
                              <span>{approvingRagId === entry.ragId ? "Approving…" : "Approve ✓"}</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => handleLoadSentenceIntoTranslator(entry)}
                            data-agent-id={`rag-translate-entry-${entry.ragId}`}
                            data-testid={`rag-translate-entry-${entry.ragId}`}
                            aria-label="Load sentence into Google Translator"
                            className="inline-flex items-center gap-1 rounded border border-primary/30 bg-primary/15 px-2 py-0.5 font-mono text-[10px] font-semibold text-primary hover:bg-primary/25 transition"
                          >
                            <Icon name="globe" className="size-3" />
                            <span>Translate 🌐</span>
                          </button>

                          {canEditRow && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingRagKey(editKey);
                                setEditRagQuestion(entry.translatedQuestion || entry.question || "");
                                setEditRagText(entry.translatedText || entry.originalText);
                              }}
                              data-agent-id={`rag-human-edit-entry-${entry.ragId}`}
                              data-testid={`rag-human-edit-entry-${entry.ragId}`}
                              aria-label="Human edit RAG sentence"
                              className="inline-flex items-center gap-1 rounded border border-white/10 bg-surface-container px-2 py-0.5 font-mono text-[10px] text-on-surface-variant hover:text-on-surface transition"
                            >
                              <Icon name="pencil" className="size-3" />
                              <span>Human Edit</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() =>
                              handleCopyRagSentence(
                                `${entry.translatedQuestion ? `${entry.translatedQuestion}\n` : ""}${entry.translatedText}`,
                                entry.ragId
                              )
                            }
                            data-agent-id={`rag-copy-entry-${entry.ragId}`}
                            data-testid={`rag-copy-entry-${entry.ragId}`}
                            aria-label="Copy RAG sentence text"
                            className="inline-flex items-center gap-1 rounded border border-white/10 bg-surface-container px-2 py-0.5 font-mono text-[10px] text-on-surface-variant hover:text-on-surface transition"
                          >
                            <Icon name="copy" className="size-3" />
                            <span>{copiedRagId === entry.ragId ? "Copied ✓" : "Copy"}</span>
                          </button>

                          {canDeleteRow && (
                            <>
                              {confirmDeleteKey === deleteKey ? (
                                <div className="inline-flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteRagEntry(entry.ragId)}
                                    disabled={savingRag}
                                    data-agent-id={`rag-confirm-delete-${entry.ragId}`}
                                    data-testid={`rag-confirm-delete-${entry.ragId}`}
                                    aria-label="Confirm delete RAG entry"
                                    className="rounded bg-error px-2 py-0.5 font-mono text-[10px] font-bold text-white hover:bg-error/90 transition"
                                  >
                                    Confirm Delete
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteKey(null)}
                                    data-agent-id={`rag-cancel-delete-${entry.ragId}`}
                                    data-testid={`rag-cancel-delete-${entry.ragId}`}
                                    aria-label="Cancel delete RAG entry"
                                    className="rounded bg-surface-container-highest px-1.5 py-0.5 font-mono text-[10px] text-on-surface-variant"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteKey(deleteKey)}
                                  data-agent-id={`rag-delete-${entry.ragId}`}
                                  data-testid={`rag-delete-${entry.ragId}`}
                                  aria-label="Delete RAG entry"
                                  className="rounded p-1 text-error/70 hover:bg-error/20 hover:text-error transition"
                                >
                                  <Icon name="trash" className="size-3" />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </div>

                      {entry.translatedQuestion && (
                        <p className="text-xs font-semibold text-on-surface">
                          Q: {entry.translatedQuestion}
                        </p>
                      )}
                      <p className="text-xs leading-relaxed text-on-surface-variant whitespace-pre-line">
                        {entry.translatedText}
                      </p>
                      {entry.languageCode !== "en" && entry.originalText !== entry.translatedText && (
                        <p className="text-[11px] font-mono text-outline">
                          Original (EN): {entry.originalText}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
