"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { readGoogleAdsConfig } from "@/lib/google-ads/config";
import { readGoogleAdsConsent, subscribeGoogleAdsConsent } from "@/lib/google-ads/consent";
import { buildGoogleAdsBootstrap, markGoogleAdsReady } from "@/lib/google-ads/browser";
import { isPrivacyExcludedPath } from "@/lib/privacy/client";

const serverConsent = () => "unknown" as const;

/** The unified consent control owns the choice; this component only loads an eligible tag. */
export function GoogleAdsMeasurement() {
  const config = readGoogleAdsConfig();
  const pathname = usePathname();
  const consent = useSyncExternalStore(subscribeGoogleAdsConsent, readGoogleAdsConsent, serverConsent);
  const tagStarted = useRef(false);
  const reloadStarted = useRef(false);
  const allowed = !!config && consent === "granted" && !isPrivacyExcludedPath(pathname);
  useEffect(() => {
    if (allowed) {
      tagStarted.current = true;
      return;
    }
    if (!tagStarted.current) return;
    // A consent-update command can itself send a cookieless ping. Stop our
    // dispatch and unload the SDK instead. The persisted pending withdrawal
    // survives the reload and is retried by the first-party consent service.
    const measurementWindow = window as Window & { pslGoogleAdsReady?: boolean; gtag?: (...args: unknown[]) => void };
    measurementWindow.pslGoogleAdsReady = false;
    measurementWindow.gtag = () => {};
    if (!reloadStarted.current) {
      reloadStarted.current = true;
      window.location.reload();
    }
  }, [allowed]);

  if (!config || !allowed) return null;
  return <>
    <Script id="psl-google-ads-consent-init" strategy="afterInteractive">{buildGoogleAdsBootstrap(config)}</Script>
    <Script id="psl-google-ads-tag" src={`https://www.googletagmanager.com/gtag/js?id=${config.tagId}`}
      strategy="afterInteractive" onReady={() => {
        if (readGoogleAdsConsent() === "granted") markGoogleAdsReady();
      }} />
  </>;
}
