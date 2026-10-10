/** Increment when providers, purposes or permitted data sharing change. */
export const PRIVACY_CONSENT_VERSION = 2;
export const PRIVACY_CONSENT_TTL_MS = 180 * 24 * 60 * 60 * 1000;
export const PRIVACY_CONSENT_COOKIE = "psl_optional_consent";
export type PrivacyChoices = { measurement: boolean; personalization: boolean };
export type PrivacyCapabilities = {
  metaMeasurement: boolean;
  metaPersonalization: boolean;
  tiktokMeasurement: boolean;
  tiktokPersonalization: boolean;
  googleMeasurement: boolean;
  openaiMeasurement: boolean;
};
export type PublicPrivacyConsent = PrivacyChoices & {
  version: number;
  choice: "unknown" | "saved";
  revision: number;
  expiresAt: number;
  gpc: boolean;
  admin: boolean;
  capabilities: PrivacyCapabilities;
};
export type PrivacyConsentResponse = { consent: PublicPrivacyConsent };
/** Stored on an order by the server, never accepted from checkout JSON. */
export type PrivacyConsentBinding = { digest: string; revision: number; version: number };
export const NO_PRIVACY_CAPABILITIES: PrivacyCapabilities = {
  metaMeasurement: false, metaPersonalization: false,
  tiktokMeasurement: false, tiktokPersonalization: false,
  googleMeasurement: false, openaiMeasurement: false,
};
export const UNKNOWN_PRIVACY_CONSENT: PublicPrivacyConsent = {
  version: PRIVACY_CONSENT_VERSION, choice: "unknown", revision: 0, expiresAt: 0,
  measurement: false, personalization: false, gpc: false, admin: false,
  capabilities: NO_PRIVACY_CAPABILITIES,
};
