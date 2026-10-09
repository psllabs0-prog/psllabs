import assert from "node:assert/strict";
import {
  initializePrivacyConsent, readPrivacyConsent, readPrivacyClientStatus, requestPrivacyConsent,
  PRIVACY_PENDING_DECLINE_KEY, PRIVACY_CHOICE_KEY, subscribePrivacyConsent,
} from "../lib/privacy/client";
import { UNKNOWN_PRIVACY_CONSENT, type PublicPrivacyConsent } from "../lib/privacy/types";

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
    capabilities: { metaMeasurement: false, metaPersonalization: false, googleMeasurement: true, openaiMeasurement: false } };
  let failGet = false;
  let failPost = false;
  let postGate: Promise<void> | null = null;
  let invalidResponse = false;
  let conflictPost = false;
  const requests: { method: string; body?: Record<string, unknown> }[] = [];
  const realInterval = globalThis.setInterval;
  const realTimeout = globalThis.setTimeout;
  const originals = Object.fromEntries(["window", "navigator", "document", "fetch", "setInterval", "setTimeout"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  try {
    Object.defineProperty(globalThis, "window", { configurable: true, value: browser });
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: navigator });
    Object.defineProperty(globalThis, "document", { configurable: true, value: { cookie: "_fbp=optional; psl_admin_session=essential" } });
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
    await initializePrivacyConsent();
    assert.equal(readPrivacyConsent().measurement, false);
    await requestPrivacyConsent({ measurement: true, personalization: false });
    assert.equal(readPrivacyConsent().measurement, true, "server-acknowledged choice enables only existing capability");
    assert.equal(readPrivacyConsent().capabilities.metaMeasurement, false);
    assert.equal(readPrivacyConsent().capabilities.metaPersonalization, false);
    storage.set("psl_attribution_v1", "optional attribution");
    storage.set("psl_cart_v1", "essential cart");

    failPost = true;
    const withdrawal = requestPrivacyConsent({ measurement: false, personalization: false });
    assert.equal(readPrivacyConsent().measurement, false, "withdrawal blocks before network completes");
    assert.equal(storage.has("psl_attribution_v1"), false);
    assert.equal(storage.get("psl_cart_v1"), "essential cart");
    await withdrawal;
    assert.equal(readPrivacyClientStatus().pendingDecline, true);
    assert.equal(storage.get(PRIVACY_PENDING_DECLINE_KEY), "1");
    await initializePrivacyConsent();
    assert.equal(readPrivacyConsent().measurement, false, "failed withdrawal never reloads the old server grant");
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
