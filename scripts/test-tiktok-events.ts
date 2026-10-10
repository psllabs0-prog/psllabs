import assert from "node:assert/strict";
import {
  prepareTikTokEvent, tikTokBrowserEventArguments, tikTokSourceUrlAllowed,
  REVIEWED_TIKTOK_EVENT_POLICY, TIKTOK_EVENT_NAMES, type TikTokEventInput,
} from "../lib/tiktok-ads/events";
import { tikTokEventId } from "../lib/tiktok-ads/event-id";
import { readTikTokServerConfig } from "../lib/tiktok-ads/config";
import { sendPreparedTikTokEvent, tikTokRequestBody } from "../lib/tiktok-ads/transport";
import { PSL_TIKTOK_PIXEL_ID } from "../lib/tiktok-ads/events";

async function main() {
  const now = 1_800_000_000_000;
  const product = "PSL-RT-10MG";
  const names = TIKTOK_EVENT_NAMES;
  const actions: TikTokEventInput[] = names.map((name) => ({ name,
    eventId: tikTokEventId(name, "offline-action"), occurredAt: now,
    sourceUrl: `https://www.psllabs.org/${name === "Purchase" ? "success" : name === "InitiateCheckout" ? "checkout" : name === "Pageview" ? "products" : "products/psl-rt-10mg"}`,
    ...(name !== "Pageview" ? { productIds: [product] } : {}),
    ...(name === "Purchase" ? { valueCents: 1234, currency: "USD", settledPayment: true } : {}),
  }));
  for (const action of actions) {
    const prepared = prepareTikTokEvent(action, { now, currentConsent: true, policy: REVIEWED_TIKTOK_EVENT_POLICY });
    assert.equal(prepared.ok, true, action.name);
    if (!prepared.ok) throw new Error("fixture preparation failed");
    assert.equal(prepared.event.event, action.name);
    assert.equal(tikTokBrowserEventArguments(prepared.event)[2].event_id, prepared.event.event_id);
    assert.equal(tikTokBrowserEventArguments(prepared.event)[0], prepared.event.event);
    assert.equal(prepareTikTokEvent(action, { now, currentConsent: true }).ok, false, "empty production policy blocks all events");
    assert.equal(prepareTikTokEvent(action, { now, currentConsent: false, policy: REVIEWED_TIKTOK_EVENT_POLICY }).ok, false);
    for (const flag of ["admin", "synthetic", "testPurchase"] as const) {
      assert.equal(prepareTikTokEvent({ ...action, [flag]: true }, { now, currentConsent: true, policy: REVIEWED_TIKTOK_EVENT_POLICY }).ok, false);
    }
    for (const sourceUrl of ["https://www.psllabs.org/admin-ledger.01", "https://www.psllabs.org/success?orderId=private",
      "https://www.psllabs.org/%61dmin", "https://www.psllabs.org/products?medical=private", "https://elsewhere.invalid/products",
      `${action.sourceUrl}#private`, `${action.sourceUrl}?email=private@example.invalid`]) {
      assert.equal(prepareTikTokEvent({ ...action, sourceUrl }, { now, currentConsent: true, policy: REVIEWED_TIKTOK_EVENT_POLICY }).ok, false);
    }
  }
  assert.equal(tikTokSourceUrlAllowed("https://www.psllabs.org/products?ttclid=VALID_AD_CLICK", "Pageview", REVIEWED_TIKTOK_EVENT_POLICY), true);
  assert.equal(tikTokSourceUrlAllowed("https://www.psllabs.org/products?ttclid=a&ttclid=b", "Pageview", REVIEWED_TIKTOK_EVENT_POLICY), false);
  assert.equal(tikTokSourceUrlAllowed("https://www.psllabs.org/products?fbclid=a", "Pageview", REVIEWED_TIKTOK_EVENT_POLICY), false);
  assert.equal(prepareTikTokEvent({ ...actions[1], productIds: ["PSL-BPC157-10MG"] },
    { now, currentConsent: true, policy: REVIEWED_TIKTOK_EVENT_POLICY }).ok, false);
  const purchase = actions[4];
  for (const patch of [{ productIds: [product, "not-eligible"] }, { settledPayment: false }, { valueCents: 1234.5 },
    { valueCents: -1 }, { currency: "EUR" }, { occurredAt: now + 1 }, { occurredAt: now - 86_400_001 }, { eventId: "private" }]) {
    assert.equal(prepareTikTokEvent({ ...purchase, ...patch }, { now, currentConsent: true, policy: REVIEWED_TIKTOK_EVENT_POLICY }).ok, false);
  }
  const prepared = prepareTikTokEvent(purchase, { now, currentConsent: true, policy: REVIEWED_TIKTOK_EVENT_POLICY });
  assert(prepared.ok);
  assert.equal(prepared.event.properties?.value, 12.34); assert.equal(prepared.event.properties?.currency, "USD");
  const technical = { user_agent: "Offline fixture", ip: "192.0.2.1" };
  const body = tikTokRequestBody(prepared.event, { ...technical, email: "never@send.invalid", medical: "NEVER" } as typeof technical, PSL_TIKTOK_PIXEL_ID, "TEST_OFFLINE");
  assert(body); assert.equal(body.event_source, "web"); assert.equal(body.event_source_id, PSL_TIKTOK_PIXEL_ID);
  assert.deepEqual(Object.keys(body.data[0].user).sort(), ["ip", "user_agent"]);
  assert.equal(JSON.stringify(body).includes("NEVER"), false); assert.equal(JSON.stringify(body).includes("email"), false);
  assert.equal(tikTokRequestBody({ ...prepared.event, medical: "private" } as typeof prepared.event, technical, PSL_TIKTOK_PIXEL_ID), null);
  assert.equal(tikTokRequestBody(prepared.event, { ...technical, ttp: "private@email.invalid" }, PSL_TIKTOK_PIXEL_ID), null);
  assert.equal(tikTokRequestBody(prepared.event, { ...technical, ip: "not-an-ip" }, PSL_TIKTOK_PIXEL_ID), null);
  assert.equal(tikTokRequestBody(prepared.event, technical, PSL_TIKTOK_PIXEL_ID, "not a test code"), null);
  assert.equal(readTikTokServerConfig(), null, "credentials cannot enable an unverified production release");
  let requests = 0;
  const send = { config: { pixelId: PSL_TIKTOK_PIXEL_ID, accessToken: "OFFLINE_NOT_A_SECRET" }, event: prepared.event,
    technical, currentPermission: async () => true, testCode: "TEST_OFFLINE", fetchImpl: (async (url, options) => {
      requests++; assert.equal(String(url), "https://business-api.tiktok.com/open_api/v1.3/event/track/");
      assert.equal(String(url).includes("OFFLINE_NOT_A_SECRET"), false); assert.equal(options?.redirect, "error");
      assert.equal(new Headers(options?.headers).get("Access-Token"), "OFFLINE_NOT_A_SECRET");
      assert.equal(JSON.parse(String(options?.body)).data[0].event_id, prepared.event.event_id);
      return Response.json({ code: 0 });
    }) as typeof fetch };
  assert.equal((await sendPreparedTikTokEvent({ ...send, currentPermission: async () => false })).ok, false);
  assert.equal(requests, 0); assert.equal((await sendPreparedTikTokEvent(send)).ok, true); assert.equal(requests, 1);
  assert.equal((await sendPreparedTikTokEvent({ ...send, config: { ...send.config, pixelId: "WRONG_PIXEL" } })).ok, false);
  assert.equal(requests, 1);
  assert.equal((await sendPreparedTikTokEvent({ ...send, fetchImpl: async () => Response.json({ code: 40001 }) })).ok, false);
  assert.equal((await sendPreparedTikTokEvent({ ...send, fetchImpl: async () => { throw new Error("private token response"); } })).reason, "transport_failed");
  console.log("TikTok offline preparation/transport passed: exact event names/IDs, USD amounts, default-off policy, entire mixed-cart rejection, exclusions, URL/data allowlists, final permission gate. No TikTok event receipt tested or network request sent.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
