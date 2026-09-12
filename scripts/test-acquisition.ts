/**
 * Offline tests for Phase 9 acquisition intelligence.
 * Run: npm run test:acquisition
 */
import {
  computeLearningBudget,
  contributionEconomicsLabel,
  hasEnoughEvidenceForPerformanceConclusion,
} from "../lib/acquisition/config";
import {
  chooseRevenueTruth,
  paidAttributionMatchScore,
  assignOrderToUniqueCampaign,
  isExactCampaignMatch,
  isExactCreativeMatch,
} from "../lib/external-metrics/paid/attribution";
import {
  DEFAULT_META_MARKETING_API_VERSION,
  buildMetaInsightsUrl,
  resolveMetaMarketingApiVersion,
} from "../lib/external-metrics/paid/meta-api-version";
import {
  metaAdsAdapter,
  tiktokAdsAdapter,
} from "../lib/external-metrics/paid/providers";
import { syncPaidAcquisition } from "../lib/external-metrics/paid/sync";
import { collectAcquisitionSnapshot } from "../lib/ceo-brief/acquisition";
import { readFileSync } from "fs";
import { join } from "path";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

async function testMissingCredsNotConfigured() {
  const prev = {
    META_ADS_ACCESS_TOKEN: process.env.META_ADS_ACCESS_TOKEN,
    META_ADS_ACCOUNT_ID: process.env.META_ADS_ACCOUNT_ID,
    TIKTOK_ADS_ACCESS_TOKEN: process.env.TIKTOK_ADS_ACCESS_TOKEN,
    TIKTOK_ADS_ADVERTISER_ID: process.env.TIKTOK_ADS_ADVERTISER_ID,
  };
  delete process.env.META_ADS_ACCESS_TOKEN;
  delete process.env.META_ADS_ACCOUNT_ID;
  delete process.env.TIKTOK_ADS_ACCESS_TOKEN;
  delete process.env.TIKTOK_ADS_ADVERTISER_ID;

  const [meta, tiktok] = await Promise.all([
    metaAdsAdapter.getStatus(),
    tiktokAdsAdapter.getStatus(),
  ]);
  assert(meta.state === "not_configured", "meta not_configured");
  assert(tiktok.state === "not_configured", "tiktok not_configured");

  const sync = await syncPaidAcquisition();
  assert(
    sync.providers.every((p) => p.status === "not_configured"),
    "sync not_configured without creds"
  );
  assert(sync.ok === true, "not_configured is not a hard sync failure");

  for (const [k, v] of Object.entries(prev)) {
    if (v !== undefined) process.env[k] = v;
    else delete process.env[k];
  }
}

function testLearningBudget() {
  process.env.PAID_LEARNING_BUDGET_CEILING_USD = "1000";
  const a = computeLearningBudget(0);
  assert(a.ceilingUsd === 1000, "ceiling default 1000");
  assert(a.remainingUsd === 1000, "remaining full");
  assert(a.reviewState === "ok", "ok at 0");

  const b = computeLearningBudget(800);
  assert(b.reviewState === "approaching", "80% approaching");
  assert(Math.abs(b.pctOfCeiling - 80) < 0.01, "80%");

  const c = computeLearningBudget(1000);
  assert(c.reviewState === "reached", "100% reached");
  assert(c.remainingUsd === 0, "remaining 0");

  const d = computeLearningBudget(1200);
  assert(d.reviewState === "exceeded", "over ceiling");
}

function testEvidenceGates() {
  delete process.env.ACQUISITION_REVIEW_MIN_CLICKS;
  delete process.env.ACQUISITION_REVIEW_MIN_SPEND_USD;
  delete process.env.ACQUISITION_MIN_ORDERS_FOR_COMPARISON;
  assert(
    hasEnoughEvidenceForPerformanceConclusion({
      clicks: 1000,
      spendUsd: 500,
      orders: 20,
    }) === false,
    "unset thresholds suppress strong conclusions"
  );

  process.env.ACQUISITION_REVIEW_MIN_CLICKS = "100";
  process.env.ACQUISITION_REVIEW_MIN_SPEND_USD = "50";
  process.env.ACQUISITION_MIN_ORDERS_FOR_COMPARISON = "5";
  assert(
    hasEnoughEvidenceForPerformanceConclusion({
      clicks: 10,
      spendUsd: 5,
      orders: 1,
    }) === false,
    "tiny sample blocked"
  );
  assert(
    hasEnoughEvidenceForPerformanceConclusion({
      clicks: 100,
      spendUsd: 50,
      orders: 5,
    }) === true,
    "adequate sample"
  );
}

function testPslBeatsPlatform() {
  const t = chooseRevenueTruth({
    pslAttributedRevenueUsd: 200,
    platformPurchaseValueUsd: 9999,
  });
  assert(t.source === "psl" && t.revenueUsd === 200, "PSL wins");
  const none = chooseRevenueTruth({
    pslAttributedRevenueUsd: 0,
    platformPurchaseValueUsd: 9999,
  });
  assert(none.revenueUsd === 0 && none.source === "none", "platform not truth");
}

function testMatchScoreNotFuzzyGarbage() {
  const score = paidAttributionMatchScore(
    {
      utmSource: "meta",
      utmMedium: "paid_social",
      utmCampaign: "totally_unrelated_geo_a",
      utmContent: "x",
    },
    {
      platform: "meta",
      campaignId: "111",
      utmCampaign: "other_theme_us_test",
    }
  );
  assert(score < 5, "unrelated campaigns do not silently match");
}

function testDeterministicAttributionNoDoubleCount() {
  const campaigns = [
    {
      key: "meta:1",
      platform: "meta",
      campaignId: "1",
      campaignName: "reta_us_test",
      utmCampaign: "reta_us_test",
    },
    {
      key: "meta:2",
      platform: "meta",
      campaignId: "2",
      campaignName: "reta_us_test2",
      utmCampaign: "reta_us_test2",
    },
  ];

  // Overlapping substring must NOT match both / either incorrectly via includes
  assert(
    !isExactCampaignMatch(
      { utmSource: "meta", utmCampaign: "reta_us_test" },
      campaigns[1]
    ),
    "reta_us_test does not match reta_us_test2"
  );
  assert(
    !isExactCampaignMatch(
      { utmSource: "meta", utmCampaign: "reta_us_test2" },
      campaigns[0]
    ),
    "reta_us_test2 does not match reta_us_test"
  );

  const exact = assignOrderToUniqueCampaign(
    { utmSource: "meta", utmCampaign: "reta_us_test" },
    campaigns
  );
  assert(exact.status === "matched", "exact campaign match succeeds");
  if (exact.status === "matched") {
    assert(exact.campaign.key === "meta:1", "exact assigns reta_us_test only");
  }

  const unmatched = assignOrderToUniqueCampaign(
    { utmSource: "meta", utmCampaign: "unknown_campaign" },
    campaigns
  );
  assert(unmatched.status === "unmatched", "unmatched stays unmatched");

  // Ambiguous: same campaign name on two campaign ids
  const amb = assignOrderToUniqueCampaign(
    { utmSource: "meta", utmCampaign: "dup_name" },
    [
      {
        key: "meta:a",
        platform: "meta",
        campaignId: "a",
        campaignName: "dup_name",
      },
      {
        key: "meta:b",
        platform: "meta",
        campaignId: "b",
        campaignName: "dup_name",
      },
    ]
  );
  assert(amb.status === "ambiguous", "ambiguous match assigns no campaign");

  // One order contributes to at most one campaign
  const orders = [
    { id: "o1", utmCampaign: "reta_us_test", total: 100 },
    { id: "o2", utmCampaign: "reta_us_test2", total: 50 },
    { id: "o3", utmCampaign: "reta_us_test", total: 25 },
  ];
  const totals = new Map<string, { orders: number; revenue: number }>();
  for (const c of campaigns) totals.set(c.key, { orders: 0, revenue: 0 });
  let matchedUnique = 0;
  for (const o of orders) {
    const a = assignOrderToUniqueCampaign(
      { utmSource: "meta", utmCampaign: o.utmCampaign },
      campaigns
    );
    if (a.status === "matched") {
      matchedUnique += 1;
      const t = totals.get(a.campaign.key)!;
      t.orders += 1;
      t.revenue += o.total;
    }
  }
  const sumCampaignOrders = [...totals.values()].reduce(
    (s, t) => s + t.orders,
    0
  );
  assert(matchedUnique === 3, "all exact orders matched once");
  assert(
    sumCampaignOrders === matchedUnique,
    "total campaign PSL orders <= unique paid-attributed orders (equal when all matched)"
  );
  assert(sumCampaignOrders <= orders.length, "never exceed unique order count");

  assert(
    !isExactCreativeMatch(
      { utmSource: "meta", utmContent: "batch_docs" },
      { platform: "meta", contentKey: "batch_docs_a" }
    ),
    "fuzzy creative content does not match"
  );
  assert(
    isExactCreativeMatch(
      { utmSource: "meta", utmContent: "batch_docs_a" },
      { platform: "meta", contentKey: "batch_docs_a" }
    ),
    "exact creative match works"
  );
}

function testMetaApiVersion() {
  delete process.env.META_MARKETING_API_VERSION;
  const d = resolveMetaMarketingApiVersion(undefined);
  assert(d.version === "v26.0", "default version is v26.0");
  assert(d.version === DEFAULT_META_MARKETING_API_VERSION, "default constant");
  assert(d.configError == null, "no error on default");

  const ok = resolveMetaMarketingApiVersion("v25.0");
  assert(ok.version === "v25.0" && ok.source === "env", "valid version honored");

  const bad = resolveMetaMarketingApiVersion("https://evil.example/v1");
  assert(bad.version === "v26.0", "invalid URL falls back safely");
  assert(bad.configError != null, "reports configuration error");

  const badForm = resolveMetaMarketingApiVersion("26.0");
  assert(badForm.version === "v26.0", "missing v falls back");
  assert(badForm.configError != null, "reports form error");

  const url = buildMetaInsightsUrl({
    version: "v26.0",
    accountId: "123",
    query: "fields=spend",
  });
  assert(
    url.startsWith("https://graph.facebook.com/v26.0/act_123/insights?"),
    "insights URL host+version fixed"
  );
  assert(!url.includes("evil"), "no arbitrary host");
}

function testTikTokConversionNotPurchase() {
  const src = readFileSync(
    join(process.cwd(), "lib/external-metrics/paid/tiktok-sync.ts"),
    "utf8"
  );
  assert(
    /platformPurchases:\s*null/.test(src),
    "generic conversion never stored as purchase"
  );
  assert(
    /platformPurchaseValueUsd:\s*null/.test(src),
    "purchase value null without verified website purchase metric"
  );
  assert(/platformConversions:/.test(src), "optional conversion diagnostic");
  assert(!/total_purchase_value/.test(src), "does not map app purchase value");
}

function testContributionInsufficient() {
  assert(
    contributionEconomicsLabel() === "insufficient data",
    "no profit labels without COGS"
  );
}

function testNoCampaignMutationInAdapters() {
  const root = join(process.cwd(), "lib/external-metrics/paid");
  for (const file of ["meta-sync.ts", "tiktok-sync.ts"]) {
    const src = readFileSync(join(root, file), "utf8");
    assert(!/campaigns\/update/i.test(src), `${file} no campaign update`);
    assert(!/budget.*POST/i.test(src), `${file} no budget POST`);
    assert(!/adsmanagement.*mutate/i.test(src), `${file} no mutate`);
    assert(
      !/method:\s*["']POST["']/.test(src) || file === "tiktok-sync.ts",
      // TikTok report is GET-only; Meta insights GET-only
      `${file} should not POST campaign changes`
    );
  }
  const meta = readFileSync(join(root, "meta-sync.ts"), "utf8");
  const tiktok = readFileSync(join(root, "tiktok-sync.ts"), "utf8");
  assert(!/method:\s*["']POST["']/.test(meta), "meta is GET insights");
  assert(!/method:\s*["']POST["']/.test(tiktok), "tiktok report GET");
}

async function testCeoUnavailableWithoutSpend() {
  // Without DB spend this may still return unavailable when DATABASE_URL missing;
  // function catches and returns unavailable.
  const snap = await collectAcquisitionSnapshot().catch(() => null);
  if (snap) {
    assert(
      snap.status === "unavailable" || snap.spendUsd == null || snap.spendUsd === 0,
      "no fabricated paid CEO success without spend"
    );
  }
}

async function testProviderIsolationShape() {
  delete process.env.META_ADS_ACCESS_TOKEN;
  delete process.env.META_ADS_ACCOUNT_ID;
  // TikTok also missing — both isolated results present
  delete process.env.TIKTOK_ADS_ACCESS_TOKEN;
  delete process.env.TIKTOK_ADS_ADVERTISER_ID;
  const result = await syncPaidAcquisition();
  assert(result.providers.length === 2, "both providers attempted");
  assert(
    result.providers.some((p) => p.provider === "meta"),
    "meta present"
  );
  assert(
    result.providers.some((p) => p.provider === "tiktok"),
    "tiktok present"
  );
}

async function main() {
  console.log("[test:acquisition] start");
  await testMissingCredsNotConfigured();
  testLearningBudget();
  testEvidenceGates();
  testPslBeatsPlatform();
  testMatchScoreNotFuzzyGarbage();
  testDeterministicAttributionNoDoubleCount();
  testMetaApiVersion();
  testTikTokConversionNotPurchase();
  testContributionInsufficient();
  testNoCampaignMutationInAdapters();
  await testCeoUnavailableWithoutSpend();
  await testProviderIsolationShape();

  const metaStatus = await metaAdsAdapter.getStatus();
  assert(
    metaStatus.diagnostics?.marketingApiVersion != null,
    "meta diagnostics expose API version"
  );
  assert(
    !JSON.stringify(metaStatus).includes("EAAB") &&
      !JSON.stringify(metaStatus).toLowerCase().includes("access_token"),
    "token never exposed in status"
  );

  console.log("[test:acquisition] ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
