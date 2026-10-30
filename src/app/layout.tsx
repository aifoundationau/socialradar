import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { SessionProvider } from "@/components/auth/SessionProvider";
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

export const metadata: Metadata = {
  title: { default: "Ad Radar", template: "%s · Ad Radar" },
  description: "Find long-running winning ads on Meta, TikTok and Google, then remix them for your brand.",
};

// viewport-fit=cover lets the header and tab bar extend under notches; they pad with safe-area insets.
export const viewport: Viewport = {
  themeColor: "#0a0e17",
  colorScheme: "dark",
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}>
      <body className="flex min-h-dvh flex-col bg-background font-sans text-on-surface">
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
