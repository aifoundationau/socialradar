"use client";

import { useState } from "react";
import Link from "next/link";
import { signInWithGoogle, useSession } from "./SessionProvider";
import { errorMessage } from "@/lib/api-client";
import { alertError, btnPrimary } from "@/components/ui/styles";

export function HomeCta() {
  const { status, user } = useSession();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === "signed-in") {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/brands" className={btnPrimary}>
          Open dashboard
        </Link>
        <span className="text-sm text-zinc-500">Signed in as {user?.email}</span>
      </div>
    );
  }

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
    <div className="space-y-3">
      <button type="button" className={btnPrimary} onClick={handleSignIn} disabled={status === "loading" || pending}>
        {pending ? "Opening Google…" : "Continue with Google"}
      </button>
      {error && <p className={`${alertError} max-w-md`}>{error}</p>}
    </div>
  );
}
