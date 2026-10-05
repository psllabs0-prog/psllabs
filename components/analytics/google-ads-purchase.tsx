"use client";

import { useEffect, useSyncExternalStore } from "react";
import { readGoogleAdsConfig } from "@/lib/google-ads/config";
import { readGoogleAdsConsent, subscribeGoogleAdsConsent } from "@/lib/google-ads/consent";
import { googleAdsReady, queueGooglePurchase, subscribeGoogleAdsReady } from "@/lib/google-ads/browser";

const serverConsent = () => "unknown" as const;
const serverReady = () => false;

/** Local order status only starts the lookup; the server receipt is the proof. */
export function GoogleAdsPurchaseConversion({ orderId, paid }: { orderId: string; paid: boolean }) {
  const consent = useSyncExternalStore(subscribeGoogleAdsConsent, readGoogleAdsConsent, serverConsent);
  const ready = useSyncExternalStore(subscribeGoogleAdsReady, googleAdsReady, serverReady);
  useEffect(() => {
    const config = readGoogleAdsConfig();
    if (!config || !paid || !ready || consent !== "granted") return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    async function check() {
      if (controller.signal.aborted || readGoogleAdsConsent() !== "granted") return;
      attempts++;
      try {
        const response = await fetch(`/api/google-ads/purchase?orderId=${encodeURIComponent(orderId)}`,
          { cache: "no-store", signal: controller.signal });
        if (response.ok) {
          const body = await response.json();
          if (body.purchase) { queueGooglePurchase(body.purchase, config!); return; }
        }
      } catch { /* Measurement must never interrupt order confirmation. */ }
      if (!controller.signal.aborted && attempts < 6) timer = setTimeout(check, 3000);
    }
    void check();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [orderId, paid, consent, ready]);
  return null;
}
