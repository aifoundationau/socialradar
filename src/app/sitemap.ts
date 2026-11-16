import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/seo";

const SITEMAP_LAST_MODIFIED = "2026-11-15";

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = getSiteUrl();

  return [
    {
      url: siteUrl,
      lastModified: SITEMAP_LAST_MODIFIED,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${siteUrl}/radar`,
      lastModified: SITEMAP_LAST_MODIFIED,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${siteUrl}/library`,
      lastModified: SITEMAP_LAST_MODIFIED,
      changeFrequency: "daily",
      priority: 0.85,
    },
    {
      url: `${siteUrl}/customize`,
      lastModified: SITEMAP_LAST_MODIFIED,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${siteUrl}/brands`,
      lastModified: SITEMAP_LAST_MODIFIED,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${siteUrl}/wallet`,
      lastModified: SITEMAP_LAST_MODIFIED,
      changeFrequency: "monthly",
      priority: 0.7,
    },
  ];
}
