"use client";

import { useState } from "react";
import { signInWithGoogle } from "./SessionProvider";
import { errorMessage } from "@/lib/api-client";
import { alertError, btnPrimary, card } from "@/components/ui/styles";

export function SignInCard({ title = "Sign in to Ad Radar" }: { title?: string }) {
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
    <div className={`${card} mx-auto w-full max-w-sm space-y-4 text-center`}>
      <h1 className="text-lg font-semibold">{title}</h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Find ads that have been running for weeks, then remix them for your brand.
      </p>
      <button type="button" className={`${btnPrimary} w-full`} onClick={handleSignIn} disabled={pending}>
        {pending ? "Opening Google…" : "Continue with Google"}
      </button>
      {error && <p className={alertError}>{error}</p>}
    </div>
  );
}
