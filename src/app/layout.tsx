import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { SessionProvider } from "@/components/auth/SessionProvider";
import { AgentDomBridge } from "@/components/agent/AgentDomBridge";
import { FreeAccessTopBanner } from "@/components/layout/FreeAccessTopBanner";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

const SITE_URL = process.env.APP_URL || "https://adradarhq.com";
const SEO_TITLE = "AdRadarHQ | AI Ad Spy & Creative Remix for Meta, TikTok & Google";
const SEO_DESCRIPTION =
  "Discover proven, long-running winning ads across Meta (Facebook & Instagram), TikTok, Google & YouTube. Deconstruct top hooks and generate AI ad variations.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SEO_TITLE,
    template: "%s | AdRadarHQ",
  },
  description: SEO_DESCRIPTION,
  applicationName: "AdRadarHQ",
  keywords: [
    "AdRadarHQ",
    "ad spy tool",
    "competitor ad intelligence",
    "Meta Ad Library search",
    "TikTok Creative Center top ads",
    "Google Ads Transparency Center",
    "YouTube ad spy",
    "AI ad creative remix",
    "direct response ad copy",
    "winning ads finder",
    "Facebook Instagram ad spy",
    "AI Foundation Australia",
  ],
  authors: [{ name: "AI Foundation", url: "https://aifoundation.net.au/" }],
  creator: "AI Foundation",
  publisher: "AdRadarHQ",
  category: "Marketing & Advertising Intelligence",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "192x192", type: "image/png" },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "AdRadarHQ",
  },
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "en_AU",
    url: SITE_URL,
    siteName: "AdRadarHQ",
    title: SEO_TITLE,
    description: SEO_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: SEO_TITLE,
    description: SEO_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-snippet": -1,
      "max-image-preview": "large",
      "max-video-preview": -1,
    },
  },
};

// viewport-fit=cover lets the header and tab bar extend under notches; they pad with safe-area insets.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0a0e17",
  colorScheme: "dark",
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable} h-full max-w-full overflow-x-clip antialiased`}>
      <body className="flex min-h-dvh w-full max-w-full overflow-x-clip flex-col bg-background font-sans text-on-surface">
        <SessionProvider>
          <FreeAccessTopBanner />
          {children}
          <AgentDomBridge />
        </SessionProvider>
      </body>
    </html>
  );
}
