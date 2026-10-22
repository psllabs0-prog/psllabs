#!/usr/bin/env node
/**
 * IndexNow ping for the PSL Labs storefront.
 *
 * IndexNow tells Bing, Yandex, Seznam, Naver, Yep and the other participating engines that URLs
 * were added or changed. Google does NOT use IndexNow (Google re-indexing is Search Console plus
 * an accurate sitemap lastmod).
 *
 * DRY RUN BY DEFAULT: without --send this prints the payload and sends nothing.
 * Run it only after a production deploy is live, once per deploy, for the URLs that changed.
 * Do not resubmit unchanged URLs on every deploy.
 *
 * The key is the public ownership token served at /<key>.txt from public/. It is public by
 * design (the engines fetch it), so it is not a secret and does not belong in .env.
 *
 * Usage (from the repo root):
 *   node scripts/indexnow-ping.mjs --since 2026-10-22           dry run: sitemap URLs with lastmod >= date
 *   node scripts/indexnow-ping.mjs --since 2026-10-22 --send    send them
 *   node scripts/indexnow-ping.mjs --all --send                 every sitemap URL (first submission only)
 *   node scripts/indexnow-ping.mjs https://www.psllabs.org/coa --send   explicit URLs
 *
 * Options:
 *   --site <origin>      canonical origin (default https://www.psllabs.org)
 *   --sitemap <url>      sitemap to read (default <site>/sitemap.xml)
 *   --skip-key-check     dry run only: do not fetch <site>/<key>.txt first
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ENDPOINT = "https://api.indexnow.org/indexnow";
const DEFAULT_SITE = "https://www.psllabs.org";
const MAX_URLS = 10_000;
const KEY_PATTERN = /^[A-Za-z0-9-]{8,128}$/;

const RESPONSES = {
  200: "OK: URLs submitted successfully.",
  202: "Accepted: URLs received; the key file is still being validated by the engine.",
  400: "Bad request: invalid format.",
  403: "Forbidden: the key file was not found or does not match the key.",
  422: "Unprocessable: a URL does not belong to the host, or the key does not match the schema.",
  429: "Too many requests: wait before sending again (possible spam signal).",
};

function fail(message) {
  console.error(`indexnow-ping: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const options = { site: DEFAULT_SITE, sitemap: undefined, since: undefined, all: false, send: false, skipKeyCheck: false, urls: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => {
      const next = argv[++i];
      if (!next || next.startsWith("--")) fail(`${arg} needs a value`);
      return next;
    };
    if (arg === "--site") options.site = value();
    else if (arg === "--sitemap") options.sitemap = value();
    else if (arg === "--since") options.since = value();
    else if (arg === "--all") options.all = true;
    else if (arg === "--send") options.send = true;
    else if (arg === "--skip-key-check") options.skipKeyCheck = true;
    else if (arg === "--help" || arg === "-h") {
      console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("*/")[0]);
      process.exit(0);
    } else if (arg.startsWith("--")) fail(`unknown option ${arg}`);
    else options.urls.push(arg);
  }
  options.site = options.site.replace(/\/+$/, "");
  options.sitemap ??= `${options.site}/sitemap.xml`;
  const modes = [options.all, Boolean(options.since), options.urls.length > 0].filter(Boolean).length;
  if (modes !== 1) fail("choose exactly one of --since YYYY-MM-DD, --all, or explicit URLs");
  if (options.since && !/^\d{4}-\d{2}-\d{2}$/.test(options.since)) fail("--since must be YYYY-MM-DD");
  if (options.send && options.skipKeyCheck) fail("--skip-key-check is for dry runs only");
  return options;
}

/** The one public/<key>.txt whose content is its own file name. */
function readKey() {
  const publicDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
  const keys = readdirSync(publicDir)
    .filter((name) => name.endsWith(".txt"))
    .map((name) => ({ name: name.slice(0, -4), content: readFileSync(join(publicDir, name), "utf8").trim() }))
    .filter(({ name, content }) => KEY_PATTERN.test(name) && name === content)
    .map(({ name }) => name);
  if (keys.length !== 1) fail(`expected exactly one IndexNow key file in public/, found ${keys.length}`);
  return keys[0];
}

function decodeXml(text) {
  return text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

async function readSitemap(sitemapUrl) {
  const response = await fetch(sitemapUrl, { redirect: "follow" });
  if (!response.ok) fail(`sitemap ${sitemapUrl} returned HTTP ${response.status}`);
  const xml = await response.text();
  return [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map(([, block]) => ({
    loc: decodeXml(block.match(/<loc>([\s\S]*?)<\/loc>/)?.[1]?.trim() ?? ""),
    lastmod: block.match(/<lastmod>([\s\S]*?)<\/lastmod>/)?.[1]?.trim(),
  })).filter((entry) => entry.loc);
}

async function checkKeyFile(site, key) {
  const keyUrl = `${site}/${key}.txt`;
  try {
    const response = await fetch(keyUrl, { redirect: "manual" });
    const body = (await response.text()).trim();
    if (response.status === 200 && body === key) return { ok: true, keyUrl };
    return { ok: false, keyUrl, detail: `HTTP ${response.status}${response.status === 200 ? ", content does not match the key" : ""}` };
  } catch (error) {
    return { ok: false, keyUrl, detail: error instanceof Error ? error.message : String(error) };
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const site = new URL(options.site);
  if (options.send && (site.protocol !== "https:" || /^(localhost|127\.|\[::1\])/.test(site.host))) {
    fail("--send is only for the live https production origin");
  }
  const key = readKey();

  let urlList;
  if (options.urls.length) {
    urlList = options.urls;
  } else {
    const entries = await readSitemap(options.sitemap);
    urlList = (options.all ? entries : entries.filter((entry) => entry.lastmod && entry.lastmod.slice(0, 10) >= options.since))
      .map((entry) => entry.loc);
  }
  urlList = [...new Set(urlList)];
  const foreign = urlList.filter((url) => {
    try { return new URL(url).host !== site.host; } catch { return true; }
  });
  if (foreign.length) fail(`these URLs are not on ${site.host}:\n  ${foreign.join("\n  ")}`);
  if (!urlList.length) fail("no URLs selected (check --since against the sitemap lastmod values)");
  if (urlList.length > MAX_URLS) fail(`IndexNow accepts at most ${MAX_URLS} URLs per request`);

  const payload = { host: site.host, key, keyLocation: `${options.site}/${key}.txt`, urlList };
  console.log(`IndexNow ${options.send ? "SEND" : "DRY RUN (nothing sent)"}: ${urlList.length} URL(s) for ${site.host}`);
  for (const url of urlList) console.log(`  ${url}`);

  if (!options.skipKeyCheck) {
    const keyCheck = await checkKeyFile(options.site, key);
    if (keyCheck.ok) console.log(`Key file OK: ${keyCheck.keyUrl}`);
    else if (options.send) fail(`key file check failed at ${keyCheck.keyUrl} (${keyCheck.detail}); deploy first`);
    else console.warn(`Key file not live yet at ${keyCheck.keyUrl} (${keyCheck.detail}). Expected before the deploy.`);
  }

  if (!options.send) {
    console.log(`Would POST to ${ENDPOINT}:`);
    console.log(JSON.stringify(payload, null, 2));
    console.log("Add --send to submit.");
    return;
  }

  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload),
  });
  const meaning = RESPONSES[response.status] ?? "Unexpected response.";
  console.log(`IndexNow responded HTTP ${response.status}: ${meaning}`);
  if (response.status !== 200 && response.status !== 202) process.exitCode = 1;
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
