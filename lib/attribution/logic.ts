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

/** Unlike campaign labels, an opaque click reference must not be truncated. */
export function cleanOpenAIReference(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 &&
    value.length <= 8192 && !/[\u0000-\u001F\u007F]/.test(value) ? value : null;
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
  oppref?: string | null;
};

function hasClickId(touch: TouchFields): boolean {
  return Boolean(touch.gclid || touch.fbclid || touch.msclkid || touch.ttclid || touch.oppref);
}

/** Owned-email visit (retention, newsletter). Kept separate from paid touches. */
export function isEmailTouch(touch: TouchFields): boolean {
  return !hasClickId(touch) && (touch.utmMedium ?? "").trim().toLowerCase() === "email";
}

/** A partner referral is measurement evidence, never a commission entitlement. */
export function isAffiliateTouch(touch: TouchFields): boolean {
  return !hasClickId(touch) &&
    (touch.utmMedium ?? "").trim().toLowerCase() === "affiliate" &&
    (touch.utmSource ?? "").trim().toLowerCase() === "affiliate" &&
    /^[a-z0-9][a-z0-9_-]{2,63}$/i.test(touch.utmContent ?? "");
}

function normalizeAffiliateTouch(touch: AttributionTouch): AttributionTouch {
  return isAffiliateTouch(touch)
    ? { ...touch, utmSource: "affiliate", utmMedium: "affiliate", utmContent: touch.utmContent!.toLowerCase() }
    : touch;
}

export function isPaidTouch(touch: TouchFields): boolean {
  if (hasClickId(touch)) {
    return true;
  }
  if (isEmailTouch(touch) || (touch.utmMedium ?? "").trim().toLowerCase() === "affiliate") {
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
    oppref: cleanOpenAIReference(params.get("oppref")),
    capturedAt: new Date().toISOString(),
  };

  if (!isPaidTouch(touch) && !isEmailTouch(touch) && !isAffiliateTouch(touch)) {
    return null;
  }

  // Prefer a stable landing path without leaking long query strings beyond UTMs.
  touch.landingPage = cleanField(buildLandingPage(pathname, params));

  return normalizeAffiliateTouch(touch);
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
  return ts <= now + 5 * 60 * 1000 && now - ts <= ATTRIBUTION_WINDOW_MS;
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
 * Email and affiliate touches stored as "paid" by older clients are reclassified.
 */
export function pruneStoredAttribution(
  state: StoredAttributionState | null,
  now = Date.now()
): StoredAttributionState {
  if (!state) {
    return { firstPaid: null, lastPaid: null, lastEmail: null };
  }
  const live = (t: AttributionTouch | null | undefined) =>
    t && isWithinWindow(t.capturedAt, now) ? normalizeAffiliateTouch(t) : null;
  const rawFirst = live(state.firstPaid);
  const rawLast = live(state.lastPaid);
  const firstPaid = rawFirst && isPaidTouch(rawFirst) ? rawFirst : null;
  const lastPaid = rawLast && isPaidTouch(rawLast) ? rawLast : null;
  const lastEmail = latest(
    live(state.lastEmail),
    rawFirst && isEmailTouch(rawFirst) ? rawFirst : null,
    rawLast && isEmailTouch(rawLast) ? rawLast : null
  );
  const storedAffiliate = live(state.lastAffiliate);
  const lastAffiliate = latest(
    storedAffiliate && isAffiliateTouch(storedAffiliate) ? storedAffiliate : null,
    rawFirst && isAffiliateTouch(rawFirst) ? rawFirst : null,
    rawLast && isAffiliateTouch(rawLast) ? rawLast : null
  );
  // If last expired but first remains (shouldn't usually), keep first only.
  return {
    firstPaid: firstPaid,
    lastPaid: lastPaid ?? firstPaid,
    lastEmail,
    ...(lastAffiliate ? { lastAffiliate } : {}),
  };
}

/**
 * Merge a new tagged landing into stored state. Paid landings update
 * first/last paid; email landings only update lastEmail, so an email visit
 * never overwrites paid attribution. Affiliate visits likewise keep a separate
 * lastAffiliate touch. Direct / organic landings pass null.
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
  if (isAffiliateTouch(incoming)) {
    return { ...pruned, lastAffiliate: normalizeAffiliateTouch(incoming) };
  }
  if (!isPaidTouch(incoming)) return pruned;

  const firstPaid = pruned.firstPaid ?? incoming;
  const lastPaid = incoming;

  return { ...pruned, firstPaid, lastPaid, lastEmail: pruned.lastEmail ?? null };
}

export function toOrderAttribution(
  state: StoredAttributionState | null
): OrderAttribution | null {
  const pruned = pruneStoredAttribution(state);
  const lastEmail = pruned.lastEmail ?? null;
  const lastAffiliate = pruned.lastAffiliate ?? null;
  const primary = pruned.lastPaid ?? pruned.firstPaid ?? latest(lastEmail, lastAffiliate);
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
    oppref: primary.oppref ?? null,
    firstPaidTouchAt: pruned.firstPaid?.capturedAt ?? null,
    lastPaidTouchAt: pruned.lastPaid?.capturedAt ?? null,
    firstPaid: pruned.firstPaid,
    lastPaid: pruned.lastPaid,
    lastEmail,
    lastEmailTouchAt: lastEmail?.capturedAt ?? null,
    ...(lastAffiliate ? { lastAffiliate, lastAffiliateTouchAt: lastAffiliate.capturedAt } : {}),
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
    const capturedAt = typeof t.capturedAt === "string" && !Number.isNaN(Date.parse(t.capturedAt))
      ? new Date(t.capturedAt).toISOString() : null;
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
      oppref: cleanOpenAIReference(t.oppref),
      capturedAt: capturedAt ?? new Date().toISOString(),
    };
    // New partner attribution requires a real capture date. Preserve the legacy
    // missing-date fallback for paid/email data without renewing an invalid referral.
    if (isAffiliateTouch(touch)) return capturedAt ? normalizeAffiliateTouch(touch) : null;
    return isPaidTouch(touch) || isEmailTouch(touch) ? touch : null;
  };
  const paidOnly = (t: AttributionTouch | null) => (t && isPaidTouch(t) ? t : null);
  const emailOnly = (t: AttributionTouch | null) => (t && isEmailTouch(t) ? t : null);
  const affiliateOnly = (t: AttributionTouch | null) =>
    (t && isAffiliateTouch(t) && isWithinWindow(t.capturedAt) ? t : null);

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
    oppref: cleanOpenAIReference(obj.oppref),
    capturedAt: typeof obj.utmMedium === "string" && obj.utmMedium.trim().toLowerCase() === "affiliate"
      ? obj.lastAffiliateTouchAt
      : obj.lastPaidTouchAt ?? obj.firstPaidTouchAt ?? obj.lastEmailTouchAt,
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
  const lastAffiliate = latest(
    affiliateOnly(anyTouchFrom(obj.lastAffiliate)),
    affiliateOnly(rawFirst),
    affiliateOnly(rawLast),
    paidPrimary ? null : affiliateOnly(rawTop)
  );
  const primary = paidPrimary ?? latest(lastEmail, lastAffiliate);

  if (!primary) {
    if (obj.openaiAdsMeasurementOptOut !== true && obj.googleAdsMeasurementConsent !== true) return null;
    return {
      ...(obj.openaiAdsMeasurementOptOut === true ? { openaiAdsMeasurementOptOut: true } : {}),
      ...(obj.googleAdsMeasurementConsent === true ? { googleAdsMeasurementConsent: true } : {}),
      utmSource: null, utmMedium: null, utmCampaign: null, utmContent: null,
      utmTerm: null, landingPage: null, referrer: null, gclid: null, fbclid: null,
      msclkid: null, ttclid: null, oppref: null, firstPaidTouchAt: null,
      lastPaidTouchAt: null, firstPaid: null, lastPaid: null, lastEmail: null,
      lastEmailTouchAt: null,
    };
  }

  const resolvedFirst = paidPrimary ? firstPaid ?? paidPrimary : null;
  const resolvedLast = paidPrimary ? lastPaid ?? paidPrimary : null;

  return {
    ...(obj.openaiAdsMeasurementOptOut === true ? { openaiAdsMeasurementOptOut: true } : {}),
    ...(obj.googleAdsMeasurementConsent === true ? { googleAdsMeasurementConsent: true } : {}),
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
    oppref: primary.oppref ?? null,
    firstPaidTouchAt: resolvedFirst?.capturedAt ?? null,
    lastPaidTouchAt: resolvedLast?.capturedAt ?? null,
    firstPaid: resolvedFirst,
    lastPaid: resolvedLast,
    lastEmail,
    lastEmailTouchAt: lastEmail?.capturedAt ?? null,
    ...(lastAffiliate ? { lastAffiliate, lastAffiliateTouchAt: lastAffiliate.capturedAt } : {}),
  };
}
