import { getSql } from "@/lib/db/sql";
import { ensureSupportSchema } from "@/lib/support/schema";
import { ensureFinanceSchema } from "@/lib/finance/schema";
import { ensureExternalMetricsSchema } from "@/lib/external-metrics/schema";
import { aggregateSearchConsolePeriod } from "@/lib/external-metrics/store";

import { ensureCustomerIntelligenceSchema } from "./schema";
import { ensureCustomerFeedbackSchema } from "./store";
import {
  upsertCustomerIntelSignal,
  upsertCustomerIntelSnapshot,
  listCustomerIntelSignals,
} from "./signals-store";
import {
  confidenceFromCounts,
  formatEvidenceNote,
  statusFromConfidence,
} from "./thresholds";
import {
  isMarketingForbiddenTheme,
  recommendationForTheme,
  themeFromDiscoverySource,
  themeFromPurchaseDriver,
  themeFromSupportCategory,
  type CiTheme,
  type EvidenceClass,
} from "./taxonomy";
import { textLooksRestrictedHumanUse } from "./guardrails";

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d.getTime());
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

type Bucket = {
  theme: CiTheme;
  evidenceClass: EvidenceClass;
  sourceChannel: string;
  signalType: string;
  current: number;
  prior: number;
  explicitQuotes: string[];
  inferredOnly: boolean;
};

function bump(
  map: Map<string, Bucket>,
  key: string,
  partial: Omit<Bucket, "current" | "prior" | "explicitQuotes"> & {
    period: "current" | "prior";
    quote?: string;
  }
) {
  const existing = map.get(key) ?? {
    theme: partial.theme,
    evidenceClass: partial.evidenceClass,
    sourceChannel: partial.sourceChannel,
    signalType: partial.signalType,
    current: 0,
    prior: 0,
    explicitQuotes: [],
    inferredOnly: partial.inferredOnly,
  };
  if (partial.period === "current") existing.current += 1;
  else existing.prior += 1;
  if (partial.quote && existing.explicitQuotes.length < 5) {
    existing.explicitQuotes.push(partial.quote.slice(0, 160));
  }
  existing.inferredOnly = existing.inferredOnly && partial.inferredOnly;
  map.set(key, existing);
}

/**
 * Idempotent customer intelligence scan (28d current vs prior 28d).
 * Does not fabricate trends from missing prior data.
 */
export async function runCustomerIntelligenceScan(options?: {
  asOf?: Date;
}): Promise<{
  ok: boolean;
  periodStart: string;
  periodEnd: string;
  signalsUpserted: number;
  snapshotId: number;
  evidenceHealth: Record<string, number>;
  message: string;
}> {
  await ensureCustomerIntelligenceSchema();
  await ensureCustomerFeedbackSchema();
  await ensureSupportSchema();
  await ensureFinanceSchema();
  await ensureExternalMetricsSchema();

  const asOf = options?.asOf ?? new Date();
  const end = addDays(
    new Date(
      Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate())
    ),
    -1
  );
  const start = addDays(end, -27);
  const priorEnd = addDays(start, -1);
  const priorStart = addDays(priorEnd, -27);

  const periodStart = ymd(start);
  const periodEnd = ymd(end);
  const priorStartStr = ymd(priorStart);
  const priorEndStr = ymd(priorEnd);

  const sql = getSql();
  const buckets = new Map<string, Bucket>();

  // --- Support (customer evidence) ---
  const supportRows = (await sql`
    SELECT
      m.id,
      m.received_at,
      m.reporting_excluded,
      c.category,
      CASE
        WHEN m.received_at::date >= ${periodStart}::date
         AND m.received_at::date <= ${periodEnd}::date THEN 'current'
        WHEN m.received_at::date >= ${priorStartStr}::date
         AND m.received_at::date <= ${priorEndStr}::date THEN 'prior'
        ELSE 'other'
      END AS period_bucket
    FROM support_messages m
    LEFT JOIN support_classifications c ON c.message_id = m.id
    WHERE m.received_at::date >= ${priorStartStr}::date
      AND m.received_at::date <= ${periodEnd}::date
      AND COALESCE(m.reporting_excluded, false) = false
      AND COALESCE(c.category, '') NOT IN ('spam_solicitation', 'vendor_solicitation')
      AND COALESCE(m.status, '') <> 'ignored'
  `) as Array<{
    id: number;
    received_at: string;
    reporting_excluded: boolean;
    category: string | null;
    period_bucket: string;
  }>;

  let supportCurrent = 0;
  let supportPrior = 0;
  for (const row of supportRows) {
    if (row.period_bucket === "other") continue;
    if (row.period_bucket === "current") supportCurrent += 1;
    else supportPrior += 1;
    const theme = themeFromSupportCategory(row.category);
    const evidenceClass: EvidenceClass =
      theme === "restricted_human_use_request" ? "compliance" : "customer";
    bump(buckets, `support:${theme}`, {
      theme,
      evidenceClass,
      sourceChannel: "support",
      signalType: "support_category",
      period: row.period_bucket as "current" | "prior",
      inferredOnly: true,
    });
  }

  // --- Post-order feedback (customer evidence; exclude finance-excluded orders) ---
  const feedbackRows = (await sql`
    SELECT
      cf.id,
      cf.submitted_at,
      cf.discovery_source_stated,
      cf.purchase_drivers,
      cf.open_feedback,
      cf.status,
      CASE
        WHEN cf.submitted_at::date >= ${periodStart}::date
         AND cf.submitted_at::date <= ${periodEnd}::date THEN 'current'
        WHEN cf.submitted_at::date >= ${priorStartStr}::date
         AND cf.submitted_at::date <= ${priorEndStr}::date THEN 'prior'
        ELSE 'other'
      END AS period_bucket
    FROM customer_feedback cf
    WHERE cf.status = 'submitted'
      AND cf.submitted_at::date >= ${priorStartStr}::date
      AND cf.submitted_at::date <= ${periodEnd}::date
      AND NOT EXISTS (
        SELECT 1 FROM finance_transactions ft
        WHERE ft.psl_order_id = cf.order_id
          AND ft.reporting_excluded = true
      )
  `) as Array<{
    id: string;
    submitted_at: string;
    discovery_source_stated: string | null;
    purchase_drivers: unknown;
    open_feedback: string | null;
    status: string;
    period_bucket: string;
  }>;

  let feedbackCurrent = 0;
  let feedbackPrior = 0;
  for (const row of feedbackRows) {
    if (row.period_bucket === "other") continue;
    if (row.period_bucket === "current") feedbackCurrent += 1;
    else feedbackPrior += 1;

    const period = row.period_bucket as "current" | "prior";
    if (row.discovery_source_stated) {
      const theme = themeFromDiscoverySource(row.discovery_source_stated);
      bump(buckets, `feedback:discovery:${row.discovery_source_stated}`, {
        theme,
        evidenceClass: "customer",
        sourceChannel: "post_order_feedback",
        signalType: "explicit_discovery_source",
        period,
        quote: `Customer explicitly selected discovery: ${row.discovery_source_stated}`,
        inferredOnly: false,
      });
    }

    let drivers: string[] = [];
    if (Array.isArray(row.purchase_drivers)) {
      drivers = row.purchase_drivers.filter(
        (d): d is string => typeof d === "string"
      );
    }
    for (const driver of drivers) {
      const theme = themeFromPurchaseDriver(driver);
      bump(buckets, `feedback:driver:${driver}`, {
        theme,
        evidenceClass: "customer",
        sourceChannel: "post_order_feedback",
        signalType: "explicit_purchase_driver",
        period,
        quote: `Customer explicitly selected purchase driver: ${driver}`,
        inferredOnly: false,
      });
    }

    if (row.open_feedback?.trim()) {
      if (textLooksRestrictedHumanUse(row.open_feedback)) {
        bump(buckets, `feedback:restricted_human_use`, {
          theme: "restricted_human_use_request",
          evidenceClass: "compliance",
          sourceChannel: "post_order_feedback",
          signalType: "restricted_open_feedback",
          period,
          inferredOnly: false,
        });
      } else {
        bump(buckets, `feedback:open_friction`, {
          theme: "website_clarity",
          evidenceClass: "customer",
          sourceChannel: "post_order_feedback",
          signalType: "explicit_open_feedback",
          period,
          quote: "Customer left open feedback (content not auto-published).",
          inferredOnly: false,
        });
      }
    }
  }

  // --- Discord community (if table exists / has rows) ---
  let communityCurrent = 0;
  let communityPrior = 0;
  let restrictedCommunity = 0;
  try {
    const discordRows = (await sql`
      SELECT
        command,
        category,
        risk_level,
        reporting_excluded,
        CASE
          WHEN created_at::date >= ${periodStart}::date
           AND created_at::date <= ${periodEnd}::date THEN 'current'
          WHEN created_at::date >= ${priorStartStr}::date
           AND created_at::date <= ${priorEndStr}::date THEN 'prior'
          ELSE 'other'
        END AS period_bucket
      FROM discord_interactions
      WHERE created_at::date >= ${priorStartStr}::date
        AND created_at::date <= ${periodEnd}::date
        AND COALESCE(reporting_excluded, false) = false
        AND COALESCE(outcome, '') <> 'rate_limited'
    `) as Array<{
      command: string;
      category: string | null;
      risk_level: string | null;
      reporting_excluded: boolean;
      period_bucket: string;
    }>;

    for (const row of discordRows) {
      if (row.period_bucket === "other") continue;
      if (row.period_bucket === "current") communityCurrent += 1;
      else communityPrior += 1;

      const cat = (row.category ?? row.command ?? "community_question").toLowerCase();
      let theme: CiTheme = "community_question";
      if (cat.includes("human") || row.risk_level === "restricted") {
        theme = "restricted_human_use_request";
        if (row.period_bucket === "current") restrictedCommunity += 1;
      } else if (cat.includes("coa") || cat.includes("batch")) {
        theme = "coa_findability";
      } else if (cat.includes("shipping")) {
        theme = "shipping_question";
      } else if (cat.includes("product") || cat.includes("availability")) {
        theme = "product_availability";
      }

      bump(buckets, `community:${theme}:${cat}`, {
        theme,
        evidenceClass:
          theme === "restricted_human_use_request" ? "compliance" : "community",
        sourceChannel: "discord",
        signalType: "community_command",
        period: row.period_bucket as "current" | "prior",
        inferredOnly: true,
      });
    }
  } catch {
    // discord_interactions may not exist yet during partial deploy
  }

  // --- Search demand (separate evidence class; never customer) ---
  let searchCurrentImp = 0;
  try {
    const search = await aggregateSearchConsolePeriod({
      startDate: periodStart,
      endDate: periodEnd,
    });
    searchCurrentImp = search.nonBrandImpressions;
    if (search.nonBrandImpressions >= 40) {
      // Corroboration hint only — does not inflate customer sample sizes
      bump(buckets, `search:coa_verification_demand`, {
        theme: "coa_findability",
        evidenceClass: "search_demand",
        sourceChannel: "search_console",
        signalType: "search_demand_hint",
        period: "current",
        inferredOnly: true,
      });
      // Represent volume as min(impressions/40, 10) observation units for confidence only within search class
      const b = buckets.get(`search:coa_verification_demand`);
      if (b) {
        b.current = Math.min(10, Math.max(1, Math.floor(search.nonBrandImpressions / 40)));
      }
    }
  } catch {
    // ignore
  }

  let signalsUpserted = 0;
  const recommendations: Array<Record<string, unknown>> = [];

  for (const [key, b] of buckets) {
    const confidence = confidenceFromCounts({
      currentCount: b.current,
      priorCount: b.prior,
      sampleSize: b.current + b.prior,
    });
    const status = statusFromConfidence(confidence);
    const rec = isMarketingForbiddenTheme(b.theme)
      ? null
      : recommendationForTheme(b.theme);

    await upsertCustomerIntelSignal({
      signalKey: key,
      signalType: b.signalType,
      theme: b.theme,
      evidenceClass: b.evidenceClass,
      sourceChannel: b.sourceChannel,
      currentCount: b.current,
      priorCount: b.prior,
      sampleSize: b.current + b.prior,
      confidenceLevel: confidence,
      status,
      recommendation: rec,
      evidenceJson: {
        note: formatEvidenceNote({
          currentCount: b.current,
          priorCount: b.prior,
          label: `${b.evidenceClass} observations (${b.theme})`,
          confidence,
        }),
        explicitEvidence: b.explicitQuotes,
        inferredOnly: b.inferredOnly,
        evidenceClass: b.evidenceClass,
        priorAvailable: true,
      },
    });
    signalsUpserted += 1;

    if (
      rec &&
      !isMarketingForbiddenTheme(b.theme) &&
      (confidence === "early_signal" ||
        confidence === "meaningful" ||
        confidence === "strong") &&
      b.evidenceClass === "customer"
    ) {
      recommendations.push({
        recommendation: rec,
        theme: b.theme,
        evidenceClass: b.evidenceClass,
        sampleSize: b.current,
        confidence,
        evidenceNote: formatEvidenceNote({
          currentCount: b.current,
          priorCount: b.prior,
          label: b.theme.replace(/_/g, " "),
          confidence,
        }),
      });
    }
  }

  const evidenceHealth = {
    supportCurrent,
    supportPrior,
    feedbackCurrent,
    feedbackPrior,
    communityCurrent,
    communityPrior,
    restrictedCommunityCurrent: restrictedCommunity,
    searchNonBrandImpressions: searchCurrentImp,
  };

  const snapshot = {
    periodStart,
    periodEnd,
    priorStart: priorStartStr,
    priorEnd: priorEndStr,
    evidenceHealth,
    recommendations,
    generatedAt: new Date().toISOString(),
  };

  const { id: snapshotId } = await upsertCustomerIntelSnapshot({
    periodStart,
    periodEnd,
    snapshot,
  });

  const signals = await listCustomerIntelSignals({ limit: 5 });
  const message =
    supportCurrent + feedbackCurrent + communityCurrent === 0
      ? "Insufficient customer evidence for new action."
      : `Scan complete. ${signalsUpserted} signal(s); top confidence ${signals[0]?.confidenceLevel ?? "insufficient"}.`;

  return {
    ok: true,
    periodStart,
    periodEnd,
    signalsUpserted,
    snapshotId,
    evidenceHealth,
    message,
  };
}
