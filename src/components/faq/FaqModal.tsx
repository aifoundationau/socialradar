"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { errorMessage } from "@/lib/api-client";
import { useSession } from "@/components/auth/SessionProvider";
import { Icon } from "@/components/ui/Icon";
import { btnSecondary, card, field } from "@/components/ui/styles";
import { SUPPORTED_RAG_LANGUAGES, getRagLanguageMeta } from "@/lib/rag-languages";
import type { FaqItem, RagSentenceItem } from "@/lib/contracts";

const emptySubscribe = () => () => {};
function useIsClient() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
}

export interface FaqModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenFaqDev?: () => void;
  onOpenSubscription?: () => void;
}

export function FaqModal({ isOpen, onClose, onOpenFaqDev, onOpenSubscription }: FaqModalProps) {
  const isClient = useIsClient();
  const { isAdmin, role } = useSession();
  const [faqs, setFaqs] = useState<FaqItem[]>([]);
  const [ragEntries, setRagEntries] = useState<RagSentenceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  // All FAQs start collapsed; expand when needed
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Language Selection: Default is English ("en").
  // When another language is selected: RAG translation first (primary), Google Translate secondary.
  const [selectedLang, setSelectedLang] = useState<string>("en");
  const [translationMode, setTranslationMode] = useState<"RAG_FIRST" | "GOOGLE_SECONDARY">("RAG_FIRST");
  const [googleTranslating, setGoogleTranslating] = useState(false);
  const [googleTranslationsByLang, setGoogleTranslationsByLang] = useState<
    Record<string, Record<string, { question: string; answer: string }>>
  >({});

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    }
    if (isOpen) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
      setExpandedId(null);
      loadFaqsAndRag();
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  async function loadFaqsAndRag() {
    setLoading(true);
    setError(null);
    try {
      const [faqRes, ragRes] = await Promise.all([
        fetch("/api/faqs", { method: "GET", cache: "no-store" }),
        fetch("/api/rag?sourceType=FAQ", { method: "GET", cache: "no-store" }).catch(() => null),
      ]);
      if (!faqRes.ok) {
        const errBody = await faqRes.json().catch(() => null);
        throw new Error(errBody?.error?.message ?? `Request failed (${faqRes.status})`);
      }
      const faqData = (await faqRes.json()) as { faqs: FaqItem[] };
      if (faqData?.faqs) {
        setFaqs(faqData.faqs);
      }
      if (ragRes && ragRes.ok) {
        const ragData = (await ragRes.json()) as { entries?: RagSentenceItem[] };
        if (Array.isArray(ragData?.entries)) {
          setRagEntries(ragData.entries);
        }
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  // Map of RAG translations for the selected language: faqId -> { question, answer }
  const ragTranslationsForLang = useMemo(() => {
    const map: Record<string, { question: string; answer: string }> = {};
    if (selectedLang.toLowerCase() === "en") return map;

    for (const entry of ragEntries) {
      if (
        entry.sourceType === "FAQ" &&
        entry.sourceId &&
        entry.languageCode.toLowerCase() === selectedLang.toLowerCase() &&
        !entry.ragId.startsWith("rag_faq_sent_")
      ) {
        map[entry.sourceId] = {
          question: entry.translatedQuestion || entry.question || "",
          answer: entry.translatedText || entry.answer || entry.originalText,
        };
      }
    }
    return map;
  }, [ragEntries, selectedLang]);

  // Trigger secondary Google Translate for any FAQs not covered by RAG (or when Google Translate secondary option is active)
  useEffect(() => {
    if (!isOpen || selectedLang === "en" || faqs.length === 0) return;

    const existingGoogleForLang = googleTranslationsByLang[selectedLang] || {};
    const itemsNeeded = faqs.filter((f) => {
      if (existingGoogleForLang[f.faqId]) return false;
      if (translationMode === "RAG_FIRST" && ragTranslationsForLang[f.faqId]) return false;
      return true;
    });

    if (itemsNeeded.length === 0) return;

    let cancelled = false;
    setGoogleTranslating(true);
    fetch("/api/rag/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceLang: "en",
        targetLang: selectedLang,
        items: itemsNeeded.map((f) => ({
          faqId: f.faqId,
          question: f.question,
          answer: f.answer,
        })),
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data?.translations && typeof data.translations === "object") {
          setGoogleTranslationsByLang((prev) => ({
            ...prev,
            [selectedLang]: {
              ...(prev[selectedLang] || {}),
              ...data.translations,
            },
          }));
        }
      })
      .catch(() => null)
      .finally(() => {
        if (!cancelled) setGoogleTranslating(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, selectedLang, translationMode, faqs, ragTranslationsForLang, googleTranslationsByLang]);

  // Resolve displayed Q&A for each FAQ:
  // 1) English default -> original English Q&A
  // 2) RAG_FIRST -> RAG translation if available, otherwise Google Translate secondary fallback
  // 3) GOOGLE_SECONDARY -> Google Translate secondary option
  const localizedFaqs = useMemo(() => {
    const googleForLang = googleTranslationsByLang[selectedLang] || {};
    return faqs.map((faq) => {
      if (selectedLang === "en") {
        return {
          ...faq,
          displayQuestion: faq.question,
          displayAnswer: faq.answer,
          translationSource: "EN" as const,
        };
      }

      const ragMatch = ragTranslationsForLang[faq.faqId];
      const googleMatch = googleForLang[faq.faqId];

      if (translationMode === "RAG_FIRST" && ragMatch && ragMatch.answer) {
        return {
          ...faq,
          displayQuestion: ragMatch.question || faq.question,
          displayAnswer: ragMatch.answer,
          translationSource: "RAG" as const,
        };
      }

      if (googleMatch) {
        return {
          ...faq,
          displayQuestion: googleMatch.question || faq.question,
          displayAnswer: googleMatch.answer || faq.answer,
          translationSource: "GOOGLE" as const,
        };
      }

      if (ragMatch && ragMatch.answer) {
        return {
          ...faq,
          displayQuestion: ragMatch.question || faq.question,
          displayAnswer: ragMatch.answer,
          translationSource: "RAG" as const,
        };
      }

      return {
        ...faq,
        displayQuestion: faq.question,
        displayAnswer: faq.answer,
        translationSource: "PENDING" as const,
      };
    });
  }, [faqs, selectedLang, translationMode, ragTranslationsForLang, googleTranslationsByLang]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const f of faqs) {
      if (f.category) set.add(f.category);
    }
    return ["ALL", ...Array.from(set)];
  }, [faqs]);

  const filteredFaqs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return localizedFaqs.filter((f) => {
      if (selectedCategory !== "ALL" && f.category.toUpperCase() !== selectedCategory.toUpperCase()) {
        return false;
      }
      if (!q) return true;
      return (
        f.displayQuestion.toLowerCase().includes(q) ||
        f.displayAnswer.toLowerCase().includes(q) ||
        f.question.toLowerCase().includes(q) ||
        f.answer.toLowerCase().includes(q) ||
        f.category.toLowerCase().includes(q)
      );
    });
  }, [localizedFaqs, selectedCategory, search]);

  if (!isClient || !isOpen) return null;

  const currentLangMeta = getRagLanguageMeta(selectedLang);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="faq-modal-title"
      data-agent-id="faq-modal"
      data-testid="faq-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/75 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Dialog Content */}
      <div className="relative flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-surface-container-low shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.08] px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl border border-primary-container/40 bg-primary-container/20 text-primary">
              <Icon name="sparkles" className="size-5" />
            </span>
            <div>
              <h2 id="faq-modal-title" className="text-title-lg font-bold text-on-surface">
                Frequently Asked Questions
              </h2>
              <p className="text-compact text-on-surface-variant">
                AdRadarHQ intelligence, ad libraries, brands, and token economy guide
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close FAQ dialog"
            data-agent-id="close-faq-modal-button"
            data-testid="close-faq-modal-button"
            className="flex size-8 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-white/[0.08] hover:text-on-surface"
          >
            <Icon name="x" className="size-5" />
          </button>
        </div>

        {/* Admin & Super Admin: FAQ Development Suite shortcut */}
        {isAdmin && onOpenFaqDev && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-primary/20 bg-primary/10 px-5 py-2.5">
            <div className="flex items-center gap-2">
              <span className="rounded bg-primary/20 px-2 py-0.5 font-mono text-[11px] font-bold text-primary uppercase">
                {role === "superadmin" ? "Super Admin" : "Main Admin"}
              </span>
              <span className="text-body-sm text-on-surface">
                You have administrative authority over knowledge base entries.
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {onOpenSubscription && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenSubscription();
                  }}
                  data-agent-id="open-sub-modal-from-faq"
                  data-testid="open-sub-modal-from-faq"
                  aria-label="Open Monthly Search Subscription details"
                  className="flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/20 px-3 py-1 font-mono text-xs font-semibold text-primary transition-colors hover:bg-primary/30"
                >
                  <Icon name="sparkles" className="size-3.5" />
                  <span>1,000 Searches / mo Subscription</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenFaqDev();
                }}
                data-agent-id="open-faq-dev-shortcut"
                data-testid="open-faq-dev-shortcut"
                className="flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/20 px-3 py-1 font-mono text-xs font-semibold text-primary transition-colors hover:bg-primary/30"
              >
                <Icon name="sliders" className="size-3.5" />
                <span>FAQ Development Suite</span>
              </button>
            </div>
          </div>
        )}

        {/* Search, Language Selector (Default English; RAG Translation First, Google Translate Secondary) & Category Filter Bar */}
        <div className="border-b border-white/[0.06] bg-surface-container-lowest/60 p-4 space-y-3">
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Icon
                name="search"
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-on-surface-variant"
              />
              <input
                type="search"
                placeholder="Search questions or keywords (e.g. Base Radar Search, tokens, remix)..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                data-agent-id="faq-search-input"
                data-testid="faq-search-input"
                className={`${field} pl-9`}
              />
            </div>

            {/* Language Selector (Default: English, All ASEAN Languages + Global Languages) */}
            <div className="flex items-center gap-2 shrink-0">
              <select
                value={selectedLang}
                onChange={(e) => setSelectedLang(e.target.value)}
                data-agent-id="navbar-faq-language-select"
                data-testid="navbar-faq-language-select"
                aria-label="Select FAQ display language"
                className="h-10 rounded-lg border border-white/15 bg-surface-container px-3 font-mono text-xs text-on-surface focus:border-primary focus:outline-none"
              >
                <option value="en">🇦🇺 English (Default)</option>
                <optgroup label="ASEAN Languages (All Member States & Timor-Leste)">
                  {SUPPORTED_RAG_LANGUAGES.filter((l) => l.code !== "en" && l.isAsean).map((lang) => (
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
            </div>
          </div>

          {/* When a non-English language is selected: RAG Translation First (Primary) vs Google Translate (Secondary) */}
          {selectedLang !== "en" && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/25 bg-primary/10 px-3 py-2 text-xs">
              <div className="flex items-center gap-2 text-on-surface">
                <Icon
                  name={googleTranslating ? "refresh" : "globe"}
                  className={`size-3.5 text-primary ${googleTranslating ? "animate-spin" : ""}`}
                />
                <span>
                  Language: <strong>{currentLangMeta.flag} {currentLangMeta.name} ({currentLangMeta.nativeName})</strong>
                  {googleTranslating ? " — Translating…" : ""}
                </span>
              </div>
              <div className="flex items-center gap-1.5 font-mono text-[11px]">
                <button
                  type="button"
                  onClick={() => setTranslationMode("RAG_FIRST")}
                  data-agent-id="navbar-faq-mode-rag-first"
                  data-testid="navbar-faq-mode-rag-first"
                  className={`rounded-md px-2.5 py-1 font-semibold transition ${
                    translationMode === "RAG_FIRST"
                      ? "bg-primary text-on-primary shadow-sm"
                      : "border border-white/10 bg-surface-container text-on-surface-variant hover:text-on-surface"
                  }`}
                >
                  1. RAG Translation First
                </button>
                <button
                  type="button"
                  onClick={() => setTranslationMode("GOOGLE_SECONDARY")}
                  data-agent-id="navbar-faq-mode-google-secondary"
                  data-testid="navbar-faq-mode-google-secondary"
                  className={`rounded-md px-2.5 py-1 font-semibold transition ${
                    translationMode === "GOOGLE_SECONDARY"
                      ? "bg-secondary text-on-secondary shadow-sm"
                      : "border border-white/10 bg-surface-container text-on-surface-variant hover:text-on-surface"
                  }`}
                >
                  2. Google Translate
                </button>
              </div>
            </div>
          )}

          {/* Category Chips */}
          <div className="flex flex-wrap items-center gap-1.5">
            {categories.map((cat) => {
              const active = selectedCategory.toUpperCase() === cat.toUpperCase();
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  data-agent-id={`faq-category-${cat.toLowerCase()}`}
                  data-testid={`faq-category-${cat.toLowerCase()}`}
                  className={`rounded-full px-3 py-1 font-mono text-xs font-semibold transition-colors ${
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
        </div>

        {/* FAQ Accordion List — Q&A Only, All Collapsed on Start */}
        <div className="flex-1 overflow-y-auto p-5 space-y-2.5">
          {loading ? (
            <div className="flex h-40 items-center justify-center text-on-surface-variant">
              <Icon name="refresh" className="size-6 animate-spin text-primary" />
            </div>
          ) : error ? (
            <div className="rounded-xl border border-error/30 bg-error/10 p-4 text-center text-error">
              <p className="font-semibold">Unable to load FAQs</p>
              <p className="text-body-sm mt-1">{error}</p>
              <button
                type="button"
                onClick={loadFaqsAndRag}
                data-agent-id="faq-retry-button"
                data-testid="faq-retry-button"
                aria-label="Retry loading FAQs"
                className={`${btnSecondary} mt-3 text-xs`}
              >
                Retry
              </button>
            </div>
          ) : filteredFaqs.length === 0 ? (
            <div className={`${card} p-8 text-center text-on-surface-variant space-y-2`}>
              <Icon name="radar" className="mx-auto size-8 text-on-surface-variant/60" />
              <p className="font-medium text-on-surface">No matching FAQs found</p>
              <p className="text-body-sm">
                Try searching with different keywords or switch the category filter.
              </p>
            </div>
          ) : (
            filteredFaqs.map((faq) => {
              const isExpanded = expandedId === faq.faqId;
              return (
                <div
                  key={faq.faqId}
                  data-agent-id={`faq-item-${faq.faqId}`}
                  data-testid={`faq-item-${faq.faqId}`}
                  className={`rounded-xl border transition-all duration-150 ${
                    isExpanded
                      ? "border-primary/40 bg-surface-container-high/90 shadow-md ring-1 ring-primary/20"
                      : "border-white/[0.08] bg-surface-container hover:border-white/15"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : faq.faqId)}
                    data-agent-id={`faq-toggle-${faq.faqId}`}
                    data-testid={`faq-toggle-${faq.faqId}`}
                    aria-label={faq.displayQuestion}
                    aria-expanded={isExpanded}
                    aria-controls={`faq-answer-${faq.faqId}`}
                    className="flex w-full items-start justify-between gap-3 p-4 text-left transition-colors"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded bg-primary/20 px-2 py-0.5 font-mono text-[10px] font-bold text-primary uppercase">
                          {faq.category}
                        </span>
                        {selectedLang !== "en" && faq.translationSource === "RAG" && (
                          <span className="rounded bg-emerald-500/20 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-300">
                            RAG Translation ✓
                          </span>
                        )}
                        {selectedLang !== "en" && faq.translationSource === "GOOGLE" && (
                          <span className="rounded bg-secondary/20 px-2 py-0.5 font-mono text-[10px] font-semibold text-secondary">
                            Google Translate
                          </span>
                        )}
                      </div>
                      <h3 className="text-body font-semibold text-on-surface">
                        {faq.displayQuestion}
                      </h3>
                    </div>
                    <span
                      className={`flex size-7 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-surface-container-highest transition-transform duration-200 ${
                        isExpanded ? "rotate-180 text-primary" : "text-on-surface-variant"
                      }`}
                    >
                      <Icon name="chevronDown" className="size-4" />
                    </span>
                  </button>

                  {isExpanded && (
                    <div
                      id={`faq-answer-${faq.faqId}`}
                      className="border-t border-white/[0.06] px-4 pt-3 pb-4 text-body leading-relaxed text-on-surface-variant font-normal"
                    >
                      <p className="whitespace-pre-line">{faq.displayAnswer}</p>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-white/[0.08] bg-surface-container-lowest/80 px-5 py-3">
          <p className="text-compact text-on-surface-variant">
            Have another question? Message the Super Admin from the account menu.
          </p>
          <button
            type="button"
            onClick={onClose}
            data-agent-id="faq-footer-close-button"
            data-testid="faq-footer-close-button"
            aria-label="Close FAQ window"
            className={`${btnSecondary} text-xs`}
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
