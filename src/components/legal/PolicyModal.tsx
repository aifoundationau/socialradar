"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/ui/Icon";
import { POLICIES, type PolicyDoc } from "@/lib/policies";
import { btnSecondary } from "@/components/ui/styles";

const emptySubscribe = () => () => {};
function useIsClient() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
}

interface PolicyModalProps {
  initialPolicyId?: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export function PolicyModal({ initialPolicyId = "founder", isOpen, onClose }: PolicyModalProps) {
  const isClient = useIsClient();
  const [selectedId, setSelectedId] = useState<string>(initialPolicyId || "founder");

  useEffect(() => {
    if (initialPolicyId && POLICIES[initialPolicyId]) {
      setSelectedId(initialPolicyId);
    }
  }, [initialPolicyId]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    }
    if (isOpen) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !isClient) return null;

  const currentPolicy: PolicyDoc = POLICIES[selectedId] || POLICIES.founder;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="policy-dialog-title"
      data-testid="policy-modal"
      data-agent-id="policy-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/80 backdrop-blur-md transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Centered Modal Container */}
      <div className="relative z-10 flex w-full max-w-3xl max-h-[calc(100dvh-2rem)] sm:max-h-[85vh] flex-col rounded-2xl border border-white/[0.14] bg-surface-container-high shadow-2xl overflow-hidden my-auto">
        {/* Header */}
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-white/[0.08] px-5 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary/20 text-primary">
              <Icon name="shield" className="size-4" />
            </span>
            <div>
              <h2 id="policy-dialog-title" className="text-title-sm font-bold text-on-surface">
                {currentPolicy.title}
              </h2>
              <p className="text-[11px] text-on-surface-variant font-mono">
                AI Foundation Governance & Compliance ({currentPolicy.badge})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            data-testid="close-policy-modal-button"
            className="flex size-9 items-center justify-center rounded-lg text-on-surface-variant transition hover:bg-white/[0.08] hover:text-on-surface"
          >
            <Icon name="x" className="size-5" />
          </button>
        </div>

        {/* Policy Tab Bar (Fluid, Responsive) */}
        <div className="flex shrink-0 border-b border-white/[0.08] bg-surface-container-low px-3 py-2 gap-1.5 overflow-x-auto no-scrollbar">
          {Object.values(POLICIES).map((p) => {
            const isSelected = p.id === selectedId;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedId(p.id)}
                className={`rounded-lg px-3 py-1.5 font-mono text-[11px] font-semibold transition whitespace-nowrap ${
                  isSelected
                    ? "bg-primary text-on-primary shadow-sm"
                    : "text-on-surface-variant hover:bg-white/[0.04] hover:text-on-surface"
                }`}
              >
                {p.title}
              </button>
            );
          })}
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-7 space-y-6 text-on-surface leading-relaxed text-sm">
          <div className="border-b border-white/[0.08] pb-4">
            <span className="inline-block rounded border border-primary/30 bg-primary/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-primary uppercase">
              {currentPolicy.badge}
            </span>
            <h3 className="mt-2 text-title-md font-bold text-on-surface">{currentPolicy.subtitle}</h3>
            <p className="mt-1 font-mono text-[11px] text-on-surface-variant">Last Reviewed: {currentPolicy.lastUpdated}</p>
          </div>

          {currentPolicy.sections.map((section, sIdx) => (
            <div key={sIdx} className="space-y-2.5">
              <h4 className="text-compact font-bold text-on-surface">{section.heading}</h4>
              {section.paragraphs.map((p, pIdx) => (
                <p key={pIdx} className="text-on-surface-variant leading-relaxed text-compact">
                  {p}
                </p>
              ))}
              {section.bullets && (
                <ul className="list-disc pl-5 space-y-1.5 font-sans text-compact text-on-surface-variant">
                  {section.bullets.map((b, bIdx) => (
                    <li key={bIdx}>{b}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex h-14 shrink-0 items-center justify-between border-t border-white/[0.08] px-5 sm:px-6 bg-surface-container-low text-[11px] font-mono text-on-surface-variant">
          <span>Copyright © 2026 AI Foundation · All rights reserved.</span>
          <button
            type="button"
            onClick={onClose}
            className={btnSecondary}
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
