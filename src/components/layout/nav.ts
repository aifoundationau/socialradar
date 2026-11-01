import type { IconName } from "@/components/ui/Icon";

/** Dashboard sections, shared by the header (md and up) and the phone tab bar. */
export const NAV: { href: string; label: string; short: string; icon: IconName }[] = [
  { href: "/radar", label: "Radar Feed", short: "Radar", icon: "radar" },
  { href: "/brands", label: "My Brands", short: "My Brands", icon: "tag" },
  { href: "/wallet", label: "Wallet", short: "Wallet", icon: "wallet" },
];

export const isActivePath = (pathname: string | null, href: string) =>
  pathname !== null && (pathname === href || pathname.startsWith(`${href}/`));
