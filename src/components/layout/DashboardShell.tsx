"use client";

import type { ReactNode } from "react";
import { useSession } from "@/components/auth/SessionProvider";
import { SignInCard } from "@/components/auth/SignInCard";
import { AmbientGlow } from "@/components/ui/AmbientGlow";
import { alertError } from "@/components/ui/styles";
import { MobileTabBar } from "./MobileTabBar";
import { TopNavWallet } from "./TopNavWallet";

/** Client-side gate: dashboard routes render only for a signed-in user. */
export function DashboardShell({ children }: { children: ReactNode }) {
  const { status, error } = useSession();

  if (status === "loading") {
    return (
      <div className="flex flex-1 items-center justify-center" aria-busy="true">
        <div className="size-6 animate-spin rounded-full border-2 border-white/10 border-t-primary" />
      </div>
    );
  }
  if (status === "signed-out") {
    return (
      <main className="relative flex flex-1 items-center justify-center px-4 py-16">
        <AmbientGlow />
        <SignInCard />
      </main>
    );
  }
  return (
    <>
      <TopNavWallet />
      {/* Bottom padding keeps content clear of the phone tab bar. */}
      <main className="flex-1 pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0">
        {error && (
          <div className="mx-auto w-full max-w-6xl px-3 pt-4 sm:px-6">
            <p className={alertError}>Live data could not load: {error}</p>
          </div>
        )}
        {children}
      </main>
      <MobileTabBar />
    </>
  );
}
