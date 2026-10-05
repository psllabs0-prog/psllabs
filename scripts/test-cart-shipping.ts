import assert from "node:assert/strict";

import { FLAT_SHIPPING_USD, FREE_SHIPPING_THRESHOLD } from "../lib/cart/constants";
import { getEstimatedTotal, getShippingDisplay, getSubtotal } from "../lib/cart/shipping";
import { computeTotals } from "../lib/checkout/totals";
import { getActiveCatalogProducts } from "../lib/products/catalog";

assert.equal(getSubtotal([]), 0);
assert.equal(getEstimatedTotal(0), 0, "An empty cart has no estimated shipping charge");
assert.equal(getShippingDisplay(0).isFreeShipping, false);
assert.equal(getEstimatedTotal(59.99), 69.98, "One Retatrutide includes the standard shipping rate");
assert.equal(getEstimatedTotal(119.98), 119.98, "Two Retatrutide units qualify for free shipping");

for (const subtotal of [12.99, 59.99, 99.98, 99.99, 99.994, 99.995, 100, 100.004, 119.98]) {
  const checkout = computeTotals(subtotal);
  assert.equal(getEstimatedTotal(subtotal), checkout.total, `Cart and checkout totals match at ${subtotal}`);
  assert.equal(getShippingDisplay(subtotal).isFreeShipping, checkout.shipping === 0);
  if (checkout.shipping > 0) {
    assert.equal(checkout.shipping, FLAT_SHIPPING_USD);
    assert.ok(getShippingDisplay(subtotal).message.includes(FLAT_SHIPPING_USD.toFixed(2)));
  }
}
assert.equal(getShippingDisplay(FREE_SHIPPING_THRESHOLD - 0.01).isFreeShipping, false);
assert.equal(getShippingDisplay(FREE_SHIPPING_THRESHOLD).isFreeShipping, true);
assert.equal(getShippingDisplay(99.995).isFreeShipping, true, "Threshold decisions use the checkout's cent rounding");

for (const product of getActiveCatalogProducts()) {
  for (let quantity = 1; quantity <= 10; quantity += 1) {
    const subtotal = getSubtotal([{ unitPrice: product.price, quantity }]);
    const checkout = computeTotals(subtotal);
    assert.equal(getEstimatedTotal(subtotal), checkout.total);
    assert.equal(getShippingDisplay(subtotal).isFreeShipping, checkout.shipping === 0);
  }
}
assert.equal(getSubtotal([{ unitPrice: 24.99, quantity: 3 }, { unitPrice: 12.99, quantity: 2 }]), 100.95);
assert.equal(getEstimatedTotal(100.95), 100.95);

for (const subtotal of [59.99, FREE_SHIPPING_THRESHOLD, 119.98]) {
  const baseline = computeTotals(subtotal);
  const discounted = computeTotals(subtotal, "", { code: "OFFLINE", percent: 10 }, { paymentMethod: "bitcoin" });
  assert.equal(getEstimatedTotal(subtotal), baseline.total, "Cart estimates do not assume a payment method or promotion");
  assert.equal(discounted.shipping, baseline.shipping, "Checkout discounts do not remove pre-discount free-shipping eligibility");
  assert.ok(discounted.total < getEstimatedTotal(subtotal), "Any applicable discounts are deferred to checkout");
}

console.log("Cart shipping regressions passed: empty carts, cent boundaries, all active-product quantities, mixed carts, and checkout discount consistency.");
