/** Offline SEO checks. No customer, payment or advertising requests are sent. */
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import robots from "../app/robots";
import sitemap from "../app/sitemap";
import { JsonLd } from "../components/seo/json-ld";
import { createProductData } from "../components/seo/product-data";
import { SiteBreadcrumbs } from "../components/seo/site-breadcrumbs";
import { getProduct } from "../lib/products";
import { getActiveCatalogProducts, getComingSoonCatalogProducts } from "../lib/products/catalog";
import { getProductRender } from "../lib/products/renders";
import { createPageMetadata, pageIndexingPolicy, SITE_URL } from "../lib/seo";

let checks = 0;
function check(value: unknown, message: string) { assert.ok(value, message); checks++; }

for (const path of ["/admin", "/admin-ledger.01", "/admin/", "/admin-partners?tab=records", "/partners/account", "/partners/account/", "/partners/auth/verify"]) {
  check(pageIndexingPolicy(path) === "private", `${path} remains private`);
  const metadata = createPageMetadata({ title: "Private", description: "Private account", path });
  assert.deepEqual(metadata.robots, { index: false, follow: false }); checks++;
}
for (const path of ["/checkout", "/success?order=private", "/cancel/", "/track", "/unsubscribe", "/newsletter/confirm"]) {
  check(pageIndexingPolicy(path) === "utility", `${path} remains excluded from indexing`);
}
for (const path of ["/", "/products", "/about", "/partners", "/partners/terms", "/guides", "/science"]) {
  check(pageIndexingPolicy(path) === "public", `${path} remains public`);
}

const routes = sitemap();
const urls = routes.map((route) => route.url);
check(urls.length === new Set(urls).size, "The sitemap has no duplicate URLs");
check(urls.every((url) => url.startsWith(SITE_URL)), "Sitemap URLs use the canonical host");
check(urls.every((url) => pageIndexingPolicy(new URL(url).pathname) === "public"), "The sitemap excludes private and checkout/confirmation utility pages");
check(routes.filter((route) => !/\/(?:guides|science)\//.test(route.url)).every((route) => !route.lastModified), "Unchanged static pages do not receive fabricated modification dates");
for (const product of getActiveCatalogProducts()) {
  check(urls.includes(`${SITE_URL}${product.href}`), `${product.name} canonical page is in the sitemap`);
  check(existsSync(join(process.cwd(), "public", product.imageSrc)), `${product.name} sitemap image exists`);
}
for (const product of getComingSoonCatalogProducts()) {
  check(!urls.includes(`${SITE_URL}${product.href}`), `${product.name} unreleased page is excluded`);
}
const robotsFile = robots();
check(robotsFile.sitemap === `${SITE_URL}/sitemap.xml`, "robots.txt points at the canonical sitemap");
check(!JSON.stringify(robotsFile.rules).includes("/admin"), "Crawlers may read the admin pages' noindex directives");

const crumbItems = [{ name: "Home", path: "/" }, { name: "Products", path: "/products" }, { name: "BPC-157 10 mg", path: "/products/psl-bpc157-10mg" }];
const crumbHtml = renderToStaticMarkup(createElement(SiteBreadcrumbs, { items: crumbItems }));
check(crumbHtml.includes('aria-label="Breadcrumb"') && crumbHtml.includes('aria-current="page"'), "The visible breadcrumb has an accessible current-page indicator");
check(crumbHtml.includes('href="/"') && crumbHtml.includes('href="/products"'), "Breadcrumb ancestors have crawlable ordinary links");
const crumbSchema = JSON.parse(crumbHtml.match(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/)![1]);
check(crumbSchema.itemListElement.length === crumbItems.length, "Visible and structured trails have the same number of entries");
for (let i = 0; i < crumbItems.length; i++) {
  check(crumbSchema.itemListElement[i].name === crumbItems[i].name && crumbSchema.itemListElement[i].position === i + 1 && crumbSchema.itemListElement[i].item === `${SITE_URL}${crumbItems[i].path}`, "Structured breadcrumb matches the visible label, position and canonical path");
}
const malicious = renderToStaticMarkup(createElement(JsonLd, { data: { name: "</script><script>alert(1)</script>" } }));
check(!malicious.includes("</script><script>"), "Structured data cannot break out of its script tag");

for (const catalog of getActiveCatalogProducts()) {
  const product = getProduct(catalog.handle)!;
  const availability = { handle: product.handle, tracked: true, stock: 4, reserved: 1, available: 3, status: "in_stock" as const };
  const data = createProductData({ product, catalog, availability });
  check(data.sku === catalog.sku && data.url === `${SITE_URL}${catalog.href}`, `${product.name} schema uses its actual SKU and canonical URL`);
  check(data.offers.price === product.price.toFixed(2) && data.offers.priceCurrency === "USD", `${product.name} schema uses the store price and currency`);
  check(data.image === `${SITE_URL}${getProductRender(product.handle)?.src ?? product.imageSrc}`, `${product.name} structured image matches the visible product image`);
  check(!("aggregateRating" in data) && !("review" in data) && !("hasCertification" in data), "No invented rating, review or certification is emitted");
  check(data.offers.availability === "https://schema.org/InStock", "Tracked available inventory maps to InStock");
  const soldOut = createProductData({ product, catalog, availability: { ...availability, available: 0, status: "out_of_stock" } });
  check(soldOut.offers.availability === "https://schema.org/OutOfStock", "Tracked unavailable inventory maps to OutOfStock");
  const unknown = createProductData({ product, catalog, availability: { ...availability, tracked: false } });
  check(!("availability" in unknown.offers), "An inventory fallback does not become a verified schema stock claim");
}

console.log(`SEO offline checks passed: ${checks}. No network requests or business writes.`);
