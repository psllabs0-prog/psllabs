/** Real pricing/rendering helpers, with no database, order, email or provider writes. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createContext, Script } from "node:vm";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import * as jsx from "react/jsx-runtime";
import ts from "typescript";

import { getProduct } from "../lib/products";
import { getActiveCatalogProducts, getCatalogProductByHandle } from "../lib/products/catalog";
import * as salePricing from "../lib/products/pricing";
import * as priceFormatter from "../lib/cart/format";
import * as classes from "../lib/utils";
import { getCartProductMeta, resolveCartLines } from "../lib/cart/products";
import { getSubtotal } from "../lib/cart/shipping";
import { getCheckoutProduct } from "../lib/payments/products";
import { catalogToTagadaInput } from "../lib/tagada";
import { computeTotals } from "../lib/checkout/totals";
import { createProductData } from "../components/seo/product-data";

const expected = {
  retatrutide: [7499, 5999, 1500, "$15 OFF"],
  "ghk-cu": [3499, 2499, 1000, "$10 OFF"],
  "bpc-157": [5999, 4799, 1200, "$12 OFF"],
  tesamorelin: [8999, 6999, 2000, "$20 OFF"],
  "reconstitution-solution": [1799, 1199, 600, "$6 OFF"],
} as const;
let checks = 0;
function check(value: unknown, message: string) { assert.ok(value, message); checks++; }

// Execute the actual display component with CSS class names stubbed only.
const filename = resolve(__dirname, "../components/commerce/product-price.tsx");
const compiled = ts.transpileModule(readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;
const output: Record<string, unknown> = {};
const mocks: Record<string, unknown> = {
  "react/jsx-runtime": jsx,
  "@/lib/products/pricing": salePricing,
  "@/lib/cart/format": priceFormatter,
  "@/lib/utils": classes,
  "./product-price.module.css": { priceGroup: "priceGroup", regular: "regular", sale: "sale", badge: "badge" },
};
new Script(`(function(require,module,exports){${compiled}\n})`, { filename }).runInContext(createContext({}))(
  (id: string) => { assert.ok(id in mocks, `Unexpected component dependency ${id}`); return mocks[id]; },
  { exports: output }, output,
);
const ProductPrice = output.ProductPrice as (props: { handle: string; unitPrice?: number; quantity?: number }) => React.ReactElement | null;
const SaleBadge = output.SaleBadge as (props: { handle: string }) => React.ReactElement | null;
check(Object.keys(salePricing.PRODUCT_PRICING).length === 5, "Only the five authorized products participate");

for (const [handle, values] of Object.entries(expected)) {
  const [regularCents, saleCents, savingCents, badge] = values;
  const price = salePricing.getProductPricing(handle)!;
  check(price.compareAtPriceCents === regularCents && price.salePriceCents === saleCents && price.savingsCents === savingCents, `${handle} exact authorized cents`);
  const catalog = getCatalogProductByHandle(handle)!;
  const product = getProduct(handle)!;
  const meta = getCartProductMeta(handle)!;
  const checkout = getCheckoutProduct(handle)!;
  check([catalog.price, product.price, meta.unitPrice, checkout.priceUsd, catalogToTagadaInput(catalog).priceUsd].every(amount => Math.round(amount * 100) === saleCents), `${handle} catalog/PDP/cart/server/provider input share one sale amount`);
  const schema = createProductData({ product, catalog, availability: { handle, tracked: true, stock: 10, reserved: 0, available: 10, status: "in_stock" } });
  check(schema.offers.price === (saleCents / 100).toFixed(2) && schema.offers.priceCurrency === "USD", `${handle} schema publishes the current payable sale price`);
  const badgeHtml = renderToStaticMarkup(SaleBadge({ handle }));
  check(badgeHtml.includes(`>${badge}</span>`) && badgeHtml.includes("off regular price"), `${handle} exact readable dollar-off badge`);
  for (const quantity of [1, 2, 10]) {
    const html = renderToStaticMarkup(ProductPrice({ handle, quantity }));
    check(html.includes("<del") && html.includes("Regular price:") && html.includes("Sale price:"), `${handle} regular/sale prices remain accessible`);
    check(html.includes(priceFormatter.formatPrice(saleCents * quantity / 100)) && html.includes(priceFormatter.formatPrice(regularCents * quantity / 100)), `${handle} quantity ${quantity} price and savings reconcile`);
    const lines = resolveCartLines([{ handle, quantity }]);
    check(Math.round(getSubtotal(lines) * 100) === saleCents * quantity, `${handle} quantity ${quantity} cart uses sale cents`);
    const btc = computeTotals(getSubtotal(lines), "", null, { paymentMethod: "bitcoin" });
    check(Math.round(btc.discountAmount * 100) === Math.round(saleCents * quantity * 5 / 100), `${handle} existing Bitcoin benefit applies once to the sale subtotal`);
    const referral = computeTotals(getSubtotal(lines), "", { code: "fixture-referral", percent: 10, exclusive: true }, { paymentMethod: "bitcoin" });
    check(referral.bitcoinDiscountAmount === 0 && Math.round(referral.discountAmount * 100) === Math.round(saleCents * quantity * 10 / 100), `${handle} first-order referral does not stack with Bitcoin`);
  }
}
for (const handle of ["mots-c", "kpv", "foundation", "unknown", "__proto__"]) {
  check(salePricing.getProductPricing(handle) === null && SaleBadge({ handle }) === null, `${handle} receives no unapproved sale badge`);
}
const oldOrderPrice = renderToStaticMarkup(ProductPrice({ handle: "bpc-157", unitPrice: 49.99, quantity: 2 }));
check(oldOrderPrice.includes("$99.98") && !oldOrderPrice.includes("<del") && !oldOrderPrice.includes("Sale price:"), "A stored historic price is displayed unchanged instead of repriced");
const mixed = resolveCartLines(getActiveCatalogProducts().map(product => ({ handle: product.handle, quantity: 1 })));
check(Math.round(getSubtotal(mixed) * 100) === 21495, "One of each product totals $214.95 merchandise");
const card = computeTotals(getSubtotal(mixed), "", null, { paymentMethod: "card" });
check(card.total === 214.95 && card.discountAmount === 0 && card.shipping === 0, "Mixed card total and existing free shipping reconcile");
check(computeTotals(getSubtotal(mixed), "", null, { paymentMethod: "bitcoin" }).total === 204.20, "Mixed Bitcoin total rounds to $204.20");
console.log(`Sale pricing checks passed: ${checks}. No business writes or network calls.`);
