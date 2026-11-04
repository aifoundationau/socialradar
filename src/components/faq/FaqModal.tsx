"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { useSession } from "@/components/auth/SessionProvider";
import { Icon } from "@/components/ui/Icon";
import { btnPrimary, btnSecondary, card, field } from "@/components/ui/styles";
import type { FaqItem } from "@/lib/contracts";

const emptySubscribe = () => () => { };
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
  const isSuperAdmin = Boolean(isAdmin && role === "superadmin");
  const [faqs, setFaqs] = useState<FaqItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [expandedId, setExpandedId] = useState<string | null>("faq_how_to_search");

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    }
    if (isOpen) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
      loadFaqs();
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  async function loadFaqs() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/faqs", { method: "GET", cache: "no-store" });
      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        throw new Error(errBody?.error?.message ?? `Request failed (${res.status})`);
      }
      const data = (await res.json()) as { faqs: FaqItem[] };
      if (data?.faqs) {
        setFaqs(data.faqs);
        // Expand the first FAQ by default if nothing selected
        if (data.faqs.length > 0 && !expandedId) {
          setExpandedId(data.faqs[0].faqId);
        }
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const f of faqs) {
      if (f.category) set.add(f.category);
    }
    return ["ALL", ...Array.from(set)];
  }, [faqs]);

  const filteredFaqs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return faqs.filter((f) => {
      if (selectedCategory !== "ALL" && f.category.toUpperCase() !== selectedCategory.toUpperCase()) {
        return false;
      }
      if (!q) return true;
      return (
        f.question.toLowerCase().includes(q) ||
        f.answer.toLowerCase().includes(q) ||
        f.category.toLowerCase().includes(q)
      );
    });
  }, [faqs, selectedCategory, search]);

  if (!isClient || !isOpen) return null;

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

        {/* Search & Category Filter Bar */}
        <div className="border-b border-white/[0.06] bg-surface-container-lowest/60 p-4 space-y-3">
          <div className="relative">
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
                  className={`rounded-full px-3 py-1 font-mono text-xs font-semibold transition-colors ${active
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

        {/* FAQ Accordion List */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
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
                onClick={loadFaqs}
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
                  className={`rounded-xl border transition-all duration-150 ${isExpanded
                    ? "border-primary/40 bg-surface-container-high/90 shadow-md ring-1 ring-primary/20"
                    : "border-white/[0.08] bg-surface-container hover:border-white/15"
                    }`}
                >
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : faq.faqId)}
                    data-agent-id={`faq-toggle-${faq.faqId}`}
                    data-testid={`faq-toggle-${faq.faqId}`}
                    aria-label={faq.question}
                    aria-expanded={isExpanded}
                    aria-controls={`faq-answer-${faq.faqId}`}
                    className="flex w-full items-start justify-between gap-3 p-4 text-left transition-colors"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-primary/20 px-2 py-0.5 font-mono text-[10px] font-bold text-primary uppercase">
                          {faq.category}
                        </span>
                      </div>
                      <h3 className="text-body font-semibold text-on-surface">
                        {faq.question}
                      </h3>
                    </div>
                    <span
                      className={`flex size-7 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-surface-container-highest transition-transform duration-200 ${isExpanded ? "rotate-180 text-primary" : "text-on-surface-variant"
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
                      <p className="whitespace-pre-line">{faq.answer}</p>
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

