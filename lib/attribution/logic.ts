import {
  ATTRIBUTION_WINDOW_MS,
  MAX_ATTR_FIELD_LENGTH,
  type AttributionTouch,
  type OrderAttribution,
  type StoredAttributionState,
} from "./types";

function cleanField(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, MAX_ATTR_FIELD_LENGTH);
  if (!trimmed) return null;
  // Strip control characters; keep URL-safe campaign tokens.
  const cleaned = trimmed.replace(/[\u0000-\u001F\u007F]/g, "");
  return cleaned || null;
}

type TouchFields = {
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  utmTerm?: string | null;
  gclid?: string | null;
  fbclid?: string | null;
  msclkid?: string | null;
  ttclid?: string | null;
};

function hasClickId(touch: TouchFields): boolean {
  return Boolean(touch.gclid || touch.fbclid || touch.msclkid || touch.ttclid);
}

/** Owned-email visit (retention, newsletter). Kept separate from paid touches. */
export function isEmailTouch(touch: TouchFields): boolean {
  return !hasClickId(touch) && (touch.utmMedium ?? "").trim().toLowerCase() === "email";
}

export function isPaidTouch(touch: TouchFields): boolean {
  if (hasClickId(touch)) {
    return true;
  }
  if (isEmailTouch(touch)) {
    return false;
  }
  const medium = (touch.utmMedium ?? "").toLowerCase();
  if (
    medium === "cpc" ||
    medium === "paid_social" ||
    medium === "display" ||
    medium === "sponsored" ||
    medium === "paid" ||
    medium === "ppc"
  ) {
    return true;
  }
  // Any explicit UTM campaign/source/content with a medium, or source alone with campaign.
  if (touch.utmSource && (touch.utmMedium || touch.utmCampaign)) {
    return true;
  }
  if (touch.utmCampaign && touch.utmSource) {
    return true;
  }
  return false;
}

export function parseTouchFromSearchParams(
  search: string,
  pathname: string,
  referrer: string
): AttributionTouch | null {
  const params = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search
  );

  const touch: AttributionTouch = {
    utmSource: cleanField(params.get("utm_source")),
    utmMedium: cleanField(params.get("utm_medium")),
    utmCampaign: cleanField(params.get("utm_campaign")),
    utmContent: cleanField(params.get("utm_content")),
    utmTerm: cleanField(params.get("utm_term")),
    landingPage: cleanField(
      `${pathname || "/"}${search && search !== "?" ? (search.startsWith("?") ? search : `?${search}`) : ""}`
    ),
    referrer: cleanReferrer(referrer),
    gclid: cleanField(params.get("gclid")),
    fbclid: cleanField(params.get("fbclid")),
    msclkid: cleanField(params.get("msclkid")),
    ttclid: cleanField(params.get("ttclid")),
    capturedAt: new Date().toISOString(),
  };

  if (!isPaidTouch(touch) && !isEmailTouch(touch)) {
    return null;
  }

  // Prefer a stable landing path without leaking long query strings beyond UTMs.
  touch.landingPage = cleanField(buildLandingPage(pathname, params));

  return touch;
}

function buildLandingPage(
  pathname: string,
  params: URLSearchParams
): string {
  const keep = [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_content",
    "utm_term",
    "gclid",
    "fbclid",
    "msclkid",
    "ttclid",
  ];
  const out = new URLSearchParams();
  for (const key of keep) {
    const value = params.get(key);
    if (value) out.set(key, value);
  }
  const qs = out.toString();
  return qs ? `${pathname || "/"}?${qs}` : pathname || "/";
}

function cleanReferrer(referrer: string): string | null {
  if (!referrer) return null;
  try {
    const url = new URL(referrer);
    return cleanField(`${url.origin}${url.pathname}`);
  } catch {
    return cleanField(referrer);
  }
}

function isWithinWindow(iso: string | null | undefined, now = Date.now()): boolean {
  if (!iso) return false;
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return false;
  return now - ts <= ATTRIBUTION_WINDOW_MS;
}

function latest(...touches: Array<AttributionTouch | null | undefined>): AttributionTouch | null {
  let best: AttributionTouch | null = null;
  for (const t of touches) {
    if (t && (!best || Date.parse(t.capturedAt) > Date.parse(best.capturedAt))) best = t;
  }
  return best;
}

/**
 * Drop expired touches. Direct visits never clear this; only time does.
 * Email touches stored as "paid" by older clients are moved to lastEmail.
 */
export function pruneStoredAttribution(
  state: StoredAttributionState | null,
  now = Date.now()
): StoredAttributionState {
  if (!state) {
    return { firstPaid: null, lastPaid: null, lastEmail: null };
  }
  const live = (t: AttributionTouch | null | undefined) =>
    t && isWithinWindow(t.capturedAt, now) ? t : null;
  const rawFirst = live(state.firstPaid);
  const rawLast = live(state.lastPaid);
  const firstPaid = rawFirst && !isEmailTouch(rawFirst) ? rawFirst : null;
  const lastPaid = rawLast && !isEmailTouch(rawLast) ? rawLast : null;
  const lastEmail = latest(
    live(state.lastEmail),
    rawFirst && isEmailTouch(rawFirst) ? rawFirst : null,
    rawLast && isEmailTouch(rawLast) ? rawLast : null
  );
  // If last expired but first remains (shouldn't usually), keep first only.
  return {
    firstPaid: firstPaid,
    lastPaid: lastPaid ?? firstPaid,
    lastEmail,
  };
}

/**
 * Merge a new tagged landing into stored state. Paid landings update
 * first/last paid; email landings only update lastEmail, so an email visit
 * never overwrites paid attribution. Direct / organic landings pass null.
 */
export function mergePaidTouch(
  previous: StoredAttributionState | null,
  incoming: AttributionTouch | null,
  now = Date.now()
): StoredAttributionState {
  const pruned = pruneStoredAttribution(previous, now);
  if (!incoming) {
    return pruned;
  }
  if (isEmailTouch(incoming)) {
    return { ...pruned, lastEmail: incoming };
  }

  const firstPaid = pruned.firstPaid ?? incoming;
  const lastPaid = incoming;

  return { firstPaid, lastPaid, lastEmail: pruned.lastEmail ?? null };
}

export function toOrderAttribution(
  state: StoredAttributionState | null
): OrderAttribution | null {
  const pruned = pruneStoredAttribution(state);
  const lastEmail = pruned.lastEmail ?? null;
  const primary = pruned.lastPaid ?? pruned.firstPaid ?? lastEmail;
  if (!primary) return null;

  return {
    utmSource: primary.utmSource,
    utmMedium: primary.utmMedium,
    utmCampaign: primary.utmCampaign,
    utmContent: primary.utmContent,
    utmTerm: primary.utmTerm,
    landingPage: primary.landingPage,
    referrer: primary.referrer,
    gclid: primary.gclid,
    fbclid: primary.fbclid,
    msclkid: primary.msclkid,
    ttclid: primary.ttclid,
    firstPaidTouchAt: pruned.firstPaid?.capturedAt ?? null,
    lastPaidTouchAt: pruned.lastPaid?.capturedAt ?? null,
    firstPaid: pruned.firstPaid,
    lastPaid: pruned.lastPaid,
    lastEmail,
    lastEmailTouchAt: lastEmail?.capturedAt ?? null,
  };
}

export function sanitizeAttributionFromBody(
  raw: unknown
): OrderAttribution | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  const anyTouchFrom = (value: unknown): AttributionTouch | null => {
    if (!value || typeof value !== "object") return null;
    const t = value as Record<string, unknown>;
    const touch: AttributionTouch = {
      utmSource: cleanField(typeof t.utmSource === "string" ? t.utmSource : null),
      utmMedium: cleanField(typeof t.utmMedium === "string" ? t.utmMedium : null),
      utmCampaign: cleanField(
        typeof t.utmCampaign === "string" ? t.utmCampaign : null
      ),
      utmContent: cleanField(
        typeof t.utmContent === "string" ? t.utmContent : null
      ),
      utmTerm: cleanField(typeof t.utmTerm === "string" ? t.utmTerm : null),
      landingPage: cleanField(
        typeof t.landingPage === "string" ? t.landingPage : null
      ),
      referrer: cleanField(typeof t.referrer === "string" ? t.referrer : null),
      gclid: cleanField(typeof t.gclid === "string" ? t.gclid : null),
      fbclid: cleanField(typeof t.fbclid === "string" ? t.fbclid : null),
      msclkid: cleanField(typeof t.msclkid === "string" ? t.msclkid : null),
      ttclid: cleanField(typeof t.ttclid === "string" ? t.ttclid : null),
      capturedAt:
        typeof t.capturedAt === "string" && !Number.isNaN(Date.parse(t.capturedAt))
          ? new Date(t.capturedAt).toISOString()
          : new Date().toISOString(),
    };
    return isPaidTouch(touch) || isEmailTouch(touch) ? touch : null;
  };
  const paidOnly = (t: AttributionTouch | null) => (t && isPaidTouch(t) ? t : null);
  const emailOnly = (t: AttributionTouch | null) => (t && isEmailTouch(t) ? t : null);

  const rawFirst = anyTouchFrom(obj.firstPaid);
  const rawLast = anyTouchFrom(obj.lastPaid);
  const rawTop = anyTouchFrom({
    utmSource: obj.utmSource,
    utmMedium: obj.utmMedium,
    utmCampaign: obj.utmCampaign,
    utmContent: obj.utmContent,
    utmTerm: obj.utmTerm,
    landingPage: obj.landingPage,
    referrer: obj.referrer,
    gclid: obj.gclid,
    fbclid: obj.fbclid,
    msclkid: obj.msclkid,
    ttclid: obj.ttclid,
    capturedAt: obj.lastPaidTouchAt ?? obj.firstPaidTouchAt ?? obj.lastEmailTouchAt,
  });
  const firstPaid = paidOnly(rawFirst);
  const lastPaid = paidOnly(rawLast);
  const paidPrimary = lastPaid ?? firstPaid ?? paidOnly(rawTop);
  const lastEmail = latest(
    emailOnly(anyTouchFrom(obj.lastEmail)),
    emailOnly(rawFirst),
    emailOnly(rawLast),
    paidPrimary ? null : emailOnly(rawTop)
  );
  const primary = paidPrimary ?? lastEmail;

  if (!primary) return null;

  const resolvedFirst = paidPrimary ? firstPaid ?? paidPrimary : null;
  const resolvedLast = paidPrimary ? lastPaid ?? paidPrimary : null;

  return {
    utmSource: primary.utmSource,
    utmMedium: primary.utmMedium,
    utmCampaign: primary.utmCampaign,
    utmContent: primary.utmContent,
    utmTerm: primary.utmTerm,
    landingPage: primary.landingPage,
    referrer: primary.referrer,
    gclid: primary.gclid,
    fbclid: primary.fbclid,
    msclkid: primary.msclkid,
    ttclid: primary.ttclid,
    firstPaidTouchAt: resolvedFirst?.capturedAt ?? null,
    lastPaidTouchAt: resolvedLast?.capturedAt ?? null,
    firstPaid: resolvedFirst,
    lastPaid: resolvedLast,
    lastEmail,
    lastEmailTouchAt: lastEmail?.capturedAt ?? null,
  };
}
