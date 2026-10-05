import assert from "node:assert/strict";
import { isAffiliateTouch, isPaidTouch, mergePaidTouch, parseTouchFromSearchParams, pruneStoredAttribution, sanitizeAttributionFromBody, toOrderAttribution } from "../lib/attribution/logic";
import { captureAttributionFromLocation, getOrderAttributionForCheckout } from "../lib/attribution/storage";
import { ATTRIBUTION_WINDOW_MS } from "../lib/attribution/types";

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

const globals = Object.fromEntries(["window", "navigator", "document"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
const values = new Map<string, string>();
const navigatorFixture = { globalPrivacyControl: false };
try {
  Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) }, location: { href: "https://psllabs.org/" } } });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: navigatorFixture });
  Object.defineProperty(globalThis, "document", { configurable: true, value: { referrer: "" } });
  captureAttributionFromLocation("https://psllabs.org/products?utm_source=affiliate&utm_medium=affiliate&utm_campaign=partners&utm_content=scoop-ab1234", "");
  captureAttributionFromLocation("https://psllabs.org/cart", "");
  check(getOrderAttributionForCheckout()?.lastAffiliate?.utmContent, "scoop-ab1234");
  captureAttributionFromLocation("https://psllabs.org/products?utm_source=chatgpt&utm_medium=cpc&oppref=paid-reference", "");
  navigatorFixture.globalPrivacyControl = true;
  const checkout = getOrderAttributionForCheckout();
  check(checkout?.openaiAdsMeasurementOptOut, true);
  check(checkout?.oppref, null);
  check(checkout?.lastPaid?.oppref, null);
  check(checkout?.lastAffiliate?.utmContent, "scoop-ab1234");
  check(sanitizeAttributionFromBody(checkout)?.lastAffiliate?.utmContent, "scoop-ab1234");
} finally {
  for (const [key, descriptor] of Object.entries(globals)) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
}
console.log(`Affiliate attribution: ${checks} lifecycle, checkout, cross-channel and privacy checks passed.`);
