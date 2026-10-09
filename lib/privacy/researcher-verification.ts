export const RESEARCHER_VERIFICATION_KEY = "psl_researcher_verified_v1";
const VERIFICATION_EVENT = "psl-researcher-verification";
let sessionVerified = false;

export function readResearcherVerification(): boolean {
  if (typeof window === "undefined") return false;
  try { return sessionVerified || window.localStorage.getItem(RESEARCHER_VERIFICATION_KEY) === "1"; }
  catch { return sessionVerified; }
}

export const serverResearcherVerification = () => false;

/** Call only after both existing eligibility checkboxes have been confirmed. */
export function confirmResearcherVerification(): void {
  sessionVerified = true;
  try { window.localStorage.setItem(RESEARCHER_VERIFICATION_KEY, "1"); }
  catch { /* The required confirmation remains valid for this document only. */ }
  window.dispatchEvent(new Event(VERIFICATION_EVENT));
}

export function subscribeResearcherVerification(listener: () => void): () => void {
  const storage = (event: StorageEvent) => {
    if (event.key === RESEARCHER_VERIFICATION_KEY || event.key === null) {
      sessionVerified = false;
      listener();
    }
  };
  window.addEventListener(VERIFICATION_EVENT, listener);
  window.addEventListener("storage", storage);
  return () => {
    window.removeEventListener(VERIFICATION_EVENT, listener);
    window.removeEventListener("storage", storage);
  };
}
