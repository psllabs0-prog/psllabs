import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Script } from "node:vm";
import ts from "typescript";
import { initializePrivacyConsent, requestPrivacyConsent, readPrivacyConsent } from "../lib/privacy/client";
import { UNKNOWN_PRIVACY_CONSENT, type PublicPrivacyConsent } from "../lib/privacy/types";
import * as productionBrowser from "../lib/tiktok-ads/browser";
import * as events from "../lib/tiktok-ads/events";

/** Isolated offline fixture. No production gate or policy override is exposed. */
function fixtureBrowser() {
  const compiled = ts.transpileModule(readFileSync("lib/tiktok-ads/browser.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mocks: Record<string, unknown> = {
    "../privacy/client": { readPrivacyConsent }, "./config": { TIKTOK_BROWSER_VERIFIED: true },
    "./events": { ...events, PRODUCTION_TIKTOK_EVENT_POLICY: events.REVIEWED_TIKTOK_EVENT_POLICY },
  };
  const exports = {};
  new Script(`(function(require,exports){${compiled}\n})`).runInThisContext()(
    (name: string) => { assert(name in mocks, `Unexpected dependency ${name}`); return mocks[name]; }, exports);
  return exports as typeof productionBrowser;
}
async function main() {
  const browserModule = fixtureBrowser();
  const originals = Object.fromEntries(["window", "document", "navigator", "fetch", "setInterval", "setTimeout"].map((name) =>
    [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const realInterval = globalThis.setInterval, realTimeout = globalThis.setTimeout;
  const values = new Map<string, string>([["psl_researcher_verified_v1", "1"]]);
  let consent: PublicPrivacyConsent = { ...UNKNOWN_PRIVACY_CONSENT };
  let allowReply = false, forged = false, scriptLoads = 0;
  let pauseReply: Promise<void> | null = null;
  const requests: { eventId: string; name: string; sourceUrl: string }[] = [];
  const commands: unknown[][] = [];
  type Pixel = unknown[][] & { _mounted?: boolean; _i: Record<string, { _init?: boolean; length: number }>; methods: string[];
    _o: Record<string, Record<string, unknown>>; track?: (...args: unknown[]) => void; revokeConsent?: () => void; grantConsent?: () => void };
  const location = { href: "https://www.psllabs.org/products", pathname: "/products", hostname: "www.psllabs.org" };
  const navigation = { globalPrivacyControl: false };
  const browser: { location: typeof location; crypto: { randomUUID: typeof randomUUID }; ttq?: Pixel; TiktokAnalyticsObject?: string;
    localStorage: { getItem: (key: string) => string | null; setItem: (key: string, value: string) => void; removeItem: (key: string) => void };
    addEventListener: () => void; removeEventListener: () => void; dispatchEvent: () => boolean } = {
      location, crypto: { randomUUID }, localStorage: { getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => { values.set(key, value); }, removeItem: (key) => { values.delete(key); } },
      addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => true,
    };
  const document = { cookie: "", referrer: "", createElement: () => ({ src: "", onerror: () => {} }), head: {
    appendChild: (script: { src: string }) => {
      scriptLoads++;
      assert.equal(script.src, `https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=${events.PSL_TIKTOK_PIXEL_ID}&lib=ttq`);
      const pixel = browser.ttq!;
      commands.push(...pixel.splice(0));
      assert.deepEqual(pixel._o[events.PSL_TIKTOK_PIXEL_ID], { autoConfig: false, autoConfigListener: false, historyObserver: false });
      pixel._mounted = true; pixel._i[events.PSL_TIKTOK_PIXEL_ID]._init = true;
      pixel.track = (...args) => { commands.push(["track", ...args]); };
      pixel.revokeConsent = () => { commands.push(["revokeConsent"]); };
      pixel.grantConsent = () => { commands.push(["grantConsent"]); };
    },
  } };
  try {
    Object.defineProperty(globalThis, "window", { configurable: true, value: browser });
    Object.defineProperty(globalThis, "document", { configurable: true, value: document });
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: navigation });
    Object.defineProperty(globalThis, "setInterval", { configurable: true, value: (...args: Parameters<typeof setInterval>) => realInterval(...args).unref() });
    Object.defineProperty(globalThis, "setTimeout", { configurable: true, value: (...args: Parameters<typeof setTimeout>) => realTimeout(...args).unref() });
    Object.defineProperty(globalThis, "fetch", { configurable: true, value: async (url: string, init: RequestInit) => {
      assert(["/api/privacy/consent", "/api/tiktok/events"].includes(url), "No external request allowed by offline fixture");
      const body = init.body ? JSON.parse(String(init.body)) : {};
      if (url === "/api/privacy/consent") {
        if (init.method === "POST") consent = { ...consent, measurement: body.measurement, personalization: body.personalization,
          choice: "saved", revision: consent.revision + 1, expiresAt: Date.now() + 86_400_000 };
        return Response.json({ consent });
      }
      requests.push(body);
      if (pauseReply) await pauseReply;
      return Response.json({ event: !allowReply ? null : { event: body.name,
        event_id: forged ? randomUUID() : body.eventId, event_time: Math.floor(Date.now() / 1000), page: { url: body.sourceUrl },
        ...(body.productIds ? { properties: { content_ids: body.productIds, content_type: "product" } } : {}),
      } });
    } });
    assert.equal(browserModule.createTikTokBrowserAction("Pageview"), null);
    await initializePrivacyConsent(); await requestPrivacyConsent({ measurement: true, personalization: true });
    assert.equal(browserModule.createTikTokBrowserAction("Pageview"), null, "Unverified capability prevents collection");
    assert.equal(scriptLoads, 0); assert.equal(requests.length, 0);
    consent = { ...consent, capabilities: { ...consent.capabilities, tiktokMeasurement: true, tiktokPersonalization: true } };
    await initializePrivacyConsent();
    await requestPrivacyConsent({ measurement: true, personalization: false });
    assert.equal(browserModule.createTikTokBrowserAction("Pageview"), null, "Measurement alone cannot authorize advertising use");
    await requestPrivacyConsent({ measurement: true, personalization: true });
    assert.equal(productionBrowser.createTikTokBrowserAction("Pageview"), null, "Production is hard-off even with an eligible fixture grant");
    const rejected = browserModule.createTikTokBrowserAction("Pageview"); assert(rejected);
    assert.equal(await browserModule.dispatchTikTokBrowserAction(rejected), false); assert.equal(scriptLoads, 0);
    allowReply = true; forged = true;
    assert.equal(await browserModule.dispatchTikTokBrowserAction(browserModule.createTikTokBrowserAction("Pageview")), false);
    assert.equal(scriptLoads, 0, "Forged server event ID cannot load SDK"); forged = false;
    const valid = browserModule.createTikTokBrowserAction("Pageview"); assert(valid);
    assert.equal(await browserModule.dispatchTikTokBrowserAction(valid), true); assert.equal(scriptLoads, 1);
    assert.equal(await browserModule.dispatchTikTokBrowserAction(valid), false, "No duplicate action dispatch");
    const eventCommands = commands.filter((entry) => entry[0] === "track");
    assert.equal(eventCommands.length, 1); assert.equal(eventCommands[0][1], "Pageview");
    assert.equal((eventCommands[0][3] as { event_id: string }).event_id, valid.eventId);
    assert.equal(commands.some((entry) => entry[0] === "holdConsent" || entry[0] === "page" || entry[0] === "identify"), false);
    for (const source of ["https://www.psllabs.org/admin-ledger.01", "https://www.psllabs.org/success?orderId=private",
      "https://www.psllabs.org/products?medical=private", "https://www.psllabs.org/track", "https://www.psllabs.org/%61dmin"]) {
      assert.equal(browserModule.tikTokBrowserContextAllowed(source, ""), false);
    }
    assert.equal(browserModule.tikTokBrowserContextAllowed(location.href, "https://www.psllabs.org/admin-ledger.01"), false);
    const stale = browserModule.createTikTokBrowserAction("Pageview"); assert(stale);
    await requestPrivacyConsent({ measurement: true, personalization: true });
    assert.equal(await browserModule.dispatchTikTokBrowserAction(stale), false, "Consent revision change invalidates existing action");
    navigation.globalPrivacyControl = true;
    assert.equal(browserModule.createTikTokBrowserAction("Pageview"), null); navigation.globalPrivacyControl = false;
    let resume!: () => void;
    pauseReply = new Promise<void>((resolve) => { resume = resolve; });
    const pending = browserModule.dispatchTikTokBrowserAction(browserModule.createTikTokBrowserAction("Pageview"));
    await Promise.resolve(); await requestPrivacyConsent({ measurement: false, personalization: false });
    resume(); assert.equal(await pending, false, "Withdrawal during server I/O prevents Pixel dispatch"); pauseReply = null;
    browserModule.stopTikTokBrowserDispatch();
    assert.equal(browserModule.hasTikTokBrowserSdk(), true); assert.equal(browserModule.createTikTokBrowserAction("Pageview"), null);
    assert.equal(commands.filter((entry) => entry[0] === "track").length, 1);
    assert.equal(commands.filter((entry) => entry[0] === "revokeConsent").length, 2);
    console.log("TikTok browser passed offline: no SDK/queue before verified consent, exact shared IDs, guarded native readiness, no automatic events/matching, denied private/admin contexts, stale-action blocking and withdrawal during I/O. Native receipt/dedup not tested.");
  } finally {
    for (const [name, descriptor] of Object.entries(originals)) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
