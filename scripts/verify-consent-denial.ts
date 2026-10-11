/**
 * Deployment smoke check, not an advertising event test.
 * Only /api/privacy/consent is requested. No grant, pixel, event endpoint,
 * customer/order data, admin credentials, or advertising provider is used.
 * --decline optionally writes one isolated first-party decline receipt.
 */
import assert from "node:assert/strict";
import { PRIVACY_CONSENT_COOKIE, PRIVACY_CONSENT_VERSION, type PublicPrivacyConsent } from "../lib/privacy/types";

const args = process.argv.slice(2);
for (const arg of args) {
  assert(arg.startsWith("--base=") || ["--decline", "--expect-meta-active"].includes(arg), "Unknown argument");
}
assert(args.filter((arg) => arg.startsWith("--base=")).length <= 1, "Only one base is permitted");
const base = new URL(args.find((arg) => arg.startsWith("--base="))?.slice(7) ?? "https://www.psllabs.org");
const localhost = ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname);
assert((base.protocol === "https:" && (["www.psllabs.org", "psllabs.org"].includes(base.hostname) ||
  /^[a-z0-9-]+\.vercel\.app$/.test(base.hostname))) || (localhost && ["http:", "https:"].includes(base.protocol)),
"Use PSL, an explicit Vercel preview, or localhost");
assert(!base.username && !base.password && !base.search && !base.hash && base.pathname === "/", "Base must be an origin");
const endpoint = new URL("/api/privacy/consent", base);
const expectMetaActive = args.includes("--expect-meta-active");
let checks = 0;
let currentStep = "fresh_default";
let publicSnapshot: Record<string, unknown> = {};

async function request(options: { gpc?: boolean; cookie?: string; decline?: PublicPrivacyConsent } = {}) {
  const response = await fetch(endpoint, {
    method: options.decline ? "POST" : "GET", redirect: "error", cache: "no-store",
    signal: AbortSignal.timeout(15000),
    headers: { Accept: "application/json", "User-Agent": "PSL-Consent-Denial-Verification/1.0",
      ...(options.gpc ? { "Sec-GPC": "1" } : {}),
      ...(options.cookie ? { Cookie: options.cookie } : {}),
      ...(options.decline ? { Origin: base.origin, "Content-Type": "application/json" } : {}) },
    ...(options.decline ? { body: JSON.stringify({ version: PRIVACY_CONSENT_VERSION,
      measurement: false, personalization: false, verifiedAdult: true,
      expectedRevision: options.decline.revision }) } : {}),
  });
  publicSnapshot = { httpStatus: response.status };
  assert.equal(response.status, 200, `Consent ${options.decline ? "decline" : "read"} HTTP status`);
  const body = await response.json() as { consent: PublicPrivacyConsent; binding?: unknown };
  assert.equal("binding" in body, false, "Private server binding is never exposed");
  const consent = body.consent;
  const boolean = (value: unknown) => typeof value === "boolean" ? value : "invalid";
  publicSnapshot = { httpStatus: response.status, version: typeof consent.version === "number" ? consent.version : "invalid",
    choice: ["unknown", "saved"].includes(consent.choice) ? consent.choice : "invalid",
    measurement: boolean(consent.measurement), personalization: boolean(consent.personalization),
    gpc: boolean(consent.gpc), metaMeasurement: boolean(consent.capabilities?.metaMeasurement),
    metaPersonalization: boolean(consent.capabilities?.metaPersonalization),
    tiktokMeasurement: boolean(consent.capabilities?.tiktokMeasurement),
    tiktokPersonalization: boolean(consent.capabilities?.tiktokPersonalization) };
  assert.equal(consent.version, PRIVACY_CONSENT_VERSION, "Deployed consent version matches this release");
  assert.equal(consent.measurement, false, "No optional measurement permission");
  assert.equal(consent.personalization, false, "No optional personalization permission");
  assert.equal(consent.gpc, options.gpc === true, "GPC state matches request");
  assert.equal(consent.admin, false, "This check never borrows an administrator identity");
  assert.equal(consent.capabilities.metaMeasurement, expectMetaActive);
  assert.equal(consent.capabilities.metaPersonalization, expectMetaActive);
  assert.equal(consent.capabilities.tiktokMeasurement, false, "TikTok web tracking stays off");
  assert.equal(consent.capabilities.tiktokPersonalization, false);
  assert.match(response.headers.get("cache-control") ?? "", /private.*no-store/);
  assert.match(response.headers.get("vary") ?? "", /Cookie/);
  assert.match(response.headers.get("vary") ?? "", /Sec-GPC/);
  checks += 14;
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) {
    assert(!options.decline, "A decline must not replace the receipt identity");
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /SameSite=lax/i);
    if (!localhost) assert.match(setCookie, /Secure/i);
    checks += localhost ? 3 : 4;
  }
  const token = setCookie?.match(new RegExp(`${PRIVACY_CONSENT_COOKIE}=([a-f0-9]{64})(?:;|$)`))?.[1];
  // Never print the cookie, binding, raw response, or arbitrary error content.
  return { consent, cookie: token ? `${PRIVACY_CONSENT_COOKIE}=${token}` : options.cookie, setCookie };
}

async function main() {
  const fresh = await request();
  assert.equal(fresh.consent.choice, "unknown"); assert(fresh.cookie); checks += 2;
  currentStep = "fresh_gpc";
  const gpc = await request({ gpc: true });
  assert.equal(gpc.consent.choice, "unknown"); checks++;
  if (args.includes("--decline")) {
    // This is a denial-only technical probe, not evidence of age, credentials,
    // laboratory intent, a website conversion, or qualified audience membership.
    currentStep = "decline_only";
    const declined = await request({ cookie: fresh.cookie, decline: fresh.consent });
    assert.equal(declined.consent.choice, "saved");
    assert.equal(declined.setCookie, null);
    currentStep = "persisted_decline";
    const persisted = await request({ cookie: fresh.cookie });
    assert.equal(persisted.consent.choice, "saved");
    assert.equal(persisted.consent.revision, declined.consent.revision);
    currentStep = "persisted_gpc";
    await request({ cookie: fresh.cookie, gpc: true });
    checks += 4;
  }
  console.log(JSON.stringify({ checkedAt: new Date().toISOString(), base: base.origin, checks,
    consentVersion: PRIVACY_CONSENT_VERSION, metaCapabilitiesActive: expectMetaActive,
    defaultDenied: true, gpcDenied: true, declinePersisted: args.includes("--decline"),
    advertisingEventsRequested: 0, optionalGrantsRequested: 0,
    browserSdkBehaviorVerified: false, productionEventReceiptVerified: false }));
}
main().catch(() => {
  console.error(JSON.stringify({ result: "failed", step: currentStep, ...publicSnapshot,
    expectedVersion: PRIVACY_CONSENT_VERSION, expectedMetaCapabilitiesActive: expectMetaActive,
    note: "Check consent HTTP status, release version, capabilities, receipt persistence, and cookie/cache headers. No raw response or cookie was logged." }));
  process.exitCode = 1;
});
