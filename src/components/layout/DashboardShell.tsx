"use client";

import type { ReactNode } from "react";
import { useSession } from "@/components/auth/SessionProvider";
import { SignInCard } from "@/components/auth/SignInCard";
import { TopNavWallet } from "./TopNavWallet";
import { alertError } from "@/components/ui/styles";

/** Client-side gate: dashboard routes render only for a signed-in user. */
export function DashboardShell({ children }: { children: ReactNode }) {
  const { status, error } = useSession();

  if (status === "loading") {
    return (
      <div className="flex flex-1 items-center justify-center" aria-busy="true">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-white" />
      </div>
    );
  }
  if (status === "signed-out") {
    return (
      <main className="flex flex-1 items-center justify-center px-4 py-16">
        <SignInCard />
      </main>
    );
  }
  return (
    <>
      <TopNavWallet />
      <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-4 py-8">
        {error && <p className={alertError}>Live data could not load: {error}</p>}
        {children}
      </main>
    </>
  );
}
