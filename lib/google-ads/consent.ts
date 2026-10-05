export const GOOGLE_ADS_CONSENT_KEY = "psl_google_ads_consent_v1";
export const GOOGLE_ADS_CONSENT_EVENT = "psl-google-ads-consent";
export const GOOGLE_ADS_PREFERENCES_EVENT = "psl-google-ads-preferences";
const CONSENT_TTL_MS = 180 * 24 * 60 * 60 * 1000;
export type GoogleAdsConsent = "granted" | "denied" | "unknown";

export function parseGoogleAdsConsent(raw: string | null, nowMs = Date.now()): GoogleAdsConsent {
  try {
    const value = JSON.parse(raw ?? "null");
    return value?.version === 1 && (value.choice === "granted" || value.choice === "denied") &&
      Number.isSafeInteger(value.updatedAt) && value.updatedAt <= nowMs &&
      nowMs - value.updatedAt <= CONSENT_TTL_MS ? value.choice : "unknown";
  } catch { return "unknown"; }
}

export function googleAdsGlobalPrivacyControl(): boolean {
  return typeof navigator !== "undefined" &&
    (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
}

export function readGoogleAdsConsent(): GoogleAdsConsent {
  if (googleAdsGlobalPrivacyControl()) return "denied";
  if (typeof window === "undefined") return "unknown";
  try { return parseGoogleAdsConsent(window.localStorage.getItem(GOOGLE_ADS_CONSENT_KEY)); }
  catch { return "unknown"; }
}

export function setGoogleAdsConsent(choice: Exclude<GoogleAdsConsent, "unknown">): void {
  if (typeof window === "undefined") return;
  const allowedChoice = googleAdsGlobalPrivacyControl() ? "denied" : choice;
  try {
    window.localStorage.setItem(GOOGLE_ADS_CONSENT_KEY,
      JSON.stringify({ version: 1, choice: allowedChoice, updatedAt: Date.now() }));
  } catch { /* No persistent consent means measurement stays off. */ }
  window.dispatchEvent(new Event(GOOGLE_ADS_CONSENT_EVENT));
}

export function subscribeGoogleAdsConsent(onChange: () => void): () => void {
  const storage = (event: StorageEvent) => {
    if (event.key === GOOGLE_ADS_CONSENT_KEY || event.key === null) onChange();
  };
  window.addEventListener(GOOGLE_ADS_CONSENT_EVENT, onChange);
  window.addEventListener("storage", storage);
  window.addEventListener("focus", onChange);
  return () => {
    window.removeEventListener(GOOGLE_ADS_CONSENT_EVENT, onChange);
    window.removeEventListener("storage", storage);
    window.removeEventListener("focus", onChange);
  };
}
