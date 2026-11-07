import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AdRadarHQ - AI Competitor Ad Spy & Creative Remix",
    short_name: "AdRadarHQ",
    description: "Discover winning competitor ads across Meta, TikTok & Google. Deconstruct top hooks and remix high-converting campaigns.",
    start_url: "/radar",
    id: "/",
    display: "standalone",
    background_color: "#0a0e17",
    theme_color: "#0a0e17",
    orientation: "any",
    categories: ["business", "marketing", "productivity"],
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Search Radar",
        short_name: "Radar",
        description: "Search winning competitor ads",
        url: "/radar",
        icons: [{ src: "/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "My Brands",
        short_name: "Brands",
        description: "Manage your Brand Cards",
        url: "/brands",
        icons: [{ src: "/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Customize Strategy",
        short_name: "Customize",
        description: "Request bespoke brand strategy",
        url: "/customize",
        icons: [{ src: "/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Wallet & Tokens",
        short_name: "Wallet",
        description: "View non-expiring token balance",
        url: "/wallet",
        icons: [{ src: "/icon-192.png", sizes: "192x192" }],
      },
    ],
  };
}

