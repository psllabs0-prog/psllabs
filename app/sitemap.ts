import type { MetadataRoute } from "next";

import { ANALYTICAL_GUIDES } from "@/lib/content/guides-data";
import { getActiveCatalogProducts } from "@/lib/products/catalog";
import { getScienceSlugs } from "@/lib/content/science";
import { SITE_URL } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  const currentDate = new Date().toISOString().split("T")[0];

  // Static core routes
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: `${SITE_URL}`,
      lastModified: currentDate,
      changeFrequency: "daily",
      priority: 1.0,
    },
    {
      url: `${SITE_URL}/products`,
      lastModified: currentDate,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/coa`,
      lastModified: currentDate,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/testing`,
      lastModified: currentDate,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/guides`,
      lastModified: currentDate,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/about`,
      lastModified: currentDate,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${SITE_URL}/shipping`,
      lastModified: currentDate,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${SITE_URL}/faq`,
      lastModified: currentDate,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${SITE_URL}/contact`,
      lastModified: currentDate,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${SITE_URL}/returns`,
      lastModified: currentDate,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${SITE_URL}/science`,
      lastModified: currentDate,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${SITE_URL}/track`,
      lastModified: currentDate,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${SITE_URL}/terms`,
      lastModified: currentDate,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/privacy`,
      lastModified: currentDate,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/disclaimer`,
      lastModified: currentDate,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];

  // Active products
  const productRoutes: MetadataRoute.Sitemap = getActiveCatalogProducts().map(
    (product) => ({
      url: `${SITE_URL}${product.href}`,
      lastModified: currentDate,
      changeFrequency: "weekly",
      priority: 0.9,
    })
  );

  // Analytical Guides cluster
  const guideRoutes: MetadataRoute.Sitemap = ANALYTICAL_GUIDES.map(
    (guide) => ({
      url: `${SITE_URL}/guides/${guide.slug}`,
      lastModified: guide.modifiedDate || guide.publishedDate,
      changeFrequency: "monthly",
      priority: guide.featured ? 0.85 : 0.75,
    })
  );

  // Science articles
  const scienceRoutes: MetadataRoute.Sitemap = getScienceSlugs().map(
    (slug) => ({
      url: `${SITE_URL}/science/${slug}`,
      lastModified: currentDate,
      changeFrequency: "monthly",
      priority: 0.65,
    })
  );

  return [...staticRoutes, ...productRoutes, ...guideRoutes, ...scienceRoutes];
}
