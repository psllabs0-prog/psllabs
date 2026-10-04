import assert from "node:assert/strict";
import vm from "node:vm";
import {
  cleanOpenAIReference, mergePaidTouch, parseTouchFromSearchParams,
  pruneStoredAttribution, sanitizeAttributionFromBody, toOrderAttribution,
} from "../lib/attribution/logic";
import { captureAttributionFromLocation, getOrderAttributionForCheckout } from "../lib/attribution/storage";
import { ATTRIBUTION_STORAGE_KEY, ATTRIBUTION_WINDOW_MS, type AttributionTouch } from "../lib/attribution/types";
import { PLAUSIBLE_TRANSFORM_REQUEST_JS, PLAUSIBLE_INIT_JS } from "../lib/plausible/redact";

let checks = 0;
const failures: string[] = [];
function check(actual: unknown, expected: unknown, label: string) {
  checks++;
  try { assert.deepEqual(actual, expected); }
  catch { failures.push(label); }
}
function noReference(value: unknown): boolean {
  if (!value || typeof value !== "object") return true;
  const fields = value as Record<string, unknown>;
  return !fields.oppref && noReference(fields.firstPaid) && noReference(fields.lastPaid) && noReference(fields.lastEmail);
}

async function main() {
  const originalFetch = globalThis.fetch;
  const originalGlobals = Object.fromEntries(["window", "navigator", "document"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  globalThis.fetch = async () => { throw new Error("Network is forbidden in this offline test"); };
  try {
    const now = Date.now();
    const references = [
      `opaque+/%25%2B==${"Ab_09-".repeat(100)}`,
      "  original/opaque+percent%encoded==  ",
      "reference/\u00e9/\u2603+%2F==",
      "x".repeat(8192),
    ];
    for (const reference of references) {
      const search = `?utm_source=chatgpt&utm_medium=cpc&utm_campaign=fixture&oppref=${encodeURIComponent(reference)}`;
      const touch = parseTouchFromSearchParams(search, "/products/fixture", "https://chatgpt.com/?oppref=REFERRER_SECRET")!;
      check(!!touch, true, "OpenAI click is classified as a paid touch");
      check(touch?.oppref, reference, "URL parsing preserves the decoded original reference without trimming or truncating");
      check(touch?.landingPage?.includes("oppref"), false, "landing page excludes OpenAI click parameter");
      check(touch?.landingPage?.includes(reference), false, "landing page excludes opaque reference value");
      check(touch?.referrer, "https://chatgpt.com/", "referrer excludes click query");
      const state = mergePaidTouch(null, touch, now);
      check(state.firstPaid?.oppref, reference, "first paid touch preserves reference");
      check(state.lastPaid?.oppref, reference, "last paid touch preserves reference");
      const snapshot = toOrderAttribution(state)!;
      check(snapshot?.oppref, reference, "order snapshot preserves full reference");
      const sanitized = sanitizeAttributionFromBody(JSON.parse(JSON.stringify(snapshot)))!;
      check(sanitized?.oppref, reference, "server sanitizer preserves full reference");
      check(sanitized?.firstPaid?.oppref, reference, "server first touch preserves full reference");
      check(sanitized?.lastPaid?.oppref, reference, "server last touch preserves full reference");
      check(sanitized?.landingPage?.includes("oppref"), false, "server snapshot does not restore reference into landing page");
    }
    check(parseTouchFromSearchParams("?oppref=literal%2Bplus%25percent%252Bencoded", "/", "")?.oppref,
      "literal+plus%percent%2Bencoded", "URL decode occurs once, preserving encoded-percent bytes");
    check(parseTouchFromSearchParams("?oppref=solo_fixture", "/", "")?.oppref, "solo_fixture", "oppref alone identifies a paid touch");
    for (const invalid of ["", "  ", "x".repeat(8193), "ref\u0000value", "ref\nvalue", "ref\u001Fvalue", "ref\u007Fvalue", null, 123]) {
      check(cleanOpenAIReference(invalid), null, "blank, oversized, non-string and control-containing references are rejected");
      check(sanitizeAttributionFromBody({ oppref: invalid }), null, "server rejects reference-only invalid attribution");
      if (typeof invalid === "string") {
        check(parseTouchFromSearchParams(`?oppref=${encodeURIComponent(invalid)}`, "/", ""), null, "URL capture rejects invalid reference-only attribution");
      }
    }

    const recent = parseTouchFromSearchParams("?oppref=recent_fixture", "/products/fixture", "")!;
    recent.capturedAt = new Date(now - ATTRIBUTION_WINDOW_MS + 1000).toISOString();
    const preserved = mergePaidTouch({ firstPaid: recent, lastPaid: recent }, null, now);
    check(preserved.firstPaid?.oppref, "recent_fixture", "direct revisit preserves first paid touch inside 30 days");
    check(preserved.lastPaid?.oppref, "recent_fixture", "direct revisit preserves last paid touch inside 30 days");
    const expired = { ...recent, capturedAt: new Date(now - ATTRIBUTION_WINDOW_MS - 1).toISOString() };
    check(pruneStoredAttribution({ firstPaid: expired, lastPaid: expired }, now),
      { firstPaid: null, lastPaid: null, lastEmail: null }, "expired paid touch is dropped");
    check(toOrderAttribution({ firstPaid: expired, lastPaid: expired }), null, "expired click is not attached to checkout");

    const forged = sanitizeAttributionFromBody({
      oppref: "fixture", openaiAdsDelivery: { status: "accepted", attempts: 99 },
      lastPaid: { ...recent, openaiAdsDelivery: { status: "accepted" } },
      lastEmail: { utmSource: "newsletter", utmMedium: "email", capturedAt: new Date(now).toISOString(), openaiAdsDelivery: { status: "accepted" } },
    });
    check(JSON.stringify(forged).includes("openaiAdsDelivery"), false, "body sanitizer cannot smuggle private delivery markers");
    check(sanitizeAttributionFromBody({ openaiAdsDelivery: { status: "accepted" } }), null, "private delivery marker alone cannot create attribution");

    const values = new Map<string, string>();
    const localStorage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); },
    };
    const navigatorFixture: { globalPrivacyControl?: boolean } = {};
    Object.defineProperty(globalThis, "window", { value: { localStorage, location: { href: "https://psllabs.org/" } }, configurable: true });
    Object.defineProperty(globalThis, "navigator", { value: navigatorFixture, configurable: true });
    Object.defineProperty(globalThis, "document", { value: { referrer: "" }, configurable: true });
    const browserReference = `browser+/%2B${"fixture".repeat(90)}`;
    const browserHref = `https://psllabs.org/products/fixture?utm_source=chatgpt&utm_medium=cpc&oppref=${encodeURIComponent(browserReference)}`;
    const captured = captureAttributionFromLocation(browserHref, "");
    check(captured.lastPaid?.oppref, browserReference, "browser capture stores the original long reference");
    check(getOrderAttributionForCheckout()?.oppref, browserReference, "browser checkout preserves original reference");
    check(getOrderAttributionForCheckout()?.openaiAdsMeasurementOptOut ?? false, false, "absent GPC keeps normal measurement choice unchanged");
    captureAttributionFromLocation("https://psllabs.org/products/fixture", "");
    check(getOrderAttributionForCheckout()?.oppref, browserReference, "browser direct revisit keeps prior attribution");
    navigatorFixture.globalPrivacyControl = false;
    check(getOrderAttributionForCheckout()?.openaiAdsMeasurementOptOut ?? false, false, "explicit false GPC keeps normal measurement choice unchanged");
    navigatorFixture.globalPrivacyControl = true;
    const checkoutOnlyOptOut = getOrderAttributionForCheckout();
    check(checkoutOnlyOptOut?.openaiAdsMeasurementOptOut, true, "GPC toggle is captured at checkout without requiring recapture");
    check(noReference(checkoutOnlyOptOut), true, "checkout GPC strips all previously stored nested references");
    const optedOutCapture = captureAttributionFromLocation(browserHref, "");
    check(noReference(optedOutCapture), true, "GPC capture strips all click references");
    check(values.get(ATTRIBUTION_STORAGE_KEY)?.includes(browserReference), false, "GPC capture removes reference from persistent browser storage");
    const optedOutCheckout = getOrderAttributionForCheckout();
    check(optedOutCheckout?.openaiAdsMeasurementOptOut, true, "GPC opt out reaches checkout");
    check(noReference(optedOutCheckout), true, "captured GPC checkout has no click references");
    values.clear();
    captureAttributionFromLocation("https://psllabs.org/", "");
    const directOptOut = getOrderAttributionForCheckout();
    check(directOptOut?.openaiAdsMeasurementOptOut, true, "direct checkout without any touch still carries GPC opt out");
    check(directOptOut?.oppref, null, "direct GPC checkout has no opaque reference");
    check(directOptOut?.firstPaid, null, "direct GPC checkout does not invent paid touch");
    navigatorFixture.globalPrivacyControl = false;
    check(getOrderAttributionForCheckout(), null, "normal direct checkout without attribution remains null");
    values.set(ATTRIBUTION_STORAGE_KEY, "{invalid");
    navigatorFixture.globalPrivacyControl = true;
    check(getOrderAttributionForCheckout()?.openaiAdsMeasurementOptOut, true, "corrupt stored attribution does not lose checkout GPC choice");
    values.set(ATTRIBUTION_STORAGE_KEY, JSON.stringify({ firstPaid: expired, lastPaid: expired }));
    navigatorFixture.globalPrivacyControl = false;
    check(getOrderAttributionForCheckout(), null, "browser checkout drops expired stored click");
    check(noReference(captureAttributionFromLocation("https://psllabs.org/", "")), true, "browser direct revisit prunes expired click");

    const transform = vm.runInNewContext(`(${PLAUSIBLE_TRANSFORM_REQUEST_JS})`, { URL }) as
      (payload: { u: string; r?: string }) => { u: string; r?: string };
    for (const href of [browserHref, "https://psllabs.org/?%6Fppref=encoded_key_fixture&utm_campaign=fixture", "https://psllabs.org/?oppref=first&oppref=second#fragment"]) {
      const payload = transform({ u: href, r: "https://chatgpt.com/?oppref=referrer_fixture#secret" });
      check(new URL(payload.u).searchParams.has("oppref"), false, "Plausible page URL omits opaque reference");
      check(new URL(payload.r!).searchParams.has("oppref"), false, "Plausible referrer URL omits opaque reference");
      check(new URL(payload.u).hash, "", "Plausible removes fragment");
    }
    const tokenPage = transform({ u: "https://psllabs.org/newsletter/confirm?token=SECRET&oppref=fixture#secret" });
    check(new URL(tokenPage.u).search, "", "existing newsletter-token redaction is retained");
    check(PLAUSIBLE_INIT_JS.includes(`transformRequest:${PLAUSIBLE_TRANSFORM_REQUEST_JS}`), true, "application init uses the tested redaction transform");

    // Preserve touch type checking in this executable fixture.
    const touchTypeCheck: AttributionTouch = recent;
    check(touchTypeCheck.oppref, "recent_fixture", "opaque reference is represented in the persisted touch schema");
    console.log(`OpenAI attribution: ${checks - failures.length}/${checks} offline URL, lifecycle, privacy and browser checks passed.`);
    if (failures.length) throw new Error(`Failed checks:\n${failures.map((label) => `- ${label}`).join("\n")}`);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, descriptor] of Object.entries(originalGlobals)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
