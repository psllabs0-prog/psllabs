import type { Metadata } from "next";
import { Archivo, Inter, JetBrains_Mono } from "next/font/google";

import { SiteLayout } from "@/components/layout/SiteLayout";
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

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://psllabs.com"
  ),
  title: {
    default: "PSL Labs — The daily protocol for the next thirty years",
    template: "%s",
  },
  description:
    "Clinical-grade longevity compounds. Third-party verified, every batch. Designed to compound.",
  openGraph: {
    siteName: "PSL Labs",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary",
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
      className={`${archivo.variable} ${inter.variable} ${jetbrainsMono.variable}`}
    >
      <body className="font-sans">
        <SiteLayout>{children}</SiteLayout>
      </body>
    </html>
  );
}
