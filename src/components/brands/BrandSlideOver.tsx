"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import type { BrandProfile } from "@/lib/contracts";
import { Icon } from "@/components/ui/Icon";
import { BrandForm } from "./BrandForm";

const emptySubscribe = () => () => {};
function useIsClient() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
}

interface BrandSlideOverProps {
  isOpen: boolean;
  onClose: () => void;
  brand?: BrandProfile;
  isFirst?: boolean;
}

export function BrandSlideOver({ isOpen, onClose, brand, isFirst = false }: BrandSlideOverProps) {
  const isClient = useIsClient();
  const panelRef = useRef<HTMLDivElement>(null);

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

  const title = brand
    ? `Edit ${brand.brandName}`
    : isFirst
      ? "Create your first brand"
      : "New brand";

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="brand-slideover-title"
      data-testid="brand-slide-over"
      data-agent-id="brand-slide-over"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6 overflow-hidden"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/80 backdrop-blur-md transition-opacity animate-in fade-in"
        onClick={onClose}
        aria-hidden="true"
        data-testid="brand-slideover-backdrop"
      />

      {/* Dead-Centered Modal Container */}
      <div
        ref={panelRef}
        className="relative z-10 flex w-full max-w-4xl lg:max-w-5xl xl:max-w-6xl max-h-[calc(100dvh-1.5rem)] sm:max-h-[92vh] flex-col rounded-2xl border border-white/[0.14] bg-surface-container-high shadow-2xl overflow-hidden my-auto animate-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-white/[0.08] px-4 sm:px-6 bg-surface-container-highest/60">
          <div className="flex items-center gap-2.5">
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary/20 text-primary border border-primary/30">
              <Icon name="sparkles" className="size-4" />
            </span>
            <div>
              <h2 id="brand-slideover-title" className="text-sm sm:text-base font-bold tracking-tight text-on-surface">
                {title}
              </h2>
              <p className="text-[11px] font-mono text-on-surface-variant hidden sm:block">
                Direct-Response Creative Avatar & Persuasion Matrix
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close brand popup"
            data-testid="close-brand-panel"
            data-agent-id="close-brand-panel-btn"
            className="flex size-8 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-white/[0.08] hover:text-on-surface"
          >
            <Icon name="x" className="size-4" />
          </button>
        </div>

        {/* Scrollable Form Body: Super Responsive 2-Column Grid on Laptop/Desktop to Avoid Scrolling */}
        <div className="flex-1 overflow-y-auto px-4 py-3 sm:px-6 sm:py-4">
          <BrandForm
            brand={brand}
            onDone={onClose}
            onCancel={onClose}
          />
        </div>
      </div>
    </div>,
    document.body
  );
}

