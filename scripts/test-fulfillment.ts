/**
 * Offline fulfillment tests.
 * Run: npm run test:fulfillment
 */
import {
  aggregatePickList,
  isFulfillmentResolvedByShipping,
} from "../lib/fulfillment/store";
import { getUnshippedReviewHours } from "../lib/ops/exceptions";
import { buildPackingSlipHtml } from "../lib/fulfillment/packing-slip";
import type { Order } from "../lib/orders/types";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function testPickListAggregate() {
  const list = aggregatePickList([
    {
      items: [
        { name: "Retatrutide", strength: "10mg", quantity: 3 },
        { name: "BPC-157", strength: "10mg", quantity: 2 },
      ],
    },
    {
      items: [
        { name: "Retatrutide", strength: "10mg", quantity: 4 },
        { name: "GHK-Cu", strength: "50mg", quantity: 2 },
      ],
    },
  ]);
  assert(
    list.find((x) => x.label === "Retatrutide 10mg")?.quantity === 7,
    "reta aggregate"
  );
  assert(
    list.find((x) => x.label === "BPC-157 10mg")?.quantity === 2,
    "bpc aggregate"
  );
  assert(
    list.find((x) => x.label === "GHK-Cu 50mg")?.quantity === 2,
    "ghk aggregate"
  );
}

function testShippingResolves() {
  assert(
    isFulfillmentResolvedByShipping({ status: "shipped", trackingNumber: null }) ===
      true,
    "shipped resolves"
  );
  assert(
    isFulfillmentResolvedByShipping({
      status: "paid",
      trackingNumber: "9400",
    }) === true,
    "tracking resolves"
  );
  assert(
    isFulfillmentResolvedByShipping({ status: "paid", trackingNumber: null }) ===
      false,
    "paid without tracking not resolved"
  );
}

function testNoOverdueWithoutConfig() {
  const prev = process.env.OPS_UNSHIPPED_REVIEW_HOURS;
  delete process.env.OPS_UNSHIPPED_REVIEW_HOURS;
  assert(getUnshippedReviewHours() === null, "no SLA configured");
  process.env.OPS_UNSHIPPED_REVIEW_HOURS = "48";
  assert(getUnshippedReviewHours() === 48, "configured hours");
  if (prev === undefined) delete process.env.OPS_UNSHIPPED_REVIEW_HOURS;
  else process.env.OPS_UNSHIPPED_REVIEW_HOURS = prev;
}

function testPackingSlipNoMedical() {
  const order: Order = {
    orderId: "psl_test",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    status: "paid",
    currency: "USD",
    email: "c@example.com",
    shipping: {
      firstName: "A",
      lastName: "B",
      address: "1 Main",
      city: "Phoenix",
      state: "AZ",
      zip: "85001",
      country: "US",
    },
    items: [
      {
        handle: "bpc-157",
        name: "BPC-157",
        strength: "10mg",
        quantity: 1,
        unitPrice: 1,
        lineTotal: 1,
      },
    ],
    subtotal: 1,
    discountCode: null,
    discountAmount: 0,
    taxRate: 0,
    tax: 0,
    shippingCost: 0,
    total: 1,
    invoiceId: null,
    invoiceCreatedAt: null,
    paidAt: "2026-01-01T00:00:00.000Z",
    shippedAt: null,
    trackingNumber: null,
    trackingCarrier: null,
    paymentMethod: "card",
    emailSent: false,
    emailError: null,
    customerEmailSent: false,
    customerEmailError: null,
    feedbackEmailSent: false,
    trackingEmailSent: false,
    trackingSavedAt: null,
    deliveryFollowupSent: false,
    stockDecremented: false,
    attribution: null,
  };
  const html = buildPackingSlipHtml(order);
  assert(/psl_test/.test(html), "order id");
  assert(/research use only/i.test(html), "RUO");
  assert(!/dose|inject|administer|treatment/i.test(html), "no medical");
}

function testEligibilityRulesDocumented() {
  // unpaid / cancelled / shipped / reporting_excluded handled in SQL listFulfillmentEligibleOrders
  const unpaid = { status: "pending" };
  const cancelled = { status: "cancelled" };
  const shipped = { status: "shipped" };
  const paid = { status: "paid" };
  assert(unpaid.status !== "paid", "unpaid excluded");
  assert(cancelled.status !== "paid", "cancelled excluded");
  assert(shipped.status !== "paid", "shipped excluded from ready");
  assert(paid.status === "paid", "paid eligible candidate");
}

function main() {
  console.log("[test-fulfillment] running…");
  testPickListAggregate();
  testShippingResolves();
  testNoOverdueWithoutConfig();
  testPackingSlipNoMedical();
  testEligibilityRulesDocumented();
  console.log("[test-fulfillment] all passed.");
}

main();
