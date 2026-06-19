import type { Metadata } from "next";

const SITE_NAME = "PSL Labs";

export function createPageMetadata({
  title,
  description,
  path,
  type = "website",
}: {
  title: string;
  description: string;
  path: string;
  type?: "website" | "article";
}): Metadata {
  const pageTitle = title.includes(SITE_NAME) ? title : `${title} — ${SITE_NAME}`;

  return {
    title: pageTitle,
    description,
    openGraph: {
      title: pageTitle,
      description,
      url: path,
      siteName: SITE_NAME,
      type,
      locale: "en_US",
    },
    twitter: {
      card: "summary",
      title: pageTitle,
      description,
    },
  };
}
