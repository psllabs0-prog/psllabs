import type { GoogleAdsConfig } from "./config";
import { readGoogleAdsConsent } from "./consent";
import type { GoogleAdsPurchaseReceipt } from "./purchase-types";

export const GOOGLE_ADS_READY_EVENT = "psl-google-ads-ready";
type Gtag = (...args: unknown[]) => void;
type MeasurementWindow = Window & { gtag?: Gtag; pslGoogleAdsReady?: boolean };
const queued = new Set<string>();
const MARKER_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Remove order references, payment-return tokens, search terms, and fragments. */
export function googleMeasurementPageUrl(href: string): string {
  try {
    const url = new URL(href);
    if (!['https:', 'http:'].includes(url.protocol)) return "";
    const clean = new URL(url.pathname, url.origin);
    for (const key of ["gclid", "gbraid", "wbraid"]) {
      const value = url.searchParams.get(key);
      if (value && /^[A-Za-z0-9_-]{1,512}$/.test(value)) clean.searchParams.set(key, value);
    }
    return clean.toString();
  } catch { return ""; }
}

export function buildGoogleAdsBootstrap(config: GoogleAdsConfig): string {
  return `window.dataLayer=window.dataLayer||[];
window.gtag=window.gtag||function(){window.dataLayer.push(arguments);};
window.gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:'denied'});
window.gtag('consent','update',{ad_storage:'granted',ad_user_data:'granted',ad_personalization:'denied',analytics_storage:'denied'});
window.gtag('js',new Date());
window.gtag('set','allow_ad_personalization_signals',false);
window.gtag('config',${JSON.stringify(config.tagId)},{send_page_view:false,allow_ad_personalization_signals:false,allow_enhanced_conversions:false,allow_google_signals:false,page_location:(${googleMeasurementPageUrl.toString()})(window.location.href),page_referrer:''});`;
}

export function updateGoogleAdsConsent(granted: boolean): void {
  if (typeof window === "undefined") return;
  const gtag = (window as MeasurementWindow).gtag;
  if (!gtag) return;
  gtag("consent", "update", {
    ad_storage: granted ? "granted" : "denied",
    ad_user_data: granted ? "granted" : "denied",
    ad_personalization: "denied", analytics_storage: "denied",
  });
}

export function markGoogleAdsReady(): void {
  (window as MeasurementWindow).pslGoogleAdsReady = true;
  window.dispatchEvent(new Event(GOOGLE_ADS_READY_EVENT));
}
export function googleAdsReady(): boolean {
  return typeof window !== "undefined" && (window as MeasurementWindow).pslGoogleAdsReady === true;
}
export function subscribeGoogleAdsReady(onChange: () => void): () => void {
  window.addEventListener(GOOGLE_ADS_READY_EVENT, onChange);
  return () => window.removeEventListener(GOOGLE_ADS_READY_EVENT, onChange);
}

export function googlePurchaseParameters(receipt: unknown, config: GoogleAdsConfig) {
  const r = receipt as GoogleAdsPurchaseReceipt | null;
  if (!r || typeof r.transactionId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(r.transactionId) ||
      typeof r.value !== "number" || !Number.isFinite(r.value) || r.value <= 0 || r.value > 1000000 ||
      r.currency !== "USD") return null;
  return { send_to: config.sendTo, transaction_id: r.transactionId, value: r.value, currency: r.currency };
}

/** Queued is not proof of Google acceptance/attribution. Google dedups transaction_id too. */
export function queueGooglePurchase(receipt: unknown, config: GoogleAdsConfig): boolean {
  if (typeof window === "undefined" || !googleAdsReady() || readGoogleAdsConsent() !== "granted") return false;
  const params = googlePurchaseParameters(receipt, config);
  const gtag = (window as MeasurementWindow).gtag;
  if (!params || !gtag) return false;
  const key = `psl_google_purchase_v1:${config.sendTo}:${params.transaction_id}`;
  if (queued.has(key)) return false;
  try {
    const prior = Number(window.localStorage.getItem(key));
    if (prior > 0 && prior <= Date.now() && Date.now() - prior < MARKER_TTL_MS) return false;
  } catch { /* The in-memory guard and Google's transaction ID still deduplicate. */ }
  queued.add(key);
  try {
    gtag("event", "conversion", {
      ...params,
      page_location: `${window.location.origin}/success`, page_referrer: "",
      event_callback: () => {
        try { window.localStorage.setItem(key, String(Date.now())); } catch { /* best effort */ }
      },
    });
    return true;
  } catch { queued.delete(key); return false; }
}
