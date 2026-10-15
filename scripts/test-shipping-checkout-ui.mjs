/** Real checkout React component, isolated Chrome, synthetic shipping replies only. */
import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
const loadModule = createRequire(import.meta.url);
const { chromium } = loadModule(process.env.PSL_PLAYWRIGHT_MODULE || "playwright");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureModules = {
  "next/link": 'import React from "react";export default function Link({children,...props}){return React.createElement("a",props,children)}',
  "next/image": 'import React from "react";export default function Image({src,alt,width,height}){return React.createElement("img",{src:"data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==",alt,width,height})}',
  "@/components/cart/cart-provider": 'export function useCart(){return {isHydrated:true,lines:[{handle:"fixture",quantity:1,unitPrice:80,name:"Fixture product",strength:"Fixture",imageSrc:"fixture",imageAlt:"Fixture"}]}}',
  "@/components/checkout/tagada-card-form": 'import React from "react";export function TagadaCardForm(){return React.createElement("div",{"data-testid":"fixture-card-form"},"Existing card payment recovery")}export function ExpiredCardConfirmation(){return React.createElement("div",{"data-testid":"fixture-expired"},"Expired payment recovery")}',
  "@/components/commerce/product-price": 'import React from "react";export function ProductPrice({unitPrice,quantity}){return React.createElement("span",null,"$"+(unitPrice*quantity).toFixed(2))}',
  "@/lib/plausible/client": 'export function trackPlausibleClientEvent(){}',
  "@/lib/attribution/storage": 'export function getOrderAttributionForCheckout(){return null}',
};
let checks = 0;
const check = (value, expected, message) => { assert.deepEqual(value, expected, message); checks++; };
async function main() {
  const bundle = await build({ stdin: { contents: 'import React from "react";import{createRoot}from"react-dom/client";import{CheckoutPage}from"./components/checkout/checkout-page";createRoot(document.getElementById("root")).render(<CheckoutPage/>);', loader: "tsx", resolveDir: root },
    bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"test"' },
    plugins: [{ name: "offline-fixtures", setup(builder) {
      builder.onResolve({ filter: /.*/ }, args => fixtureModules[args.path] ? { path: args.path, namespace: "fixture" } : undefined);
      builder.onResolve({ filter: /\.css$/ }, args => ({ path: args.path, namespace: "fixture-css" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: fixtureModules[args.path], loader: "js", resolveDir: root }));
      builder.onLoad({ filter: /.*/, namespace: "fixture-css" }, () => ({ contents: "export default {}", loader: "js" }));
    } }],
  });
  const server = http.createServer((request, response) => {
    response.setHeader("Cache-Control", "no-store");
    if (request.url === "/fixture.js") { response.setHeader("Content-Type", "application/javascript"); response.end(bundle.outputFiles[0].text); }
    else { response.setHeader("Content-Type", "text/html"); response.end('<!doctype html><html><body><div id="root"></div><script src="/fixture.js"></script></body></html>'); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true, ...(process.env.PSL_TEST_CHROME ? { executablePath: process.env.PSL_TEST_CHROME } : {}) });
  try {
    const context = await browser.newContext();
    const page = await context.newPage(); page.setDefaultTimeout(10000);
    const pageErrors = [], forbidden = [], submissions = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    let mode = "enabled", serial = 0, quoteTtl = 30000, quoteDelay = 0;
    await context.route("**/*", async route => {
      const url = new URL(route.request().url());
      if (url.origin !== base && url.protocol !== "data:") { forbidden.push(url.origin); await route.abort(); return; }
      if (!url.pathname.startsWith("/api/")) { await route.continue(); return; }
      if (url.pathname !== "/api/checkout/shipping-options") { submissions.push(url.pathname); await route.fulfill({ status: 500, json: { error: "Unexpected fixture submission" } }); return; }
      const body = route.request().postDataJSON();
      assert(body.email && body.shipping.address && body.shipping.firstName && body.shipping.lastName && body.shipping.city && body.shipping.state && body.shipping.zip);
      assert.deepEqual(body.items, [{ handle: "fixture", quantity: 1 }]);
      if (quoteDelay) await new Promise(resolve => setTimeout(resolve, quoteDelay));
      if (mode === "error") { await route.fulfill({ status: 503, json: { error: "Fixture unavailable" } }); return; }
      const expiresAt = new Date(Date.now() + quoteTtl).toISOString();
      await route.fulfill({ json: { standard: { method: "standard", priceUsd: 9.99 }, priority: mode === "disabled"
        ? { available: false, reason: "Not available" }
        : { available: true, method: "priority", priceUsd: 24.99, quoteToken: `fixture_quote_${++serial}`, expiresAt,
          selection: { method: "priority", carrier: "USPS", providerServiceCode: "Priority", serviceDisplayName: "USPS Priority Mail",
            transitDays: 2, deliveryEstimate: "Estimated 2 business days after carrier acceptance", quotedPostageUsd: 9.61,
            package: { weightOz: 8, lengthIn: 6, widthIn: 4, heightIn: 3 }, quotedAt: new Date().toISOString(), quoteExpiresAt: expiresAt } } } });
    });
    const fillAddress = async () => {
      for (const [id, value] of Object.entries({ "checkout-email": "fixture@example.test", "checkout-first-name": "Fixture", "checkout-last-name": "Buyer",
        "checkout-address": "1 Test Street", "checkout-city": "Phoenix", "checkout-zip": "85085" })) await page.locator(`#${id}`).fill(value);
      await page.locator("#checkout-state").selectOption("AZ");
    };
    const standard = () => page.locator('input[name="shipping-method"][value="standard"]');
    const priority = () => page.locator('input[name="shipping-method"][value="priority"]');
    await page.goto(base);
    check(await standard().isChecked(), true, "Standard is the explicit default");
    check(await priority().count(), 0, "No upgrade is advertised before server availability");
    quoteDelay = 700; await fillAddress();
    check(await standard().isEnabled(), true, "Standard remains selectable while checking quotes");
    await priority().waitFor(); check(await priority().isChecked(), false, "Priority never auto-selects");
    await priority().check(); check(await standard().isChecked(), false);
    check(await page.locator("body").innerText().then(text => text.includes("Estimated 2 business days")), true);
    const shippingSection = page.locator('section[aria-labelledby="checkout-shipping-heading"]');
    check(await shippingSection.innerText().then(text => text.includes("Priority is optional") || text.includes("never selected automatically")), false, "The redundant optional-Priority explanation is removed");
    check(await shippingSection.locator("label").allInnerTexts().then(labels => labels.some(text => /after carrier acceptance/i.test(text))), false, "Shipping choices omit the repeated carrier-acceptance phrase");
    check(await shippingSection.innerText().then(text => text.includes("Orders are processed within 24 hours.") && text.includes("Transit begins when the carrier receives the parcel; delivery times are estimates.")), true, "Processing and transit remain clearly disclosed in their separate note");
    check(await page.getByRole("heading", { name: "Order Summary", exact: true }).first().locator("..").innerText().then(text => /after carrier acceptance/i.test(text)), false, "Selected summary omits the repeated carrier-acceptance phrase");
    await page.locator("#checkout-address").fill("2 Test Street");
    await page.getByRole("alert").filter({ hasText: "Your address, cart, discount or payment choice changed" }).waitFor();
    check(await standard().isChecked(), false, "Changed quote requires explicit re-selection");
    await page.locator("#checkout-research-status").selectOption("independent_researcher");
    await page.locator("#checkout-research-use").check();
    await page.getByRole("button", { name: "Continue to Bitcoin payment", exact: true }).click();
    check(submissions.length, 0, "An invalidated Priority quote cannot submit an order");
    await standard().check(); check(await standard().isChecked(), true);
    mode = "disabled"; quoteDelay = 0; await page.reload(); await fillAddress();
    await page.getByRole("status").filter({ hasText: "Additional shipping options are unavailable" }).waitFor();
    check(await priority().count(), 0, "Disabled feature never offers Priority"); check(await standard().isChecked(), true);
    mode = "error"; await page.reload(); await fillAddress();
    await page.getByRole("status").filter({ hasText: "We couldn’t check additional shipping options" }).waitFor();
    check(await standard().isChecked(), true, "Provider failure keeps Standard available");
    mode = "enabled"; quoteTtl = 1200; await page.reload(); await fillAddress(); await priority().waitFor(); await priority().check();
    await page.getByRole("alert").filter({ hasText: "Your address, cart, discount or payment choice changed" }).waitFor();
    check(await priority().count(), 0, "Expired option cannot be reused");
    const now = Date.now();
    await page.addInitScript(value => sessionStorage.setItem("psl:card-checkout:v1", JSON.stringify(value)), {
      version: 1, createdAt: now, expiresAt: now + 7200000, orderId: "psl_fixture", phase: "processing", confirmation: null, reportedSuccess: false,
      session: { orderId: "psl_fixture", checkoutToken: "checkout_fixture", sessionToken: "session_fixture", storeId: "store_fixture",
        customer: { email: "fixture@example.test", firstName: "Fixture", lastName: "Buyer" }, shippingAddress: { line1: "1 Test Street", city: "Phoenix", state: "AZ", postalCode: "85085", country: "US" },
        items: [{ variantId: "variant_fixture", quantity: 1 }], shippingCost: 9.99, total: 89.99, cartFingerprint: "older_changed_cart" },
    });
    await page.goto(`${base}/?paymentAction=requireAction&paymentId=pay_fixture`);
    await page.getByTestId("fixture-card-form").waitFor();
    check(await page.getByText("Review your checkout details", { exact: true }).count(), 0, "Old unresolved 3DS recovery is not replaced by a new checkout");
    check(forbidden, [], "No external origins were requested"); check(submissions, [], "No order/payment endpoint was called"); check(pageErrors, [], "No browser errors");
    console.log(`PASS: shipping checkout UI (${checks} checks; actual React component, Standard fallback, disabled feature, stale/expired Priority prevention and legacy 3DS recovery; synthetic replies only).`);
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
