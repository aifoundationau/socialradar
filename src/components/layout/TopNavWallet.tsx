"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOutUser, useSession } from "@/components/auth/SessionProvider";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { btnPrimary } from "@/components/ui/styles";

const NAV = [
  { href: "/brands", label: "Brands" },
  { href: "/wallet", label: "Wallet" },
];

const linkBase = "rounded-full px-3 py-1.5 text-sm font-medium transition-colors";

function NavLinks() {
  const pathname = usePathname();
  return (
    <>
      {NAV.map(({ href, label }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`${linkBase} ${
              active
                ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </>
  );
}

// usePathname suspends below dynamic routes (e.g. /studio/[adId]); this keeps the shell prerenderable.
function NavLinksFallback() {
  return (
    <>
      {NAV.map(({ href, label }) => (
        <Link key={href} href={href} className={`${linkBase} text-zinc-600 dark:text-zinc-400`}>
          {label}
        </Link>
      ))}
    </>
  );
}

function BrandSwitcher() {
  const { profile, brands } = useSession();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (brands === null || profile === null) {
    return <div className="h-9 w-40 animate-pulse rounded-full bg-zinc-100 dark:bg-zinc-800" />;
  }
  if (brands.length === 0) {
    return (
      <Link href="/brands" className="text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400">
        + Add a brand
      </Link>
    );
  }

  async function select(activeBrandId: string) {
    setPending(true);
    setError(null);
    try {
      await apiFetch("/api/brands", { method: "PATCH", body: { activeBrandId } });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="sr-only">Active brand</span>
      <select
        className="h-9 max-w-[11rem] truncate rounded-full border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
        value={profile.activeBrandId}
        onChange={(e) => select(e.target.value)}
        disabled={pending}
        title={error ?? "Brand used by Radar and Studio"}
        aria-invalid={error ? true : undefined}
      >
        {!profile.activeBrandId && <option value="">Choose a brand…</option>}
        {brands.map((b) => (
          <option key={b.brandId} value={b.brandId}>
            {b.brandName}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Live token counter, active-brand switcher and "Buy tokens" entry point. */
export function TopNavWallet() {
  const { user, profile } = useSession();

  return (
    <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/90 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <Link href="/" className="mr-2 font-semibold tracking-tight">
          Ad Radar
        </Link>
        <nav className="flex items-center gap-1" aria-label="Main">
          <Suspense fallback={<NavLinksFallback />}>
            <NavLinks />
          </Suspense>
        </nav>

        <div className="ml-auto flex flex-wrap items-center gap-3">
          <BrandSwitcher />
          <Link
            href="/wallet"
            className="rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-semibold tabular-nums text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
            title="Token balance"
          >
            {profile ? profile.tokenBalance.toLocaleString("en-AU") : "–"} tokens
          </Link>
          <Link href="/wallet#packs" className={btnPrimary}>
            Buy tokens
          </Link>
          <button
            type="button"
            onClick={() => signOutUser()}
            className="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            title={user?.email ?? undefined}
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
