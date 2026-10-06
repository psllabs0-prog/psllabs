import { LEGAL_ENTITY_NAME } from "@/lib/content/testing-scope";
import { SITE_URL } from "@/lib/seo";

export function createBreadcrumbData(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: `${SITE_URL}${item.path}`,
    })),
  };
}

export function createArticleData({
  title, description, path, publishedDate, modifiedDate,
}: {
  title: string;
  description: string;
  path: string;
  publishedDate: string;
  modifiedDate?: string;
}) {
  const organization = {
    "@type": "Organization",
    name: "PSL Labs",
    legalName: LEGAL_ENTITY_NAME,
    url: SITE_URL,
  };
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: title,
    description,
    author: organization,
    publisher: organization,
    datePublished: publishedDate,
    dateModified: modifiedDate ?? publishedDate,
    url: `${SITE_URL}${path}`,
    mainEntityOfPage: `${SITE_URL}${path}`,
    inLanguage: "en-US",
  };
}
