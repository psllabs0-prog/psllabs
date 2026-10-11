import assert from "node:assert/strict";
import { prepareMetaEvent, browserEventArguments, type MetaEventInput, type MetaEventPolicy, META_EVENT_NAMES, REVIEWED_META_EVENT_POLICY, PRODUCTION_META_EVENT_POLICY, metaSourceUrlAllowed } from "../lib/meta-ads/events";
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
  assert.equal(prepareMetaEvent(event, { now, currentConsent: true }).ok, false, "production scope rejects offline product fixtures");
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
const pageView: MetaEventInput = { name: "PageView", eventId: metaEventId("PageView", "offline-action"),
  occurredAt: now, sourceUrl: "https://www.psllabs.org/products?fbclid=VALID_CLICK_ONLY" };
const scoped = prepareMetaEvent(pageView, { now, currentConsent: true });
assert.equal(scoped.ok, true, "production proposal permits only the actual products landing page");
if (scoped.ok) {
  assert.equal(scoped.event.event_source_url, pageView.sourceUrl);
  assert.equal(scoped.event.custom_data, undefined, "PageView has no product or purchase fields");
}
assert.deepEqual(PRODUCTION_META_EVENT_POLICY.approvedProductIds, []);
for (const sourceUrl of ["https://www.psllabs.org/", "https://www.psllabs.org/about",
  "https://www.psllabs.org/products/psl-rt-10mg", "https://www.psllabs.org/checkout",
  "https://www.psllabs.org/success", "https://www.psllabs.org/admin-ledger.01",
  "https://www.psllabs.org/products?email=private", "https://www.psllabs.org/products#private"]) {
  assert.equal(prepareMetaEvent({ ...pageView, sourceUrl }, { now, currentConsent: true }).ok, false);
}
for (const name of META_EVENT_NAMES.filter((name) => name !== "PageView")) {
  assert.equal(prepareMetaEvent({ ...purchase, name, sourceUrl: "https://www.psllabs.org/products" },
    { now, currentConsent: true }).ok, false, `${name} remains disabled in the production proposal`);
}
for (const flag of ["admin", "synthetic", "testPurchase"] as const) {
  assert.equal(prepareMetaEvent({ ...pageView, [flag]: true }, { now, currentConsent: true }).ok, false);
}
assert.equal(prepareMetaEvent(pageView, { now, currentConsent: false }).ok, false);
assert.equal(prepareMetaEvent({ ...pageView, productIds: ["PSL-RT-10MG"] }, { now, currentConsent: true }).ok, false);
console.log("Meta offline preparation: PageView-only /products proposal, blocked deeper/product/excluded events, mixed-cart rejection, fixture USD values and shared browser/server IDs passed. No platform event receipt was tested.");
