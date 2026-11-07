"use client";

import { useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { Icon } from "@/components/ui/Icon";
import { FaqModal } from "@/components/faq/FaqModal";
import { InstallAppModal } from "@/components/pwa/InstallAppModal";

/**
 * Top Navbar displayed on the front start page (`/`) and on signed-out views,
 * making the Navbar FAQ and App Download available to all visitors whether logged in or not.
 */
export function PublicStartNavbar() {
  const [isFaqOpen, setIsFaqOpen] = useState(false);
  const [isInstallOpen, setIsInstallOpen] = useState(false);

  return (
    <header className="relative mx-auto flex w-full max-w-5xl items-center justify-between px-4 pt-[calc(1rem+env(safe-area-inset-top))] sm:px-6">
      <div className="flex items-center gap-3">
        <Link
          href="/"
          data-agent-id="start-navbar-logo-link"
          data-testid="start-navbar-logo-link"
          aria-label="AdRadarHQ home page"
          className="shrink-0"
        >
          <Logo />
        </Link>
        <span className="hidden rounded-full border border-primary-container/40 bg-primary-container/20 px-2 py-0.5 font-mono text-mono-label text-primary uppercase sm:inline">
          Remix Studio
        </span>
      </div>

      <div className="flex items-center gap-2 sm:gap-2.5">
        {/* Download App / Install PWA Button */}
        <div className="group relative flex items-center">
          <button
            type="button"
            onClick={() => setIsInstallOpen(true)}
            data-agent-id="start-navbar-download-app-btn"
            data-testid="start-navbar-download-app-btn"
            aria-label="Download App for Chrome Laptop, Android, and iPhone"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 sm:px-3 text-body font-semibold text-emerald-300 transition-colors hover:border-emerald-500/50 hover:bg-emerald-500/20 hover:text-emerald-200"
          >
            <Icon name="download" className="size-4 text-emerald-400" />
            <span className="hidden xs:inline sm:inline">Download App</span>
            <span className="inline xs:hidden sm:hidden">App</span>
          </button>
          <div
            role="tooltip"
            data-agent-id="start-navbar-download-tooltip"
            data-testid="start-navbar-download-tooltip"
            className="pointer-events-none absolute top-full right-0 z-50 mt-2.5 w-64 rounded-xl border border-emerald-500/30 bg-surface-container-highest p-3 text-left shadow-2xl opacity-0 scale-95 transition-all duration-150 ease-out group-hover:opacity-100 group-hover:scale-100"
          >
            <div className="flex items-center gap-1.5 font-mono text-[11px] font-semibold text-emerald-300">
              <Icon name="download" className="size-3.5 shrink-0 text-emerald-400" />
              <span>Install AdRadarHQ App</span>
            </div>
            <p className="mt-1 text-[12px] leading-relaxed text-on-surface-variant font-normal">
              Install as a standalone app on Google Chrome (Laptop/Desktop), Android, or iPhone / iPad.
            </p>
          </div>
        </div>

        <div className="group relative flex items-center">
          <button
            type="button"
            onClick={() => setIsFaqOpen(true)}
            data-agent-id="start-navbar-faqs-btn"
            data-testid="start-navbar-faqs-btn"
            aria-label="Open Frequently Asked Questions"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/[0.1] bg-surface-container-low/90 px-3 text-body font-medium text-on-surface-variant transition-colors hover:border-primary/40 hover:bg-surface-container-high hover:text-on-surface"
          >
            <Icon name="helpCircle" className="size-4 text-primary" />
            <span>FAQs</span>
          </button>
          <div
            role="tooltip"
            data-agent-id="start-navbar-faqs-tooltip"
            data-testid="start-navbar-faqs-tooltip"
            className="pointer-events-none absolute top-full right-0 z-50 mt-2.5 w-64 rounded-xl border border-white/[0.14] bg-surface-container-highest p-3 text-left shadow-2xl opacity-0 scale-95 transition-all duration-150 ease-out group-hover:opacity-100 group-hover:scale-100"
          >
            <div className="flex items-center gap-1.5 font-mono text-[11px] font-semibold text-primary">
              <Icon name="helpCircle" className="size-3.5 shrink-0" />
              <span>Frequently Asked Questions</span>
            </div>
            <p className="mt-1 text-[12px] leading-relaxed text-on-surface-variant font-normal">
              Everything you need to know about Radar search filters, token mechanics, AI creative remixes, and platform billing.
            </p>
          </div>
        </div>
        <span className="rounded-full border border-primary-container/40 bg-primary-container/20 px-2 py-0.5 font-mono text-mono-label text-primary uppercase sm:hidden">
          Remix Studio
        </span>
      </div>

      <FaqModal isOpen={isFaqOpen} onClose={() => setIsFaqOpen(false)} />
      <InstallAppModal isOpen={isInstallOpen} onClose={() => setIsInstallOpen(false)} />
    </header>
  );
}

