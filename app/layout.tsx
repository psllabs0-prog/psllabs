import type { Metadata } from "next";
import { Archivo, IBM_Plex_Mono, Inter, Source_Serif_4 } from "next/font/google";

import { ApplicationShell } from "@/components/layout/application-shell";
import { DEFAULT_SHARE_IMAGE } from "@/lib/branding";
import { SITE_DESCRIPTION, SITE_TITLE, SITE_URL } from "@/lib/seo";
import "./globals.css";
import "./storefront.css";
import { isDesignPreview } from "@/lib/design-preview";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getResearchAccount } from "@/lib/research-auth/server";
import { RESEARCH_PATH_HEADER, researchPathRequiresAccount } from "@/lib/research-auth/paths";
import { safeResearchReturnPath } from "@/lib/research-auth/qualification";

const archivo = Archivo({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["500", "600", "700"],
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-serif",
  weight: ["600"],
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  ...(isDesignPreview() ? { robots: { index: false, follow: false } } : {}),
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: "%s",
  },
  description: SITE_DESCRIPTION,
  other: {
    "facebook-domain-verification": "hgjjo1lsoncv50z8autv2otgn55yj6",
  },
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    siteName: "PSL Labs",
    locale: "en_US",
    type: "website",
    images: [DEFAULT_SHARE_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [DEFAULT_SHARE_IMAGE],
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const requestHeaders = await headers();
  const path = requestHeaders.get(RESEARCH_PATH_HEADER) || "/";
  if (researchPathRequiresAccount(path) && !await getResearchAccount(requestHeaders)) {
    redirect(`/research-account/sign-in?next=${encodeURIComponent(safeResearchReturnPath(path))}`);
  }
  return (
    <html
      lang="en"
      className={`${archivo.variable} ${inter.variable} ${sourceSerif.variable} ${ibmPlexMono.variable}`}
    >
      <body className="font-sans">
        <ApplicationShell visualPreview={isDesignPreview()}>{children}</ApplicationShell>
      </body>
    </html>
  );
}
