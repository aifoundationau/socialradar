"use client";

import { useState } from "react";
import Link from "next/link";
import { signInWithGoogle, useSession } from "./SessionProvider";
import { errorMessage } from "@/lib/api-client";
import { Icon } from "@/components/ui/Icon";
import { alertError, btnPrimary } from "@/components/ui/styles";

export function HomeCta() {
  const { status, user } = useSession();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === "signed-in") {
    return (
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Link href="/radar" className={btnPrimary}>
          <Icon name="radar" />
          Open Radar
        </Link>
        <span className="truncate text-body text-on-surface-variant">Signed in as {user?.email}</span>
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
      <button
        type="button"
        className={`${btnPrimary} w-full sm:w-auto`}
        onClick={handleSignIn}
        disabled={status === "loading" || pending}
      >
        {pending ? "Opening Google…" : "Continue with Google"}
      </button>
      {error && <p className={`${alertError} max-w-md`}>{error}</p>}
    </div>
  );
}
