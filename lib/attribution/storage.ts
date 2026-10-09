import { ATTRIBUTION_STORAGE_KEY, type AttributionTouch, type OrderAttribution, type StoredAttributionState } from "./types";
import { mergePaidTouch, parseTouchFromSearchParams, pruneStoredAttribution, sanitizeAttributionFromBody, toOrderAttribution } from "./logic";
import { readPrivacyConsent } from "../privacy/client";
import type { PublicPrivacyConsent } from "../privacy/types";

const empty = (): StoredAttributionState => ({ firstPaid: null, lastPaid: null, lastEmail: null });
function clear(): void {
  try { window.localStorage.removeItem(ATTRIBUTION_STORAGE_KEY); } catch { /* Optional only. */ }
}
function allowedTouch(touch: AttributionTouch | null | undefined, consent: PublicPrivacyConsent): AttributionTouch | null {
  if (!touch) return null;
  let landingPage = touch.landingPage;
  if (landingPage) {
    try {
      const url = new URL(landingPage, "https://www.psllabs.org");
      for (const key of ["fbclid", "ttclid", "msclkid", "oppref"]) url.searchParams.delete(key);
      if (!consent.capabilities.googleMeasurement) url.searchParams.delete("gclid");
      landingPage = url.pathname + url.search;
    } catch { landingPage = null; }
  }
  return { ...touch, landingPage, fbclid: null, ttclid: null, msclkid: null,
    gclid: consent.capabilities.googleMeasurement ? touch.gclid : null,
    oppref: consent.capabilities.openaiMeasurement ? touch.oppref : null };
}
function permitted(consent: PublicPrivacyConsent): boolean {
  return consent.measurement && !consent.gpc && !consent.admin && consent.choice === "saved" &&
    consent.expiresAt > Date.now();
}
function read(consent: PublicPrivacyConsent): StoredAttributionState {
  try {
    const raw = window.localStorage.getItem(ATTRIBUTION_STORAGE_KEY);
    const state = raw ? pruneStoredAttribution(JSON.parse(raw)) : empty();
    return { firstPaid: allowedTouch(state.firstPaid, consent), lastPaid: allowedTouch(state.lastPaid, consent),
      lastEmail: allowedTouch(state.lastEmail, consent),
      ...(state.lastAffiliate ? { lastAffiliate: allowedTouch(state.lastAffiliate, consent) } : {}) };
  } catch { return empty(); }
}
/** No historical capture or optional identifier storage before a verified choice. */
export function captureAttributionFromLocation(
  href = typeof window !== "undefined" ? window.location.href : "",
  referrer = typeof document !== "undefined" ? document.referrer : "",
): StoredAttributionState {
  const consent = readPrivacyConsent();
  if (!permitted(consent)) { clear(); return empty(); }
  let incoming: AttributionTouch | null = null;
  try {
    const url = new URL(href);
    incoming = allowedTouch(parseTouchFromSearchParams(url.search, url.pathname, referrer), consent);
  } catch { /* No attribution for an invalid URL. */ }
  const next = mergePaidTouch(read(consent), incoming);
  try { window.localStorage.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify(next)); } catch { /* Optional only. */ }
  return next;
}
export function getOrderAttributionForCheckout(): OrderAttribution | null {
  const consent = readPrivacyConsent();
  if (!permitted(consent)) {
    clear();
    return sanitizeAttributionFromBody({ openaiAdsMeasurementOptOut: true });
  }
  return sanitizeAttributionFromBody({ ...toOrderAttribution(read(consent)),
    googleAdsMeasurementConsent: consent.capabilities.googleMeasurement,
    openaiAdsMeasurementOptOut: !consent.capabilities.openaiMeasurement });
}
