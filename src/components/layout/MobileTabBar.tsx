"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { NAV, isActivePath } from "./nav";

function Tabs({ pathname }: { pathname: string | null }) {
  return (
    <ul className="grid grid-cols-3">
      {NAV.map(({ href, short, icon }) => {
        const active = isActivePath(pathname, href);
        return (
          <li key={href}>
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
              <Icon name={icon} className="size-5" />
              {short}
            </Link>
          </li>
        );
      })}
    </ul>
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
