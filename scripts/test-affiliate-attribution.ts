import assert from "node:assert/strict";
import { isAffiliateTouch, isPaidTouch, mergePaidTouch, parseTouchFromSearchParams, pruneStoredAttribution, sanitizeAttributionFromBody, toOrderAttribution } from "../lib/attribution/logic";
import { captureAttributionFromLocation, getOrderAttributionForCheckout } from "../lib/attribution/storage";
import { ATTRIBUTION_WINDOW_MS } from "../lib/attribution/types";
import { initializePrivacyConsent } from "../lib/privacy/client";
import { PRIVACY_CONSENT_VERSION } from "../lib/privacy/types";

let checks = 0;
function check(actual: unknown, expected: unknown) { assert.deepEqual(actual, expected); checks++; }
const now = Date.now();
const affiliate = parseTouchFromSearchParams("?utm_source=affiliate&utm_medium=affiliate&utm_campaign=partners&utm_content=scoop-ab1234", "/products", "https://scoopreview.com/review")!;
const paid = parseTouchFromSearchParams("?utm_source=chatgpt&utm_medium=cpc&oppref=paid-reference", "/products", "")!;
const email = { ...parseTouchFromSearchParams("?utm_source=newsletter&utm_medium=email&utm_campaign=welcome", "/products", "")!, capturedAt: new Date(now + 1000).toISOString() };
check(isAffiliateTouch(affiliate), true);
check(isPaidTouch(affiliate), false);
for (const content of ["", "x", "bad/code", "with space", "x".repeat(65)]) {
  check(parseTouchFromSearchParams(`?utm_source=affiliate&utm_medium=affiliate&utm_content=${encodeURIComponent(content)}`, "/", ""), null);
}
check(parseTouchFromSearchParams("?utm_source=other&utm_medium=affiliate&utm_content=valid-code", "/", ""), null);
const solo = mergePaidTouch(null, affiliate, now);
check(solo.firstPaid, null);
check(solo.lastPaid, null);
check(solo.lastAffiliate?.utmContent, "scoop-ab1234");
check(toOrderAttribution(solo)?.utmMedium, "affiliate");
check(sanitizeAttributionFromBody(toOrderAttribution(solo))?.lastAffiliate?.utmContent, "scoop-ab1234");
const withPaid = mergePaidTouch(solo, paid, now);
check(toOrderAttribution(withPaid)?.oppref, "paid-reference");
check(toOrderAttribution(withPaid)?.lastAffiliate?.utmContent, "scoop-ab1234");
check(mergePaidTouch(withPaid, affiliate, now).lastPaid?.oppref, "paid-reference");
const withEmail = mergePaidTouch(withPaid, email, now);
check(toOrderAttribution(withEmail)?.oppref, "paid-reference");
check(toOrderAttribution(withEmail)?.lastEmail?.utmMedium, "email");
check(sanitizeAttributionFromBody(toOrderAttribution(withEmail))?.lastAffiliate?.utmContent, "scoop-ab1234");
check(toOrderAttribution(mergePaidTouch(solo, email, now))?.utmMedium, "email");
check(mergePaidTouch(solo, null, now).lastAffiliate?.utmContent, "scoop-ab1234");
const olderClient = pruneStoredAttribution({ firstPaid: affiliate, lastPaid: affiliate }, now);
check(olderClient.firstPaid, null);
check(olderClient.lastPaid, null);
check(olderClient.lastAffiliate?.utmContent, "scoop-ab1234");
for (const capturedAt of [new Date(now - ATTRIBUTION_WINDOW_MS - 1).toISOString(), new Date(now + 24 * 60 * 60 * 1000).toISOString()]) {
  const outside = { ...affiliate, capturedAt };
  check(pruneStoredAttribution({ firstPaid: null, lastPaid: null, lastAffiliate: outside }, now).lastAffiliate, undefined);
  check(sanitizeAttributionFromBody({ lastAffiliate: outside }), null);
}
check(sanitizeAttributionFromBody({ lastAffiliate: paid }), null);
check(isAffiliateTouch({ ...affiliate, oppref: "paid-reference" }), false);
check(isPaidTouch({ ...affiliate, oppref: "paid-reference" }), true);

// Affiliate dates cannot be invented from malformed inputs or another channel.
for (const capturedAt of [undefined, null, "", "not-a-date", 123456]) {
  check(sanitizeAttributionFromBody({ lastAffiliate: { ...affiliate, capturedAt } }), null);
  check(sanitizeAttributionFromBody({ ...affiliate, lastAffiliateTouchAt: capturedAt, lastEmailTouchAt: email.capturedAt }), null);
}
const upper = { ...affiliate, utmSource: "Affiliate", utmMedium: "AFFILIATE", utmContent: "SCOOP-AB1234" };
const normalized = sanitizeAttributionFromBody({ lastAffiliate: upper })!.lastAffiliate!;
check([normalized.utmSource, normalized.utmMedium, normalized.utmContent], ["affiliate", "affiliate", "scoop-ab1234"]);
const upperLanding = parseTouchFromSearchParams("?utm_source=Affiliate&utm_medium=AFFILIATE&utm_content=SCOOP-AB1234", "/products", "")!;
check([upperLanding.utmSource, upperLanding.utmMedium, upperLanding.utmContent], ["affiliate", "affiliate", "scoop-ab1234"]);
check(pruneStoredAttribution({ firstPaid: null, lastPaid: null, lastAffiliate: upper }, now).lastAffiliate?.utmContent, "scoop-ab1234");
check(mergePaidTouch(null, upper, now).lastAffiliate?.utmSource, "affiliate");
check(sanitizeAttributionFromBody({ ...upper, lastAffiliateTouchAt: upper.capturedAt, lastEmailTouchAt: new Date(now - ATTRIBUTION_WINDOW_MS * 2).toISOString() })?.lastAffiliate?.capturedAt, upper.capturedAt);
check(sanitizeAttributionFromBody({ ...upper, lastAffiliateTouchAt: new Date(now - ATTRIBUTION_WINDOW_MS * 2).toISOString(), lastEmailTouchAt: email.capturedAt }), null);
check(sanitizeAttributionFromBody({ lastPaid: { ...paid, capturedAt: undefined } })?.lastPaid?.oppref, "paid-reference");
check(sanitizeAttributionFromBody({ lastEmail: { ...email, capturedAt: "invalid-legacy-date" } })?.lastEmail?.utmMedium, "email");

async function testBrowserConsent() {
const globals = Object.fromEntries(["window", "navigator", "document", "fetch", "setTimeout", "setInterval"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
const values = new Map<string, string>();
const navigatorFixture = { globalPrivacyControl: false };
const events = new EventTarget();
const originalTimeout = globalThis.setTimeout;
const originalInterval = globalThis.setInterval;
try {
  Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) }, location: { href: "https://psllabs.org/", pathname: "/", hostname: "psllabs.org", origin: "https://psllabs.org" },
    addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events), dispatchEvent: events.dispatchEvent.bind(events) } });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: navigatorFixture });
  Object.defineProperty(globalThis, "document", { configurable: true, value: { referrer: "", cookie: "" } });
  Object.defineProperty(globalThis, "setTimeout", { configurable: true, value: (...args: Parameters<typeof setTimeout>) => originalTimeout(...args).unref() });
  Object.defineProperty(globalThis, "setInterval", { configurable: true, value: (...args: Parameters<typeof setInterval>) => originalInterval(...args).unref() });
  Object.defineProperty(globalThis, "fetch", { configurable: true, value: async () => Response.json({ consent: {
    version: PRIVACY_CONSENT_VERSION, choice: "saved", revision: 1, expiresAt: Date.now() + 86400000,
    measurement: true, personalization: false, gpc: false, admin: false,
    capabilities: { googleMeasurement: true, openaiMeasurement: true, metaMeasurement: false, metaPersonalization: false, tiktokMeasurement: false, tiktokPersonalization: false },
  } }) });
  captureAttributionFromLocation("https://psllabs.org/products?utm_source=affiliate&utm_medium=affiliate&utm_campaign=partners&utm_content=scoop-ab1234", "");
  check(getOrderAttributionForCheckout()?.lastAffiliate ?? null, null);
  check(getOrderAttributionForCheckout()?.utmContent, null);
  check(values.has("psl_attribution_v1"), false);
  values.set("psl_researcher_verified_v1", "1");
  await initializePrivacyConsent();
  captureAttributionFromLocation("https://psllabs.org/products?utm_source=affiliate&utm_medium=affiliate&utm_campaign=partners&utm_content=scoop-ab1234", "");
  captureAttributionFromLocation("https://psllabs.org/cart", "");
  check(getOrderAttributionForCheckout()?.lastAffiliate?.utmContent, "scoop-ab1234");
  captureAttributionFromLocation("https://psllabs.org/products?utm_source=chatgpt&utm_medium=cpc&oppref=paid-reference", "");
  navigatorFixture.globalPrivacyControl = true;
  const checkout = getOrderAttributionForCheckout();
  check(checkout?.lastAffiliate ?? null, null);
  check(checkout?.utmContent, null);
  check(checkout?.openaiAdsMeasurementOptOut, true);
  check(values.has("psl_attribution_v1"), false);
} finally {
  for (const [key, descriptor] of Object.entries(globals)) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
}
}
testBrowserConsent().then(() => console.log(`Affiliate attribution: ${checks} lifecycle, checkout, cross-channel and consent/GPC checks passed.`)).catch(error => { console.error(error); process.exitCode = 1; });
