import {
  PRIVACY_CONSENT_VERSION, UNKNOWN_PRIVACY_CONSENT,
  type PrivacyChoices, type PublicPrivacyConsent,
} from "./types";
import { readResearcherVerification, subscribeResearcherVerification } from "./researcher-verification";

export const PRIVACY_CONSENT_EVENT = "psl-privacy-consent";
export const PRIVACY_PREFERENCES_EVENT = "psl-cookie-preferences";
export const PRIVACY_WITHDRAWAL_EVENT = "psl-privacy-withdrawal";
export const PRIVACY_CHOICE_KEY = "psl_privacy_choice_v1";
export const PRIVACY_PENDING_DECLINE_KEY = "psl_privacy_pending_decline_v1";
export type PrivacyClientStatus = {
  state: "checking" | "ready" | "saving" | "error";
  pendingDecline: boolean;
  error: string | null;
};
export const INITIAL_PRIVACY_STATUS: PrivacyClientStatus = {
  state: "checking", pendingDecline: false, error: null,
};
let consent = UNKNOWN_PRIVACY_CONSENT;
let status = INITIAL_PRIVACY_STATUS;
let verifiedFromServer = false;
let listening = false;
let initialized = false;
let serverInitialized = false;
let storageWorks: boolean | undefined;
let operation = 0;
let getInFlight: Promise<PublicPrivacyConsent> | null = null;
let saveQueue: Promise<unknown> = Promise.resolve();
let expiryTimer: ReturnType<typeof setTimeout> | undefined;
let derivedSource = consent;
let derivedReason = "";
let derivedConsent = consent;

export function globalPrivacyControl(): boolean {
  return typeof navigator !== "undefined" &&
    (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
}

export function isPrivacyExcludedPath(pathname: string): boolean {
  try {
    const decoded = decodeURIComponent(pathname);
    return /%|\\/.test(decoded) || /^\/(?:admin[^/]*|api|test(?:s)?|demo)(?:\/|$)/i.test(decoded);
  } catch { return true; }
}

function browserStorageWorks(): boolean {
  if (storageWorks !== undefined) return storageWorks;
  try {
    const key = "psl_privacy_storage_check";
    window.localStorage.setItem(key, "1");
    window.localStorage.removeItem(key);
    storageWorks = true;
  } catch { storageWorks = false; }
  return storageWorks;
}

function hasPendingDecline(): boolean {
  if (status.pendingDecline) return true;
  try { return window.localStorage.getItem(PRIVACY_PENDING_DECLINE_KEY) === "1"; }
  catch { return false; }
}

/** A browser cache is never evidence of a grant. A fresh server receipt is required. */
export function readPrivacyConsent(): PublicPrivacyConsent {
  if (typeof window === "undefined") return UNKNOWN_PRIVACY_CONSENT;
  const reason = globalPrivacyControl() || consent.gpc ? "gpc" :
    consent.admin || isPrivacyExcludedPath(window.location.pathname) ? "admin" :
    !readResearcherVerification() ? "age" :
    hasPendingDecline() ? "pending" :
    !verifiedFromServer || storageWorks === false ? "unverified" :
    consent.expiresAt > 0 && consent.expiresAt <= Date.now() ? "expired" : "";
  if (derivedSource !== consent || derivedReason !== reason) {
    derivedSource = consent;
    derivedReason = reason;
    derivedConsent = reason ? {
      ...consent, measurement: false, personalization: false,
      gpc: consent.gpc || reason === "gpc",
      choice: reason === "expired" ? "unknown" : consent.choice,
    } : consent;
  }
  return derivedConsent;
}

export const serverPrivacyConsent = () => UNKNOWN_PRIVACY_CONSENT;
export const readPrivacyClientStatus = () => status;
export const serverPrivacyClientStatus = () => INITIAL_PRIVACY_STATUS;

function notify(): void {
  window.dispatchEvent(new Event(PRIVACY_CONSENT_EVENT));
}

function setStatus(next: PrivacyClientStatus): void {
  status = next;
  notify();
}

function scrubOptionalIdentifiers(): void {
  try {
    window.localStorage.removeItem("psl_attribution_v1");
    window.localStorage.removeItem("psl_google_ads_consent_v1");
    window.localStorage.removeItem("ttoclid");
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith("psl_google_purchase_v1:")) window.localStorage.removeItem(key);
    }
  } catch { /* Denial remains in memory if storage is unavailable. */ }
  // Delete only known optional advertising cookies, never shopping or login cookies.
  for (const name of document.cookie.split(";").map((part) => part.trim().split("=")[0])) {
    if (!/^(?:_fbp|_fbc|_ttp|_tt_enable_cookie|ttclid|ttcsid(?:_[A-Za-z0-9_-]+)?|_gcl_[A-Za-z0-9_]+)$/.test(name)) continue;
    document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
    const host = window.location.hostname;
    document.cookie = `${name}=; Max-Age=0; Path=/; Domain=${host}; SameSite=Lax`;
    if (host === "psllabs.org" || host.endsWith(".psllabs.org")) {
      document.cookie = `${name}=; Max-Age=0; Path=/; Domain=.psllabs.org; SameSite=Lax`;
    }
  }
  window.dispatchEvent(new Event(PRIVACY_WITHDRAWAL_EVENT));
}

function denyLocally(pendingDecline: boolean): void {
  consent = { ...consent, measurement: false, personalization: false };
  verifiedFromServer = false;
  if (pendingDecline) {
    try { window.localStorage.setItem(PRIVACY_PENDING_DECLINE_KEY, "1"); } catch { /* Still deny. */ }
  }
  status = { ...status, pendingDecline };
  scrubOptionalIdentifiers();
  notify();
}

function validateResponse(value: unknown): PublicPrivacyConsent {
  const c = (value as { consent?: PublicPrivacyConsent } | null)?.consent;
  if (!c || c.version !== PRIVACY_CONSENT_VERSION ||
      (c.choice !== "unknown" && c.choice !== "saved") ||
      typeof c.measurement !== "boolean" || typeof c.personalization !== "boolean" ||
      typeof c.gpc !== "boolean" || typeof c.admin !== "boolean" ||
      !Number.isSafeInteger(c.revision) || c.revision < 0 || !Number.isSafeInteger(c.expiresAt) || c.expiresAt < 0 ||
      !c.capabilities || Object.values(c.capabilities).some((item) => typeof item !== "boolean")) {
    throw new Error("Invalid privacy response");
  }
  for (const name of ["metaMeasurement", "metaPersonalization", "tiktokMeasurement", "tiktokPersonalization", "googleMeasurement", "openaiMeasurement"] as const) {
    if (typeof c.capabilities[name] !== "boolean") throw new Error("Missing privacy capability");
  }
  if ((c.measurement || c.personalization) &&
      (c.choice !== "saved" || c.expiresAt <= Date.now() || c.gpc || c.admin)) {
    throw new Error("Invalid privacy grant");
  }
  return c;
}

function scheduleExpiry(): void {
  if (expiryTimer) clearTimeout(expiryTimer);
  if (!consent.expiresAt || consent.expiresAt <= Date.now()) return;
  expiryTimer = setTimeout(() => {
    if (consent.expiresAt <= Date.now()) {
      denyLocally(false);
      consent = { ...consent, choice: "unknown" };
      setStatus({ state: "ready", pendingDecline: false, error: null });
    } else scheduleExpiry();
  }, Math.min(consent.expiresAt - Date.now() + 10, 2_147_483_647));
}

async function fetchConsent(): Promise<PublicPrivacyConsent> {
  const requestOperation = operation;
  try {
    const response = await fetch("/api/privacy/consent", {
      credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error("Privacy service unavailable");
    const saved = validateResponse(await response.json());
    serverInitialized = true;
    if (requestOperation !== operation || hasPendingDecline()) return readPrivacyConsent();
    consent = saved;
    verifiedFromServer = true;
    if (!saved.measurement && !saved.personalization) scrubOptionalIdentifiers();
    scheduleExpiry();
    setStatus({ state: "ready", pendingDecline: false, error: null });
    return readPrivacyConsent();
  } catch {
    if (requestOperation === operation) {
      denyLocally(hasPendingDecline());
      setStatus({ state: "error", pendingDecline: hasPendingDecline(),
        error: "We could not verify your cookie preferences. Optional advertising stays off. Shopping and checkout still work." });
    }
    return readPrivacyConsent();
  }
}

export function initializePrivacyConsent(): Promise<PublicPrivacyConsent> {
  if (typeof window === "undefined" || isPrivacyExcludedPath(window.location.pathname) || !readResearcherVerification()) {
    return Promise.resolve(readPrivacyConsent());
  }
  ensureListeners();
  browserStorageWorks();
  initialized = true;
  if (hasPendingDecline()) return requestPrivacyConsent({ measurement: false, personalization: false });
  if (getInFlight) return getInFlight;
  getInFlight = fetchConsent().finally(() => { getInFlight = null; });
  return getInFlight;
}

export function requestPrivacyConsent(choices: PrivacyChoices): Promise<PublicPrivacyConsent> {
  if (typeof window === "undefined" || !readResearcherVerification() || isPrivacyExcludedPath(window.location.pathname)) {
    return Promise.resolve(readPrivacyConsent());
  }
  const permitted = !globalPrivacyControl() && !consent.admin && browserStorageWorks();
  const next = {
    measurement: permitted && choices.measurement,
    personalization: permitted && choices.measurement && choices.personalization,
  };
  const previous = readPrivacyConsent();
  const isReduction = (!next.measurement && previous.measurement) ||
    (!next.personalization && previous.personalization) || (!next.measurement && !next.personalization);
  const currentOperation = ++operation;
  const expectedRevision = consent.revision;
  if (isReduction) denyLocally(true);
  setStatus({ state: "saving", pendingDecline: hasPendingDecline(), error: null });
  const save = async () => {
    try {
      if (!serverInitialized) {
        await fetchConsent();
        if (!serverInitialized) throw new Error("Could not initialize privacy session");
      }
      // A grant queued before a newer choice or cross-tab withdrawal is stale.
      if ((next.measurement || next.personalization) && currentOperation !== operation) return readPrivacyConsent();
      const response = await fetch("/api/privacy/consent", {
        method: "POST", credentials: "same-origin", cache: "no-store", keepalive: true,
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ version: PRIVACY_CONSENT_VERSION, ...next, verifiedAdult: true, expectedRevision }),
      });
      if (response.status === 409 && currentOperation === operation) {
        denyLocally(hasPendingDecline());
        await fetchConsent();
        denyLocally(hasPendingDecline());
        consent = { ...consent, choice: "unknown" };
        setStatus({ state: "error", pendingDecline: hasPendingDecline(),
          error: "Your preferences changed in another tab. Optional advertising stays off. Review the current settings and choose again." });
        return readPrivacyConsent();
      }
      if (!response.ok) throw new Error("Could not save preferences");
      const saved = validateResponse(await response.json());
      if (currentOperation !== operation) return readPrivacyConsent();
      consent = saved;
      verifiedFromServer = true;
      try {
        window.localStorage.removeItem(PRIVACY_PENDING_DECLINE_KEY);
        // This is a cross-tab invalidation signal, not a reusable consent grant.
        window.localStorage.setItem(PRIVACY_CHOICE_KEY, JSON.stringify({ version: PRIVACY_CONSENT_VERSION, updatedAt: Date.now(), revision: saved.revision }));
      } catch { storageWorks = false; }
      scheduleExpiry();
      setStatus({ state: "ready", pendingDecline: false, error: storageWorks === false
        ? "Your browser cannot save cookie preferences. Optional advertising stays off." : null });
      return readPrivacyConsent();
    } catch {
      if (currentOperation === operation) {
        denyLocally(isReduction || hasPendingDecline());
        setStatus({ state: "error", pendingDecline: isReduction || hasPendingDecline(),
          error: isReduction
            ? "Optional advertising is off in this browser. The server has not confirmed withdrawal yet; we will retry when you are online. Keep this page open or use Retry."
            : "Your choice could not be saved. Optional advertising stays off. Please try again." });
      }
      return readPrivacyConsent();
    }
  };
  const result = saveQueue.then(save, save);
  saveQueue = result.catch(() => undefined);
  return result;
}

function ensureListeners(): void {
  if (listening || typeof window === "undefined") return;
  listening = true;
  const refresh = () => {
    if (!initialized || !readResearcherVerification()) return;
    if (globalPrivacyControl() && (consent.measurement || consent.personalization)) {
      void requestPrivacyConsent({ measurement: false, personalization: false });
    } else void initializePrivacyConsent();
  };
  window.addEventListener("focus", refresh);
  window.addEventListener("online", refresh);
  window.addEventListener("storage", (event) => {
    if ([PRIVACY_CHOICE_KEY, PRIVACY_PENDING_DECLINE_KEY, null].includes(event.key)) {
      operation++;
      denyLocally(hasPendingDecline());
      void initializePrivacyConsent();
    }
  });
  subscribeResearcherVerification(() => {
    if (!readResearcherVerification()) denyLocally(false);
    else void initializePrivacyConsent();
  });
  // Browsers do not provide a standard change event for Global Privacy Control.
  setInterval(() => {
    if (!initialized || !globalPrivacyControl()) return;
    if (consent.measurement || consent.personalization) {
      void requestPrivacyConsent({ measurement: false, personalization: false });
    }
  }, 1000);
}

export function subscribePrivacyConsent(listener: () => void): () => void {
  ensureListeners();
  window.addEventListener(PRIVACY_CONSENT_EVENT, listener);
  return () => window.removeEventListener(PRIVACY_CONSENT_EVENT, listener);
}
export const subscribePrivacyClientStatus = subscribePrivacyConsent;

export function openCookiePreferences(): void {
  window.dispatchEvent(new Event(PRIVACY_PREFERENCES_EVENT));
}
