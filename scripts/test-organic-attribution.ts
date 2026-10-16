/** Actual attribution/parser/browser/checkout helpers; no database or provider calls. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createContext, Script } from "node:vm";
import ts from "typescript";
import {
  isOrganicTouch, isPaidTouch, mergePaidTouch, parseTouchFromSearchParams,
  pruneStoredAttribution, sanitizeAttributionFromBody, toOrderAttribution,
} from "../lib/attribution/logic";
import { captureAttributionFromLocation, getOrderAttributionForCheckout } from "../lib/attribution/storage";
import { ATTRIBUTION_STORAGE_KEY, ATTRIBUTION_WINDOW_MS, type AttributionTouch } from "../lib/attribution/types";
import { checkoutAttribution } from "../lib/checkout/prepare-order";
import { initializePrivacyConsent, requestPrivacyConsent } from "../lib/privacy/client";
import { NO_PRIVACY_CAPABILITIES, PRIVACY_CONSENT_VERSION, type PublicPrivacyConsent } from "../lib/privacy/types";
import {
  assignOrderToUniqueCampaign, assignOrderToUniqueCreative, isPaidOrderAttribution,
  paidAttributionMatchScore,
} from "../lib/external-metrics/paid/attribution";
import * as paidReporting from "../lib/external-metrics/paid/attribution";
import * as acquisitionConfig from "../lib/acquisition/config";
import type { AcquisitionDashboard } from "../lib/acquisition/dashboard";
import type { CeoAcquisitionSnapshot } from "../lib/ceo-brief/types";
import type { BriefPeriod } from "../lib/ceo-brief/period";

let checks = 0;
function check(actual: unknown, expected: unknown, message: string) {
  assert.deepEqual(actual, expected, message);
  checks++;
}
const now = Date.now();
const at = (delta: number) => new Date(now + delta).toISOString();
function landing(source: string, medium = "organic_social", suffix = ""): AttributionTouch {
  const touch = parseTouchFromSearchParams(
    `?utm_source=${source}&utm_medium=${medium}&utm_campaign=batch_docs_oct2026&utm_content=report_reel01${suffix}`,
    "/testing", "https://example.invalid/",
  );
  assert(touch);
  return touch;
}
const paid = { ...landing("google", "cpc", "&gclid=paid_fixture"), capturedAt: at(-1000) };
const secondPaid = { ...landing("meta", "paid_social"), capturedAt: at(-500) };
const organic = landing("instagram");

for (const source of ["instagram", "tiktok", "youtube", "x", "snapchat"]) {
  const touch = landing(source);
  const state = mergePaidTouch(null, touch, now);
  const order = toOrderAttribution(state)!;
  check(isOrganicTouch(touch), true, `${source}: explicit organic channel`);
  check(isPaidTouch(touch), false, `${source}: not a paid touch`);
  check([state.firstPaid, state.lastPaid], [null, null], `${source}: no invented paid history`);
  check(state.lastOrganic?.utmSource, source, `${source}: own organic touch retained`);
  check([order.utmSource, order.utmMedium, order.utmCampaign, order.utmContent],
    [source, "organic_social", "batch_docs_oct2026", "report_reel01"], `${source}: order dimensions retained`);
  check([order.firstPaidTouchAt, order.lastPaidTouchAt], [null, null], `${source}: paid timestamps remain null`);
  check(sanitizeAttributionFromBody(order)?.lastOrganic?.capturedAt, touch.capturedAt, `${source}: server round trip keeps original time`);
}
for (const medium of ["organic", "organic-social", "social", "social_network", "social-network", "social_media", "social-media", "referral", "ORGANIC_SOCIAL"]) {
  check(isPaidTouch(landing("instagram", medium)), false, `${medium}: explicit nonpaid medium excluded`);
}
for (const medium of ["cpc", "paid_social", "display", "sponsored", "paid", "ppc"]) {
  check(isPaidTouch(landing("meta", medium)), true, `${medium}: paid medium preserved`);
}

const facebookOrganic = landing("facebook", "organic_social", "&fbclid=automatic_social_fixture");
check(isPaidTouch(facebookOrganic), false, "fbclid on an explicitly organic post does not turn it into an ad");
check(mergePaidTouch(null, facebookOrganic, now).lastOrganic?.utmSource, "facebook", "organic Facebook click retained separately");
check(isPaidTouch({ fbclid: "ambiguous_fixture" }), true, "bare historical fbclid remains unchanged without organic evidence");
check(isPaidTouch(landing("meta", "paid_social", "&fbclid=paid_fixture")), true, "paid Facebook click remains paid");
for (const key of ["gclid", "msclkid", "ttclid", "oppref"]) {
  const touch = landing("instagram", "organic_social", `&${key}=paid_fixture`);
  check(isOrganicTouch(touch), false, `${key}: actual paid reference retains priority`);
  check(isPaidTouch(touch), true, `${key}: paid reference compatibility`);
}
const email = { ...landing("newsletter", "email"), capturedAt: at(-100) };
const affiliate = { ...landing("affiliate", "affiliate"), utmContent: "approved-code", capturedAt: at(-50) };
const journey = mergePaidTouch(mergePaidTouch(mergePaidTouch(mergePaidTouch(null, paid, now), secondPaid, now), email, now), affiliate, now);
const afterOrganic = mergePaidTouch(journey, organic, now);
const snapshot = toOrderAttribution(afterOrganic)!;
check(afterOrganic.firstPaid?.gclid, "paid_fixture", "organic visit preserves true first paid touch");
check(afterOrganic.lastPaid?.utmSource, "meta", "organic visit preserves true last paid touch");
check(snapshot.utmSource, "meta", "paid attribution remains primary at checkout");
check(snapshot.lastOrganic?.utmSource, "instagram", "organic evidence retained beside paid history");
check(snapshot.lastEmail?.utmMedium, "email", "owned email history retained");
check(snapshot.lastAffiliate?.utmContent, "approved-code", "affiliate history retained");
check(sanitizeAttributionFromBody(snapshot)?.lastOrganic?.utmSource, "instagram", "server retains organic alongside paid");
check(mergePaidTouch(afterOrganic, null, now), afterOrganic, "direct revisit changes no live touch");
check(toOrderAttribution(mergePaidTouch(null, organic, now))?.utmMedium, "organic_social", "organic-only source usable as fallback");
check(toOrderAttribution({ firstPaid: null, lastPaid: null, lastOrganic: { ...organic, capturedAt: at(-200) }, lastEmail: email })?.utmMedium,
  "email", "newer email wins when no paid touch exists");
check(toOrderAttribution({ firstPaid: null, lastPaid: null, lastOrganic: organic, lastEmail: email })?.utmMedium,
  "organic_social", "newer organic wins when no paid touch exists");

// Lazily reclassify only explicitly identifiable old browser touches, never rewrite stored orders.
const legacy = { firstPaid: paid, lastPaid: facebookOrganic };
const originalLegacy = structuredClone(legacy);
const migrated = pruneStoredAttribution(legacy, now);
check(migrated.firstPaid?.gclid, "paid_fixture", "legacy true first paid touch preserved");
check(migrated.lastPaid?.gclid, "paid_fixture", "legacy paid last fallback does not select organic");
check(migrated.lastOrganic?.capturedAt, facebookOrganic.capturedAt, "legacy organic capture time not renewed");
check(legacy, originalLegacy, "normalization does not mutate input historical record");
const legacyBody = sanitizeAttributionFromBody({ ...facebookOrganic, firstPaid: facebookOrganic,
  lastPaid: facebookOrganic, lastPaidTouchAt: facebookOrganic.capturedAt, firstPaidTouchAt: facebookOrganic.capturedAt })!;
check([legacyBody.firstPaid, legacyBody.lastPaid], [null, null], "legacy top-level paid fallback cannot reintroduce organic");
check(legacyBody.lastOrganic?.capturedAt, facebookOrganic.capturedAt, "legacy top-level organic time retained");
const ambiguous = parseTouchFromSearchParams("?fbclid=old_unknown_source", "/products", "")!;
check(pruneStoredAttribution({ firstPaid: ambiguous, lastPaid: ambiguous }, now).lastPaid?.fbclid,
  "old_unknown_source", "unlabelled historic source not guessed");
for (const capturedAt of [at(-ATTRIBUTION_WINDOW_MS - 1), at(86400000)]) {
  const invalid = { ...organic, capturedAt };
  check(pruneStoredAttribution({ firstPaid: null, lastPaid: null, lastOrganic: invalid }, now).lastOrganic, undefined,
    "expired/future organic browser touch pruned");
  check(sanitizeAttributionFromBody({ lastOrganic: invalid }), null, "expired/future organic server touch rejected");
}
for (const capturedAt of [undefined, null, "not-a-date", 123]) {
  check(sanitizeAttributionFromBody({ lastOrganic: { ...organic, capturedAt } }), null, "malformed organic date not invented");
}
check(sanitizeAttributionFromBody({ lastOrganic: paid }), null, "paid touch cannot be smuggled into organic bucket");
check(sanitizeAttributionFromBody({ ...organic, lastOrganicTouchAt: undefined }), null, "top-level organic requires capture evidence");
check(parseTouchFromSearchParams("", "/testing", "https://google.com/"), null, "untagged search referrer does not invent attribution");

// Exact platform/campaign/content equality cannot make an organic order paid again.
const campaign = { platform: "meta", campaignName: "batch_docs_oct2026", campaignId: "fixture-campaign" };
const creative = { platform: "meta", contentKey: "report_reel01" };
for (const touch of [organic, facebookOrganic, landing("instagram", "social"), landing("instagram", "referral"), email, affiliate]) {
  check(isPaidOrderAttribution(touch), false, "paid dashboard cohort excludes explicit nonpaid touch");
  check(assignOrderToUniqueCampaign(touch, [campaign]).status, "unmatched", "campaign match does not reintroduce nonpaid source");
  check(assignOrderToUniqueCreative(touch, [creative]).status, "unmatched", "creative match does not reintroduce nonpaid source");
  check(paidAttributionMatchScore(touch, campaign), 0, "nonpaid source receives no paid match score");
}
check(isPaidOrderAttribution({ utmSource: "instagram" }), true, "ambiguous source-only historic reporting unchanged");
for (const key of ["gclid", "msclkid", "ttclid", "oppref"]) {
  const touch = landing("instagram", "organic_social", `&${key}=paid_fixture`);
  check(isPaidOrderAttribution(touch), true, `${key}: paid reporting retains explicit paid reference precedence`);
  check(assignOrderToUniqueCampaign(touch, [campaign]).status, "matched", `${key}: valid exact paid campaign remains matched`);
}

const binding = { digest: "a".repeat(64), revision: 1, version: PRIVACY_CONSENT_VERSION };
const consent: PublicPrivacyConsent = {
  version: PRIVACY_CONSENT_VERSION, choice: "saved", revision: 1, expiresAt: now + 86400000,
  measurement: true, personalization: false, gpc: false, admin: false,
  capabilities: { ...NO_PRIVACY_CAPABILITIES, googleMeasurement: true, openaiMeasurement: true },
};
const raw = toOrderAttribution(mergePaidTouch(null, { ...facebookOrganic,
  landingPage: "/testing?utm_source=facebook&fbclid=private_fixture", referrer: "https://example.invalid/?private=fixture" }, now))!;
const trusted = checkoutAttribution(raw, { consent, binding })!;
check(trusted.lastOrganic?.landingPage, "/testing", "server cleans new nested organic landing query");
check(trusted.lastOrganic?.referrer, "https://example.invalid/", "server cleans new nested organic referrer query");
check(trusted.lastOrganic?.fbclid, null, "disabled Meta identifier removed from nested organic touch");
check(trusted.privacyConsent, binding, "server retains trusted receipt binding");
for (const modified of [
  { ...consent, measurement: false }, { ...consent, choice: "unknown" as const },
  { ...consent, gpc: true }, { ...consent, admin: true }, { ...consent, revision: 2 },
  { ...consent, expiresAt: now - 1 },
]) check(checkoutAttribution(raw, { consent: modified, binding }), null, "organic cannot bypass existing server consent guard");
check(checkoutAttribution(raw, null), null, "organic cannot create an unbound server measurement");

async function reportingBoundaries() {
  const attributedOrders = [
    { order_id: "organic", total: 1000, attribution: organic },
    { order_id: "facebook-organic", total: 2000, attribution: facebookOrganic },
    { order_id: "social", total: 3000, attribution: landing("youtube", "social") },
    { order_id: "referral", total: 4000, attribution: landing("instagram", "referral") },
    { order_id: "email", total: 5000, attribution: landing("instagram", "email") },
    { order_id: "paid", total: 100, attribution: landing("meta", "paid_social") },
    { order_id: "paid-click", total: 50, attribution: landing("instagram", "organic_social", "&gclid=paid_fixture") },
    { order_id: "ambiguous-legacy", total: 30, attribution: {
      utmSource: "instagram", utmCampaign: "batch_docs_oct2026", utmContent: "report_reel01", fbclid: "legacy_fixture",
    } },
  ];
  const readSql = async (strings: TemplateStringsArray) => {
    const query = strings.join("?");
    if (query.includes("FROM orders o")) return structuredClone(attributedOrders);
    if (query.includes("AS content_key")) return [{ platform: "meta", content_key: "report_reel01", ad_id: "fixture-ad", ad_name: "report_reel01", spend: 10 }];
    if (query.includes("GROUP BY platform, campaign_id")) return [{ platform: "meta", campaign_id: "fixture-campaign", campaign_name: "batch_docs_oct2026", spend: 10,
      impressions: 100, clicks: 10, platform_value: 0, platform_conversions: 0 }];
    if (query.includes("COALESCE(SUM(spend_usd)")) return [{ spend: 10, clicks: 10 }];
    throw new Error("Unexpected reporting read in offline fixture");
  };
  const mocks: Record<string, unknown> = {
    "@/lib/db/sql": { getSql: () => readSql },
    "@/lib/finance/schema": { ensureFinanceSchema: async () => {} },
    "@/lib/orders/store": { ensureOrdersSchema: async () => {} },
    "@/lib/external-metrics/schema": { ensureExternalMetricsSchema: async () => {} },
    "@/lib/external-metrics/store": { sumPaidAcquisitionSpendUsd: async () => 10,
      countPaidAcquisitionRows: async () => 1, sumPaidSpendByPlatform: async () => [{ platform: "meta", spendUsd: 10 }] },
    "@/lib/external-metrics/paid/providers": { getAllPaidProviderStatuses: async () => [] },
    "@/lib/external-metrics/paid/attribution": paidReporting,
    "@/lib/acquisition/config": acquisitionConfig,
    "./config": acquisitionConfig,
  };
  function load<T>(relative: string): T {
    const filename = resolve(__dirname, "..", relative);
    const compiled = ts.transpileModule(readFileSync(filename, "utf8"), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
    }).outputText;
    const output = {};
    const execute = new Script(`(function(require,module,exports){${compiled}\n})`, { filename })
      .runInContext(createContext({ Date, URL, console, process: { env: {} } }));
    execute((id: string) => { assert(id in mocks, `Unexpected offline dependency: ${id}`); return mocks[id]; }, { exports: output }, output);
    return output as T;
  }
  const dashboardModule = load<{ buildAcquisitionDashboard: () => Promise<AcquisitionDashboard> }>("lib/acquisition/dashboard.ts");
  const dashboard = await dashboardModule.buildAcquisitionDashboard();
  check(dashboard.platformSummary[0]?.pslOrders, 3, "actual dashboard cohort excludes all explicit nonpaid rows");
  check(dashboard.platformSummary[0]?.pslRevenueUsd, 180, "actual platform revenue excludes organic/email/referral values");
  check(dashboard.campaigns[0]?.pslOrders, 3, "actual campaign aggregation preserves paid and ambiguous legacy orders only");
  check(dashboard.campaigns[0]?.pslRevenueUsd, 180, "actual campaign revenue excludes organic campaign-name collisions");
  check(dashboard.creatives[0]?.orders, 3, "actual creative aggregation cannot reintroduce organic content-name collisions");
  check(dashboard.creatives[0]?.revenueUsd, 180, "actual creative revenue excludes nonpaid rows");
  const briefModule = load<{ collectAcquisitionSnapshot: (period: BriefPeriod) => Promise<CeoAcquisitionSnapshot> }>("lib/ceo-brief/acquisition.ts");
  const brief = await briefModule.collectAcquisitionSnapshot({ periodStart: new Date("2026-10-01"), periodEnd: new Date("2026-10-16"), labelStart: "2026-10-01", labelEnd: "2026-10-15" });
  check(brief.status, "available", "actual CEO reporting fixture successfully executes");
  check(brief.attributedOrders, 3, "actual CEO brief excludes organic despite legacy source-only SQL filter");
  check(brief.attributedRevenueUsd, 180, "actual CEO revenue retains paid click precedence and legacy ambiguous rows");
}

async function browserConsent() {
  const globals = Object.fromEntries(["window", "navigator", "document", "fetch", "setTimeout", "setInterval"]
    .map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const values = new Map<string, string>();
  const navigatorFixture = { globalPrivacyControl: false };
  const events = new EventTarget();
  const originalTimeout = globalThis.setTimeout;
  const originalInterval = globalThis.setInterval;
  let serverConsent = { ...consent };
  try {
    Object.defineProperty(globalThis, "window", { configurable: true, value: {
      localStorage: { getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) },
      location: { href: "https://psllabs.org/testing", pathname: "/testing", hostname: "psllabs.org", origin: "https://psllabs.org" },
      addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events), dispatchEvent: events.dispatchEvent.bind(events),
    } });
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: navigatorFixture });
    Object.defineProperty(globalThis, "document", { configurable: true, value: { referrer: "", cookie: "" } });
    Object.defineProperty(globalThis, "setTimeout", { configurable: true, value: (...args: Parameters<typeof setTimeout>) => originalTimeout(...args).unref() });
    Object.defineProperty(globalThis, "setInterval", { configurable: true, value: (...args: Parameters<typeof setInterval>) => originalInterval(...args).unref() });
    Object.defineProperty(globalThis, "fetch", { configurable: true, value: async (_url: unknown, options?: RequestInit) => {
      if (options?.method === "POST") serverConsent = { ...serverConsent, ...JSON.parse(String(options.body)), revision: serverConsent.revision + 1 };
      return Response.json({ consent: serverConsent });
    } });
    const href = "https://psllabs.org/testing?utm_source=instagram&utm_medium=organic_social&utm_campaign=batch_docs_oct2026&utm_content=report_reel01&fbclid=private_fixture";
    captureAttributionFromLocation(href, "");
    check(values.has(ATTRIBUTION_STORAGE_KEY), false, "no organic browser storage before verified consent");
    values.set("psl_researcher_verified_v1", "1");
    await initializePrivacyConsent();
    const captured = captureAttributionFromLocation(href, "");
    check(captured.lastOrganic?.utmSource, "instagram", "consented organic browser capture succeeds");
    check(captured.lastPaid, null, "organic browser capture does not invent paid touch");
    check(captured.lastOrganic?.fbclid, null, "browser removes optional Meta identifier from organic");
    check(JSON.stringify(captured).includes("private_fixture"), false, "organic storage excludes identifier in every nested field");
    check(getOrderAttributionForCheckout()?.lastOrganic?.utmContent, "report_reel01", "browser checkout keeps organic content key");
    captureAttributionFromLocation("https://psllabs.org/testing?utm_source=google&utm_medium=cpc&gclid=paid_fixture", "");
    captureAttributionFromLocation(href, "");
    check(getOrderAttributionForCheckout()?.utmSource, "google", "browser organic revisit preserves paid primary");
    check(getOrderAttributionForCheckout()?.lastOrganic?.utmSource, "instagram", "browser organic retained beside paid primary");
    navigatorFixture.globalPrivacyControl = true;
    check(getOrderAttributionForCheckout()?.lastOrganic ?? null, null, "GPC removes organic checkout data");
    check(values.has(ATTRIBUTION_STORAGE_KEY), false, "GPC clears organic browser storage");
    navigatorFixture.globalPrivacyControl = false;
    captureAttributionFromLocation(href, "");
    const withdrawal = requestPrivacyConsent({ measurement: false, personalization: false });
    check(getOrderAttributionForCheckout()?.lastOrganic ?? null, null, "withdrawal blocks organic before server response");
    await withdrawal;
    check(values.has(ATTRIBUTION_STORAGE_KEY), false, "withdrawal clears new organic field with existing optional storage");
    captureAttributionFromLocation(href, "");
    check(values.has(ATTRIBUTION_STORAGE_KEY), false, "saved decline prevents new organic storage");
  } finally {
    for (const [key, descriptor] of Object.entries(globals)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
}
Promise.all([reportingBoundaries(), browserConsent()]).then(() => console.log(`Organic attribution: ${checks} parser, channel, legacy, reporting, server and browser privacy checks passed.`))
  .catch(error => { console.error(error); process.exitCode = 1; });
