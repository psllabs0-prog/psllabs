import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { readGoogleAdsConfig } from "../lib/google-ads/config";
import { GOOGLE_ADS_CONSENT_KEY, readGoogleAdsConsent, setGoogleAdsConsent } from "../lib/google-ads/consent";
import { buildGoogleAdsBootstrap, googleMeasurementPageUrl, googlePurchaseParameters, queueGooglePurchase } from "../lib/google-ads/browser";
import { initializePrivacyConsent } from "../lib/privacy/client";
import { UNKNOWN_PRIVACY_CONSENT } from "../lib/privacy/types";

async function main() {

const env = { NEXT_PUBLIC_GOOGLE_ADS_MEASUREMENT_ENABLED: "true", NEXT_PUBLIC_GOOGLE_ADS_TAG_ID: "AW-123456789", NEXT_PUBLIC_GOOGLE_ADS_PURCHASE_LABEL: "Offline_test_label" };
const config = readGoogleAdsConfig(env)!;
assert.equal(readGoogleAdsConfig({}), null);
assert.equal(readGoogleAdsConfig({ ...env, NEXT_PUBLIC_GOOGLE_ADS_MEASUREMENT_ENABLED: "false" }), null);
for (const label of ["", "x", "bad/label", "<script>"]) assert.equal(readGoogleAdsConfig({ ...env, NEXT_PUBLIC_GOOGLE_ADS_PURCHASE_LABEL: label }), null);
assert.equal(config.sendTo, "AW-123456789/Offline_test_label");

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

const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
const previousFetch = Object.getOwnPropertyDescriptor(globalThis, "fetch");
const previousInterval = globalThis.setInterval;
const previousTimeout = globalThis.setTimeout;
let revision = 0;
const storage = new Map<string, string>();
const events: unknown[][] = [];
const testNavigator = { globalPrivacyControl: false };
const testWindow = {
  pslGoogleAdsReady: true,
  location: { origin: "https://www.psllabs.org", pathname: "/", hostname: "www.psllabs.org" },
  localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => { storage.set(key, value); }, removeItem: (key: string) => { storage.delete(key); } },
  dispatchEvent: () => true,
  addEventListener: () => {}, removeEventListener: () => {},
  gtag: (...args: unknown[]) => { events.push(args); },
};
try {
  Object.defineProperty(globalThis, "window", { configurable: true, value: testWindow });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: testNavigator });
  Object.defineProperty(globalThis, "document", { configurable: true, value: { cookie: "" } });
  Object.defineProperty(globalThis, "setInterval", { configurable: true, value: (...args: Parameters<typeof setInterval>) => previousInterval(...args).unref() });
  Object.defineProperty(globalThis, "setTimeout", { configurable: true, value: (...args: Parameters<typeof setTimeout>) => previousTimeout(...args).unref() });
  Object.defineProperty(globalThis, "fetch", { configurable: true, value: async (_url: string, init: RequestInit) => {
    const choices = init.body ? JSON.parse(String(init.body)) : { measurement: false, personalization: false };
    return Response.json({ consent: { ...UNKNOWN_PRIVACY_CONSENT, ...choices,
      choice: init.method === "POST" ? "saved" : "unknown", revision: ++revision,
      expiresAt: Date.now() + 86400000,
      capabilities: { metaMeasurement: false, metaPersonalization: false, googleMeasurement: true, openaiMeasurement: false } } });
  } });
  storage.set("psl_researcher_verified_v1", "1");
  storage.set(GOOGLE_ADS_CONSENT_KEY, JSON.stringify({ version: 1, choice: "granted", updatedAt: Date.now() }));
  assert.equal(readGoogleAdsConsent(), "unknown", "legacy choice cannot authorize new unified tracking");
  await initializePrivacyConsent();
  const receipt = { transactionId: "offline_test_1", value: 82.97, currency: "USD", email: "private@example.com", items: ["private"] };
  assert.equal(queueGooglePurchase(receipt, config), false, "no consent means no event");
  await setGoogleAdsConsent("granted");
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
  await setGoogleAdsConsent("denied");
  assert.equal(queueGooglePurchase({ ...second, transactionId: "offline_test_4" }, config), false, "revocation stops new event");
  assert.equal(events.length, 1, "no unapproved events queued");
  assert.equal(storage.has(GOOGLE_ADS_CONSENT_KEY), false, "legacy grant is removed");
} finally {
  if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument); else Reflect.deleteProperty(globalThis, "document");
  if (previousFetch) Object.defineProperty(globalThis, "fetch", previousFetch); else Reflect.deleteProperty(globalThis, "fetch");
  globalThis.setInterval = previousInterval;
  globalThis.setTimeout = previousTimeout;
  if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow); else Reflect.deleteProperty(globalThis, "window");
  if (previousNavigator) Object.defineProperty(globalThis, "navigator", previousNavigator); else Reflect.deleteProperty(globalThis, "navigator");
}
for (const receipt of [null, {}, { transactionId: "bad space", value: 5, currency: "USD" }, { transactionId: "valid", value: 0, currency: "USD" }, { transactionId: "valid", value: 5, currency: "EUR" }]) {
  assert.equal(googlePurchaseParameters(receipt, config), null);
}
console.log("[test-google-ads-browser] consent, configuration, redaction, payload allowlist and dedup passed offline");

}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
