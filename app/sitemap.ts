import type { MetadataRoute } from "next";

import { ANALYTICAL_GUIDES } from "@/lib/content/guides-data";
import { getScienceArticles } from "@/lib/content/science";
import { getActiveCatalogProducts } from "@/lib/products/catalog";
import { getProductRender } from "@/lib/products/renders";
import { SITE_URL } from "@/lib/seo";
import { pageLastModified } from "@/lib/seo-page-dates";

export default function sitemap(): MetadataRoute.Sitemap {
  // Only indexable canonical content belongs here. Do not stamp build time as
  // lastmod: it is not evidence that a page's content changed. Dates for pages
  // without their own content dates live in lib/seo-page-dates.ts.
  const staticPaths = [
    "", "/products", "/coa", "/testing", "/guides", "/about", "/shipping",
    "/faq", "/contact", "/returns", "/science", "/terms", "/privacy", "/disclaimer", "/partners", "/partners/terms",
  ];

  const staticRoutes = staticPaths.map((path) => {
    const lastModified = pageLastModified(path);
    return { url: `${SITE_URL}${path}`, ...(lastModified ? { lastModified } : {}) };
  });
  // List the image the product page actually shows (the studio render) rather than the original
  // label PNGs.
  const productRoutes = getActiveCatalogProducts().map((product) => {
    const lastModified = pageLastModified(product.href);
    return {
      url: `${SITE_URL}${product.href}`,
      ...(lastModified ? { lastModified } : {}),
      images: [`${SITE_URL}${getProductRender(product.handle)?.src ?? product.imageSrc}`],
    };
  });
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
