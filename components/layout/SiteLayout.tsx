import { Suspense } from "react";

import { AttributionCapture } from "@/components/attribution/attribution-capture";
import { GoogleAdsMeasurement } from "@/components/analytics/google-ads-measurement";
import { MetaAdsMeasurement } from "@/components/analytics/meta-ads-measurement";
import { CartDrawer } from "@/components/cart/cart-drawer";
import { CartProvider } from "@/components/cart/cart-provider";
import { AnnouncementBar } from "@/components/layout/AnnouncementBar";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { ResearchAccountDeclarationBridge } from "@/components/research-auth/research-account-session";
import { ResearchUseBanner } from "@/components/layout/research-use-banner";
import { CookieConsentControls } from "@/components/privacy/cookie-preferences";
import { StorefrontTheme } from "./storefront-theme";

export function SiteLayout({ children, visualPreview = false }: { children: React.ReactNode; visualPreview?: boolean }) {
  return (
    <CartProvider>
      {!visualPreview && <Suspense fallback={null}>
        <AttributionCapture />
      </Suspense>}
      <ResearchAccountDeclarationBridge />
      {!visualPreview && <><GoogleAdsMeasurement />
      <Suspense fallback={null}><MetaAdsMeasurement /></Suspense></>}
      <StorefrontTheme visualPreview={visualPreview}>
      <a href="#main-content" className="storefront-skip-link">Skip to content</a>
      <div className="flex min-h-screen flex-col">
        <Header />
        <ResearchUseBanner />
        <AnnouncementBar />
        <div id="main-content" tabIndex={-1} className="flex-1 storefront-main-content">{children}</div>
        <Footer />
      </div>
      <CartDrawer />
      <CookieConsentControls />
      </StorefrontTheme>
    </CartProvider>
  );
}
