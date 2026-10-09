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

export function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <CartProvider>
      <Suspense fallback={null}>
        <AttributionCapture />
      </Suspense>
      <ResearcherVerificationGate />
      <GoogleAdsMeasurement />
      <Suspense fallback={null}><MetaAdsMeasurement /></Suspense>
      <div className="flex min-h-screen flex-col">
        <Header />
        <AnnouncementBar />
        <div className="flex-1">{children}</div>
        <Footer />
      </div>
      <CartDrawer />
      <CookieConsentControls />
    </CartProvider>
  );
}
