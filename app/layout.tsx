import type { Metadata } from "next";
import { Archivo, Inter, JetBrains_Mono, Source_Serif_4 } from "next/font/google";

import { SiteLayout } from "@/components/layout/SiteLayout";
import { SITE_DESCRIPTION, SITE_TITLE, SITE_URL } from "@/lib/seo";
import "./globals.css";

const archivo = Archivo({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["600", "700"],
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

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: "%s",
  },
  description: SITE_DESCRIPTION,
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    siteName: "PSL Labs",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${archivo.variable} ${inter.variable} ${sourceSerif.variable} ${jetbrainsMono.variable}`}
    >
      <body className="font-sans">
        <SiteLayout>{children}</SiteLayout>
      </body>
    </html>
  );
}
