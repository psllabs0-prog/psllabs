/** Actual card form with synthetic SDK/HTTP replies in an isolated headless browser. */
import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const loadModule = createRequire(import.meta.url);
const { chromium } = loadModule(process.env.PSL_PLAYWRIGHT_MODULE || "playwright");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sdkReact = `import React from "react";
export function TagadaHeadlessProvider({children}){return React.createElement(React.Fragment,null,children)}
export function useHeadlessClient(){return window.cardFixture.client}
export function useCheckout(){return window.cardFixture.checkout}
export function usePayment(){return window.cardFixture.payment}`;
const sdkHttp = `export class HttpClient {
 static resolveBaseUrl(){return location.origin}
 constructor(){}
 async get(){window.cardTrace.push("evidence");return structuredClone(window.cardFixture.raw)}
}`;
const entry = `import React from "react";
import {createRoot} from "react-dom/client";
import {TagadaCardForm} from "./components/checkout/tagada-card-form";
import {cardSessionStore} from "./lib/checkout/card-session-storage";
import {CHECKOUT_RESEARCH_ACK_VERSION} from "./lib/checkout/research-acknowledgement";
const test=window.cardCase;
const address={line1:"1 Fixture Street",city:"Phoenix",state:"AZ",postalCode:"85085",country:"US"};
const subtotal=test.subtotal??80, discount=test.discount??0, fee=test.fee??9.99;
const session={orderId:"psl_fixture",checkoutToken:"checkout_fixture",sessionToken:"session_fixture",storeId:"store_fixture",
 customer:{email:"fixture@example.test",firstName:"Fixture",lastName:"Buyer"},shippingAddress:address,
 items:[{variantId:"variant_fixture",quantity:1}],shippingCost:fee,total:Math.round((subtotal-discount+fee)*100)/100,
 pricing:{subtotal,discountCode:discount?"FIXTURE10":null,discountAmount:discount,tax:0},cartFingerprint:"fixture",
 researchAcknowledgementVersion:CHECKOUT_RESEARCH_ACK_VERSION,shippingMethod:test.method??"standard",
 tagadaShippingRateId:test.missingBinding?undefined:"rate_server_bound",
 shippingQuote:test.method==="priority"?"signed_fixture_quote":undefined,
 shippingQuoteExpiresAt:test.method==="priority"?new Date(Date.now()+(test.expired?-1000:300000)).toISOString():undefined};
const raw={checkoutSession:{id:"cs_fixture",storeId:session.storeId,checkoutToken:session.checkoutToken,draft:false,
 selectedPresentmentCurrency:"USD",shippingRateId:test.preselected?session.tagadaShippingRateId:"rate_previous",
 shippingAddress:{...address,...(test.wrongAddress?{postalCode:"10007"}:{})},
 customer:{email:test.wrongEmail?"other@example.test":session.customer.email},sessionLineItems:session.items},
 summary:{currency:test.wrongCurrency?"EUR":"USD",subtotalAmount:Math.round(subtotal*100),totalPromotionAmount:Math.round(discount*100),
 shippingCost:Math.round(fee*100)+(test.wrongFee?1:0),totalTaxAmount:0,totalAmount:Math.round((subtotal+fee)*100),
 totalAdjustedAmount:Math.round((subtotal-discount+fee)*100),
 items:[{variantId:"variant_fixture",quantity:1,unitAmount:Math.round(subtotal*100),amount:Math.round(subtotal*100),currency:"USD"}]}};
window.cardTrace=[];window.cardErrors=[];
const rates=test.rates??[];
const fixture={raw,client:{config:{environment:"production"}},checkout:{session:{id:"cs_fixture",selectedShippingRateId:raw.checkoutSession.shippingRateId},isLoading:false,error:null,
 updateCustomerAndAddress:async()=>{window.cardTrace.push("address")},
 getShippingRates:async()=>{window.cardTrace.push("rates");if(test.rateError)throw new Error("Fixture rate lookup failed");return rates},
 selectShippingRate:async(id)=>{window.cardTrace.push("select:"+id);if(test.selectError)throw new Error("Fixture selection failed");if(!test.selectionIgnored)raw.checkoutSession.shippingRateId=id},
 refresh:async()=>{window.cardTrace.push("refresh")}},payment:{isProcessing:false,
 tokenizeCard:async()=>{window.cardTrace.push("tokenize");return {tagadaToken:"synthetic_card_token"}},
 processPayment:async()=>{window.cardTrace.push("charge");return {status:"requires_redirect",paymentId:"pay_fixture"}}}};
window.cardFixture=fixture;
if(!cardSessionStore.start(session))throw new Error("Invalid synthetic session fixture");
if(test.processing)cardSessionStore.markProcessing(session.orderId);
createRoot(document.getElementById("root")).render(<TagadaCardForm session={session} onError={message=>window.cardErrors.push(message)} onSuccessRedirect={()=>{throw new Error("Unexpected redirect")}}/>);`;

let checks = 0;
const check = (value, expected, message) => { assert.deepEqual(value, expected, message); checks++; };
async function main() {
  const bundle = await build({ stdin: { contents: entry, loader: "tsx", resolveDir: root }, bundle: true, write: false,
    platform: "browser", format: "iife", jsx: "automatic",
    define: { "process.env.NODE_ENV": '"test"', "process.env.NEXT_PUBLIC_TAGADA_ENVIRONMENT": '"production"' },
    plugins: [{ name: "synthetic-provider", setup(builder) {
      builder.onResolve({ filter: /^@tagadapay\/headless-sdk(?:\/react)?$/ }, args => ({ path: args.path, namespace: "fixture-sdk" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture-sdk" }, args => ({ contents: args.path.endsWith("/react") ? sdkReact : sdkHttp, loader: "js", resolveDir: root }));
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
  const scenarios = [
    { name: "empty rates, Standard paid", ok: true, fee: 9.99 },
    { name: "empty rates, Standard free crossing after discount", ok: true, fee: 0, subtotal: 107.98, discount: 10.80 },
    { name: "empty rates, Priority2499", ok: true, method: "priority", fee: 24.99 },
    { name: "empty rates, Priority2299", ok: true, method: "priority", fee: 22.99, subtotal: 120 },
    { name: "empty rates, already-selected bound rate", ok: true, preselected: true },
    { name: "exact nonempty listed rate", ok: true, rates: [{ id: "rate_server_bound", name: "USPS Ground Advantage", amount: 999, currency: "USD" }] },
    { name: "rate lookup throws", rateError: true },
    { name: "nonempty rate omits bound ID", rates: [{ id: "another_rate", name: "USPS Ground Advantage", amount: 999, currency: "USD" }] },
    { name: "nonempty bound rate has wrong fee", rates: [{ id: "rate_server_bound", name: "USPS Ground Advantage", amount: 1000, currency: "USD" }] },
    { name: "nonempty bound rate contradicts service", rates: [{ id: "rate_server_bound", name: "USPS Priority Mail", amount: 999, currency: "USD" }] },
    { name: "provider rejects selection", selectError: true },
    { name: "SDK silently leaves old saved ID", selectionIgnored: true },
    { name: "fresh raw fee mismatch", wrongFee: true },
    { name: "fresh raw currency mismatch", wrongCurrency: true },
    { name: "fresh raw address mismatch", wrongAddress: true },
    { name: "fresh raw email mismatch", wrongEmail: true },
    { name: "Priority quote expired", method: "priority", fee: 24.99, expired: true },
    { name: "server binding missing", missingBinding: true },
    { name: "processing payment remains locked", processing: true },
  ];
  try {
    for (const scenario of scenarios) {
      const context = await browser.newContext();
      const page = await context.newPage(); page.setDefaultTimeout(10000);
      const forbidden = [], confirmations = [], pageErrors = [];
      page.on("pageerror", error => pageErrors.push(error.message));
      await context.route("**/*", async route => {
        const url = new URL(route.request().url());
        if (url.origin === base && url.pathname === "/api/checkout/card" && route.request().method() === "POST") {
          confirmations.push(route.request().postDataJSON());
          await route.fulfill({ status: 409, json: { error: "Synthetic order confirmation remains pending." } }); return;
        }
        if (url.origin !== base || route.request().method() !== "GET" || url.pathname.startsWith("/api/")) {
          forbidden.push({ origin: url.origin, path: url.pathname, method: route.request().method() }); await route.abort(); return;
        }
        await route.continue();
      });
      await page.addInitScript(value => { window.cardCase = value; }, scenario);
      await page.goto(base);
      if (scenario.processing) {
        await page.getByRole("status").waitFor();
        check(await page.getByRole("button", { name: "Pay by card", exact: true }).count(), 0, scenario.name);
      } else {
        await page.locator("#tagada-pan").fill("4111 1111 1111 1111");
        await page.locator("#tagada-exp").fill("12/30");
        await page.locator("#tagada-cvc").fill("123");
        await page.getByRole("button", { name: "Pay by card", exact: true }).click();
        if (scenario.ok) await page.waitForFunction(() => window.cardTrace.includes("charge"));
        else await page.getByRole("alert").waitFor();
      }
      const trace = await page.evaluate(() => window.cardTrace);
      check(trace.filter(step => step === "charge").length, scenario.ok ? 1 : 0, `${scenario.name}: charge guard`);
      if (scenario.ok) {
        check(trace.includes("evidence"), true, `${scenario.name}: fresh raw proof`);
        check(trace.indexOf("evidence") < trace.indexOf("charge"), true, `${scenario.name}: proof before payment`);
        check(trace.filter(step => step.startsWith("select:")).every(step => step === "select:rate_server_bound"), true, `${scenario.name}: exact server ID only`);
      }
      if (scenario.preselected) check(trace.some(step => step.startsWith("select:")), false, "Already selected exact rate is not replaced");
      if (scenario.rateError) check(trace.includes("tokenize"), false, "Lookup exceptions do not become empty-list fallbacks");
      check(confirmations.every(payload => Object.keys(payload).every(key => ["orderId", "paymentId", "tagadaOrderId", "checkoutSessionId"].includes(key))), true, "Only safe references enter synthetic confirmation requests");
      check(forbidden, [], `${scenario.name}: no external or unexpected requests`);
      check(pageErrors, [], `${scenario.name}: no browser errors`);
      await context.close();
    }
    console.log(`PASS: shipping card UI (${checks} checks across ${scenarios.length} actual React scenarios; trusted empty-list selection, fresh identity/address/fee proof and payment recovery; synthetic SDK only, no live requests/orders/charges).`);
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
