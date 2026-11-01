"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { NAV, isActivePath } from "./nav";

function Tabs({ pathname }: { pathname: string | null }) {
  const [isBrandsHelpOpen, setIsBrandsHelpOpen] = useState(false);

  return (
    <div className="relative">
      {/* Collapsible Dropdown Explanation for My Brands */}
      {isBrandsHelpOpen && (
        <div
          role="region"
          aria-label="My Brands Guide"
          data-testid="brands-mobile-explanation"
          className="absolute bottom-full left-2 right-2 mb-2 rounded-2xl border border-white/[0.16] bg-surface-container-high p-4 text-on-surface shadow-[0_-12px_36px_rgba(0,0,0,0.6)] backdrop-blur-xl animate-in fade-in slide-in-from-bottom-2 duration-200"
        >
          <div className="flex items-start justify-between gap-2 border-b border-white/[0.08] pb-2.5">
            <div className="flex items-center gap-1.5 font-semibold text-primary text-compact">
              <Icon name="tag" className="size-4 shrink-0" />
              <span>How to Fill Out My Brands</span>
            </div>
            <button
              type="button"
              onClick={() => setIsBrandsHelpOpen(false)}
              aria-label="Close explanation"
              className="rounded-full p-1 text-on-surface-variant hover:bg-white/[0.08] hover:text-on-surface"
            >
              <Icon name="x" className="size-4" />
            </button>
          </div>

          <div className="mt-2.5 space-y-2 text-[12px] leading-relaxed text-on-surface-variant">
            <div className="rounded-lg bg-primary/10 border border-primary/20 p-2 text-primary font-medium text-[11px]">
              💡 <strong>Create as many Brands as you want!</strong> Add all your clients or products, then choose which one to research & remix.
            </div>

            <p className="text-on-surface font-medium pt-0.5">Quick guide to filling out a brand:</p>
            <ul className="space-y-1.5 pl-0.5">
              <li className="flex items-start gap-1.5">
                <span className="text-primary font-bold">•</span>
                <span><strong>Brand Name & URLs:</strong> Company name, industry, and landing page links.</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-primary font-bold">•</span>
                <span><strong>Core Value Proposition:</strong> What makes your product better than competitors.</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-primary font-bold">•</span>
                <span><strong>Tone of Voice:</strong> Direct-response copy style (Bold, High Conversion, Playful).</span>
              </li>
            </ul>
          </div>

          <div className="mt-3 pt-2.5 border-t border-white/[0.08] flex items-center justify-between">
            <span className="text-[11px] text-on-surface-variant">Active brand powers AI remixes</span>
            <Link
              href="/brands"
              onClick={() => setIsBrandsHelpOpen(false)}
              className="rounded-lg bg-primary px-3 py-1 font-mono text-[11px] font-semibold text-on-primary hover:bg-primary-fixed transition"
            >
              Open Brands →
            </Link>
          </div>

          {/* Pointer Arrow */}
          <div className="absolute -bottom-1.5 left-12 size-3 rotate-45 border-b border-r border-white/[0.16] bg-surface-container-high" />
        </div>
      )}

      <ul className="grid grid-cols-3">
        {NAV.map(({ href, short, icon }) => {
          const active = isActivePath(pathname, href);
          const isBrands = href === "/brands";

          return (
            <li key={href} className="relative">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`relative flex h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${
                  active ? "text-primary" : "text-on-surface-variant"
                }`}
              >
                {active && (
                  <span className="absolute inset-x-8 top-0 h-0.5 rounded-full bg-primary shadow-[0_0_8px_rgba(192,193,255,0.8)]" />
                )}
                <div className="relative flex items-center justify-center">
                  <Icon name={icon} className="size-5" />
                  {isBrands && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setIsBrandsHelpOpen((v) => !v);
                      }}
                      title="Explain My Brands section"
                      aria-label="Explain My Brands section"
                      data-testid="brands-info-toggle-btn"
                      className="absolute -top-1 -right-3 flex size-3.5 items-center justify-center rounded-full border border-primary/40 bg-primary/20 text-[9px] font-bold text-primary transition hover:scale-110 hover:bg-primary hover:text-on-primary"
                    >
                      ?
                    </button>
                  )}
                </div>
                <span>{short}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function TabsForPath() {
  return <Tabs pathname={usePathname()} />;
}

/** Bottom tab navigation on phones (below 768px); the header nav takes over from there. */
export function MobileTabBar() {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.08] bg-surface-container-lowest/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
    >
      <Suspense fallback={<Tabs pathname={null} />}>
        <TabsForPath />
      </Suspense>
    </nav>
  );
}
