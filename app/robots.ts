import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // HTML utility/admin pages publish noindex. Crawlers must be able to
      // fetch them to see that directive; authentication still protects data.
      disallow: ["/api/"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
