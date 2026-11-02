import type { IconName } from "@/components/ui/Icon";

export interface NavItem {
  href: string;
  label: string;
  short: string;
  icon: IconName;
  tooltipTitle: string;
  tooltipDesc: string;
}

/** Dashboard sections: My Brands first, followed by Radar Feed, then Wallet. */
export const NAV: NavItem[] = [
  {
    href: "/brands",
    label: "My Brands",
    short: "My Brands",
    icon: "tag",
    tooltipTitle: "My Brands",
    tooltipDesc: "Configure brand identity, voice guidelines, landing pages, and value propositions for AI ad remixes.",
  },
  {
    href: "/radar",
    label: "Radar Feed",
    short: "Radar",
    icon: "radar",
    tooltipTitle: "Radar Feed",
    tooltipDesc: "Discover high-performing Meta, TikTok & Google ads running live with duration and score intelligence.",
  },
  {
    href: "/customize",
    label: "Customize",
    short: "Customize",
    icon: "sparkles",
    tooltipTitle: "Professional Customize Service",
    tooltipDesc: "Have our professional strategy team take your brand details and extra notes to craft a bespoke brand & ad blueprint.",
  },
  {
    href: "/wallet",
    label: "Wallet",
    short: "Wallet",
    icon: "wallet",
    tooltipTitle: "Token Wallet",
    tooltipDesc: "Inspect live token ledger balance, monitor deduction history, and purchase token packs.",
  },
];

export const isActivePath = (pathname: string | null, href: string) =>
  pathname !== null && (pathname === href || pathname.startsWith(`${href}/`));
