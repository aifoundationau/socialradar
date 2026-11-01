"use client";

import { useEffect, useRef } from "react";
import type { BrandProfile } from "@/lib/contracts";
import { Icon } from "@/components/ui/Icon";
import { BrandForm } from "./BrandForm";

interface BrandSlideOverProps {
  isOpen: boolean;
  onClose: () => void;
  brand?: BrandProfile;
  isFirst?: boolean;
}

export function BrandSlideOver({ isOpen, onClose, brand, isFirst = false }: BrandSlideOverProps) {
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

  if (!isOpen) return null;

  const title = brand
    ? `Edit ${brand.brandName}`
    : isFirst
      ? "Create your first brand"
      : "New brand";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="brand-slideover-title"
      data-testid="brand-slide-over"
      data-agent-id="brand-slide-over"
      className="fixed inset-0 z-50 flex justify-end"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
        data-testid="brand-slideover-backdrop"
      />

      {/* Slide-over panel */}
      <div
        ref={panelRef}
        className="relative z-10 flex h-full w-full max-w-xl flex-col border-l border-white/[0.12] bg-surface-container-high shadow-2xl transition-transform"
      >
        {/* Header */}
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-white/[0.08] px-6">
          <h2 id="brand-slideover-title" className="text-title-sm font-semibold tracking-tight text-on-surface">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            data-testid="close-brand-panel"
            data-agent-id="close-brand-panel-btn"
            className="flex size-9 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-white/[0.08] hover:text-on-surface"
          >
            <Icon name="x" className="size-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <BrandForm
            brand={brand}
            onDone={onClose}
            onCancel={onClose}
          />
        </div>
      </div>
    </div>
  );
}

