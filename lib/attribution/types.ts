import type { PrivacyConsentBinding } from "../privacy/types";

/**
 * Paid-acquisition attribution for PSL Labs.
 *
 * UTM naming convention (required for all contractors / ads):
 *
 * source:   google | bing | meta | x | reddit
 * medium:   cpc | paid_social | display | sponsored
 * campaign: <theme>_<geo>_<test>     e.g. testing_docs_us_test1
 * content:  <creative_concept>_<variant>  e.g. batch_docs_a
 *
 * Primary reporting attribution on an order = last non-direct paid touch.
 * First paid touch is also retained. Direct revisits do not overwrite paid data.
 */

export const ATTRIBUTION_STORAGE_KEY = "psl_attribution_v1";
export const ATTRIBUTION_WINDOW_DAYS = 30;
export const ATTRIBUTION_WINDOW_MS =
  ATTRIBUTION_WINDOW_DAYS * 24 * 60 * 60 * 1000;

export const ALLOWED_UTM_SOURCES = [
  "google",
  "bing",
  "meta",
  "x",
  "reddit",
] as const;

export const ALLOWED_UTM_MEDIUMS = [
  "cpc",
  "paid_social",
  "display",
  "sponsored",
] as const;

export const MAX_ATTR_FIELD_LENGTH = 200;

export type AttributionTouch = {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  landingPage: string | null;
  referrer: string | null;
  gclid: string | null;
  fbclid: string | null;
  msclkid: string | null;
  ttclid: string | null;
  /** Opaque OpenAI click reference; preserve its original value. */
  oppref?: string | null;
  capturedAt: string;
};

export type StoredAttributionState = {
  firstPaid: AttributionTouch | null;
  lastPaid: AttributionTouch | null;
  /** Most recent owned-email visit (utm_medium=email). Never replaces a paid touch. */
  lastEmail?: AttributionTouch | null;
  /** Last partner referral; retained separately from paid ads and email. */
  lastAffiliate?: AttributionTouch | null;
};

/**
 * Snapshot persisted on the order. Primary fields come from lastPaid, then
 * firstPaid, and fall back to the latest email or affiliate touch without paid data.
 */
export type OrderAttribution = {
  /** Trusted consent receipt binding set by checkout server code, never checkout JSON. */
  privacyConsent?: PrivacyConsentBinding;
  /** Explicit advertising-measurement choice at checkout; absence means no Google purchase. */
  googleAdsMeasurementConsent?: boolean;
  /** Measurement choice captured at checkout; true suppresses OpenAI events. */
  openaiAdsMeasurementOptOut?: boolean;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  landingPage: string | null;
  referrer: string | null;
  gclid: string | null;
  fbclid: string | null;
  msclkid: string | null;
  ttclid: string | null;
  oppref?: string | null;
  firstPaidTouchAt: string | null;
  lastPaidTouchAt: string | null;
  firstPaid: AttributionTouch | null;
  lastPaid: AttributionTouch | null;
  lastEmail?: AttributionTouch | null;
  lastEmailTouchAt?: string | null;
  lastAffiliate?: AttributionTouch | null;
  lastAffiliateTouchAt?: string | null;
};
