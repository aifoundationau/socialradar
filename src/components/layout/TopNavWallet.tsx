"use client";

import { Suspense, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOutUser, useSession } from "@/components/auth/SessionProvider";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { Icon } from "@/components/ui/Icon";
import { Logo } from "@/components/ui/Logo";
import { monoLabel } from "@/components/ui/styles";
import { NAV, isActivePath } from "./nav";
import { SuperAdminModal } from "@/components/admin/SuperAdminModal";
import { ContactAdminModal } from "@/components/contact/ContactAdminModal";

function NavItems({ pathname }: { pathname: string | null }) {
  return NAV.map(({ href, label }) => {
    const active = isActivePath(pathname, href);
    return (
      <Link
        key={href}
        href={href}
        aria-current={active ? "page" : undefined}
        className={`rounded px-3 py-1.5 text-body transition-colors ${
          active
            ? "bg-surface-container font-medium text-on-surface shadow-sm ring-1 ring-white/[0.08]"
            : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
        }`}
      >
        {label}
      </Link>
    );
  });
}

// usePathname suspends below dynamic routes; the fallback keeps the shell prerenderable.
function NavLinks() {
  return <NavItems pathname={usePathname()} />;
}

/** Selects the brand that remixes are written for. Shown in the header on large screens, in the account menu otherwise. */
export function BrandSwitcher({ className = "" }: { className?: string }) {
  const { profile, brands } = useSession();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (brands === null || profile === null) {
    return <div className={`h-11 w-full animate-pulse rounded bg-surface-container-high lg:h-9 lg:w-44 ${className}`} />;
  }
  if (brands.length === 0) {
    return (
      <Link
        href="/brands"
        className={`items-center gap-1.5 rounded border border-dashed border-white/15 px-3 py-2 text-body font-medium text-primary hover:border-primary-container ${className || "flex"}`}
      >
        <Icon name="plus" className="size-3.5" />
        Add a brand
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
    <label className={`relative items-center ${className || "flex"}`}>
      <span className="sr-only">Active brand</span>
      <span aria-hidden="true" className="pointer-events-none absolute left-3 size-2 rounded-full bg-tertiary-container" />
      <select
        className="h-11 w-full min-w-0 appearance-none truncate rounded border border-white/[0.08] bg-surface-container-low pr-8 pl-7 text-base font-medium text-on-surface transition hover:border-outline-variant focus:border-primary-container focus:outline-none disabled:opacity-60 lg:h-9 lg:max-w-[13rem] lg:text-compact"
        value={profile.activeBrandId}
        onChange={(e) => select(e.target.value)}
        disabled={pending}
        title={error ?? "Brand used for remixes"}
        aria-invalid={error ? true : undefined}
      >
        {!profile.activeBrandId && <option value="">Choose a brand…</option>}
        {brands.map((b) => (
          <option key={b.brandId} value={b.brandId}>
            {b.brandName}
          </option>
        ))}
      </select>
      <Icon name="chevronsUpDown" className="pointer-events-none absolute right-2.5 size-3.5 text-on-surface-variant" />
    </label>
  );
}

function TokenPill() {
  const { profile } = useSession();
  return (
    <div className="flex h-10 items-center rounded border border-white/[0.08] bg-surface-container-low pr-1 pl-2.5 sm:h-9">
      <Link
        href="/wallet"
        title="Token balance"
        className="flex items-center gap-1.5 font-mono text-mono-code font-medium text-secondary tabular-nums"
      >
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full rounded-full bg-secondary opacity-75 motion-safe:animate-ping" />
          <span className="relative inline-flex size-2 rounded-full bg-secondary" />
        </span>
        <Icon name="zap" className="size-3.5" />
        {profile ? profile.tokenBalance.toLocaleString("en-AU") : "–"}
        <span className="hidden sm:inline">tokens</span>
      </Link>
      <Link
        href="/wallet#packs"
        aria-label="Buy tokens"
        className="ml-2 flex h-8 min-w-8 items-center justify-center gap-0.5 rounded bg-primary px-1.5 font-mono text-mono-label font-semibold text-on-primary transition-colors hover:bg-primary-fixed sm:h-7 sm:px-2"
      >
        <Icon name="plus" className="size-3" />
        <span className="hidden sm:inline">Top-up</span>
      </Link>
    </div>
  );
}

function AccountMenu() {
  const { user } = useSession();
  const menu = useRef<HTMLDivElement>(null);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [isContactOpen, setIsContactOpen] = useState(false);
  const initial = user?.email?.[0]?.toUpperCase();

  return (
    <>
      <button
        type="button"
        popoverTarget="account-menu"
        aria-label="Account menu"
        data-testid="account-menu-button"
        className="flex size-10 items-center justify-center rounded-full bg-primary text-on-primary transition-colors hover:bg-primary-fixed sm:size-8"
      >
        {initial ? <span className="text-body font-semibold">{initial}</span> : <Icon name="user" />}
      </button>
      <div
        id="account-menu"
        ref={menu}
        popover="auto"
        className="inset-auto top-[calc(3.75rem+env(safe-area-inset-top))] right-3 m-0 w-72 max-w-[calc(100vw-1.5rem)] rounded-xl border border-white/[0.12] bg-surface-container-high p-0 text-on-surface shadow-[0_12px_32px_-4px_rgba(0,0,0,0.6)] sm:right-6"
      >
        <div className="border-b border-white/[0.08] px-4 py-3">
          <p className={monoLabel}>Signed in as</p>
          <p className="mt-1 truncate text-body font-medium">{user?.email}</p>
        </div>
        <div className="space-y-2 border-b border-white/[0.08] px-4 py-3 lg:hidden">
          <p className={monoLabel}>Active brand</p>
          <BrandSwitcher />
        </div>
        <div className="border-b border-white/[0.08] p-1.5 space-y-0.5">
          <button
            type="button"
            onClick={() => {
              menu.current?.hidePopover();
              setIsAdminOpen(true);
            }}
            data-testid="open-superadmin-button"
            className="flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 text-body font-medium text-primary transition-colors hover:bg-primary-container/20 sm:min-h-10"
          >
            <Icon name="sliders" className="size-4" />
            Super Admin Panel
          </button>
          <button
            type="button"
            onClick={() => {
              menu.current?.hidePopover();
              setIsContactOpen(true);
            }}
            data-testid="open-contact-button"
            className="flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 text-body font-medium text-on-surface-variant transition-colors hover:bg-white/[0.04] hover:text-on-surface sm:min-h-10"
          >
            <Icon name="sparkles" className="size-4" />
            Message Super Admin
          </button>
        </div>
        <button
          type="button"
          onClick={() => {
            menu.current?.hidePopover();
            signOutUser();
          }}
          className="flex min-h-11 w-full items-center gap-2 px-4 text-body text-on-surface-variant transition-colors hover:bg-white/[0.04] hover:text-on-surface sm:min-h-10"
        >
          <Icon name="logOut" />
          Sign out
        </button>
      </div>

      <SuperAdminModal isOpen={isAdminOpen} onClose={() => setIsAdminOpen(false)} />
      <ContactAdminModal isOpen={isContactOpen} onClose={() => setIsContactOpen(false)} />
    </>
  );
}

/** Sticky app header: live token balance, active-brand switcher and the "Top-up" entry point. */
export function TopNavWallet() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-surface-container-lowest/90 pt-[env(safe-area-inset-top)] backdrop-blur-md">
      <div className="flex h-14 items-center gap-3 px-3 sm:px-6">
        <Link href="/" aria-label="AdRadar home page" className="shrink-0">
          <Logo />
        </Link>
        <span className="hidden rounded-full border border-primary-container/40 bg-primary-container/20 px-2 py-0.5 font-mono text-mono-label uppercase text-primary lg:inline">
          Remix Studio
        </span>
        <nav aria-label="Main" className="ml-2 hidden items-center gap-1 rounded-lg border border-white/[0.06] bg-surface-container-lowest p-0.5 md:flex">
          <Suspense fallback={<NavItems pathname={null} />}>
            <NavLinks />
          </Suspense>
        </nav>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <BrandSwitcher className="hidden lg:flex" />
          <TokenPill />
          <AccountMenu />
        </div>
      </div>
    </header>
  );
}
