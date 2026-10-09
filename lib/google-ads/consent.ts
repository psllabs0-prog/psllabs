import {
  globalPrivacyControl, PRIVACY_CONSENT_EVENT, PRIVACY_PREFERENCES_EVENT,
  readPrivacyConsent, requestPrivacyConsent, subscribePrivacyConsent,
} from "../privacy/client";

/** Legacy storage is deliberately not accepted as optional-cookie permission. */
export const GOOGLE_ADS_CONSENT_KEY = "psl_google_ads_consent_v1";
export const GOOGLE_ADS_CONSENT_EVENT = PRIVACY_CONSENT_EVENT;
export const GOOGLE_ADS_PREFERENCES_EVENT = PRIVACY_PREFERENCES_EVENT;
export type GoogleAdsConsent = "granted" | "denied" | "unknown";
export const googleAdsGlobalPrivacyControl = globalPrivacyControl;

export function readGoogleAdsConsent(): GoogleAdsConsent {
  if (globalPrivacyControl()) return "denied";
  const consent = readPrivacyConsent();
  if (consent.choice === "unknown") return "unknown";
  return consent.measurement && consent.capabilities.googleMeasurement && !consent.admin
    ? "granted" : "denied";
}

export async function setGoogleAdsConsent(choice: Exclude<GoogleAdsConsent, "unknown">): Promise<void> {
  await requestPrivacyConsent({ measurement: choice === "granted", personalization: false });
}

export const subscribeGoogleAdsConsent = subscribePrivacyConsent;
