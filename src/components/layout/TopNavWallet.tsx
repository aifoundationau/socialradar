"use client";

import { Suspense, useEffect, useRef, useState } from "react";
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
import { MonthlySubscriptionModal } from "@/components/subscription/MonthlySubscriptionModal";
import { AdAgentModal } from "@/components/ad-agent/AdAgentModal";
import { InstallAppModal } from "@/components/pwa/InstallAppModal";
import type { AdAgentProfile } from "@/lib/contracts";

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
        data-agent-id="header-add-brand-link"
        data-testid="header-add-brand-link"
        aria-label="Add a brand profile"
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
        data-agent-id="header-brand-switcher-select"
        data-testid="header-brand-switcher-select"
        aria-label="Select active brand for remixes"
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
    <div className="flex h-9 shrink-0 items-center rounded border border-white/[0.08] bg-surface-container-low pr-1 pl-2 sm:pl-2.5" data-agent-id="header-token-pill" data-testid="header-token-pill">
      <Link
        href="/wallet"
        title="Token balance"
        aria-label="View token balance in wallet"
        data-agent-id="header-wallet-balance-link"
        data-testid="header-wallet-balance-link"
        className="flex items-center gap-1 sm:gap-1.5 font-mono text-mono-code font-medium text-secondary tabular-nums"
      >
        <span className="relative hidden xs:flex sm:flex size-2">
          <span className="absolute inline-flex size-full rounded-full bg-secondary opacity-75 motion-safe:animate-ping" />
          <span className="relative inline-flex size-2 rounded-full bg-secondary" />
        </span>
        <Icon name="zap" className="size-3.5 shrink-0" />
        {profile ? profile.tokenBalance.toLocaleString("en-AU") : "–"}
        <span className="hidden sm:inline">tokens</span>
      </Link>
      <Link
        href="/wallet#packs"
        aria-label="Buy tokens"
        data-agent-id="header-topup-link"
        data-testid="header-topup-link"
        className="ml-1.5 sm:ml-2 flex h-7 min-w-7 items-center justify-center gap-0.5 rounded bg-primary px-1.5 font-mono text-mono-label font-semibold text-on-primary transition-colors hover:bg-primary-fixed sm:px-2"
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
  onOpenAdAgent,
  onOpenInstallApp,
  isAdAgentProfileRegistered = true,
}: {
  onOpenAdmin: (tab?: "CURRENCY" | "PRICING" | "PACKS" | "LEDGER" | "USERS" | "MESSAGES" | "RBAC" | "FAQS" | "DEV") => void;
  onOpenSupporter: () => void;
  onOpenFaq: () => void;
  onOpenAdAgent: () => void;
  onOpenInstallApp: () => void;
  isAdAgentProfileRegistered?: boolean;
}) {
  const { user, isAdmin, role, isSuperAdmin, actingAsRole, setActingRole, resetRole } = useSession();
  const menu = useRef<HTMLDivElement>(null);
  const initial = user?.email?.[0]?.toUpperCase();
  const [confirmMenuResetRole, setConfirmMenuResetRole] = useState(false);

  return (
    <>
      <button
        type="button"
        popoverTarget="account-menu"
        aria-label="Account menu"
        data-agent-id="account-menu-button"
        data-testid="account-menu-button"
        className="relative flex size-10 items-center justify-center rounded-full bg-primary text-on-primary transition-colors hover:bg-primary-fixed sm:size-8"
      >
        {initial ? <span className="text-body font-semibold">{initial}</span> : <Icon name="user" />}
        {role === "ad_agent" && !isAdAgentProfileRegistered && (
          <span
            className="absolute -top-0.5 -right-0.5 flex size-3"
            title="Ad Agent Registration Required"
          >
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex rounded-full size-3 bg-amber-500 border border-surface-container-lowest" />
          </span>
        )}
      </button>
      <div
        id="account-menu"
        ref={menu}
        popover="auto"
        data-agent-id="account-menu-popover"
        data-testid="account-menu-popover"
        className="inset-auto top-[calc(3.75rem+env(safe-area-inset-top))] right-3 m-0 w-72 max-w-[calc(100vw-1.5rem)] rounded-xl border border-white/[0.12] bg-surface-container-high p-0 text-on-surface shadow-[0_12px_32px_-4px_rgba(0,0,0,0.6)] sm:right-6"
      >
        <div className="border-b border-white/[0.08] px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <p className={monoLabel}>Signed in as</p>
            <span
              className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider ${
                isAdmin
                  ? "border border-primary/30 bg-primary-container/30 text-primary"
                  : role === "ad_agent"
                    ? "border border-tertiary/30 bg-tertiary/15 text-tertiary"
                    : "border border-secondary/30 bg-secondary/15 text-secondary"
              }`}
            >
              {role === "superadmin"
                ? "Super Admin"
                : role === "admin"
                  ? "Main Admin"
                  : role === "ad_agent"
                    ? "Ad Agent"
                    : "Supporter"}
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
                confirmMenuResetRole ? (
                  <div className="inline-flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmMenuResetRole(false);
                        resetRole();
                      }}
                      data-agent-id="confirm-account-menu-reset-role"
                      data-testid="confirm-account-menu-reset-role"
                      aria-label="Confirm reset role view to Super Admin"
                      className="rounded bg-primary px-2 py-0.5 font-mono text-[10px] font-bold text-on-primary hover:bg-primary-fixed transition"
                    >
                      Confirm Reset
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmMenuResetRole(false)}
                      data-agent-id="cancel-account-menu-reset-role"
                      data-testid="cancel-account-menu-reset-role"
                      className="rounded border border-white/15 px-1.5 py-0.5 font-mono text-[10px] text-on-surface-variant hover:text-on-surface"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmMenuResetRole(true)}
                    data-agent-id="account-menu-reset-role"
                    data-testid="account-menu-reset-role"
                    aria-label="Reset role view to Super Admin"
                    className="font-mono text-[10px] text-primary hover:underline"
                  >
                    Reset
                  </button>
                )
              )}
            </div>
            <div className="grid grid-cols-2 gap-1">
              <button
                type="button"
                onClick={() => setActingRole("superadmin")}
                className={`rounded-lg py-1 px-1 text-center font-mono text-[10px] font-semibold transition ${
                  role === "superadmin"
                    ? "bg-primary text-on-primary shadow-sm ring-1 ring-primary/40"
                    : "border border-white/10 text-on-surface-variant hover:text-on-surface hover:bg-white/[0.04]"
                }`}
                data-agent-id="act-as-superadmin-button"
                data-testid="act-as-superadmin-button"
                aria-label="Act as Super Admin"
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
                data-agent-id="act-as-admin-button"
                data-testid="act-as-admin-button"
                aria-label="Act as Main Admin"
              >
                Main Admin
              </button>
              <button
                type="button"
                onClick={() => setActingRole("ad_agent")}
                className={`rounded-lg py-1 px-1 text-center font-mono text-[10px] font-semibold transition ${
                  role === "ad_agent"
                    ? "bg-tertiary text-on-primary shadow-sm ring-1 ring-tertiary/40"
                    : "border border-white/10 text-on-surface-variant hover:text-on-surface hover:bg-white/[0.04]"
                }`}
                data-agent-id="act-as-ad-agent-button"
                data-testid="act-as-ad-agent-button"
                aria-label="Act as Ad Agent"
              >
                Ad Agent
              </button>
              <button
                type="button"
                onClick={() => setActingRole("supporter")}
                className={`rounded-lg py-1 px-1 text-center font-mono text-[10px] font-semibold transition ${
                  role === "supporter"
                    ? "bg-secondary text-on-secondary shadow-sm ring-1 ring-secondary/40"
                    : "border border-white/10 text-on-surface-variant hover:text-on-surface hover:bg-white/[0.04]"
                }`}
                data-agent-id="act-as-supporter-button"
                data-testid="act-as-supporter-button"
                aria-label="Act as Supporter"
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
              onOpenInstallApp();
            }}
            data-agent-id="account-menu-download-app-button"
            data-testid="account-menu-download-app-button"
            aria-label="Download App for Chrome Laptop, Android, and iPhone"
            className="flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 text-body font-medium text-emerald-400 transition-colors hover:bg-emerald-500/10 sm:min-h-10"
          >
            <Icon name="download" className="size-4 text-emerald-400" />
            <span>Download App (Laptop / Mobile)</span>
          </button>
          <button
            type="button"
            onClick={() => {
              menu.current?.hidePopover();
              onOpenFaq();
            }}
            data-agent-id="account-menu-faqs-button"
            data-testid="account-menu-faqs-button"
            aria-label="Open Frequently Asked Questions"
            className="flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 text-body font-medium text-on-surface-variant transition-colors hover:bg-white/[0.04] hover:text-on-surface sm:min-h-10"
          >
            <Icon name="helpCircle" className="size-4 text-primary" />
            <span>Frequently Asked Questions</span>
          </button>
          {/* Ad Agent Menu: Accessible to Ad Agents, Super Admin, and Main Admin — hidden for Supporters */}
          {role !== "supporter" && (role === "ad_agent" || isSuperAdmin || isAdmin) && (
            <button
              type="button"
              onClick={() => {
                menu.current?.hidePopover();
                onOpenAdAgent();
              }}
              data-agent-id="account-menu-ad-agent-button"
              data-testid="account-menu-ad-agent-button"
              aria-label="Open Ad Agent Registration and Customize Orders Panel"
              className="flex min-h-11 w-full items-center justify-between rounded-lg px-3 text-body font-medium text-tertiary transition-colors hover:bg-tertiary/15 sm:min-h-10"
            >
              <div className="flex items-center gap-2.5">
                <Icon name="sparkles" className="size-4 text-tertiary" />
                <span>
                  {role === "superadmin"
                    ? "Ad Agent Panel (No Reg Needed)"
                    : !isAdAgentProfileRegistered
                      ? "Ad Agent Registration Required"
                      : "Ad Agent Orders, Profile & Contractors"}
                </span>
              </div>
              {role === "ad_agent" && !isAdAgentProfileRegistered && (
                <span className="rounded bg-amber-500/25 border border-amber-500/40 px-1.5 py-0.5 font-mono text-[9px] font-bold text-amber-300 uppercase">
                  Action Required
                </span>
              )}
            </button>
          )}
          {isAdmin ? (
            <button
              type="button"
              onClick={() => {
                menu.current?.hidePopover();
                onOpenAdmin();
              }}
              data-agent-id="open-superadmin-button"
              data-testid="open-superadmin-button"
              aria-label={role === "superadmin" ? "Open Super Admin Panel" : "Open Main Admin Panel"}
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
              aria-label="Open Supporter Admin Panel"
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
              data-agent-id="preview-supporter-panel-button"
              data-testid="preview-supporter-panel-button"
              aria-label="Preview Supporter Admin Panel"
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
          data-agent-id="account-menu-signout-button"
          data-testid="account-menu-signout-button"
          aria-label="Sign out of account"
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
  const { user, role, isAdmin, isSuperAdmin, actingAsRole, resetRole } = useSession();
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [adminInitialTab, setAdminInitialTab] = useState<
    "CURRENCY" | "PRICING" | "PACKS" | "LEDGER" | "USERS" | "MESSAGES" | "RBAC" | "FAQS" | "DEV" | undefined
  >(undefined);
  const [isSupporterOpen, setIsSupporterOpen] = useState(false);
  const [isContactOpen, setIsContactOpen] = useState(false);
  const [isFaqOpen, setIsFaqOpen] = useState(false);
  const [isSubscriptionOpen, setIsSubscriptionOpen] = useState(false);
  const [isAdAgentOpen, setIsAdAgentOpen] = useState(false);
  const [isInstallModalOpen, setIsInstallModalOpen] = useState(false);

  const [isSubscriptionEnabled, setIsSubscriptionEnabled] = useState(false); // Default is Off

  const [adAgentRegistrationChecked, setAdAgentRegistrationChecked] = useState(false);
  const [isAdAgentProfileRegistered, setIsAdAgentProfileRegistered] = useState(true);

  // Sync Monthly Search Subscription (1K) enabled status (Default is Off)
  useEffect(() => {
    let active = true;
    async function syncSubscriptionStatus() {
      try {
        const data = await apiFetch<{
          monthlySubscription?: { enabled?: boolean };
        }>("/api/wallet/checkout", { method: "GET" });
        if (active && data?.monthlySubscription) {
          setIsSubscriptionEnabled(Boolean(data.monthlySubscription.enabled));
        }
      } catch {
        // default remains false (off)
      }
    }

    syncSubscriptionStatus();
    window.addEventListener("adradar:config-updated", syncSubscriptionStatus);
    return () => {
      active = false;
      window.removeEventListener("adradar:config-updated", syncSubscriptionStatus);
    };
  }, []);

  useEffect(() => {
    if (role !== "ad_agent") {
      setIsAdAgentProfileRegistered(true);
      return;
    }
    let active = true;
    apiFetch<{ myAgentProfile: AdAgentProfile | null }>("/api/ad-agent")
      .then((data) => {
        if (!active) return;
        const prof = data.myAgentProfile;
        const registered = Boolean(
          prof &&
            ((prof.phone && prof.phone !== "Not specified") ||
              (prof.bankOrPayIdDetails && prof.bankOrPayIdDetails.trim().length > 0)),
        );
        setIsAdAgentProfileRegistered(registered);
        setAdAgentRegistrationChecked(true);
      })
      .catch(() => {
        if (active) setAdAgentRegistrationChecked(true);
      });

    const onRegistered = () => setIsAdAgentProfileRegistered(true);
    window.addEventListener("adradar:agent-registered", onRegistered);
    return () => {
      active = false;
      window.removeEventListener("adradar:agent-registered", onRegistered);
    };
  }, [role, user?.email]);

  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-surface-container-lowest/90 pt-[env(safe-area-inset-top)] backdrop-blur-md">
      {/* Superadmin "Acting as Role" Notification Banner */}
      {isSuperAdmin && actingAsRole && actingAsRole !== "superadmin" && (
        <div
          data-agent-id="acting-as-banner"
          data-testid="acting-as-banner"
          className="bg-primary/20 border-b border-primary/30 px-3 sm:px-6 py-1.5 flex items-center justify-between text-xs font-mono"
        >
          <div className="flex items-center gap-2 text-on-surface">
            <span className="flex size-2 rounded-full bg-primary animate-pulse" />
            <span>
              Acting as{" "}
              <strong>
                {actingAsRole === "admin"
                  ? "Main Admin"
                  : actingAsRole === "ad_agent"
                    ? "Ad Agent"
                    : "Supporter"}
              </strong>
            </span>
            <span className="text-on-surface-variant hidden md:inline">
              (
              {actingAsRole === "admin"
                ? "Main Admin Panel view with 5 tabs"
                : actingAsRole === "ad_agent"
                  ? "Ad Agent role view — Customize orders & profile"
                  : "Supporter Admin Panel view with 3 tabs"}
              )
            </span>
          </div>
          <button
            type="button"
            onClick={() => resetRole()}
            data-agent-id="reset-role-button"
            data-testid="reset-role-button"
            aria-label="Return to Super Admin role"
            className="rounded bg-primary px-2.5 py-0.5 font-bold text-on-primary hover:bg-primary-fixed transition text-[11px]"
          >
            Return to Super Admin
          </button>
        </div>
      )}

      {/* New Ad Agent Role: Registration Required Banner */}
      {role === "ad_agent" && adAgentRegistrationChecked && !isAdAgentProfileRegistered && (
        <div
          data-agent-id="new-ad-agent-banner"
          data-testid="new-ad-agent-banner"
          className="bg-amber-500/15 border-b border-amber-500/30 px-3 sm:px-6 py-2 flex items-center justify-between text-xs font-mono"
        >
          <div className="flex items-center gap-2 text-on-surface">
            <span className="flex size-2 rounded-full bg-amber-400 animate-pulse" />
            <span>
              <strong>Ad Agent Role Assigned:</strong> Super Admin has updated your role to Ad Agent. Please fill out your Ad Agent Registration &amp; Customize Orders Panel to activate your profile.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setIsAdAgentOpen(true)}
            data-agent-id="banner-complete-registration-btn"
            data-testid="banner-complete-registration-btn"
            className="rounded bg-amber-500 px-2.5 py-1 font-bold text-black hover:bg-amber-400 transition text-[11px] shrink-0 ml-2"
          >
            Fill Out Registration →
          </button>
        </div>
      )}

      <div className="flex h-14 w-full max-w-full min-w-0 items-center gap-1.5 px-2.5 sm:gap-3 sm:px-6">
        <Link
          href="/"
          data-agent-id="header-home-logo-link"
          data-testid="header-home-logo-link"
          aria-label="AdRadarHQ home page"
          className="shrink-0 min-w-0"
        >
          <Logo />
        </Link>
        <span className="hidden rounded-full border border-primary-container/40 bg-primary-container/20 px-2 py-0.5 font-mono text-mono-label uppercase text-primary lg:inline">
          Remix Studio
        </span>
        <nav aria-label="Main" className="ml-2 hidden items-center gap-1 rounded-lg border border-white/[0.06] bg-surface-container-lowest p-0.5 md:flex">
          <Suspense fallback={<NavItems pathname={null} />}>
            <NavLinks />
          </Suspense>
          <div className="group relative flex items-center">
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
            <div
              role="tooltip"
              data-agent-id="nav-tooltip-faqs"
              data-testid="nav-tooltip-faqs"
              className="pointer-events-none absolute top-full left-1/2 z-50 mt-2.5 w-64 -translate-x-1/2 rounded-xl border border-white/[0.14] bg-surface-container-highest p-3 text-left shadow-2xl opacity-0 scale-95 transition-all duration-150 ease-out group-hover:opacity-100 group-hover:scale-100 group-focus-within:opacity-100 group-focus-within:scale-100"
            >
              <div className="flex items-center gap-1.5 font-mono text-[11px] font-semibold text-primary">
                <Icon name="helpCircle" className="size-3.5 shrink-0" />
                <span>Frequently Asked Questions</span>
              </div>
              <p className="mt-1 text-[12px] leading-relaxed text-on-surface-variant font-normal">
                Everything you need to know about Radar search filters, token mechanics, AI creative remixes, and platform billing.
              </p>
              <div className="absolute -top-1 left-1/2 -translate-x-1/2 size-2 rotate-45 border-t border-l border-white/[0.14] bg-surface-container-highest" />
            </div>
          </div>
          {isAdmin && isSubscriptionEnabled && (
            <div className="group relative flex items-center">
              <button
                type="button"
                onClick={() => setIsSubscriptionOpen(true)}
                data-agent-id="nav-link-subscription"
                data-testid="nav-link-subscription"
                aria-label="Monthly Search Subscription (1,000 searches)"
                className="flex items-center gap-1.5 rounded border border-primary/30 bg-primary/10 px-2.5 py-1 font-mono text-xs font-semibold text-primary hover:bg-primary/20 transition-colors"
              >
                <Icon name="sparkles" className="size-3.5" />
                <span>Subscription (1K)</span>
              </button>
              <div
                role="tooltip"
                data-agent-id="nav-tooltip-subscription"
                data-testid="nav-tooltip-subscription"
                className="pointer-events-none absolute top-full left-1/2 z-50 mt-2.5 w-64 -translate-x-1/2 rounded-xl border border-primary/30 bg-surface-container-highest p-3 text-left shadow-2xl opacity-0 scale-95 transition-all duration-150 ease-out group-hover:opacity-100 group-hover:scale-100 group-focus-within:opacity-100 group-focus-within:scale-100"
              >
                <div className="flex items-center gap-1.5 font-mono text-[11px] font-semibold text-primary">
                  <Icon name="sparkles" className="size-3.5 shrink-0" />
                  <span>Monthly Search Subscription</span>
                </div>
                <p className="mt-1 text-[12px] leading-relaxed text-on-surface-variant font-normal">
                  SuperAdmin &amp; MainAdmin search tier: 1,000 monthly search allowance with custom billing.
                </p>
                <div className="absolute -top-1 left-1/2 -translate-x-1/2 size-2 rotate-45 border-t border-l border-primary/30 bg-surface-container-highest" />
              </div>
            </div>
          )}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-3">
          <div className="group relative flex items-center md:hidden">
            <button
              type="button"
              onClick={() => setIsFaqOpen(true)}
              aria-label="Frequently Asked Questions"
              data-agent-id="mobile-header-faqs"
              data-testid="mobile-header-faqs"
              className="flex h-9 items-center gap-1 rounded-lg border border-white/[0.08] bg-surface-container-low px-2 text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors text-compact font-medium"
            >
              <Icon name="helpCircle" className="size-3.5 text-primary shrink-0" />
              <span className="text-[11px] font-medium">FAQs</span>
            </button>
            <div
              role="tooltip"
              className="pointer-events-none hidden sm:block absolute top-full right-0 z-50 mt-2 w-64 rounded-xl border border-white/[0.14] bg-surface-container-highest p-2.5 text-left shadow-2xl opacity-0 scale-95 transition-all duration-150 ease-out group-hover:opacity-100 group-hover:scale-100"
            >
              <div className="flex items-center gap-1.5 font-mono text-[11px] font-semibold text-primary">
                <Icon name="helpCircle" className="size-3.5 shrink-0" />
                <span>Frequently Asked Questions</span>
              </div>
              <p className="mt-1 text-[11px] leading-snug text-on-surface-variant font-normal">
                Everything you need to know about search filters, token mechanics, AI remixes, and billing.
              </p>
            </div>
          </div>
          {isAdmin && isSubscriptionEnabled && (
            <div className="group relative flex items-center md:hidden">
              <button
                type="button"
                onClick={() => setIsSubscriptionOpen(true)}
                aria-label="Monthly Search Subscription"
                data-agent-id="mobile-header-subscription"
                data-testid="mobile-header-subscription"
                className="flex h-9 items-center gap-1 rounded-lg border border-primary/30 bg-primary/10 px-1.5 text-primary hover:bg-primary/20 transition-colors text-[10px] font-mono font-bold"
              >
                <Icon name="sparkles" className="size-3 shrink-0" />
                <span className="whitespace-nowrap">1K</span>
              </button>
              <div
                role="tooltip"
                className="pointer-events-none hidden sm:block absolute top-full right-0 z-50 mt-2 w-64 rounded-xl border border-primary/30 bg-surface-container-highest p-2.5 text-left shadow-2xl opacity-0 scale-95 transition-all duration-150 ease-out group-hover:opacity-100 group-hover:scale-100"
              >
                <div className="flex items-center gap-1.5 font-mono text-[11px] font-semibold text-primary">
                  <Icon name="sparkles" className="size-3.5 shrink-0" />
                  <span>Monthly Search Subscription</span>
                </div>
                <p className="mt-1 text-[11px] leading-snug text-on-surface-variant font-normal">
                  Privileged search tier: 1,000 monthly search allowance.
                </p>
              </div>
            </div>
          )}
          <BrandSwitcher className="hidden lg:flex" />
          {/* Download App / Install PWA Button */}
          <div className="group relative flex items-center">
            <button
              type="button"
              onClick={() => setIsInstallModalOpen(true)}
              aria-label="Download App for Chrome Laptop, Android, and iPhone"
              data-agent-id="header-download-app-btn"
              data-testid="header-download-app-btn"
              className="flex h-9 items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 sm:px-2.5 text-emerald-300 hover:bg-emerald-500/20 hover:text-emerald-200 transition-colors text-compact font-semibold"
            >
              <Icon name="download" className="size-3.5 text-emerald-400 shrink-0" />
              <span className="hidden sm:inline text-xs font-mono font-bold">App</span>
            </button>
            <div
              role="tooltip"
              className="pointer-events-none hidden sm:block absolute top-full right-0 z-50 mt-2 w-64 rounded-xl border border-emerald-500/30 bg-surface-container-highest p-2.5 text-left shadow-2xl opacity-0 scale-95 transition-all duration-150 ease-out group-hover:opacity-100 group-hover:scale-100"
            >
              <div className="flex items-center gap-1.5 font-mono text-[11px] font-semibold text-emerald-300">
                <Icon name="download" className="size-3.5 shrink-0 text-emerald-400" />
                <span>Download AdRadarHQ App</span>
              </div>
              <p className="mt-1 text-[11px] leading-snug text-on-surface-variant font-normal">
                Install as a standalone app on Google Chrome (Laptop/Desktop), Android, or iPhone / iPad.
              </p>
            </div>
          </div>
          <TokenPill />
          <AccountMenu
            onOpenAdmin={(tab) => {
              setAdminInitialTab(tab);
              setIsAdminOpen(true);
            }}
            onOpenSupporter={() => setIsSupporterOpen(true)}
            onOpenFaq={() => setIsFaqOpen(true)}
            onOpenAdAgent={() => setIsAdAgentOpen(true)}
            onOpenInstallApp={() => setIsInstallModalOpen(true)}
            isAdAgentProfileRegistered={isAdAgentProfileRegistered}
          />
        </div>
      </div>

      <InstallAppModal
        isOpen={isInstallModalOpen}
        onClose={() => setIsInstallModalOpen(false)}
      />

      <FaqModal
        isOpen={isFaqOpen}
        onClose={() => setIsFaqOpen(false)}
        onOpenFaqDev={() => {
          setIsFaqOpen(false);
          setAdminInitialTab("FAQS");
          setIsAdminOpen(true);
        }}
        onOpenSubscription={
          isSubscriptionEnabled
            ? () => {
                setIsFaqOpen(false);
                setIsSubscriptionOpen(true);
              }
            : undefined
        }
      />
      <MonthlySubscriptionModal
        isOpen={isSubscriptionOpen}
        onClose={() => setIsSubscriptionOpen(false)}
        onOpenPricing={() => {
          setIsSubscriptionOpen(false);
          setAdminInitialTab("PRICING");
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
      <AdAgentModal
        isOpen={isAdAgentOpen}
        onClose={() => setIsAdAgentOpen(false)}
      />
      <ContactAdminModal isOpen={isContactOpen} onClose={() => setIsContactOpen(false)} />
    </header>
  );
}
