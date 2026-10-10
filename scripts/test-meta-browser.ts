import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initializePrivacyConsent, requestPrivacyConsent } from "../lib/privacy/client";
import { UNKNOWN_PRIVACY_CONSENT, type PublicPrivacyConsent } from "../lib/privacy/types";
import * as productionBrowser from "../lib/meta-ads/browser";
import { PSL_META_DATASET_ID, REVIEWED_META_EVENT_POLICY, type MetaEventPolicy } from "../lib/meta-ads/events";
import { loadMetaBrowserFixture } from "./meta-browser-fixture";

async function main() {
  // Reviewed candidates are exercised only in an isolated module, never by
  // changing the empty production policy or exposing a runtime QA switch.
  const { createMetaBrowserAction, dispatchMetaBrowserAction, metaBrowserContextAllowed,
    hasMetaBrowserSdk, stopMetaBrowserDispatch } = loadMetaBrowserFixture(REVIEWED_META_EVENT_POLICY);
  const originals = Object.fromEntries(["window", "document", "navigator", "fetch", "setInterval", "setTimeout"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const realInterval = globalThis.setInterval, realTimeout = globalThis.setTimeout;
  const values = new Map<string, string>([["psl_researcher_verified_v1", "1"]]);
  const requests: { url: string; body: Record<string, unknown> }[] = [];
  const commands: unknown[][] = [];
  let scriptLoads = 0;
  let allowReply = false;
  let forgeReply = false;
  let pauseReply: Promise<void> | null = null;
  let consent: PublicPrivacyConsent = { ...UNKNOWN_PRIVACY_CONSENT };
  const location = { href: "https://www.psllabs.org/", pathname: "/", hostname: "www.psllabs.org" };
  const navigation = { globalPrivacyControl: false };
  type Pixel = ((...args: unknown[]) => void) & { queue: unknown[][]; callMethod?: (...args: unknown[]) => void };
  const browser: { location: typeof location; crypto: { randomUUID: typeof randomUUID }; fbq?: Pixel; _fbq?: Pixel;
    localStorage: { getItem: (key: string) => string | null; setItem: (key: string, value: string) => void; removeItem: (key: string) => void };
    addEventListener: () => void; removeEventListener: () => void; dispatchEvent: () => boolean } = {
      location, crypto: { randomUUID }, localStorage: { getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => { values.set(key, value); }, removeItem: (key) => { values.delete(key); } },
      addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => true,
    };
  const document = { cookie: "", referrer: "", createElement: () => ({ onload: () => {}, src: "" }), head: {
    appendChild: (script: { src: string; onload: () => void }) => {
      assert.equal(script.src, "https://connect.facebook.net/en_US/fbevents.js");
      scriptLoads++;
      const pixel = browser.fbq!;
      commands.push(...pixel.queue.splice(0));
      pixel.callMethod = (...args) => { commands.push(args); };
      script.onload();
    },
  } };
  try {
    Object.defineProperty(globalThis, "window", { configurable: true, value: browser });
    Object.defineProperty(globalThis, "document", { configurable: true, value: document });
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: navigation });
    Object.defineProperty(globalThis, "setInterval", { configurable: true, value: (...args: Parameters<typeof setInterval>) => realInterval(...args).unref() });
    Object.defineProperty(globalThis, "setTimeout", { configurable: true, value: (...args: Parameters<typeof setTimeout>) => realTimeout(...args).unref() });
    Object.defineProperty(globalThis, "fetch", { configurable: true, value: async (url: string, init: RequestInit) => {
      assert(["/api/privacy/consent", "/api/meta/events"].includes(url), "no actual external network calls");
      const body = init.body ? JSON.parse(String(init.body)) : {};
      if (url === "/api/privacy/consent") {
        if (init.method === "POST") consent = { ...consent, measurement: body.measurement, personalization: body.personalization,
          choice: "saved", revision: consent.revision + 1, expiresAt: Date.now() + 86400000 };
        return Response.json({ consent });
      }
      requests.push({ url, body });
      if (pauseReply) await pauseReply;
      return Response.json({ event: !allowReply ? null : {
        event_name: body.name, event_id: forgeReply ? randomUUID() : body.eventId,
        event_time: Math.floor(Date.now() / 1000), event_source_url: body.sourceUrl, action_source: "website",
        ...(body.productIds ? { custom_data: { content_ids: body.productIds, content_type: "product" } } : {}),
      } });
    } });

    assert.equal(createMetaBrowserAction("PageView"), null, "unknown consent creates no action");
    await initializePrivacyConsent();
    await requestPrivacyConsent({ measurement: true, personalization: true });
    assert.equal(createMetaBrowserAction("PageView"), null, "both Meta capabilities must be verified");
    assert.equal(requests.length, 0); assert.equal(scriptLoads, 0);
    consent = { ...consent, capabilities: { tiktokMeasurement: false, tiktokPersonalization: false, metaMeasurement: true, metaPersonalization: true, googleMeasurement: false, openaiMeasurement: false } };
    await initializePrivacyConsent();
    await requestPrivacyConsent({ measurement: true, personalization: false });
    assert.equal(createMetaBrowserAction("PageView"), null, "measurement alone cannot authorize Meta personalization");
    await requestPrivacyConsent({ measurement: true, personalization: true });
    assert.equal(productionBrowser.metaBrowserContextAllowed(location.href, ""), false);
    assert.equal(productionBrowser.createMetaBrowserAction("PageView"), null,
      "actual empty production scope denies collection even with both consented capabilities");
    assert.equal(await productionBrowser.dispatchMetaBrowserAction({ name: "PageView", eventId: randomUUID(),
      sourceUrl: location.href, consentRevision: consent.revision, createdAt: Date.now() }), false);
    assert.equal(requests.length, 0); assert.equal(scriptLoads, 0);

    const narrowPolicy: MetaEventPolicy = {
      approvedPaths: { PageView: ["/", "/products/psl-rs-5ml"], ViewContent: ["/products/psl-rs-5ml"],
        InitiateCheckout: ["/checkout"] }, approvedProductIds: ["PSL-RS-5ML"],
    };
    const narrow = loadMetaBrowserFixture(narrowPolicy);
    assert(narrow.metaBrowserContextAllowed(location.href, "https://www.facebook.com/"));
    assert.equal(narrow.metaBrowserContextAllowed("https://www.psllabs.org/products/psl-rt-10mg", ""), false,
      "a reviewed product outside the final scope is not an SDK context");
    assert.equal(narrow.metaBrowserContextAllowed(location.href, "https://www.psllabs.org/products/psl-rt-10mg"), false,
      "a same-site referrer must also be inside the final scope");
    location.href = "https://www.psllabs.org/products/psl-rt-10mg"; location.pathname = "/products/psl-rt-10mg";
    assert.equal(narrow.createMetaBrowserAction("PageView"), null);
    assert.equal(await narrow.dispatchMetaBrowserAction({ name: "PageView", eventId: randomUUID(),
      sourceUrl: location.href, consentRevision: consent.revision, createdAt: Date.now() }), false);
    location.href = "https://www.psllabs.org/products/psl-rs-5ml"; location.pathname = "/products/psl-rs-5ml";
    assert(narrow.createMetaBrowserAction("ViewContent", ["PSL-RS-5ML"]));
    assert.equal(narrow.createMetaBrowserAction("AddToCart", ["PSL-RS-5ML"]), null,
      "permission for one event does not authorize another on the same page");
    location.href = "https://www.psllabs.org/checkout"; location.pathname = "/checkout";
    assert(narrow.createMetaBrowserAction("InitiateCheckout", ["PSL-RS-5ML"]));
    assert.equal(narrow.createMetaBrowserAction("InitiateCheckout", ["PSL-RS-5ML", "PSL-RT-10MG"]), null,
      "mixed approved/unapproved carts are rejected before a request");
    assert.equal(requests.length, 0); assert.equal(scriptLoads, 0);
    location.href = "https://www.psllabs.org/"; location.pathname = "/";
    const first = createMetaBrowserAction("PageView")!;
    assert(first);
    assert.equal(await dispatchMetaBrowserAction(first), false, "off server reply never loads SDK");
    assert.equal(scriptLoads, 0);
    assert.equal(await dispatchMetaBrowserAction(first), false, "same action is not retried or replayed");
    assert.equal(requests.length, 1);

    for (const [source, ref] of [
      ["https://www.psllabs.org/?email=private", ""], ["https://www.psllabs.org/admin-ledger.01", ""],
      ["https://www.psllabs.org/success?orderId=private", ""], [location.href, "https://www.psllabs.org/admin"],
      [location.href, "https://www.facebook.com/private/path"], [location.href, "https://www.instagram.com/?health=private"],
    ]) assert.equal(metaBrowserContextAllowed(source, ref), false);
    assert(metaBrowserContextAllowed("https://www.psllabs.org/?fbclid=allowed_123", "https://www.facebook.com/"));
    document.referrer = "https://www.psllabs.org/admin";
    assert.equal(createMetaBrowserAction("PageView"), null);
    document.referrer = "";
    allowReply = true; forgeReply = true;
    assert.equal(await dispatchMetaBrowserAction(createMetaBrowserAction("PageView")), false, "mismatched server ID cannot be forwarded");
    assert.equal(scriptLoads, 0);
    forgeReply = false;
    const approved = createMetaBrowserAction("PageView")!;
    assert.equal(await dispatchMetaBrowserAction(approved), true);
    assert.equal(scriptLoads, 1);
    assert.deepEqual(commands.slice(0, 4), [["consent", "revoke"], ["set", "autoConfig", false, PSL_META_DATASET_ID],
      ["init", PSL_META_DATASET_ID], ["set", "trackSingleOnly", true, PSL_META_DATASET_ID]],
    "manual-only configuration follows init and precedes any consent grant or event");
    const event = commands.find((row) => row[0] === "trackSingle")!;
    assert.equal(event[1], PSL_META_DATASET_ID);assert.equal(event[2], "PageView");
    assert.deepEqual(event[4], { eventID: approved.eventId }, "browser preserves the CAPI event ID exactly");
    assert.deepEqual(commands[4], ["consent", "grant"]);
    assert(commands.every((row) => row[0] !== "track" && row[0] !== "trackCustom"), "application never requests broadcast tracking");
    assert.equal(requests.at(-1)?.body.sourceUrl, location.href, "actual contextual URL is preserved");
    assert.deepEqual(Object.keys(requests.at(-1)!.body).sort(), ["eventId", "name", "sourceUrl"]);
    const sentCommands = commands.length, sentRequests = requests.length;
    assert.equal(await dispatchMetaBrowserAction(approved), false, "a successful manual event is not replayed");
    assert.equal(commands.length, sentCommands); assert.equal(requests.length, sentRequests);

    location.href = "https://www.psllabs.org/products/psl-rt-10mg?fbclid=valid_123";
    location.pathname = "/products/psl-rt-10mg";
    assert.equal(createMetaBrowserAction("AddToCart", ["PSL-GHKCU-50MG"]), null, "wrong product context is rejected before any request");
    const add = createMetaBrowserAction("AddToCart", ["PSL-RT-10MG"]);
    assert.equal(await dispatchMetaBrowserAction(add), true);
    assert.equal(scriptLoads, 1, "SDK is reused, not duplicated");
    let release!: () => void;
    pauseReply = new Promise<void>((resolve) => { release = resolve; });
    const inFlight = dispatchMetaBrowserAction(createMetaBrowserAction("ViewContent", ["PSL-RT-10MG"]));
    const before = commands.length;
    await requestPrivacyConsent({ measurement: false, personalization: false });
    release();pauseReply = null;
    assert.equal(await inFlight, false, "withdrawal cancels a server reply already in flight");
    assert.equal(commands.length, before);
    const ownedPixel = browser.fbq!;
    const unownedCommands: unknown[][] = [];
    const unownedPixel = Object.assign((...args: unknown[]) => { unownedCommands.push(args); }, { queue: [] });
    browser._fbq = unownedPixel;
    ownedPixel.queue.push(["trackSingle", PSL_META_DATASET_ID, "PageView"]);
    stopMetaBrowserDispatch();assert.equal(hasMetaBrowserSdk(), true, "old SDK remains marked for document replacement");
    assert.deepEqual(commands.at(-1), ["consent", "revoke"], "withdrawal reaches the owned SDK before its wrapper is stopped");
    assert.equal(commands.length, before + 1, "only the defensive revoke is dispatched");
    assert.equal(ownedPixel.queue.length, 0, "pending owned commands are discarded");
    assert.equal(browser._fbq, unownedPixel, "an unrelated replacement global is preserved");
    assert.equal(unownedCommands.length, 0, "shutdown never invokes an unowned SDK");
    browser.fbq?.("track", "fake");
    ownedPixel("trackSingle", PSL_META_DATASET_ID, "PageView");
    stopMetaBrowserDispatch();
    assert.equal(commands.length, before + 1, "stopped globals, cached wrappers and repeated shutdown cannot dispatch");
    assert.equal(await dispatchMetaBrowserAction(add), false, "no action is forwarded after shutdown");
    console.log("[test-meta-browser] default-off, dual consent, actual context/referrer, server gate, safe initialization, stable IDs, no replay, and withdrawal races passed offline");
  } finally {
    for (const [key, descriptor] of Object.entries(originals)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
    }
  }
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
