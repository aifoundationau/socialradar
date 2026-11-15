import type { Metadata } from "next";
import { SeoRouteMetadataInputSchema, type SeoRouteMetadataInput } from "@/lib/contracts";

export const DEFAULT_SITE_URL = "https://adradarhq.com";
export const SEO_SITE_NAME = "AdRadarHQ";
export const SEO_ALTERNATE_NAME = "Social Radar";
export const SEO_LOCALE = "en_AU";
export const SEO_COPYRIGHT = "Copyright, all rights reserved, David Robertson";
export const SEO_OG_IMAGE_ALT =
  "AdRadarHQ — AI Competitor Ad Spy & Creative Remix Studio for Meta, TikTok, Google & YouTube";

export function getSiteUrl(): string {
  const raw = (process.env.APP_URL || DEFAULT_SITE_URL).trim();
  const normalized = raw.replace(/\/+$/, "");
  return normalized || DEFAULT_SITE_URL;
}

/**
 * Builds route-specific Next.js Metadata (`keywords`, `alternates.canonical`, `openGraph`, `twitter`)
 * while preserving the exact route `title` and `description` passed in.
 */
export function buildRouteSeoMetadata(input: SeoRouteMetadataInput): Metadata {
  const parsed = SeoRouteMetadataInputSchema.safeParse(input);
  const safe = parsed.success ? parsed.data : input;
  const fullTitle = `${safe.title} | ${SEO_SITE_NAME}`;

  return {
    title: safe.title,
    description: safe.description,
    keywords: safe.keywords,
    alternates: {
      canonical: safe.canonicalPath,
    },
    openGraph: {
      type: "website",
      locale: SEO_LOCALE,
      url: safe.canonicalPath,
      siteName: SEO_SITE_NAME,
      title: fullTitle,
      description: safe.description,
      images: [
        {
          url: "/opengraph-image",
          width: 1200,
          height: 630,
          alt: SEO_OG_IMAGE_ALT,
          type: "image/png",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description: safe.description,
      images: [
        {
          url: "/twitter-image",
          width: 1200,
          height: 630,
          alt: SEO_OG_IMAGE_ALT,
        },
      ],
    },
  };
}

/**
 * Builds sanitized Schema.org JSON-LD (`Organization`, `WebSite`, `SoftwareApplication`)
 * for non-visual `<script type="application/ld+json">` injection.
 */
export function buildStructuredDataJsonLd(siteTitle: string, siteDescription: string): string {
  const siteUrl = getSiteUrl();

  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${siteUrl}/#organization`,
        name: SEO_SITE_NAME,
        alternateName: [SEO_ALTERNATE_NAME, "AI Foundation Australia"],
        url: siteUrl,
        logo: {
          "@type": "ImageObject",
          url: `${siteUrl}/icon-512.png`,
          width: 512,
          height: 512,
        },
        founder: {
          "@type": "Person",
          name: "David Robertson",
        },
        parentOrganization: {
          "@type": "Organization",
          name: "AI Foundation",
          url: "https://aifoundation.net.au/",
        },
        areaServed: [
          { "@type": "Country", name: "Australia" },
          { "@type": "Country", name: "New Zealand" },
          { "@type": "Place", name: "Worldwide" },
        ],
      },
      {
        "@type": "WebSite",
        "@id": `${siteUrl}/#website`,
        url: siteUrl,
        name: SEO_SITE_NAME,
        alternateName: SEO_ALTERNATE_NAME,
        description: siteDescription,
        inLanguage: "en-AU",
        publisher: {
          "@id": `${siteUrl}/#organization`,
        },
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${siteUrl}/#application`,
        name: SEO_SITE_NAME,
        headline: siteTitle,
        description: siteDescription,
        url: siteUrl,
        applicationCategory: "BusinessApplication",
        applicationSubCategory: "Advertising Intelligence & AI Creative Software",
        operatingSystem: "Web, iOS, Android, macOS, Windows",
        inLanguage: "en-AU",
        publisher: {
          "@id": `${siteUrl}/#organization`,
        },
        offers: {
          "@type": "Offer",
          price: "1.00",
          priceCurrency: "AUD",
          availability: "https://schema.org/InStock",
          url: `${siteUrl}/wallet`,
          description: "Pay-as-you-go non-expiring ad intelligence tokens with no monthly lock-in.",
        },
        featureList: [
          "Search live Meta (Facebook & Instagram), TikTok, Google & YouTube ad libraries",
          "Filter by 28+ day Proven Winners and 60+ day Extended Winners",
          "0-100 Winner Matrix scoring across Brand Fit, Hook Strength, and Longevity",
          "AI Creative Remix Studio with hook deconstruction, scripts, and shot-by-shot storyboards",
          "Multi-Brand Vault and Community Brand Library",
          "Geolocation-matched human Ad Agents for custom brand and ad strategy",
        ],
      },
    ],
  };

  return JSON.stringify(graph).replace(/</g, "\\u003c");
}
