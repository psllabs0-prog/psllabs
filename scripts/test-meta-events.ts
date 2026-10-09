import assert from "node:assert/strict";
import { prepareMetaEvent, browserEventArguments, type MetaEventInput, type MetaEventPolicy, META_EVENT_NAMES, REVIEWED_META_EVENT_POLICY, metaSourceUrlAllowed } from "../lib/meta-ads/events";
import { metaEventId } from "../lib/meta-ads/event-id";
const now = 1_800_000_000_000;
assert.equal(metaSourceUrlAllowed("https://www.psllabs.org/products/psl-rt-10mg?fbclid=VALID_CLICK_ONLY", "ViewContent", REVIEWED_META_EVENT_POLICY), true);
assert.equal(metaSourceUrlAllowed("https://psllabs.org/about", "PageView", REVIEWED_META_EVENT_POLICY), true);
for (const url of ["https://www.psllabs.org/products/psl-rt-10mg?email=private", "https://www.psllabs.org/%61dmin", "https://www.psllabs.org/success?orderId=private", "https://www.psllabs.org/about?utm_campaign=private_health_context"]) {
  assert.equal(metaSourceUrlAllowed(url, "PageView", REVIEWED_META_EVENT_POLICY), false);
}
assert.equal(prepareMetaEvent({ name: "ViewContent", eventId: "a".repeat(64), occurredAt: now,
  sourceUrl: "https://www.psllabs.org/products/psl-rt-10mg", productIds: ["PSL-BPC157-10MG"] },
  { policy: REVIEWED_META_EVENT_POLICY, currentConsent: true, now }).ok, false);
// Invented fixtures remain offline; no orders, pixels or provider requests are created.
const policy: MetaEventPolicy = { approvedPaths: Object.fromEntries(META_EVENT_NAMES.map((n) => [n, ["/products/offline-fixture"]])),
  approvedProductIds: ["offline-fixture"] };
const purchase: MetaEventInput = { name: "Purchase", eventId: metaEventId("Purchase", "offline-order"), occurredAt: now,
  sourceUrl: "https://www.psllabs.org/products/offline-fixture", productIds: ["offline-fixture"],
  valueCents: 10999, currency: "USD", settledPayment: true };
const prepared = prepareMetaEvent(purchase, { policy, now, currentConsent: true });
assert.equal(prepared.ok, true);
if (prepared.ok) {
  assert.equal(prepared.event.custom_data?.value, 109.99);
  assert.equal(prepared.event.custom_data?.currency, "USD");
  assert.equal(browserEventArguments(prepared.event)[2], prepared.event.event_name);
  assert.equal(browserEventArguments(prepared.event)[4].eventID, prepared.event.event_id);
  assert.equal(prepared.event.event_id, metaEventId("Purchase", "offline-order"));
  assert.equal(JSON.stringify(prepared.event).includes("email"), false);
}
for (const name of META_EVENT_NAMES) {
  const event = { ...purchase, name, ...(name === "PageView" ? { productIds: [] } : {}) };
  assert.equal(prepareMetaEvent(event, { now, currentConsent: true }).ok, false, "empty production allowlist rejects all events");
  assert.equal(prepareMetaEvent(event, { policy, now, currentConsent: false }).ok, false);
  for (const flag of ["admin", "synthetic", "testPurchase"] as const) {
    assert.equal(prepareMetaEvent({ ...event, [flag]: true }, { policy, now, currentConsent: true }).ok, false);
  }
}
for (const patch of [
  { productIds: ["offline-fixture", "unapproved-compound"] }, { settledPayment: false },
  { valueCents: 10.1 }, { valueCents: -1 }, { currency: "EUR" }, { occurredAt: now + 1 },
  { sourceUrl: "https://www.psllabs.org/admin-ledger.01" },
  { sourceUrl: "https://www.psllabs.org/products/offline-fixture?email=private" },
  { sourceUrl: "https://www.psllabs.org/products/offline-fixture#private" },
  { sourceUrl: "https://example.com/products/offline-fixture" },
]) assert.equal(prepareMetaEvent({ ...purchase, ...patch }, { policy, now, currentConsent: true }).ok, false);
console.log("Meta offline preparation: all five event gates, excluded activity, entire mixed-cart rejection, settled USD values and shared browser/server IDs passed. No platform event receipt was tested.");
