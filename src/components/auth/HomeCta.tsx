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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center" data-agent-id="home-cta-signed-in" data-testid="home-cta-signed-in">
        <Link
          href="/radar"
          className={btnPrimary}
          data-agent-id="home-cta-open-radar"
          data-testid="home-cta-open-radar"
          aria-label="Open Ad Radar dashboard"
        >
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
    <div className="space-y-3" data-agent-id="home-cta-signed-out" data-testid="home-cta-signed-out">
      <button
        type="button"
        className={`${btnPrimary} w-full sm:w-auto`}
        onClick={handleSignIn}
        disabled={status === "loading" || pending}
        data-agent-id="home-cta-google-signin"
        data-testid="home-cta-google-signin"
        aria-label="Continue with Google to sign in"
      >
        {pending ? "Opening Google…" : "Continue with Google"}
      </button>
      {error && <p className={`${alertError} max-w-md`} role="alert">{error}</p>}
    </div>
  );
}
