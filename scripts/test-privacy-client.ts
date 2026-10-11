import assert from "node:assert/strict";
import {
  initializePrivacyConsent, readPrivacyConsent, readPrivacyClientStatus, requestPrivacyConsent,
  PRIVACY_PENDING_DECLINE_KEY, PRIVACY_CHOICE_KEY, subscribePrivacyConsent,
} from "../lib/privacy/client";
import { PRIVACY_CONSENT_VERSION, UNKNOWN_PRIVACY_CONSENT, type PublicPrivacyConsent } from "../lib/privacy/types";

async function main() {
  const storage = new Map<string, string>();
  const events = new EventTarget();
  const location = { pathname: "/", hostname: "www.psllabs.org", origin: "https://www.psllabs.org" };
  const browser = {
    location,
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => { storage.set(key, value); },
      removeItem: (key: string) => { storage.delete(key); },
    },
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    dispatchEvent: events.dispatchEvent.bind(events),
  };
  const navigator = { globalPrivacyControl: false };
  let server: PublicPrivacyConsent = { ...UNKNOWN_PRIVACY_CONSENT,
    capabilities: { tiktokMeasurement: false, tiktokPersonalization: false, metaMeasurement: false, metaPersonalization: false, googleMeasurement: true, openaiMeasurement: false } };
  let failGet = false;
  let failPost = false;
  let postGate: Promise<void> | null = null;
  let invalidResponse = false;
  let conflictPost = false;
  const requests: { method: string; body?: Record<string, unknown> }[] = [];
  const deletedCookies: string[] = [];
  const cookieJar = new Map([["_fbp", "optional"], ["ttclid", "optional"], ["ttcsid", "optional"],
    ["ttcsid_DB53OTJC77U074LG2FOG", "optional"], ["psl_admin_session", "essential"]]);
  const realInterval = globalThis.setInterval;
  const realTimeout = globalThis.setTimeout;
  const originals = Object.fromEntries(["window", "navigator", "document", "fetch", "setInterval", "setTimeout"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  try {
    Object.defineProperty(globalThis, "window", { configurable: true, value: browser });
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: navigator });
    Object.defineProperty(globalThis, "document", { configurable: true, value: {
      get cookie() { return [...cookieJar].map(([key, value]) => `${key}=${value}`).join("; "); },
      set cookie(value: string) {
        const name = value.split("=")[0];
        if (value.includes("Max-Age=0")) { deletedCookies.push(name); cookieJar.delete(name); }
      },
    } });
    Object.defineProperty(globalThis, "setInterval", { configurable: true, value: (...args: Parameters<typeof setInterval>) => realInterval(...args).unref() });
    Object.defineProperty(globalThis, "setTimeout", { configurable: true, value: (...args: Parameters<typeof setTimeout>) => realTimeout(...args).unref() });
    Object.defineProperty(globalThis, "fetch", { configurable: true, value: async (url: string, init: RequestInit) => {
      assert.equal(url, "/api/privacy/consent", "privacy choices never contact an advertising platform");
      const method = init.method ?? "GET";
      const body = init.body ? JSON.parse(String(init.body)) : undefined;
      requests.push({ method, body });
      if (method === "POST") {
        if (postGate) await postGate;
        if (failPost) throw new Error("offline");
        if (conflictPost) {
          conflictPost = false;
          server = { ...server, revision: server.revision + 1, measurement: false, personalization: false };
          return Response.json({ error: "consent_conflict" }, { status: 409 });
        }
        assert.deepEqual(Object.keys(body).sort(), ["expectedRevision", "measurement", "personalization", "verifiedAdult", "version"]);
        assert.equal(body.verifiedAdult, true);
        assert.equal(body.version, PRIVACY_CONSENT_VERSION);
        server = { ...server, measurement: !!body.measurement, personalization: !!body.personalization,
          choice: "saved", revision: server.revision + 1, expiresAt: Date.now() + 86400000 };
      } else if (failGet) throw new Error("offline");
      return Response.json({ consent: invalidResponse ? { ...server, expiresAt: 0, measurement: true } : server });
    } });

    storage.set("psl_google_ads_consent_v1", JSON.stringify({ version: 1, choice: "granted", updatedAt: Date.now() }));
    storage.set(PRIVACY_CHOICE_KEY, JSON.stringify({ version: 1, measurement: true, updatedAt: Date.now() }));
    assert.equal(readPrivacyConsent().measurement, false, "legacy or invented local grant is never permission");
    await initializePrivacyConsent();
    assert.equal(requests.length, 0, "entry gate is required before optional consent initialization");
    storage.set("psl_researcher_verified_v1", "1");
    const unlisten = subscribePrivacyConsent(() => {});
    const originalServer = server;
    server = { ...server, version: PRIVACY_CONSENT_VERSION - 1, choice: "saved", revision: 1,
      expiresAt: Date.now() + 86400000, measurement: true, personalization: true,
      capabilities: { ...server.capabilities, metaMeasurement: true, metaPersonalization: true } };
    await initializePrivacyConsent();
    assert.equal(readPrivacyConsent().measurement, false, "an earlier-version grant cannot authorize a newly introduced integration");
    assert.equal(readPrivacyConsent().personalization, false);
    assert.equal(readPrivacyClientStatus().state, "error", "outdated responses fail closed until refreshed");
    server = originalServer;
    await initializePrivacyConsent();
    assert.equal(readPrivacyConsent().measurement, false);
    await requestPrivacyConsent({ measurement: true, personalization: false });
    assert.equal(readPrivacyConsent().measurement, true, "server-acknowledged choice enables only existing capability");
    assert.equal(readPrivacyConsent().capabilities.metaMeasurement, false);
    assert.equal(readPrivacyConsent().capabilities.metaPersonalization, false);
    assert.equal(JSON.parse(storage.get(PRIVACY_CHOICE_KEY)!).version, PRIVACY_CONSENT_VERSION,
      "cross-tab invalidation uses the current policy version without storing a reusable grant");
    storage.set("psl_attribution_v1", "optional attribution");
    storage.set("ttoclid", "optional TikTok click identifier");
    storage.set("psl_cart_v1", "essential cart");

    failPost = true;
    const withdrawal = requestPrivacyConsent({ measurement: false, personalization: false });
    assert.equal(readPrivacyConsent().measurement, false, "withdrawal blocks before network completes");
    assert.equal(storage.has("psl_attribution_v1"), false);
    assert.equal(storage.has("ttoclid"), false, "withdrawal removes TikTok's optional local identifier");
    for (const name of ["_fbp", "ttclid", "ttcsid", "ttcsid_DB53OTJC77U074LG2FOG"]) {
      assert.ok(deletedCookies.includes(name), `withdrawal removes optional cookie ${name}`);
    }
    assert.equal(cookieJar.get("psl_admin_session"), "essential", "withdrawal preserves essential login cookies");
    assert.equal(storage.get("psl_cart_v1"), "essential cart");
    await withdrawal;
    assert.equal(readPrivacyClientStatus().pendingDecline, true);
    assert.equal(storage.get(PRIVACY_PENDING_DECLINE_KEY), "1");
    storage.set(PRIVACY_CHOICE_KEY, JSON.stringify({ version: PRIVACY_CONSENT_VERSION - 1, measurement: true }));
    await initializePrivacyConsent();
    assert.equal(readPrivacyConsent().measurement, false, "pending withdrawal survives an older cache and never reloads the server grant");
    failPost = false;
    await initializePrivacyConsent();
    assert.equal(readPrivacyClientStatus().pendingDecline, false);
    assert.equal(server.measurement, false);

    await requestPrivacyConsent({ measurement: true, personalization: false });
    navigator.globalPrivacyControl = true;
    assert.equal(readPrivacyConsent().measurement, false, "GPC blocks without waiting for the next poll");
    await requestPrivacyConsent({ measurement: true, personalization: true });
    assert.equal(server.measurement, false, "GPC overrides an Accept request");
    assert.equal(server.personalization, false);
    navigator.globalPrivacyControl = false;

    await requestPrivacyConsent({ measurement: true, personalization: false });
    server = { ...server, admin: true, measurement: false, personalization: false };
    await initializePrivacyConsent();
    assert.equal(readPrivacyConsent().measurement, false, "admin session is excluded even on storefront");
    server = { ...server, admin: false };
    await initializePrivacyConsent();
    await requestPrivacyConsent({ measurement: true, personalization: false });
    for (const path of ["/admin", "/admin-ledger.01", "/test", "/api/orders"]) {
      location.pathname = path;
      assert.equal(readPrivacyConsent().measurement, false, `excluded ${path}`);
    }
    location.pathname = "/";
    failGet = true;
    await initializePrivacyConsent();
    assert.equal(readPrivacyConsent().measurement, false, "unverifiable receipt fails closed");
    failGet = false;
    invalidResponse = true;
    await initializePrivacyConsent();
    assert.equal(readPrivacyConsent().measurement, false, "grant without a valid expiry fails closed");
    invalidResponse = false;

    conflictPost = true;
    const postsBeforeConflict = requests.filter((r) => r.method === "POST").length;
    await requestPrivacyConsent({ measurement: true, personalization: false });
    assert.equal(readPrivacyConsent().measurement, false, "cross-tab revision conflict cannot overwrite withdrawal");
    assert.equal(readPrivacyConsent().choice, "unknown", "conflict requires a fresh user choice");
    assert.equal(readPrivacyClientStatus().state, "error");
    assert.equal(requests.filter((r) => r.method === "POST").length, postsBeforeConflict + 1, "conflicting grant is never automatically retried");

    let releasePost!: () => void;
    const postsBeforeRace = requests.filter((r) => r.method === "POST").length;
    postGate = new Promise<void>((resolve) => { releasePost = resolve; });
    const acceptInFlight = requestPrivacyConsent({ measurement: true, personalization: false });
    const declineAfter = requestPrivacyConsent({ measurement: false, personalization: false });
    releasePost();
    postGate = null;
    await Promise.all([acceptInFlight, declineAfter]);
    assert.equal(server.measurement, false, "serialized choices preserve the last intent at the server");
    assert.equal(requests.filter((r) => r.method === "POST").length, postsBeforeRace + 1, "stale queued grant is skipped before transport");
    assert.equal(readPrivacyConsent().measurement, false);
    unlisten();
    console.log("[test-privacy-client] gate, default deny, trusted receipt, withdrawal retry, GPC, admin/test exclusion, malformed response, and request ordering passed offline");
  } finally {
    for (const [key, descriptor] of Object.entries(originals)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
