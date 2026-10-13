import { Suspense } from "react";

import { AttributionCapture } from "@/components/attribution/attribution-capture";
import { GoogleAdsMeasurement } from "@/components/analytics/google-ads-measurement";
import { MetaAdsMeasurement } from "@/components/analytics/meta-ads-measurement";
import { CartDrawer } from "@/components/cart/cart-drawer";
import { CartProvider } from "@/components/cart/cart-provider";
import { AnnouncementBar } from "@/components/layout/AnnouncementBar";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { ResearcherVerificationGate } from "@/components/layout/ResearcherVerificationGate";
import { CookieConsentControls } from "@/components/privacy/cookie-preferences";
import { StorefrontTheme } from "./storefront-theme";

export function SiteLayout({ children, visualPreview = false }: { children: React.ReactNode; visualPreview?: boolean }) {
  return (
    <CartProvider>
      {!visualPreview && <Suspense fallback={null}>
        <AttributionCapture />
      </Suspense>}
      <ResearcherVerificationGate />
      {!visualPreview && <><GoogleAdsMeasurement />
      <Suspense fallback={null}><MetaAdsMeasurement /></Suspense></>}
      <StorefrontTheme visualPreview={visualPreview}>
      <div className="flex min-h-screen flex-col">
        <Header />
        <AnnouncementBar />
        <div className="flex-1">{children}</div>
        <Footer />
      </div>
      <CartDrawer />
      <CookieConsentControls />
      </StorefrontTheme>
    </CartProvider>
  );
}
