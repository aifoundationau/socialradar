"use client";

import { useState } from "react";
import { signInWithGoogle } from "./SessionProvider";
import { errorMessage } from "@/lib/api-client";
import { Logo } from "@/components/ui/Logo";
import { alertError, btnPrimary, card } from "@/components/ui/styles";

export function SignInCard({ title = "Sign in to AdRadar" }: { title?: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignIn() {
    setPending(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={`${card} relative mx-auto w-full max-w-sm space-y-5 text-center shadow-[0_12px_32px_-4px_rgba(0,0,0,0.6)]`}>
      <div className="flex justify-center">
        <Logo />
      </div>
      <div className="space-y-1">
        <h1 className="text-headline-md font-semibold">{title}</h1>
        <p className="text-body text-on-surface-variant">Find ads that have been running for weeks, then remix them for your brand.</p>
      </div>
      <button type="button" className={`${btnPrimary} w-full`} onClick={handleSignIn} disabled={pending}>
        {pending ? "Opening Google…" : "Continue with Google"}
      </button>
      {error && <p className={alertError}>{error}</p>}
    </div>
  );
}
