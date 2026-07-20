import type { Metadata } from "next";

import { SITE_DESCRIPTION, SITE_TITLE } from "@/lib/branding";

const SITE_NAME = "PSL Labs";

function resolveSiteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) return "https://www.psllabs.org";
  if (/^https?:\/\//i.test(raw)) return raw.replace(/\/+$/, "");
  return `https://${raw.replace(/\/+$/, "")}`;
}

export const SITE_URL = resolveSiteUrl();

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
  const pageTitle = title.includes(SITE_NAME)
    ? title
    : `${title} — ${SITE_NAME}`;

  return {
    title: pageTitle,
    description,
    alternates: {
      canonical: path,
    },
    openGraph: {
      title: pageTitle,
      description,
      url: path,
      siteName: SITE_NAME,
      type,
      locale: "en_US",
    },
    twitter: {
      card: "summary_large_image",
      title: pageTitle,
      description,
    },
  };
}

export { SITE_DESCRIPTION, SITE_TITLE };
