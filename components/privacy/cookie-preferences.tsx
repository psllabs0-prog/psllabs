"use client";

import { Dialog } from "@base-ui/react/dialog";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useCart } from "@/components/cart/cart-provider";
import { PillButton } from "@/components/ui/pill-button";
import {
  initializePrivacyConsent, isPrivacyExcludedPath, openCookiePreferences,
  PRIVACY_PREFERENCES_EVENT, readPrivacyClientStatus, readPrivacyConsent,
  requestPrivacyConsent, serverPrivacyClientStatus, serverPrivacyConsent,
  subscribePrivacyClientStatus, subscribePrivacyConsent,
} from "@/lib/privacy/client";
import {
  readResearcherVerification, serverResearcherVerification, subscribeResearcherVerification,
} from "@/lib/privacy/researcher-verification";
import type { PublicPrivacyConsent } from "@/lib/privacy/types";

const choiceButtonClass = "min-h-11 min-w-0 flex-1 whitespace-nowrap border border-accent bg-transparent px-3 text-xs text-ink hover:bg-accent/10 sm:px-5 sm:text-sm";

export function CookiePreferencesButton() {
  return <button type="button" onClick={openCookiePreferences}
    className="mt-3 inline-flex min-h-11 items-center text-sm text-ash underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
    Cookie preferences
  </button>;
}

export function CookieConsentControls() {
  const pathname = usePathname();
  const { isOpen: cartOpen } = useCart();
  const consent = useSyncExternalStore(subscribePrivacyConsent, readPrivacyConsent, serverPrivacyConsent);
  const status = useSyncExternalStore(subscribePrivacyClientStatus, readPrivacyClientStatus, serverPrivacyClientStatus);
  const verified = useSyncExternalStore(subscribeResearcherVerification, readResearcherVerification, serverResearcherVerification);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const bannerRef = useRef<HTMLElement>(null);
  const spacerRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const excluded = isPrivacyExcludedPath(pathname) || consent.admin;
  const bannerVisible = verified && !excluded && !cartOpen && !preferencesOpen &&
    (consent.choice === "unknown" || status.pendingDecline);

  useEffect(() => {
    if (verified && !excluded) void initializePrivacyConsent();
  }, [verified, excluded]);

  useEffect(() => {
    const open = () => {
      previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setPreferencesOpen(true);
    };
    window.addEventListener(PRIVACY_PREFERENCES_EVENT, open);
    // Old footer links in an already-open browser can still open the unified controls.
    window.addEventListener("psl-google-ads-preferences", open);
    return () => {
      window.removeEventListener(PRIVACY_PREFERENCES_EVENT, open);
      window.removeEventListener("psl-google-ads-preferences", open);
    };
  }, []);

  useEffect(() => {
    const banner = bannerRef.current;
    const spacer = spacerRef.current;
    if (!bannerVisible || !banner || !spacer) return;
    const originalPadding = document.documentElement.style.scrollPaddingBottom;
    const resize = () => {
      const height = Math.ceil(banner.getBoundingClientRect().height);
      spacer.style.height = `${height}px`;
      document.documentElement.style.scrollPaddingBottom = `${height + 16}px`;
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(banner);
    return () => {
      observer.disconnect();
      spacer.style.height = "0px";
      document.documentElement.style.scrollPaddingBottom = originalPadding;
    };
  }, [bannerVisible]);

  const choose = async (measurement: boolean, personalization: boolean) => {
    await requestPrivacyConsent({ measurement, personalization });
    if (readPrivacyClientStatus().state === "ready") setPreferencesOpen(false);
  };
  const busy = status.state === "checking" || status.state === "saving";

  return <>
    {bannerVisible && <>
      <div ref={spacerRef} aria-hidden="true" />
      <section ref={bannerRef} aria-label="Cookie preferences"
        className="fixed inset-x-0 bottom-0 z-[70] border-t border-border-strong bg-surface px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-8px_28px_rgb(0_0_0/0.18)] md:px-6">
        <div className="mx-auto flex max-w-[1320px] flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
          <div className="min-w-0">
            <p className="text-sm leading-relaxed text-ink">Optional cookies help us measure advertising and personalize ads.</p>
            {status.error && <p role="status" className="mt-1 max-w-[600px] text-xs leading-relaxed text-ash">{status.error}</p>}
            {consent.gpc && <p className="mt-1 text-xs leading-relaxed text-ash">Your browser’s privacy signal keeps optional advertising off.</p>}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2 sm:flex-nowrap">
            <PillButton size="sm" variant="secondary" className={choiceButtonClass} disabled={busy || status.pendingDecline || consent.gpc}
              onClick={() => void choose(true, true)}>Accept all</PillButton>
            <PillButton size="sm" variant="secondary" className={choiceButtonClass} disabled={busy}
              onClick={() => void choose(false, false)}>Decline optional</PillButton>
            <PillButton size="sm" variant="ghost" className="min-h-11 w-full sm:w-auto" onClick={openCookiePreferences}>Cookie settings</PillButton>
          </div>
        </div>
      </section>
    </>}
    <Dialog.Root open={preferencesOpen && verified && !cartOpen} onOpenChange={setPreferencesOpen}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[90] bg-black/70" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-[91] flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-[620px] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border border-border-strong bg-surface text-ink shadow-xl outline-none"
          finalFocus={() => previousFocus.current?.isConnected ? previousFocus.current : undefined}>
          <div className="flex items-center justify-between gap-4 border-b border-linen px-5 py-4 md:px-6">
            <Dialog.Title className="font-display text-xl font-bold">Cookie settings</Dialog.Title>
            <Dialog.Close aria-label="Close cookie settings" className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-pill border border-border-strong text-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">×</Dialog.Close>
          </div>
          {preferencesOpen && <PreferencesForm key={`${consent.revision}:${consent.gpc}:${excluded}`}
            consent={consent} excluded={excluded} onSave={choose} />}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  </>;
}

function PreferencesForm({ consent, excluded, onSave }: {
  consent: PublicPrivacyConsent; excluded: boolean;
  onSave: (measurement: boolean, personalization: boolean) => Promise<void>;
}) {
  const status = useSyncExternalStore(subscribePrivacyClientStatus, readPrivacyClientStatus, serverPrivacyClientStatus);
  const [measurement, setMeasurement] = useState(consent.measurement);
  const [personalization, setPersonalization] = useState(consent.personalization);
  const measurementAvailable = Object.entries(consent.capabilities).some(([key, active]) => key.endsWith("Measurement") && active);
  const personalizationAvailable = consent.capabilities.metaPersonalization;
  const disabled = excluded || consent.gpc || status.pendingDecline || status.state === "saving" || status.state === "checking";
  return <>
    <div className="min-h-0 space-y-5 overflow-y-auto px-5 py-5 text-sm leading-relaxed md:px-6">
      <Dialog.Description className="text-ash">Choose which optional advertising features you allow. Shopping, login, checkout, security, and your required researcher verification work whichever option you choose.</Dialog.Description>
      {(excluded || consent.gpc) && <p className="rounded-lg border border-border-strong p-3 text-ink">{excluded
        ? "Advertising collection is off for administrator and test activity."
        : "Global Privacy Control is active. Optional advertising measurement and personalization stay off."}</p>}
      <section className="rounded-lg border border-border-strong p-4">
        <h3 className="font-semibold">Essential functions <span className="ml-2 font-mono text-xs text-ash">Always on</span></h3>
        <p className="mt-2 text-ash">Essential storage keeps your cart, sign-in, consent choice, researcher verification, payment-return recovery, and security controls working. It does not depend on advertising consent.</p>
      </section>
      <section className="rounded-lg border border-border-strong p-4">
        <label className="flex min-h-11 items-center justify-between gap-4 font-semibold">
          Advertising measurement
          <input type="checkbox" checked={measurement && !consent.gpc && !excluded} disabled={disabled || !measurementAvailable}
            onChange={(event) => {
              setMeasurement(event.target.checked);
              if (!event.target.checked) setPersonalization(false);
            }} className="size-5 shrink-0 accent-accent" />
        </label>
        <p className="mt-1 text-ash">When an eligible integration is enabled, this allows its optional cookies and permitted website events to measure ad visits and completed actions. Advertising platforms may receive browser information, permitted event identifiers, timestamps, and eligible purchase values and currency.</p>
        <ul className="mt-3 space-y-2 text-ash">
          <li>Meta: {consent.capabilities.metaMeasurement ? "available for permitted pages and events only." : "off; not currently available."}</li>
          <li>Google: {consent.capabilities.googleMeasurement ? "optional purchase measurement is available; enhanced conversions and personalized ads remain off." : "off on this website."}</li>
          <li>OpenAI: {consent.capabilities.openaiMeasurement ? "optional eligible purchase measurement is available, with personalization opted out." : "off on this website."}</li>
          <li>TikTok: off; not enabled by this consent choice.</li>
        </ul>
      </section>
      <section className="rounded-lg border border-border-strong p-4">
        <label className="flex min-h-11 items-center justify-between gap-4 font-semibold">
          Personalized advertising
          <input type="checkbox" checked={personalization && !consent.gpc && !excluded} disabled={disabled || !measurement || !personalizationAvailable}
            onChange={(event) => setPersonalization(event.target.checked)} className="size-5 shrink-0 accent-accent" />
        </label>
        <p className="mt-1 text-ash">Retargeting can reach eligible past visitors. Purchaser exclusions can avoid showing acquisition ads to eligible recent purchasers. Similar audiences can help platforms find new people with patterns similar to an eligible source audience.</p>
        <p className="mt-2 text-ash">{personalizationAvailable
          ? "Only permitted Meta audience uses are available. We do not upload customer contact lists or enable automatic customer matching."
          : "Retargeting, customer matching, purchaser exclusions, and similar audiences are currently off. Accepting now does not authorize features introduced later."}</p>
      </section>
      <p className="text-ash">Consent does not permit sending sensitive health information, card details, or prohibited product information. Use Cookie preferences in the footer to withdraw. Withdrawal stops future collection and use through our integrations once confirmed; it does not automatically erase information a platform already received. Contact support@psllabs.org for deletion or privacy requests.</p>
      <p className="text-ash">Choices expire after 180 days. We honor applicable browser privacy opt-out signals. <Link href="/privacy" className="text-accent underline underline-offset-4">Read the privacy policy</Link>.</p>
      {status.error && <p role="status" className="rounded-lg border border-border-strong p-3 text-ink">{status.error}</p>}
      {status.pendingDecline && <PillButton size="sm" variant="secondary" disabled={status.state === "saving"}
        onClick={() => void requestPrivacyConsent({ measurement: false, personalization: false })}>Retry withdrawal</PillButton>}
    </div>
    <div className="grid grid-cols-2 gap-2 border-t border-linen px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:px-6">
      <PillButton size="sm" variant="secondary" className={choiceButtonClass} disabled={disabled}
        onClick={() => void onSave(true, true)}>Accept all</PillButton>
      <PillButton size="sm" variant="secondary" className={choiceButtonClass} disabled={status.state === "saving" || status.state === "checking" || excluded}
        onClick={() => void onSave(false, false)}>Decline optional</PillButton>
      <PillButton size="sm" className="col-span-2 min-h-11" disabled={disabled}
        onClick={() => void onSave(measurement, personalization)}>Save settings</PillButton>
    </div>
  </>;
}
