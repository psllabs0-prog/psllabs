import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { readGoogleAdsConfig } from "../lib/google-ads/config";
import { GOOGLE_ADS_CONSENT_KEY, parseGoogleAdsConsent, readGoogleAdsConsent, setGoogleAdsConsent } from "../lib/google-ads/consent";
import { buildGoogleAdsBootstrap, googleMeasurementPageUrl, googlePurchaseParameters, queueGooglePurchase } from "../lib/google-ads/browser";
import { sanitizeAttributionFromBody } from "../lib/attribution/logic";

const env = { NEXT_PUBLIC_GOOGLE_ADS_MEASUREMENT_ENABLED: "true", NEXT_PUBLIC_GOOGLE_ADS_TAG_ID: "AW-123456789", NEXT_PUBLIC_GOOGLE_ADS_PURCHASE_LABEL: "Offline_test_label" };
const config = readGoogleAdsConfig(env)!;
assert.equal(readGoogleAdsConfig({}), null);
assert.equal(readGoogleAdsConfig({ ...env, NEXT_PUBLIC_GOOGLE_ADS_MEASUREMENT_ENABLED: "false" }), null);
for (const label of ["", "x", "bad/label", "<script>"]) assert.equal(readGoogleAdsConfig({ ...env, NEXT_PUBLIC_GOOGLE_ADS_PURCHASE_LABEL: label }), null);
assert.equal(config.sendTo, "AW-123456789/Offline_test_label");

const now = Date.now();
assert.equal(parseGoogleAdsConsent(null, now), "unknown");
assert.equal(parseGoogleAdsConsent("bad json", now), "unknown");
assert.equal(parseGoogleAdsConsent(JSON.stringify({ version: 1, choice: "granted", updatedAt: now }), now), "granted");
assert.equal(parseGoogleAdsConsent(JSON.stringify({ version: 1, choice: "granted", updatedAt: now + 1 }), now), "unknown");
assert.equal(parseGoogleAdsConsent(JSON.stringify({ version: 1, choice: "granted", updatedAt: now - 181 * 86400000 }), now), "unknown");
assert.equal(googleMeasurementPageUrl("https://www.psllabs.org/success?orderId=secret&token=secret#gclid=secret"), "https://www.psllabs.org/success");
assert.equal(googleMeasurementPageUrl("https://www.psllabs.org/?gclid=real-ad-click&email=private&gbraid=test_123"), "https://www.psllabs.org/?gclid=real-ad-click&gbraid=test_123");
assert.equal(googleMeasurementPageUrl("javascript:alert(1)"), "");

const bootstrapWindow: { location: { href: string }; dataLayer?: unknown[][] } = { location: { href: "https://www.psllabs.org/?gclid=abc&email=private" } };
runInNewContext(buildGoogleAdsBootstrap(config), { window: bootstrapWindow, URL, Date });
const commands = bootstrapWindow.dataLayer!.map((args) => Array.from(args));
assert.equal(commands[0][0], "consent");
assert.equal(commands[0][1], "default");
assert.equal((commands[0][2] as Record<string, unknown>).ad_storage, "denied");
assert.equal(commands[1][1], "update");
assert.equal((commands[1][2] as Record<string, unknown>).ad_personalization, "denied");
const tagConfig = commands.find((row) => row[0] === "config")![2] as Record<string, unknown>;
assert.equal(tagConfig.allow_enhanced_conversions, false);
assert.equal(tagConfig.page_location, "https://www.psllabs.org/?gclid=abc");
assert.equal(tagConfig.page_referrer, "");

const grantedOnly = sanitizeAttributionFromBody({ googleAdsMeasurementConsent: true, googleAdsPurchase: { value: 1000 } });
assert.equal(grantedOnly?.googleAdsMeasurementConsent, true);
assert.equal("googleAdsPurchase" in grantedOnly!, false, "browser cannot inject receipt marker");
assert.equal(sanitizeAttributionFromBody({ googleAdsMeasurementConsent: "true" }), null);

const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
const storage = new Map<string, string>();
const events: unknown[][] = [];
const testNavigator = { globalPrivacyControl: false };
const testWindow = {
  pslGoogleAdsReady: true,
  location: { origin: "https://www.psllabs.org" },
  localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => { storage.set(key, value); } },
  dispatchEvent: () => true,
  gtag: (...args: unknown[]) => { events.push(args); },
};
try {
  Object.defineProperty(globalThis, "window", { configurable: true, value: testWindow });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: testNavigator });
  const receipt = { transactionId: "offline_test_1", value: 82.97, currency: "USD", email: "private@example.com", items: ["private"] };
  assert.equal(queueGooglePurchase(receipt, config), false, "no consent means no event");
  setGoogleAdsConsent("granted");
  assert.equal(readGoogleAdsConsent(), "granted");
  assert.equal(queueGooglePurchase(receipt, config), true);
  assert.equal(queueGooglePurchase(receipt, config), false, "same page dedup");
  const params = events[0][2] as Record<string, unknown>;
  assert.equal(params.transaction_id, receipt.transactionId);
  assert.equal(params.value, 82.97);
  assert.equal(params.currency, "USD");
  assert.equal("email" in params, false);
  assert.equal("items" in params, false);
  assert.equal(params.page_location, "https://www.psllabs.org/success");
  (params.event_callback as () => void)();
  assert(storage.has(`psl_google_purchase_v1:${config.sendTo}:offline_test_1`));
  const second = { transactionId: "offline_test_2", value: 20, currency: "USD" };
  storage.set(`psl_google_purchase_v1:${config.sendTo}:${second.transactionId}`, String(Date.now()));
  assert.equal(queueGooglePurchase(second, config), false, "persisted marker dedup");
  testNavigator.globalPrivacyControl = true;
  assert.equal(readGoogleAdsConsent(), "denied");
  assert.equal(queueGooglePurchase({ ...second, transactionId: "offline_test_3" }, config), false, "GPC overrides saved grant");
  testNavigator.globalPrivacyControl = false;
  setGoogleAdsConsent("denied");
  assert.equal(queueGooglePurchase({ ...second, transactionId: "offline_test_4" }, config), false, "revocation stops new event");
  assert.equal(events.length, 1, "no unapproved events queued");
  assert.equal(JSON.parse(storage.get(GOOGLE_ADS_CONSENT_KEY)!).choice, "denied");
} finally {
  if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow); else Reflect.deleteProperty(globalThis, "window");
  if (previousNavigator) Object.defineProperty(globalThis, "navigator", previousNavigator); else Reflect.deleteProperty(globalThis, "navigator");
}
for (const receipt of [null, {}, { transactionId: "bad space", value: 5, currency: "USD" }, { transactionId: "valid", value: 0, currency: "USD" }, { transactionId: "valid", value: 5, currency: "EUR" }]) {
  assert.equal(googlePurchaseParameters(receipt, config), null);
}
console.log("[test-google-ads-browser] consent, configuration, redaction, payload allowlist and dedup passed offline");
