/** Offline only: no provider request, label, payment, order write or email send. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assertLabelMatchesOrderShipping, labelRateMatchesShippingSelection } from "../lib/btcpostage/shipping-guard";
import { DEFAULT_PACKAGE } from "../lib/btcpostage/types";
import { getOrderShippingPresentation, getShippingSelectionPresentation } from "../lib/shipping/presentation";
import type { ShippingSelection } from "../lib/shipping/types";
import type { Order } from "../lib/orders/types";
import { buildCustomerOrderConfirmationEmail } from "../lib/email/order-confirmation";
import { buildOrderShippedEmail } from "../lib/email/order-shipped";
import { buildPackingSlipHtml } from "../lib/fulfillment/packing-slip";
import { toTrackedOrder } from "../lib/orders/tracking";

const priority: ShippingSelection = {
  method: "priority", carrier: "USPS", providerServiceCode: "Priority",
  serviceDisplayName: "USPS Priority Mail", transitDays: 2,
  deliveryEstimate: "Estimated 2 business days after carrier acceptance; not guaranteed.",
  quotedPostageUsd: 9.61, package: { weightOz: 4, lengthIn: 6, widthIn: 4, heightIn: 3 },
  quotedAt: "2026-10-15T12:00:00.000Z", quoteExpiresAt: "2026-10-15T12:05:00.000Z",
};
const base = { selection: priority, carrier: "USPS", service: "Priority", pkg: DEFAULT_PACKAGE };
assert.doesNotThrow(() => assertLabelMatchesOrderShipping(base), "paid service survives checkout quote expiration during later fulfillment");
for (const service of ["GroundAdvantage", "Express", "PriorityFlatRate", "priority", "USPS Priority Mail"]) {
  assert.throws(() => assertLabelMatchesOrderShipping({ ...base, service }), /Label service must match/, service);
}
assert.throws(() => assertLabelMatchesOrderShipping({ ...base, carrier: "UPS" }), /Label service must match/);
for (const pkg of [
  { ...DEFAULT_PACKAGE, weightOz: 3 },
  { ...DEFAULT_PACKAGE, weightOz: 8 },
  { ...DEFAULT_PACKAGE, depthIn: 7 },
  { ...DEFAULT_PACKAGE, weightOz: Number.NaN },
  { ...DEFAULT_PACKAGE, heightIn: -3 },
  { ...DEFAULT_PACKAGE, packageType: "FlatRate" },
]) assert.throws(() => assertLabelMatchesOrderShipping({ ...base, pkg }));
for (const selection of [
  { ...priority, package: null },
  { ...priority, quotedPostageUsd: null },
  { ...priority, quotedAt: null },
  { ...priority, providerServiceCode: null },
  { ...priority, package: { ...priority.package!, weightOz: -4 } },
]) assert.throws(() => assertLabelMatchesOrderShipping({ ...base, selection }));
const standard = { ...priority, method: "standard" as const, providerServiceCode: "GroundAdvantage", serviceDisplayName: "USPS Ground Advantage", package: null, quotedPostageUsd: null };
assert.doesNotThrow(() => assertLabelMatchesOrderShipping({ ...base, selection: standard, service: "GroundAdvantage" }));
assert.throws(() => assertLabelMatchesOrderShipping({ ...base, selection: standard }), /Label service must match/);
assert.doesNotThrow(() => assertLabelMatchesOrderShipping({ ...base, selection: undefined, carrier: "UPS", service: "legacy-service" }), "historical manual workflow remains available");
assert.equal(labelRateMatchesShippingSelection(priority, { carrier: "usps", service: "Priority" }), true);
assert.equal(labelRateMatchesShippingSelection(priority, { carrier: "USPS", service: "GroundAdvantage" }), false);
assert.equal(getShippingSelectionPresentation().serviceName, "Standard shipping");
assert.equal(getShippingSelectionPresentation().deliveryEstimate, null);
assert.equal(getOrderShippingPresentation({ selection: priority }).serviceName, "USPS Priority Mail");

const order = {
  orderId: "psl_offline_shipping_fixture", createdAt: "2026-10-15T12:00:00.000Z", status: "paid",
  email: "offline@example.invalid", shipping: { firstName: "Offline", lastName: "Fixture", address: "<script>private-street</script>", city: "Phoenix", state: "AZ", zip: "85016", country: "US", selection: priority },
  items: [{ handle: "psl-bpc-10mg", name: "BPC-157", strength: "10 mg", quantity: 1, unitPrice: 47.99, lineTotal: 47.99 }],
  subtotal: 47.99, discountCode: null, discountAmount: 0, shippingCost: 24.99, total: 72.98,
  trackingNumber: "OFFLINE-NOT-A-SHIPMENT", trackingCarrier: "USPS", paidAt: "2026-10-15T12:00:00.000Z",
} as Order;
const confirmation = buildCustomerOrderConfirmationEmail(order);
const shipped = buildOrderShippedEmail(order);
const slip = buildPackingSlipHtml(order);
const tracked = toTrackedOrder(order);
for (const text of [confirmation.html, confirmation.text, shipped.html, shipped.text, slip, JSON.stringify(tracked)]) {
  assert.match(text, /USPS Priority Mail/, "selected service survives each receipt/fulfillment surface");
  assert.match(text, /2 business days/, "saved carrier estimate survives");
}
assert.equal(tracked.shippingService.serviceName, "USPS Priority Mail");
assert.doesNotMatch(JSON.stringify(tracked), /private-street|quotedPostageUsd|providerServiceCode|quoteExpiresAt/, "tracking projection does not disclose private address or provider quote metadata");
assert.doesNotMatch(slip, /<script>private-street/);
assert.match(slip, /&lt;script&gt;private-street/);
assert.match(confirmation.text, /24 hours/);
const legacy = { ...order, shipping: { ...order.shipping, selection: undefined }, shippingCost: 24.99 };
assert.equal(toTrackedOrder(legacy).shippingService.serviceName, "Standard shipping", "shipping price never infers Priority");
assert.doesNotMatch(buildCustomerOrderConfirmationEmail(legacy).text, /USPS Priority Mail|USPS Ground Advantage/);

const serviceSource = readFileSync(new URL("../lib/btcpostage/service.ts", import.meta.url), "utf8");
const buySource = serviceSource.slice(serviceSource.indexOf("export async function buyOrderLabel"));
assert(buySource.indexOf("assertLabelMatchesOrderShipping(") < buySource.indexOf("claimLabelPurchase("), "guard precedes claim");
assert(buySource.indexOf("assertLabelMatchesOrderShipping(") < buySource.indexOf("await createPurchase("), "guard precedes paid provider dispatch");
console.log("Shipping fulfillment, service matching, receipt projection and legacy isolation checks passed (offline; zero dispatches).");
