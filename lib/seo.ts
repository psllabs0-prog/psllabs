import type { Metadata } from "next";

import {
  DEFAULT_SHARE_IMAGE,
  SITE_DESCRIPTION,
  SITE_TITLE,
} from "@/lib/branding";

const SITE_NAME = "PSL Labs";

function resolveSiteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) return "https://www.psllabs.org";
  if (/^https?:\/\//i.test(raw)) return raw.replace(/\/+$/, "");
  return `https://${raw.replace(/\/+$/, "")}`;
}

/** Card checkout return URL host (Tagada redirect). Falls back to SITE_URL. */
function resolvePaymentsUrl(): string {
  const raw = process.env.NEXT_PUBLIC_PAYMENTS_URL?.trim();
  if (!raw) return resolveSiteUrl();
  if (/^https?:\/\//i.test(raw)) return raw.replace(/\/+$/, "");
  return `https://${raw.replace(/\/+$/, "")}`;
}

export const SITE_URL = resolveSiteUrl();
export const PAYMENTS_URL = resolvePaymentsUrl();

export function pageIndexingPolicy(path: string): "private" | "utility" | "public" {
  const pathname = path.split(/[?#]/, 1)[0].replace(/\/+$/, "") || "/";
  if (/^\/admin(?:-|\/|$)/.test(pathname) || /^\/partners\/(?:account|auth)(?:\/|$)/.test(pathname) ||
      /^\/(?:research-account|payment-return)(?:\/|$)/.test(pathname)) {
    return "private";
  }
  return ["/checkout", "/success", "/cancel", "/track", "/unsubscribe", "/newsletter/confirm"].includes(pathname)
    ? "utility"
    : "public";
}

export function createPageMetadata({
  title,
  description,
  path,
  type = "website",
  image,
}: {
  title: string;
  description: string;
  path: string;
  type?: "website" | "article";
  image?: { url: string; alt: string };
}): Metadata {
  const pageTitle = title.includes(SITE_NAME)
    ? title
    : `${title} | ${SITE_NAME}`;
  const indexing = pageIndexingPolicy(path);
  const shareImage = image ?? DEFAULT_SHARE_IMAGE;

  return {
    title: pageTitle,
    description,
    ...(indexing !== "public"
      ? { robots: { index: false, follow: indexing === "utility" } }
      : {}),
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
      images: [shareImage],
    },
    twitter: {
      card: "summary_large_image",
      title: pageTitle,
      description,
      images: [shareImage],
    },
  };
}

export { SITE_DESCRIPTION, SITE_TITLE };
