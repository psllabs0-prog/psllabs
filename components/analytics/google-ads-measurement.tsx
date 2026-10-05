"use client";

import Link from "next/link";
import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { readGoogleAdsConfig } from "@/lib/google-ads/config";
import {
  GOOGLE_ADS_PREFERENCES_EVENT, googleAdsGlobalPrivacyControl, readGoogleAdsConsent,
  setGoogleAdsConsent, subscribeGoogleAdsConsent,
} from "@/lib/google-ads/consent";
import { buildGoogleAdsBootstrap, markGoogleAdsReady, updateGoogleAdsConsent } from "@/lib/google-ads/browser";

const serverConsent = () => "unknown" as const;
const subscribeHydration = () => () => {};
const clientHydrated = () => true;
const serverHydrated = () => false;

export function GoogleAdsMeasurement() {
  const config = readGoogleAdsConfig();
  const pathname = usePathname();
  const consent = useSyncExternalStore(subscribeGoogleAdsConsent, readGoogleAdsConsent, serverConsent);
  const hydrated = useSyncExternalStore(subscribeHydration, clientHydrated, serverHydrated);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  useEffect(() => {
    const open = () => setPreferencesOpen(true);
    window.addEventListener(GOOGLE_ADS_PREFERENCES_EVENT, open);
    return () => window.removeEventListener(GOOGLE_ADS_PREFERENCES_EVENT, open);
  }, []);
  useEffect(() => { updateGoogleAdsConsent(consent === "granted"); }, [consent]);
  if (!config || !hydrated || pathname.startsWith("/admin")) return null;
  const browserOptOut = googleAdsGlobalPrivacyControl();
  const choose = (granted: boolean) => {
    setGoogleAdsConsent(granted ? "granted" : "denied");
    updateGoogleAdsConsent(readGoogleAdsConsent() === "granted");
    setPreferencesOpen(false);
  };
  return <>
    {consent === "granted" && <>
      <Script id="psl-google-ads-consent-init" strategy="afterInteractive">{buildGoogleAdsBootstrap(config)}</Script>
      <Script id="psl-google-ads-tag" src={`https://www.googletagmanager.com/gtag/js?id=${config.tagId}`}
        strategy="afterInteractive" onReady={markGoogleAdsReady} />
    </>}
    {(preferencesOpen || consent === "unknown") && <section aria-label="Advertising measurement preferences"
      className="fixed inset-x-3 bottom-3 z-[80] mx-auto max-w-[680px] rounded-2xl border border-linen bg-paper p-5 shadow-xl md:bottom-5">
      <h2 className="font-display text-base font-bold text-ink">Help us understand which ads work</h2>
      <p className="mt-2 text-sm leading-relaxed text-ash">
        {browserOptOut ? "Your browser’s privacy preference keeps advertising measurement off." :
          "Allow Google advertising cookies and purchase measurement? This helps us connect ads to sales. We keep personalized advertising off."}
        {" "}<Link href="/privacy" className="underline underline-offset-2">Privacy details</Link>
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" onClick={() => choose(false)} className="rounded-pill border border-ink px-5 py-2.5 text-sm font-medium text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
          {browserOptOut ? "Keep measurement off" : "Decline"}
        </button>
        {!browserOptOut && <button type="button" onClick={() => choose(true)} className="rounded-pill border border-accent bg-accent px-5 py-2.5 text-sm font-medium text-page focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">Allow measurement</button>}
      </div>
    </section>}
  </>;
}

export function GoogleAdsPreferencesButton() {
  if (!readGoogleAdsConfig()) return null;
  return <button type="button" className="mt-3 text-xs text-ash underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    onClick={() => window.dispatchEvent(new Event(GOOGLE_ADS_PREFERENCES_EVENT))}>Advertising preferences</button>;
}
