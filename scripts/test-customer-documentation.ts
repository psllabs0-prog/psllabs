/** Offline only: pure template rendering; no SMTP, database, cron or HTTP actions. */
import assert from "node:assert/strict";
import nodemailer from "nodemailer";
import { buildCustomerOrderConfirmationEmail } from "../lib/email/order-confirmation";
import { buildOrderShippedEmail } from "../lib/email/order-shipped";
import { buildDeliveryFollowupEmail } from "../lib/email/delivery-followup";
import { customerTrackingUrl, ORDER_DOCUMENTATION_LINKS, ORDER_TRACKING_URL } from "../lib/email/order-documentation";
import { escapeHtml } from "../lib/email/shared";
import { upsTrackingUrl, uspsTrackingUrl } from "../lib/orders/tracking";
import { documentationPreviewOrder as order } from "./fixtures/customer-documentation";

const originalTransport = nodemailer.createTransport;
nodemailer.createTransport = (() => { throw new Error("Pure rendering must never create an SMTP transport"); }) as typeof nodemailer.createTransport;
try {
  const builders = [buildCustomerOrderConfirmationEmail, buildOrderShippedEmail, buildDeliveryFollowupEmail];
  for (const build of builders) {
    const email = build(order);
    assert(email.text.includes(order.orderId), "customer can identify their order");
    for (const link of ORDER_DOCUMENTATION_LINKS) {
      assert(email.text.includes(link.path) && email.html.includes(link.path), "lookup and both guides are available in text and HTML");
    }
    assert(email.text.includes("A report for a different lot does not document your shipment."), "never infer the shipped lot from the current catalog");
    assert(email.text.includes("identifier on the label") && email.text.includes("support@psllabs.org"), "missing documentation has a practical support path");
    assert(email.text.includes("Not for human or animal consumption."), "research-use scope remains explicit");
    assert(!/account area|\/products|shop now|buy again|utm_/i.test(email.text), "transactional emails have no nonexistent account, upsell or marketing tracking");
    assert(!email.text.includes(order.invoiceId!) && !email.text.includes(order.shipping.address), "private payment references and street address stay out");
    for (const match of email.html.matchAll(/href="([^"]+)"/g)) {
      const href = match[1].replace(/&amp;/g, "&");
      assert(/^(https:\/\/|mailto:support@psllabs\.org$)/.test(href), "link schemes are safe");
      assert(!href.includes(order.orderId) && !href.includes(order.email), "links do not expose order or recipient identifiers");
    }
    const unsafe = "<img src=x onerror=alert(1)>";
    const hostile = build({ ...order, orderId: unsafe, shipping: { ...order.shipping, firstName: unsafe }, trackingCarrier: unsafe, trackingNumber: unsafe, items: [{ ...order.items[0], name: unsafe, strength: unsafe }] });
    assert(!hostile.html.includes(unsafe) && hostile.html.includes(escapeHtml(unsafe)), "customer-supplied fields are escaped in HTML");
  }
  const receipt = buildCustomerOrderConfirmationEmail(order);
  assert(receipt.text.includes("Subtotal: $59.99") && receipt.text.includes("Shipping: $9.99") && receipt.text.includes("Order total: $69.98"), "stored totals survive documentation changes");
  assert(receipt.html.includes("Strength: 10 mg") && receipt.html.includes("SKU:") && receipt.html.includes("Unit: $59.99") && receipt.html.includes(">$69.98<"), "compact receipt keeps item metadata and stored paid total in HTML");
  const discounted = buildCustomerOrderConfirmationEmail({ ...order, discountCode: "BITCOIN", discountAmount: 3, total: 66.98, paymentMethod: "bitcoin" });
  assert(discounted.text.includes("Bitcoin discount (5%): -$3.00") && discounted.text.includes("Order total: $66.98"), "existing discount line and historical paid total are preserved");
  const legacy = buildCustomerOrderConfirmationEmail({ ...order, items: [{ ...order.items[0], handle: "retired-item", name: "Historical order item" }] });
  assert(legacy.text.includes("Historical order item") && legacy.text.includes("/coa") && !legacy.html.includes("/products/retired-item"), "old orders retain item details and generic report lookup, with no broken catalog links");
  assert.equal(customerTrackingUrl(order), uspsTrackingUrl(order.trackingNumber!));
  assert.equal(customerTrackingUrl({ trackingCarrier: " ups ", trackingNumber: "1Z A&x=1" }), upsTrackingUrl("1Z A&x=1"));
  assert.equal(new URL(customerTrackingUrl({ trackingCarrier: "UPS", trackingNumber: "1Z A&x=1" })).searchParams.get("tracknum"), "1Z A&x=1", "tracking numbers stay encoded values");
  for (const carrier of [null, "unknown", "javascript:alert(1)", "https://attacker.invalid"]) {
    assert.equal(customerTrackingUrl({ trackingCarrier: carrier, trackingNumber: "123" }), ORDER_TRACKING_URL, "unknown carrier falls back to the site's order lookup");
  }
  assert.equal(customerTrackingUrl({ trackingCarrier: "USPS", trackingNumber: " " }), ORDER_TRACKING_URL);
  assert.throws(() => buildOrderShippedEmail({ ...order, trackingNumber: null }), /no tracking number/);
  const ups = buildOrderShippedEmail({ ...order, trackingCarrier: "UPS" });
  assert(ups.text.includes("https://www.ups.com/track?") && !ups.text.includes("tools.usps.com"), "shipping email honors known carrier");
  assert(!/3.5 business days|24 hours/i.test(ups.text), "shipping email defers to actual carrier updates");
  const followup = buildDeliveryFollowupEmail(order);
  assert(/has not arrived/.test(followup.text) && !/arrived as expected|was delivered|has been delivered/i.test(followup.text), "timed check-in does not assert delivery");
  assert(/honest review/.test(followup.text) && !/if you found.*helpful/i.test(followup.text), "review request is not conditional on positive sentiment");
  console.log("Customer documentation: template, privacy, carrier, legacy-order, totals and delivery checks passed (offline; no sends).");
} finally {
  nodemailer.createTransport = originalTransport;
}
