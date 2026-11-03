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
import { SupporterModal } from "@/components/supporter/SupporterModal";
import { ContactAdminModal } from "@/components/contact/ContactAdminModal";
import { FaqModal } from "@/components/faq/FaqModal";

function NavItems({ pathname }: { pathname: string | null }) {
  return NAV.map(({ href, label, tooltipTitle, tooltipDesc }) => {
    const active = isActivePath(pathname, href);
    return (
      <div key={href} className="group relative flex items-center">
        <Link
          href={href}
          aria-current={active ? "page" : undefined}
          data-agent-id={`nav-link-${href.replace("/", "")}`}
          data-testid={`nav-link-${href.replace("/", "")}`}
          className={`rounded px-3 py-1.5 text-body transition-colors ${
            active
              ? "bg-surface-container font-medium text-on-surface shadow-sm ring-1 ring-white/[0.08]"
              : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
          }`}
        >
          {label}
        </Link>
        {tooltipDesc && (
          <div
            role="tooltip"
            className="pointer-events-none absolute top-full left-1/2 z-50 mt-2.5 w-64 -translate-x-1/2 rounded-xl border border-white/[0.14] bg-surface-container-highest p-3 text-left shadow-2xl opacity-0 scale-95 transition-all duration-150 ease-out group-hover:opacity-100 group-hover:scale-100"
          >
            <div className="flex items-center gap-1.5 font-mono text-[11px] font-semibold text-primary">
              <Icon name="sparkles" className="size-3 shrink-0" />
              <span>{tooltipTitle}</span>
            </div>
            <p className="mt-1 text-[12px] leading-relaxed text-on-surface-variant font-normal">
              {tooltipDesc}
            </p>
            <div className="absolute -top-1 left-1/2 -translate-x-1/2 size-2 rotate-45 border-t border-l border-white/[0.14] bg-surface-container-highest" />
          </div>
        )}
      </div>
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

function AccountMenu({
  onOpenAdmin,
  onOpenSupporter,
  onOpenFaq,
}: {
  onOpenAdmin: (tab?: "CURRENCY" | "PRICING" | "PACKS" | "LEDGER" | "MESSAGES" | "RBAC" | "FAQS" | "DEV") => void;
  onOpenSupporter: () => void;
  onOpenFaq: () => void;
}) {
  const { user, isAdmin, role, isSuperAdmin, actingAsRole, setActingRole, resetRole } = useSession();
  const menu = useRef<HTMLDivElement>(null);
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
          <div className="flex items-center justify-between gap-2">
            <p className={monoLabel}>Signed in as</p>
            <span
              className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider ${
                isAdmin
                  ? "border border-primary/30 bg-primary-container/30 text-primary"
                  : "border border-secondary/30 bg-secondary/15 text-secondary"
              }`}
            >
              {role === "superadmin" ? "Super Admin" : role === "admin" ? "Main Admin" : "Supporter"}
            </span>
          </div>
          <p className="mt-1 truncate text-body font-medium">{user?.email}</p>
        </div>

        {/* Superadmin Role View Switcher: allows Superadmin to act as any role */}
        {isSuperAdmin && (
          <div className="border-b border-white/[0.08] p-3 space-y-2 bg-surface-container-highest/40">
            <div className="flex items-center justify-between">
              <p className={monoLabel}>Act As Role View</p>
              {actingAsRole && actingAsRole !== "superadmin" && (
                <button
                  type="button"
                  onClick={() => resetRole()}
                  className="font-mono text-[10px] text-primary hover:underline"
                >
                  Reset
                </button>
              )}
            </div>
            <div className="grid grid-cols-3 gap-1">
              <button
                type="button"
                onClick={() => setActingRole("superadmin")}
                className={`rounded-lg py-1 px-1 text-center font-mono text-[10px] font-semibold transition ${
                  role === "superadmin"
                    ? "bg-primary text-on-primary shadow-sm ring-1 ring-primary/40"
                    : "border border-white/10 text-on-surface-variant hover:text-on-surface hover:bg-white/[0.04]"
                }`}
                data-testid="act-as-superadmin-button"
              >
                Super Admin
              </button>
              <button
                type="button"
                onClick={() => setActingRole("admin")}
                className={`rounded-lg py-1 px-1 text-center font-mono text-[10px] font-semibold transition ${
                  role === "admin"
                    ? "bg-primary text-on-primary shadow-sm ring-1 ring-primary/40"
                    : "border border-white/10 text-on-surface-variant hover:text-on-surface hover:bg-white/[0.04]"
                }`}
                data-testid="act-as-admin-button"
              >
                Main Admin
              </button>
              <button
                type="button"
                onClick={() => setActingRole("supporter")}
                className={`rounded-lg py-1 px-1 text-center font-mono text-[10px] font-semibold transition ${
                  role === "supporter"
                    ? "bg-secondary text-on-secondary shadow-sm ring-1 ring-secondary/40"
                    : "border border-white/10 text-on-surface-variant hover:text-on-surface hover:bg-white/[0.04]"
                }`}
                data-testid="act-as-supporter-button"
              >
                Supporter
              </button>
            </div>
          </div>
        )}

        <div className="space-y-2 border-b border-white/[0.08] px-4 py-3 lg:hidden">
          <p className={monoLabel}>Active brand</p>
          <BrandSwitcher />
        </div>
        <div className="border-b border-white/[0.08] p-1.5 space-y-0.5">
          <button
            type="button"
            onClick={() => {
              menu.current?.hidePopover();
              onOpenFaq();
            }}
            data-testid="account-menu-faqs-button"
            className="flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 text-body font-medium text-on-surface-variant transition-colors hover:bg-white/[0.04] hover:text-on-surface sm:min-h-10"
          >
            <Icon name="helpCircle" className="size-4 text-primary" />
            <span>Frequently Asked Questions</span>
          </button>
          {isAdmin ? (
            <button
              type="button"
              onClick={() => {
                menu.current?.hidePopover();
                onOpenAdmin();
              }}
              data-testid="open-superadmin-button"
              className="flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 text-body font-medium text-primary transition-colors hover:bg-primary-container/20 sm:min-h-10"
            >
              <Icon name="sliders" className="size-4" />
              {role === "superadmin" ? "Super Admin Panel" : "Main Admin Panel"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                menu.current?.hidePopover();
                onOpenSupporter();
              }}
              data-agent-id="account-menu-supporter-button"
              data-testid="open-supporter-button"
              className="flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 text-body font-medium text-secondary transition-colors hover:bg-secondary/15 sm:min-h-10"
            >
              <Icon name="sliders" className="size-4" />
              Supporter Admin Panel
            </button>
          )}

          {/* When Superadmin is in native Superadmin mode, also give direct 1-click preview of other panels */}
          {isSuperAdmin && role === "superadmin" && (
            <button
              type="button"
              onClick={() => {
                menu.current?.hidePopover();
                onOpenSupporter();
              }}
              data-testid="preview-supporter-panel-button"
              className="flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 text-body font-medium text-secondary/80 transition-colors hover:bg-secondary/10 sm:min-h-10"
            >
              <Icon name="user" className="size-4" />
              <span>Preview Supporter Panel</span>
            </button>
          )}
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
    </>
  );
}

/** Sticky app header: live token balance, active-brand switcher and the "Top-up" entry point. */
export function TopNavWallet() {
  const { isAdmin, isSuperAdmin, actingAsRole, resetRole } = useSession();
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [adminInitialTab, setAdminInitialTab] = useState<
    "CURRENCY" | "PRICING" | "PACKS" | "LEDGER" | "MESSAGES" | "RBAC" | "FAQS" | "DEV" | undefined
  >(undefined);
  const [isSupporterOpen, setIsSupporterOpen] = useState(false);
  const [isContactOpen, setIsContactOpen] = useState(false);
  const [isFaqOpen, setIsFaqOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-surface-container-lowest/90 pt-[env(safe-area-inset-top)] backdrop-blur-md">
      {/* Superadmin "Acting as Role" Notification Banner */}
      {isSuperAdmin && actingAsRole && actingAsRole !== "superadmin" && (
        <div
          data-testid="acting-as-banner"
          className="bg-primary/20 border-b border-primary/30 px-3 sm:px-6 py-1.5 flex items-center justify-between text-xs font-mono"
        >
          <div className="flex items-center gap-2 text-on-surface">
            <span className="flex size-2 rounded-full bg-primary animate-pulse" />
            <span>
              Acting as <strong>{actingAsRole === "admin" ? "Main Admin" : "Supporter"}</strong>
            </span>
            <span className="text-on-surface-variant hidden md:inline">
              ({actingAsRole === "admin" ? "Main Admin Panel view with 5 tabs" : "Supporter Admin Panel view with 3 tabs"})
            </span>
          </div>
          <button
            type="button"
            onClick={() => resetRole()}
            data-testid="reset-role-button"
            className="rounded bg-primary px-2.5 py-0.5 font-bold text-on-primary hover:bg-primary-fixed transition text-[11px]"
          >
            Return to Super Admin
          </button>
        </div>
      )}

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
          <button
            type="button"
            onClick={() => setIsFaqOpen(true)}
            data-agent-id="nav-link-faqs"
            data-testid="nav-link-faqs"
            aria-label="Frequently Asked Questions"
            className="rounded px-3 py-1.5 text-body text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors"
          >
            FAQs
          </button>
        </nav>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => setIsFaqOpen(true)}
            aria-label="Frequently Asked Questions"
            data-agent-id="mobile-header-faqs"
            data-testid="mobile-header-faqs"
            className="flex h-10 items-center gap-1.5 rounded-lg border border-white/[0.08] bg-surface-container-low px-2.5 text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors md:hidden text-compact font-medium"
            title="Frequently Asked Questions"
          >
            <Icon name="helpCircle" className="size-4 text-primary" />
            <span className="text-[12px] font-medium">FAQs</span>
          </button>
          <BrandSwitcher className="hidden lg:flex" />
          <TokenPill />
          <AccountMenu
            onOpenAdmin={(tab) => {
              setAdminInitialTab(tab);
              setIsAdminOpen(true);
            }}
            onOpenSupporter={() => setIsSupporterOpen(true)}
            onOpenFaq={() => setIsFaqOpen(true)}
          />
        </div>
      </div>

      <FaqModal
        isOpen={isFaqOpen}
        onClose={() => setIsFaqOpen(false)}
        onOpenFaqDev={() => {
          setIsFaqOpen(false);
          setAdminInitialTab("FAQS");
          setIsAdminOpen(true);
        }}
      />
      <SuperAdminModal
        isOpen={isAdminOpen}
        onClose={() => {
          setIsAdminOpen(false);
          setAdminInitialTab(undefined);
        }}
        initialTab={adminInitialTab}
      />
      <SupporterModal
        isOpen={isSupporterOpen}
        onClose={() => setIsSupporterOpen(false)}
      />
      <ContactAdminModal isOpen={isContactOpen} onClose={() => setIsContactOpen(false)} />
    </header>
  );
}
