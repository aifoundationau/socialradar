"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch, errorMessage } from "@/lib/api-client";
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
  const [targetLang, setTargetLang] = useState<string>("es");
  const [translating, setTranslating] = useState(false);
  const [savingToRag, setSavingToRag] = useState(false);
  const [hasTranslatedDraft, setHasTranslatedDraft] = useState(false);
  const [draftQuestion, setDraftQuestion] = useState("");
  const [draftAnswer, setDraftAnswer] = useState("");
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

  async function handleGoogleTranslateFaq() {
    setTranslating(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const res = await fetch("/api/rag/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: faq.question,
          text: faq.answer,
          sourceLang: "en",
          targetLang,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message ?? "Google Translate failed");
      }
      setDraftQuestion(data.translatedQuestion || faq.question);
      setDraftAnswer(data.translatedText || faq.answer);
      setHasTranslatedDraft(true);
      setStatusMsg(
        `Instant Google Translate completed (${data.languageName}). Please human-edit below before adding to RAG.`
      );
    } catch (err) {
      setErrorMsg(errorMessage(err));
    } finally {
      setTranslating(false);
    }
  }

  async function handleSaveHumanEditedFaqToRag() {
    if (!draftAnswer.trim()) return;
    setSavingToRag(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const langMeta = getRagLanguageMeta(targetLang);
      const res = await fetch("/api/rag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message ?? "Failed to add human-edited FAQ to RAG");
      }
      setStatusMsg(
        `Human-edited ${langMeta.name} (${langMeta.nativeName}) FAQ added to RAG corpus!`
      );
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
            FAQ RAG & Multilingual Translator
          </span>
          <span className="font-mono text-[11px] text-on-surface-variant">
            {atomicSentences.length} Indexed Sentences • {multilingualEntries.length} Multilingual RAG Translations
          </span>
        </div>
      </div>

      {/* 1. Indexed RAG Sentences for this FAQ */}
      {atomicSentences.length > 0 && (
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
                    <span className="font-mono text-[10px] font-bold text-secondary">
                      {langMeta.flag} {entry.languageName} • Human Verified ✓
                    </span>
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
              onChange={(e) => setTargetLang(e.target.value)}
              data-agent-id={`faq-translate-lang-${faq.faqId}`}
              data-testid={`faq-translate-lang-${faq.faqId}`}
              aria-label="Select target language for Google Translate"
              className="rounded-lg border border-white/15 bg-surface-container-lowest px-2.5 py-1.5 font-mono text-xs text-on-surface focus:border-primary focus:outline-none"
            >
              {SUPPORTED_RAG_LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.flag} {lang.name} ({lang.nativeName})
                </option>
              ))}
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
                  setDraftQuestion(faq.question);
                  setDraftAnswer(faq.answer);
                  setHasTranslatedDraft(true);
                }}
                data-agent-id={`faq-manual-write-btn-${faq.faqId}`}
                data-testid={`faq-manual-write-btn-${faq.faqId}`}
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
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] font-bold text-amber-300 uppercase">
                Step 2: Human Edit & Review Before Adding to RAG
              </span>
              <button
                type="button"
                onClick={() => setHasTranslatedDraft(false)}
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
                className={field}
              />
            </div>
            <div>
              <label className={label}>Translated Answer / RAG Content (Human Editable)</label>
              <textarea
                rows={3}
                value={draftAnswer}
                onChange={(e) => setDraftAnswer(e.target.value)}
                data-agent-id={`faq-human-edit-answer-${faq.faqId}`}
                data-testid={`faq-human-edit-answer-${faq.faqId}`}
                className={field}
              />
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={handleSaveHumanEditedFaqToRag}
                disabled={savingToRag || !draftAnswer.trim()}
                data-agent-id={`faq-add-to-rag-btn-${faq.faqId}`}
                data-testid={`faq-add-to-rag-btn-${faq.faqId}`}
                className={btnPrimary}
              >
                <Icon name="checkCircle" className="size-3.5" />
                <span>{savingToRag ? "Adding to RAG…" : "2. Approve Human Edit & Add to RAG"}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Rendered UNDER ALL FAQs:
 * Purpose 1: Complete list of all sentences used in this website and from all AI works (Radar Feed Searches, AI Remixes, Customize Strategies, FAQs).
 * Purpose 2: Allows all users to write/translate FAQs & sentences into multiple languages via Google Translator -> Human Edit -> Add to RAG.
 */
export function GlobalRagCorpusSection({
  faqs,
  isAdmin = false,
  onFaqPublished,
}: {
  faqs: FaqItem[];
  isAdmin?: boolean;
  onFaqPublished?: () => void;
}) {
  const [entries, setEntries] = useState<RagSentenceItem[]>([]);
  const [stats, setStats] = useState<RagStats>({
    total: 0,
    faqCount: 0,
    websiteUiCount: 0,
    radarSearchCount: 0,
    aiRemixCount: 0,
    customizeAiCount: 0,
    multilingualCount: 0,
  });
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [ragSearch, setRagSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<string>("ALL");
  const [langFilter, setLangFilter] = useState<string>("ALL");
  const [showAllSentences, setShowAllSentences] = useState(false);

  // Studio State: Google Translate -> Human Edit -> Add to RAG
  const [selectedTemplateFaqId, setSelectedTemplateFaqId] = useState<string>("");
  const [sourceQuestion, setSourceQuestion] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [sourceCategory, setSourceCategory] = useState("Radar Search");
  const [sourceType, setSourceType] = useState<RagSourceType>("FAQ");
  const [targetLang, setTargetLang] = useState("es");
  const [translating, setTranslating] = useState(false);
  const [humanEditedQuestion, setHumanEditedQuestion] = useState("");
  const [humanEditedText, setHumanEditedText] = useState("");
  const [publishAsFaq, setPublishAsFaq] = useState(false);
  const [savingRag, setSavingRag] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Inline Edit & Two-Step Confirm Delete on RAG Sentence Items
  const [editingRagId, setEditingRagId] = useState<string | null>(null);
  const [editRagQuestion, setEditRagQuestion] = useState("");
  const [editRagText, setEditRagText] = useState("");
  const [confirmDeleteRagId, setConfirmDeleteRagId] = useState<string | null>(null);
  const [copiedRagId, setCopiedRagId] = useState<string | null>(null);

  const loadRagCorpus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/rag", { method: "GET", cache: "no-store" });
      const data = await res.json();
      if (res.ok && Array.isArray(data.entries)) {
        setEntries(data.entries);
        if (data.stats) setStats(data.stats);
      }
    } catch (err) {
      console.warn("[GlobalRagCorpusSection] failed to load RAG corpus", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRagCorpus();
  }, [loadRagCorpus]);

  const filteredEntries = useMemo(() => {
    const q = ragSearch.trim().toLowerCase();
    return entries.filter((entry) => {
      if (sourceFilter !== "ALL") {
        if (sourceFilter === "MULTILINGUAL") {
          if (entry.languageCode === "en") return false;
        } else if (entry.sourceType !== sourceFilter) {
          return false;
        }
      }
      if (langFilter !== "ALL" && entry.languageCode.toLowerCase() !== langFilter.toLowerCase()) {
        return false;
      }
      if (!q) return true;
      const hay = `${entry.section} ${entry.question ?? ""} ${entry.translatedQuestion ?? ""} ${entry.originalText} ${entry.translatedText} ${entry.languageName} ${entry.keywords.join(" ")}`.toLowerCase();
      return hay.includes(q);
    });
  }, [entries, ragSearch, sourceFilter, langFilter]);

  const visibleEntries = useMemo(
    () => (showAllSentences ? filteredEntries : filteredEntries.slice(0, 20)),
    [filteredEntries, showAllSentences]
  );

  function handleSelectTemplateFaq(faqId: string) {
    setSelectedTemplateFaqId(faqId);
    const found = faqs.find((f) => f.faqId === faqId);
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
    setHumanEditedQuestion(entry.translatedQuestion || entry.question || "");
    setHumanEditedText(entry.translatedText || entry.originalText);
    setFeedbackMsg(
      `Loaded "${entry.section}" into the Multilingual Google Translator & Human Edit studio below.`
    );
  }

  async function handleSyncCorpus() {
    setSyncing(true);
    setErrorMsg(null);
    setFeedbackMsg(null);
    try {
      const res = await fetch("/api/rag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "SYNC_CORPUS" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? "Sync failed");
      if (Array.isArray(data.entries)) setEntries(data.entries);
      if (data.stats) setStats(data.stats);
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
      const res = await fetch("/api/rag/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: sourceQuestion.trim() || undefined,
          text: sourceText.trim(),
          sourceLang: "en",
          targetLang,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message ?? "Google Translate request failed");
      }
      setHumanEditedQuestion(data.translatedQuestion || sourceQuestion);
      setHumanEditedText(data.translatedText || sourceText);
      setFeedbackMsg(
        `Instant Google Translate (${data.languageName}) complete! Review and human-edit the text in Step 2 below before clicking "Approve Human Edit & Add to RAG".`
      );
    } catch (err) {
      setErrorMsg(errorMessage(err));
    } finally {
      setTranslating(false);
    }
  }

  async function handleAddHumanEditedToRag(e: React.FormEvent) {
    e.preventDefault();
    const finalBody = humanEditedText.trim() || sourceText.trim();
    if (!finalBody) {
      setErrorMsg("Please translate or enter the human-edited text before adding to RAG.");
      return;
    }
    setSavingRag(true);
    setErrorMsg(null);
    setFeedbackMsg(null);
    try {
      const langMeta = getRagLanguageMeta(targetLang);
      const res = await fetch("/api/rag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "ADD_ENTRY",
          sourceType,
          sourceId: selectedTemplateFaqId || undefined,
          section:
            sourceType === "FAQ"
              ? `FAQ: ${sourceCategory} (${langMeta.name})`
              : `${sourceCategory} (${langMeta.name})`,
          originalText: sourceText.trim() || finalBody,
          question: sourceQuestion.trim() || undefined,
          answer: sourceText.trim() || finalBody,
          languageCode: langMeta.code,
          languageName: `${langMeta.name} (${langMeta.nativeName})`,
          translatedQuestion: humanEditedQuestion.trim() || sourceQuestion.trim() || undefined,
          translatedText: finalBody,
          category: sourceCategory,
          publishAsFaq,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message ?? "Failed to save human-edited entry to RAG");
      }
      if (Array.isArray(data.entries)) setEntries(data.entries);
      if (data.stats) setStats(data.stats);
      setFeedbackMsg(
        `Human-edited ${langMeta.name} (${langMeta.nativeName}) entry verified and added to the RAG corpus!`
      );
      if (publishAsFaq && onFaqPublished) {
        onFaqPublished();
      }
    } catch (err) {
      setErrorMsg(errorMessage(err));
    } finally {
      setSavingRag(false);
    }
  }

  async function handleSaveInlineRagEdit(ragId: string) {
    if (!editRagText.trim()) return;
    setSavingRag(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/rag", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ragId,
          translatedQuestion: editRagQuestion.trim() || undefined,
          translatedText: editRagText.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? "Failed to update RAG entry");
      if (Array.isArray(data.entries)) setEntries(data.entries);
      if (data.stats) setStats(data.stats);
      setEditingRagId(null);
      setFeedbackMsg("Human-edited RAG sentence updated and re-indexed.");
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
      const data = await apiFetch<{ entries: RagSentenceItem[]; stats: RagStats }>("/api/rag", {
        method: "DELETE",
        body: { ragId },
      });
      if (Array.isArray(data.entries)) setEntries(data.entries);
      if (data.stats) setStats(data.stats);
      setConfirmDeleteRagId(null);
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
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/15 px-2.5 py-0.5 font-mono text-[11px] font-bold text-primary uppercase">
              <Icon name="layers" className="size-3.5" />
              RAG Knowledge & Multilingual Engine
            </span>
            <span className="rounded-md border border-secondary/40 bg-secondary/15 px-2 py-0.5 font-mono text-[11px] font-semibold text-secondary">
              {stats.total} Indexed Sentences
            </span>
          </div>
          <h4 className="mt-1.5 text-title-sm font-bold text-on-surface">
            Website Sentences, AI Works & Multilingual FAQ RAG Studio
          </h4>
          <p className="mt-0.5 text-compact text-on-surface-variant">
            1) Full RAG index of every FAQ, every sentence used across this website, and all AI works (Radar Feed Searches, AI Creative Remixes, Customize Strategies).{" "}
            2) Write or translate FAQs into 22 languages using Google Translator with mandatory Human Edit before adding to RAG.
          </p>
        </div>
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
          <div className="font-mono text-[10px] text-amber-300 uppercase">AI Remixes & Customize</div>
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

      {/* PURPOSE 2: MULTILINGUAL FAQ & SENTENCE AUTHORING STUDIO (Google Translate -> Human Edit -> Add to RAG) */}
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
                Multilingual FAQ & Sentence Translator (Google Translator → Human Edit → Add to RAG)
              </h5>
              <p className="text-xs text-on-surface-variant">
                Select any FAQ or website sentence (or write your own FAQ), click Instant Google Translate, then human-edit before adding to the RAG corpus.
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
              <option value="">✍️ Write Custom FAQ / Website Sentence…</option>
              {faqs.map((f) => (
                <option key={f.faqId} value={f.faqId}>
                  [{f.category}] {f.question}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={label}>2. Target Language (Google Translator)</label>
            <select
              value={targetLang}
              onChange={(e) => setTargetLang(e.target.value)}
              data-agent-id="rag-target-language-select"
              data-testid="rag-target-language-select"
              aria-label="Select target language for Google Translator"
              className={field}
            >
              {SUPPORTED_RAG_LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.flag} {lang.name} — {lang.nativeName} ({lang.code})
                </option>
              ))}
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
              className={field}
            />
          </div>
        </div>

        {/* Source Input Fields */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="space-y-2.5 rounded-xl border border-white/[0.08] bg-surface-container-lowest/70 p-3.5">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] font-bold text-primary uppercase">
                Source Question & Text (English or Base Language)
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
                onChange={(e) => setSourceQuestion(e.target.value)}
                placeholder="e.g. How do I search for winning competitor ads in my niche?"
                data-agent-id="rag-source-question-input"
                data-testid="rag-source-question-input"
                className={field}
              />
            </div>
            <div>
              <label className={label}>Source Answer / Website or AI Sentence</label>
              <textarea
                rows={4}
                value={sourceText}
                onChange={(e) => setSourceText(e.target.value)}
                placeholder="Enter or select an FAQ answer or website sentence, then click 'Instant Google Translate'..."
                data-agent-id="rag-source-text-input"
                data-testid="rag-source-text-input"
                className={field}
              />
            </div>
          </div>

          {/* Step 2: Human Edit Before Adding to RAG */}
          <div className="space-y-2.5 rounded-xl border border-amber-400/30 bg-amber-500/[0.05] p-3.5">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] font-bold text-amber-300 uppercase">
                Human Edit & Review (Edit Before Adding to RAG)
              </span>
              <span className="rounded bg-amber-500/20 px-2 py-0.5 font-mono text-[10px] font-semibold text-amber-300">
                {getRagLanguageMeta(targetLang).flag} {getRagLanguageMeta(targetLang).name}
              </span>
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
                className={field}
              />
            </div>
            <div>
              <label className={label}>Human-Edited Answer / RAG Sentence ({getRagLanguageMeta(targetLang).nativeName})</label>
              <textarea
                rows={4}
                value={humanEditedText}
                onChange={(e) => setHumanEditedText(e.target.value)}
                placeholder="Review and human-edit the Google translated text here before adding to the RAG corpus..."
                data-agent-id="rag-human-edited-text-input"
                data-testid="rag-human-edited-text-input"
                className={field}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <label className="flex items-center gap-2 text-xs text-on-surface cursor-pointer">
            <input
              type="checkbox"
              checked={publishAsFaq}
              onChange={(e) => setPublishAsFaq(e.target.checked)}
              data-agent-id="rag-publish-as-faq-checkbox"
              data-testid="rag-publish-as-faq-checkbox"
              className="size-4 rounded border-white/20 bg-surface-container-lowest text-primary"
            />
            <span>Also publish this human-edited translation as a standalone FAQ card in the FAQ list</span>
          </label>
          <button
            type="submit"
            disabled={savingRag || (!humanEditedText.trim() && !sourceText.trim())}
            data-agent-id="rag-approve-and-add-btn"
            data-testid="rag-approve-and-add-btn"
            aria-label="Approve Human Edit and Add to RAG"
            className={btnPrimary}
          >
            <Icon name="checkCircle" className="size-4" />
            <span>{savingRag ? "Saving to RAG…" : "Approve Human Edit & Add to RAG ✓"}</span>
          </button>
        </div>
      </form>

      {/* PURPOSE 1: COMPLETE LIST OF ALL SENTENCES IN THIS WEBSITE & FROM ALL AI WORKS */}
      <div className={`${card} p-5 space-y-4`}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h5 className="text-body font-bold text-on-surface">
              Complete RAG Sentence Index (Website UI, FAQs, Radar Feed Searches & AI Works)
            </h5>
            <p className="text-xs text-on-surface-variant">
              Search, filter, copy, or load any website or AI sentence into the Google Translator + Human Editor above.
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
              const isEditingThis = editingRagId === entry.ragId;

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
                          className={field}
                        />
                      )}
                      <textarea
                        rows={3}
                        value={editRagText}
                        onChange={(e) => setEditRagText(e.target.value)}
                        className={field}
                      />
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingRagId(null)}
                          className={btnSecondary}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSaveInlineRagEdit(entry.ragId)}
                          disabled={savingRag}
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
                          {entry.isHumanVerified && (
                            <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[10px] text-emerald-300">
                              RAG Verified ✓
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
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

                          <button
                            type="button"
                            onClick={() => {
                              setEditingRagId(entry.ragId);
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

                          {isAdmin && entry.ragId.startsWith("rag_") && (
                            <>
                              {confirmDeleteRagId === entry.ragId ? (
                                <div className="inline-flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteRagEntry(entry.ragId)}
                                    disabled={savingRag}
                                    data-agent-id={`rag-confirm-delete-${entry.ragId}`}
                                    data-testid={`rag-confirm-delete-${entry.ragId}`}
                                    className="rounded bg-error px-2 py-0.5 font-mono text-[10px] font-bold text-white hover:bg-error/90 transition"
                                  >
                                    Confirm Delete
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteRagId(null)}
                                    className="rounded bg-surface-container-highest px-1.5 py-0.5 font-mono text-[10px] text-on-surface-variant"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteRagId(entry.ragId)}
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
