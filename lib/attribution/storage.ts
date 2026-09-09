import {
  ATTRIBUTION_STORAGE_KEY,
} from "./types";
import type { StoredAttributionState } from "./types";
import {
  mergePaidTouch,
  parseTouchFromSearchParams,
  pruneStoredAttribution,
  toOrderAttribution,
} from "./logic";
import type { OrderAttribution } from "./types";

function readRaw(): StoredAttributionState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ATTRIBUTION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredAttributionState;
    return pruneStoredAttribution(parsed);
  } catch {
    return null;
  }
}

function writeRaw(state: StoredAttributionState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      ATTRIBUTION_STORAGE_KEY,
      JSON.stringify(pruneStoredAttribution(state))
    );
  } catch {
    /* private mode / quota — attribution is best-effort */
  }
}

/**
 * Capture current URL if it is a paid landing. Direct revisits leave
 * existing paid attribution untouched for the 30-day window.
 */
export function captureAttributionFromLocation(
  href = typeof window !== "undefined" ? window.location.href : "",
  referrer = typeof document !== "undefined" ? document.referrer : ""
): StoredAttributionState {
  let pathname = "/";
  let search = "";
  try {
    const url = new URL(href, "https://psllabs.org");
    pathname = url.pathname || "/";
    search = url.search || "";
  } catch {
    pathname = "/";
    search = "";
  }

  const incoming = parseTouchFromSearchParams(search, pathname, referrer);
  const next = mergePaidTouch(readRaw(), incoming);
  writeRaw(next);
  return next;
}

export function getOrderAttributionForCheckout(): OrderAttribution | null {
  return toOrderAttribution(readRaw());
}
