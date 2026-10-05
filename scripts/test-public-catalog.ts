import assert from "node:assert/strict";

import { getCartProductMeta, resolveCartLines } from "../lib/cart/products";
import { prepareReservedOrder } from "../lib/checkout/prepare-order";
import { toPublicOrder, type Order } from "../lib/orders/types";
import { getAllCheckoutProducts, getCheckoutProduct } from "../lib/payments/products";
import { getProduct } from "../lib/products";
import { getActiveCatalogProducts } from "../lib/products/catalog";
import { getPublicCatalogProduct } from "../lib/products/public-catalog";

async function main() {
  const originalFetch = globalThis.fetch;
  let networkRequests = 0;
  globalThis.fetch = async () => {
    networkRequests += 1;
    throw new Error("Public catalog regressions must remain offline.");
  };

  try {
    const retired = ["foundation", "cellular-energy", "recovery"];
    const unavailable = [...retired, "mots-c", "kpv", "unknown", "__proto__", "constructor"];
    const expectedActive = ["retatrutide", "ghk-cu", "bpc-157", "tesamorelin", "reconstitution-solution"];
    const active = getActiveCatalogProducts();
    assert.deepEqual(active.map((product) => product.handle).sort(), [...expectedActive].sort());
    assert.deepEqual(getAllCheckoutProducts().map((product) => product.id).sort(), [...expectedActive].sort());

    for (const handle of unavailable) {
      assert.equal(getPublicCatalogProduct(handle), undefined, `${handle} has no public purchase page`);
      assert.equal(getCheckoutProduct(handle), undefined, `${handle} cannot begin a new payment`);
      assert.equal(getCartProductMeta(handle), null, `${handle} does not survive a stale browser cart`);
    }
    for (const slug of ["psl-motsc-10mg", "psl-kpv-10mg"]) {
      assert.equal(getPublicCatalogProduct(slug), undefined, `${slug} remains unpublished`);
    }

    for (const product of active) {
      const slug = product.href.split("/").at(-1)!;
      assert.equal(getPublicCatalogProduct(slug)?.handle, product.handle);
      assert.equal(getPublicCatalogProduct(product.handle)?.href, product.href);
      assert.equal(getCheckoutProduct(product.handle)?.priceUsd, product.price);
      assert.equal(getCheckoutProduct(product.handle)?.name, product.name);
      assert.equal(getCartProductMeta(product.handle)?.unitPrice, product.price);
    }

    const shipping = {
      firstName: "Offline", lastName: "Fixture", address: "123 Test Street",
      city: "Phoenix", state: "AZ", zip: "85001", country: "US",
    };
    for (const paymentMethod of ["card", "bitcoin"] as const) {
      for (const handle of unavailable) {
        for (const items of [
          [{ handle, quantity: 1 }],
          [{ handle: "retatrutide", quantity: 1 }, { handle, quantity: 1 }],
        ]) {
          const result = await prepareReservedOrder({
            email: "offline-fixture@example.com", shipping, items,
            paymentMethod, currency: "USD",
          }, { paymentMethod });
          assert.equal(result.ok, false, `${paymentMethod} checkout rejects ${handle}`);
          if (!result.ok) assert.equal(result.status, 404);
        }
      }
    }
    assert.equal(networkRequests, 0, "Rejected carts do not reach persistence or a payment provider");

    const currentCart = resolveCartLines([
      { handle: "foundation", quantity: 2 },
      { handle: "retatrutide", quantity: 1 },
      { handle: "mots-c", quantity: 1 },
    ]);
    assert.deepEqual(currentCart.map((line) => [line.handle, line.quantity, line.unitPrice]), [["retatrutide", 1, 59.99]]);

    for (const handle of retired) {
      const historicalProduct = getProduct(handle);
      assert.ok(historicalProduct, "Archived product definitions stay available for historical reference");
      const archivedOrder = {
        orderId: `historical_${handle}`, createdAt: "2025-01-01T00:00:00.000Z",
        updatedAt: "2025-01-01T00:00:00.000Z", status: "paid", currency: "USD",
        email: "historical@example.com", shipping,
        items: [{ handle, name: historicalProduct.name, strength: "Historical package", quantity: 1, unitPrice: historicalProduct.price, lineTotal: historicalProduct.price }],
        subtotal: historicalProduct.price, discountCode: null, discountAmount: 0,
        taxRate: 0, tax: 0, shippingCost: 0, total: historicalProduct.price,
        invoiceId: "historical_invoice", invoiceCreatedAt: null, paidAt: null,
        paymentMethod: "card", emailSent: true, emailError: null, customerEmailSent: true,
        customerEmailError: null, shippedAt: null, trackingNumber: null, trackingCarrier: null,
        feedbackEmailSent: false, trackingEmailSent: false, trackingSavedAt: null,
        deliveryFollowupSent: false, stockDecremented: true, attribution: null,
      } satisfies Order;
      const before = JSON.stringify(archivedOrder);
      const publicOrder = toPublicOrder(archivedOrder);
      assert.deepEqual(publicOrder.items, archivedOrder.items, "Historical order items retain their recorded names, handles, and prices");
      assert.equal(publicOrder.orderId, archivedOrder.orderId);
      assert.equal(JSON.stringify(archivedOrder), before, "Historical records are unchanged");
      assert.equal("email" in publicOrder, false, "Public order privacy remains intact");
    }

    console.log("Public catalog regressions passed: retired/future/unknown products, both payment methods, mixed/stale carts, all five active products, and historical order preservation.");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
