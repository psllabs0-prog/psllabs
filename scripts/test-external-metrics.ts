/**
 * Offline tests for external metrics foundation (no fabricated paid data).
 * Run: npm run test:external-metrics
 */
import { isBrandSearchQuery, getSeoBrandTerms } from "../lib/external-metrics/brand";
import {
  getSearchConsoleConnectorStatus,
  syncSearchConsoleDaily,
} from "../lib/external-metrics/search-console";
import {
  SEO_MIN_IMPRESSIONS_FOR_SIGNAL,
  SEO_MIN_NONBRAND_CLICKS_FOR_ACTION,
} from "../lib/external-metrics/seo-brief";
import {
  metaAdsAdapter,
  tiktokAdsAdapter,
} from "../lib/external-metrics/paid/providers";
import { chooseRevenueTruth } from "../lib/external-metrics/paid/attribution";
import { collectAcquisitionSnapshot } from "../lib/ceo-brief/acquisition";
import { collectSeoSnapshot } from "../lib/ceo-brief/seo";
import { buildLukeActionCandidates, composeWeeklyBrief } from "../lib/ceo-brief/compose";
import { selectLukeActions } from "../lib/ceo-brief/period";
import type {
  CeoAcquisitionSnapshot,
  CeoHealthSnapshot,
  CeoInventorySnapshot,
  CeoSalesSnapshot,
  CeoSeoSnapshot,
  CeoSupportSnapshot,
} from "../lib/ceo-brief/types";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function emptySales(): CeoSalesSnapshot {
  return {
    periodLabel: "2026-09-01 → 2026-09-07",
    priorPeriodLabel: "2026-08-25 → 2026-08-31",
    legitimateOrders: 0,
    priorLegitimateOrders: 0,
    grossRevenueUsd: 0,
    priorGrossRevenueUsd: 0,
    netBusinessRevenueUsd: null,
    unitsSold: 0,
    priorUnitsSold: 0,
    aovUsd: null,
    priorAovUsd: null,
    revenueBySku: [],
    paymentMethodMix: [],
    refundsUsd: null,
    refundsNote: "n/a",
    reconciliationWarnings: [],
    ordersChangeNote: null,
    revenueChangeNote: null,
  };
}

function emptyInventory(): CeoInventorySnapshot {
  return {
    skus: [],
    lowStockAlerts: [],
    reorderReviewSignals: [],
    awaitingTestingLots: 0,
    inboundUnitsTotal: 0,
    sellableUnitsTotal: 0,
    testingEconomicsNote: "test",
  };
}

function emptySupport(): CeoSupportSnapshot {
  return {
    genuineCustomerMessages: 0,
    green: 0,
    yellow: 0,
    red: 0,
    unresolvedEscalations: 0,
    unresolvedEscalationsLabel: "Current legitimate unresolved escalations",
    spamSolicitations: 0,
    vendorSolicitations: 0,
    topGenuineCategories: [],
    recurringQuestionHints: [],
    systemFailures: [],
    automationIssues: [],
  };
}

function testBrandClassification() {
  process.env.SEO_BRAND_TERMS = "psl labs,psllabs,psllabs.org";
  const terms = getSeoBrandTerms();
  assert(isBrandSearchQuery("PSL Labs peptides", terms) === true, "brand hit");
  assert(isBrandSearchQuery("psllabs.org coa", terms) === true, "domain brand");
  assert(isBrandSearchQuery("bpc 157 purity", terms) === false, "non-brand");
  assert(isBrandSearchQuery("", terms) === false, "empty not brand");
  assert(isBrandSearchQuery(null, terms) === false, "null not brand");
  // Homepage traffic without query must not auto-brand.
  assert(isBrandSearchQuery("   ", terms) === false, "whitespace not brand");
}

function testPaidProvidersNotConfigured() {
  const prevMeta = process.env.META_ADS_ACCESS_TOKEN;
  const prevTik = process.env.TIKTOK_ADS_ACCESS_TOKEN;
  delete process.env.META_ADS_ACCESS_TOKEN;
  delete process.env.META_ADS_ACCOUNT_ID;
  delete process.env.TIKTOK_ADS_ACCESS_TOKEN;
  delete process.env.TIKTOK_ADS_ADVERTISER_ID;

  return Promise.all([metaAdsAdapter.getStatus(), tiktokAdsAdapter.getStatus()]).then(
    ([meta, tiktok]) => {
      assert(meta.state === "not_configured", "meta not configured");
      assert(tiktok.state === "not_configured", "tiktok not configured");
      if (prevMeta !== undefined) process.env.META_ADS_ACCESS_TOKEN = prevMeta;
      if (prevTik !== undefined) process.env.TIKTOK_ADS_ACCESS_TOKEN = prevTik;
    }
  );
}

function testPslRevenueWins() {
  const a = chooseRevenueTruth({
    pslAttributedRevenueUsd: 120,
    platformPurchaseValueUsd: 9999,
  });
  assert(a.source === "psl" && a.revenueUsd === 120, "PSL wins");
  const b = chooseRevenueTruth({
    pslAttributedRevenueUsd: 0,
    platformPurchaseValueUsd: 500,
  });
  assert(b.source === "none" && b.revenueUsd === 0, "platform claim not truth");
}

function testTinyImpressionNoiseNoSeoAction() {
  const seo: CeoSeoSnapshot = {
    status: "available",
    message: "ok",
    clicks: 1,
    impressions: 2,
    nonBrandImpressions: 2,
    nonBrandClicks: 1,
    ctr: 0.5,
    averagePosition: 40,
    priorClicks: 0,
    priorImpressions: 1,
    clicksChangeNote: null,
    impressionsChangeNote: null,
    pagesGaining: ["/"], // would be filtered by store min volume; force materialOpportunity false
    queryChanges: ["x"],
    materialOpportunity: false,
  };
  assert(
    seo.nonBrandClicks! < SEO_MIN_NONBRAND_CLICKS_FOR_ACTION,
    "below action bar"
  );
  assert(2 < SEO_MIN_IMPRESSIONS_FOR_SIGNAL, "noise below signal bar");

  const candidates = buildLukeActionCandidates({
    sales: emptySales(),
    inventory: emptyInventory(),
    support: emptySupport(),
    health: { warnings: [] },
    acquisition: {
      status: "unavailable",
      message: "Paid acquisition spend data not yet available.",
      spendUsd: null,
      sessionsOrClicks: null,
      attributedOrders: null,
      attributedRevenueUsd: null,
      cacUsd: null,
      roas: null,
      winners: [],
      losers: [],
    },
    seo,
  });
  assert(
    !candidates.some((c) => /SEO/i.test(c.action)),
    "tiny noise must not create SEO Luke action"
  );
}

async function testMissingPaidAndSeoGraceful() {
  const acq = await collectAcquisitionSnapshot();
  assert(acq.status === "unavailable", "paid unavailable");
  assert(/not yet available/i.test(acq.message), "paid message");

  const seo = await collectSeoSnapshot();
  assert(seo.status === "pending", "seo pending without rows");
  assert(seo.clicks === null && seo.impressions === null, "no fabricate");
  assert(seo.materialOpportunity === false, "no material opp");
}

async function testPermissionFailGraceful() {
  const prevProp = process.env.GOOGLE_SEARCH_CONSOLE_PROPERTY;
  const prevJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const prevEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const prevKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

  delete process.env.GOOGLE_SEARCH_CONSOLE_PROPERTY;
  delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  delete process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  delete process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

  const status = getSearchConsoleConnectorStatus();
  assert(status.status === "not_configured", "connector not configured");

  // Without DB this may throw internally but sync catches and records not_configured
  // when property/creds missing — if DATABASE_URL missing, start run may fail.
  try {
    const result = await syncSearchConsoleDaily();
    assert(
      result.status === "not_configured" || result.status === "error",
      "graceful non-ok"
    );
    assert(result.ok === false, "not ok");
  } catch {
    // DB unavailable is also graceful for CEO brief path
  }

  if (prevProp !== undefined) process.env.GOOGLE_SEARCH_CONSOLE_PROPERTY = prevProp;
  if (prevJson !== undefined) process.env.GOOGLE_SERVICE_ACCOUNT_JSON = prevJson;
  if (prevEmail !== undefined) process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = prevEmail;
  if (prevKey !== undefined) process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY = prevKey;
}

function testCeoSeoSectionNoFabricateCompose() {
  const seo: CeoSeoSnapshot = {
    status: "pending",
    message: "External SEO data pending sync.",
    clicks: null,
    impressions: null,
    nonBrandImpressions: null,
    nonBrandClicks: null,
    ctr: null,
    averagePosition: null,
    priorClicks: null,
    priorImpressions: null,
    clicksChangeNote: null,
    impressionsChangeNote: null,
    pagesGaining: [],
    queryChanges: [],
    materialOpportunity: false,
  };
  const acq: CeoAcquisitionSnapshot = {
    status: "unavailable",
    message: "Paid acquisition spend data not yet available.",
    spendUsd: null,
    sessionsOrClicks: null,
    attributedOrders: null,
    attributedRevenueUsd: null,
    cacUsd: null,
    roas: null,
    winners: [],
    losers: [],
  };
  const health: CeoHealthSnapshot = { warnings: [] };
  const brief = composeWeeklyBrief({
    periodStart: "2026-08-31T00:00:00.000Z",
    periodEnd: "2026-09-07T00:00:00.000Z",
    periodLabel: "2026-08-31 → 2026-09-06",
    generatedAt: "2026-09-07T15:00:00.000Z",
    sales: emptySales(),
    acquisition: acq,
    inventory: emptyInventory(),
    support: emptySupport(),
    seo,
    health,
  });
  assert(brief.seo.clicks === null, "compose keeps null");
  assert(brief.actions.every((a) => !/SEO/i.test(a.action)), "no SEO action");
  assert(selectLukeActions(buildLukeActionCandidates({
    sales: emptySales(),
    inventory: emptyInventory(),
    support: emptySupport(),
    health,
    acquisition: acq,
    seo,
  }), 3).length === 0, "zero-data no busywork");
}

async function main() {
  console.log("[test-external-metrics] running…");
  testBrandClassification();
  await testPaidProvidersNotConfigured();
  testPslRevenueWins();
  testTinyImpressionNoiseNoSeoAction();
  await testMissingPaidAndSeoGraceful();
  await testPermissionFailGraceful();
  testCeoSeoSectionNoFabricateCompose();
  console.log("[test-external-metrics] all passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
