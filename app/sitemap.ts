import type { MetadataRoute } from "next";

import { ANALYTICAL_GUIDES } from "@/lib/content/guides-data";
import { getScienceArticles } from "@/lib/content/science";
import { getActiveCatalogProducts } from "@/lib/products/catalog";
import { SITE_URL } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  // Only indexable canonical content belongs here. Do not stamp build time as
  // lastmod: it is not evidence that a page's content changed.
  const staticPaths = [
    "", "/products", "/coa", "/testing", "/guides", "/about", "/shipping",
    "/faq", "/contact", "/returns", "/science", "/terms", "/privacy", "/disclaimer",
  ];

  const staticRoutes = staticPaths.map((path) => ({ url: `${SITE_URL}${path}` }));
  const productRoutes = getActiveCatalogProducts().map((product) => ({
    url: `${SITE_URL}${product.href}`,
    images: [`${SITE_URL}${product.imageSrc}`],
  }));
  const guideRoutes = ANALYTICAL_GUIDES.map((guide) => ({
    url: `${SITE_URL}/guides/${guide.slug}`,
    lastModified: guide.modifiedDate || guide.publishedDate,
  }));
  const scienceRoutes = getScienceArticles().map((article) => ({
    url: `${SITE_URL}/science/${article.slug}`,
    lastModified: article.modifiedDate || article.date || undefined,
  }));

  return [...staticRoutes, ...productRoutes, ...guideRoutes, ...scienceRoutes];
}
