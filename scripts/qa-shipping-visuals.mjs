/** Local visual QA only: actual checkout, global/storefront/module CSS, local fonts and product image. */
import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PSL_PLAYWRIGHT_MODULE || "C:/Users/Luke/AppData/Local/npm-cache/_npx/a8a7eec953f1f314/node_modules/playwright");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = process.env.PSL_VISUAL_QA_OUTPUT || "C:/Users/Luke/.codex/visualizations/2026/10/04/01a107cb-3d9f-7e11-afaa-22cd9653a8da/psl-shipping-20261015";
const fontRoot = process.env.PSL_VISUAL_QA_FONT_ROOT || "C:/Users/Luke/AppData/Local/Temp/psl-kashu-research-accounts-20261014/.next/static";
const fixtureModules = {
  "next/link": 'import React from "react";export default function Link({children,...props}){return React.createElement("a",props,children)}',
  "next/image": 'import React from "react";export default function Image({src,alt,width,height,className,style}){return React.createElement("img",{src:typeof src==="string"?src:src.src,alt,width,height,className,style})}',
  "@/components/cart/cart-provider": 'export function useCart(){const quantity=Number(new URLSearchParams(window.location.search).get("qty"))===2?2:1;return {isHydrated:true,lines:[{handle:"retatrutide",quantity,unitPrice:59.99,name:"Retatrutide",strength:"10 mg",imageSrc:"/Retatrutide-transparent.png",imageAlt:"Vial of lyophilized Retatrutide powder"}]}}',
  "@/components/checkout/tagada-card-form": 'import React from "react";export function TagadaCardForm(){return React.createElement("p",null,"QA fixture: provider payment fields are omitted.")}export function ExpiredCardConfirmation(){return null}',
  "@/lib/plausible/client": 'export function trackPlausibleClientEvent(){}',
  "@/lib/attribution/storage": 'export function getOrderAttributionForCheckout(){return null}',
};
const mime = file => file.endsWith(".woff2") ? "font/woff2" : file.endsWith(".webp") ? "image/webp" : file.endsWith(".png") ? "image/png" : "application/octet-stream";
const inside = (base, relative) => { const resolved = path.resolve(base, relative); return resolved.startsWith(`${path.resolve(base)}${path.sep}`) ? resolved : null; };
const luminance = rgb => rgb.match(/[\d.]+/g).slice(0, 3).map(Number).map(value => { const channel = value / 255; return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4; }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
const contrast = (foreground, background) => { const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a); return (values[0] + 0.05) / (values[1] + 0.05); };

async function main() {
  await mkdir(output, { recursive: true });
  const globalCss = await postcss([tailwind({ base: root, optimize: false })]).process(await readFile(path.join(root, "app/globals.css"), "utf8"), { from: path.join(root, "app/globals.css") });
  const fontChunks = (await readdir(path.join(fontRoot, "chunks"))).filter(file => file.endsWith(".css"));
  let fontCss = "";
  for (const file of fontChunks) {
    const css = await readFile(path.join(fontRoot, "chunks", file), "utf8");
    fontCss += (css.match(/@font-face\{[^}]*\}/g) || []).join("\n").replaceAll("../media/", "/qa-fonts/");
  }
  assert(fontCss.includes("font-family:Inter") && fontCss.includes("font-family:Archivo"), "actual cached site font declarations must exist");
  const bundle = await build({
    stdin: { contents: 'import React from "react";import{createRoot}from"react-dom/client";import{CheckoutPage}from"./components/checkout/checkout-page";createRoot(document.getElementById("root")).render(<CheckoutPage/>);', loader: "tsx", resolveDir: root },
    outfile: path.join(output, "fixture.js"), bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic",
    define: { "process.env.NODE_ENV": '"test"' },
    plugins: [{ name: "isolated-nontransactional-fixtures", setup(builder) {
      builder.onResolve({ filter: /.*/ }, args => fixtureModules[args.path] ? { path: args.path, namespace: "qa-fixture" } : undefined);
      builder.onLoad({ filter: /.*/, namespace: "qa-fixture" }, args => ({ contents: fixtureModules[args.path], loader: "js", resolveDir: root }));
    } }],
  });
  const js = bundle.outputFiles.find(file => file.path.endsWith(".js")).text;
  const moduleCss = bundle.outputFiles.find(file => file.path.endsWith(".css"))?.text || "";
  assert(moduleCss.includes("summaryImage"), "actual checkout CSS modules must be bundled");
  const css = `${fontCss}\n${globalCss.css}\n${await readFile(path.join(root, "app/storefront.css"), "utf8")}\n${moduleCss}\n:root{--font-display:Archivo,sans-serif;--font-sans:Inter,sans-serif;--font-mono:"IBM Plex Mono",monospace;--font-serif:"Source Serif 4",serif}#qa-notice{padding:8px 16px;border-bottom:1px solid #526977;background:#142530;color:#d0e4ed;font:12px/1.5 Inter,sans-serif;text-align:center}`;
  const html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/fixture.css"><title>PSL shipping — isolated visual QA</title></head><body><div id="qa-notice">LOCAL QA · Synthetic shipping replies · No authentication or payment flow tested</div><div id="root"></div><script src="/fixture.js"></script></body></html>';
  const server = http.createServer(async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    const pathname = new URL(request.url, "http://localhost").pathname;
    if (pathname === "/fixture.js") { response.setHeader("Content-Type", "application/javascript"); response.end(js); return; }
    if (pathname === "/fixture.css") { response.setHeader("Content-Type", "text/css"); response.end(css); return; }
    const file = pathname.startsWith("/qa-fonts/") ? inside(path.join(fontRoot, "media"), decodeURIComponent(pathname.slice(10)))
      : pathname === "/Retatrutide-transparent.png" ? path.join(root, "public/Retatrutide-transparent.png") : null;
    if (file) { try { response.setHeader("Content-Type", mime(file)); response.end(await readFile(file)); } catch { response.writeHead(404); response.end(); } return; }
    if (pathname === "/") { response.setHeader("Content-Type", "text/html"); response.end(html); return; }
    response.writeHead(404); response.end();
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PSL_TEST_CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  const results = [], forbidden = [], submissions = [], errors = [];
  try {
    for (const width of [1440, 390, 360]) {
      for (const scenario of [{ key: "standard-free", qty: 2, priority: false }, { key: "priority-2299", qty: 2, priority: true }, { key: "priority-2499", qty: 1, priority: true }]) {
        const context = await browser.newContext({ viewport: { width, height: width === 1440 ? 1000 : 844 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
        const page = await context.newPage();
        page.on("pageerror", error => errors.push(error.message));
        await context.route("**/*", async route => {
          const url = new URL(route.request().url());
          if (url.origin !== base) { forbidden.push(url.origin); await route.abort(); return; }
          if (!url.pathname.startsWith("/api/")) { await route.continue(); return; }
          if (url.pathname !== "/api/checkout/shipping-options") { submissions.push(url.pathname); await route.fulfill({ status: 500, json: { error: "Payment and order submissions are forbidden in visual QA" } }); return; }
          const body = route.request().postDataJSON();
          assert.deepEqual(body.items, [{ handle: "retatrutide", quantity: scenario.qty }]);
          const now = Date.now(), expiresAt = new Date(now + 300000).toISOString();
          await route.fulfill({ json: { standard: { method: "standard", priceUsd: scenario.qty === 2 ? 0 : 9.99 },
            priority: { available: true, method: "priority", priceUsd: scenario.qty === 2 ? 22.99 : 24.99, quoteToken: `synthetic_visual_quote_${width}_${scenario.key}`, expiresAt,
              selection: { method: "priority", carrier: "USPS", providerServiceCode: "Priority", serviceDisplayName: "USPS Priority Mail", transitDays: 2,
                deliveryEstimate: "Estimated 2 business days after carrier acceptance; not guaranteed.", quotedPostageUsd: 9.61,
                package: { weightOz: 8, lengthIn: 6, widthIn: 4, heightIn: 3 }, quotedAt: new Date(now).toISOString(), quoteExpiresAt: expiresAt } } } });
        });
        await page.goto(`${base}/?qty=${scenario.qty}`, { waitUntil: "networkidle" });
        for (const [id, value] of Object.entries({ "checkout-email": "qa@example.invalid", "checkout-first-name": "QA", "checkout-last-name": "Fixture",
          "checkout-address": "200 North Spring Street", "checkout-city": "Los Angeles", "checkout-zip": "90012" })) await page.locator(`#${id}`).fill(value);
        await page.locator("#checkout-state").selectOption("CA");
        const priority = page.locator('input[name="shipping-method"][value="priority"]');
        await priority.waitFor();
        const standard = page.locator('input[name="shipping-method"][value="standard"]');
        await standard.focus(); await page.keyboard.press("ArrowDown"); assert(await priority.isChecked(), "Keyboard arrow selects Priority");
        await page.keyboard.press("ArrowUp"); assert(await standard.isChecked(), "Keyboard arrow returns to Standard");
        if (scenario.priority) await priority.check();
        const shipping = page.locator('section[aria-labelledby="checkout-shipping-heading"]');
        const summary = page.getByRole("heading", { name: "Order Summary", exact: true }).filter({ visible: true }).locator("..");
        await page.evaluate(async () => { await document.fonts.ready; await Promise.all(Array.from(document.images).map(img => img.decode().catch(() => {}))); });
        const facts = await page.evaluate(() => {
          const section = document.querySelector('section[aria-labelledby="checkout-shipping-heading"]');
          const radioLabels = Array.from(section.querySelectorAll('input[type="radio"]')).map(input => { const label = input.closest("label"); const bounds = label.getBoundingClientRect(); return { service: input.value, selected: input.checked, text: label.innerText, left: bounds.left, right: bounds.right, width: bounds.width, scrollWidth: label.scrollWidth }; });
          const chosen = document.querySelector('input[name="shipping-method"]:checked');
          const muted = section.querySelector(".text-ash");
          const summary = Array.from(document.querySelectorAll("h2")).find(h => h.textContent === "Order Summary" && h.getBoundingClientRect().width > 0).parentElement;
          const summaryAmounts = Array.from(summary.querySelectorAll("dl > div")).map(row => {
            const title = row.querySelector("dt"), amount = row.querySelector("dd");
            return { title: title.innerText, amount: amount.innerText, titleRight: title.getBoundingClientRect().right, amountLeft: amount.getBoundingClientRect().left, amountRight: amount.getBoundingClientRect().right };
          });
          return { viewport: innerWidth, documentWidth: document.documentElement.scrollWidth, radioLabels, chosen: chosen?.value,
            shippingText: section.innerText, headingFont: getComputedStyle(section.querySelector("h2")).fontFamily,
            mutedColor: getComputedStyle(muted).color, panelColor: getComputedStyle(section).backgroundColor,
            summaryAmounts,
            fontsLoaded: document.fonts.check("16px Inter") && document.fonts.check("600 16px Archivo"),
            imageLoaded: Array.from(document.images).some(img => img.naturalWidth > 100),
            sectionBeforePayment: section.compareDocumentPosition(Array.from(document.querySelectorAll("h2")).find(h => h.textContent === "Payment Method")) & Node.DOCUMENT_POSITION_FOLLOWING };
        });
        assert(facts.documentWidth <= width, `Horizontal page overflow at ${width}/${scenario.key}`);
        assert(facts.radioLabels.every(label => label.left >= 0 && label.right <= width && label.scrollWidth <= Math.ceil(label.width)), `Shipping card overflow at ${width}/${scenario.key}`);
        assert.equal(facts.chosen, scenario.priority ? "priority" : "standard");
        assert(facts.fontsLoaded && facts.imageLoaded, "Actual fonts and product artwork must load");
        assert(facts.sectionBeforePayment, "Shipping choice must precede payment");
        facts.mutedTextContrast = Math.round(contrast(facts.mutedColor, facts.panelColor) * 100) / 100;
        assert(facts.mutedTextContrast >= 4.5, "Shipping description text meets normal-text contrast");
        assert(facts.summaryAmounts.every(row => row.titleRight <= row.amountLeft + 1), "Summary labels and monetary values must not overlap");
        assert(Math.max(...facts.summaryAmounts.map(row => row.amountRight)) - Math.min(...facts.summaryAmounts.map(row => row.amountRight)) <= 1, "Summary monetary values align on one right edge");
        const amountCents = value => Math.round(Number(value.replace(/[^\d.-]/g, "")) * 100);
        const displayedSubtotal = amountCents(facts.summaryAmounts.find(row => row.title === "Subtotal").amount);
        const displayedShipping = amountCents(facts.summaryAmounts.find(row => row.title.startsWith("Shipping")).amount);
        const displayedDiscounts = facts.summaryAmounts.filter(row => /discount/i.test(row.title)).reduce((sum, row) => sum + amountCents(row.amount), 0);
        const displayedTotal = amountCents(facts.summaryAmounts.find(row => row.title === "Total").amount);
        assert.equal(displayedSubtotal + displayedShipping + displayedDiscounts, displayedTotal, "Visible subtotal, shipping and discounts must reconcile to the visible total without duplicate discounts");
        assert(facts.shippingText.includes("within 24 hours") && facts.shippingText.includes("Transit begins when the carrier receives the parcel") && facts.shippingText.includes("delivery times are estimates"), "Processing and transit must be separate");
        assert(!facts.shippingText.includes("Priority is optional") && !facts.shippingText.includes("never selected automatically"), "Optional-Priority explanatory line must be removed");
        assert(facts.radioLabels.every(label => !/after carrier acceptance/i.test(label.text)), "Radio choices omit the repeated carrier-acceptance phrase");
        const summaryText = await summary.innerText();
        assert(!/after carrier acceptance/i.test(summaryText), "Selected summary omits the repeated carrier-acceptance phrase");
        const expected = scenario.priority ? scenario.qty === 2 ? "$22.99" : "$24.99" : "Free";
        assert(summaryText.includes(expected), `Selected shipping amount visible in summary ${expected}`);
        assert.equal(displayedTotal, scenario.priority ? scenario.qty === 2 ? 13697 : 8198 : 11398, "Approved shipping tier produces the exact verified cart total");
        await shipping.screenshot({ path: path.join(output, `${width}-${scenario.key}-shipping.png`) });
        await summary.screenshot({ path: path.join(output, `${width}-${scenario.key}-summary.png`) });
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await page.screenshot({ path: path.join(output, `${width}-${scenario.key}-full.png`), fullPage: true });
        results.push({ width, scenario: scenario.key, expectedShippingPrice: expected, ...facts });
        await context.close();
      }
    }
    assert.deepEqual(forbidden, []); assert.deepEqual(submissions, []); assert.deepEqual(errors, []);
    const report = { generatedAt: new Date().toISOString(), fixture: "Actual CheckoutPage, ProductPrice, Input and CSS modules plus real globals/storefront CSS, cached real brand fonts and local product PNG. Synthetic cart and shipping API only.",
      limitations: ["No production authentication, research-entry gate, live carrier quote, card fields, payment or actual order was exercised.", "Next Image is represented by a native image using the same real source and dimensions; image optimization behavior is not tested.", "Site header, footer, cookie banner and authenticated account shell are intentionally omitted from this component-only fixture.", "Screenshots show synthetic carrier data and do not verify any actual delivery commitment or production availability."],
      externalRequests: forbidden, orderOrPaymentSubmissions: submissions, browserErrors: errors, results };
    await writeFile(path.join(output, "visual-qa-report.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ output, screenshots: results.length * 3, scenarios: results.length, noHorizontalOverflow: true, externalRequests: 0, orderOrPaymentSubmissions: 0, browserErrors: 0 }));
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
