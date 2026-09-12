import { ensureExternalMetricsSchema } from "@/lib/external-metrics/schema";
import { getSql } from "@/lib/db/sql";

import { detectAuthorityOpportunities, type QueryPeriodStats } from "./detect";
import { ensureAuthoritySchema } from "./schema";
import { upsertAuthorityOpportunities } from "./store";
import { recommendInternalLinks, getKnownSitePages } from "./pages";

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d.getTime());
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

async function loadQueryPeriodStats(input: {
  start: string;
  end: string;
  priorStart: string;
  priorEnd: string;
}): Promise<QueryPeriodStats[]> {
  await ensureExternalMetricsSchema();
  const sql = getSql();

  const current = (await sql`
    SELECT
      query,
      page,
      BOOL_OR(is_brand) AS is_brand,
      COALESCE(SUM(impressions), 0)::float AS impressions,
      COALESCE(SUM(clicks), 0)::float AS clicks,
      CASE WHEN SUM(impressions) > 0
        THEN SUM(clicks)::float / SUM(impressions)::float
        ELSE 0 END AS ctr,
      CASE WHEN SUM(impressions) > 0
        THEN SUM(position * impressions)::float / SUM(impressions)::float
        ELSE 0 END AS position
    FROM search_console_daily
    WHERE date >= ${input.start}::date
      AND date <= ${input.end}::date
      AND query <> ''
    GROUP BY query, page
  `) as Array<{
    query: string;
    page: string;
    is_brand: boolean;
    impressions: number;
    clicks: number;
    ctr: number;
    position: number;
  }>;

  const prior = (await sql`
    SELECT
      query,
      page,
      COALESCE(SUM(impressions), 0)::float AS impressions,
      COALESCE(SUM(clicks), 0)::float AS clicks
    FROM search_console_daily
    WHERE date >= ${input.priorStart}::date
      AND date <= ${input.priorEnd}::date
      AND query <> ''
    GROUP BY query, page
  `) as Array<{
    query: string;
    page: string;
    impressions: number;
    clicks: number;
  }>;

  const priorMap = new Map(
    prior.map((p) => [`${p.query}\0${p.page}`, p] as const)
  );

  return current.map((c) => {
    const p = priorMap.get(`${c.query}\0${c.page}`);
    return {
      query: c.query,
      page: c.page,
      isBrand: Boolean(c.is_brand),
      impressions: Number(c.impressions),
      clicks: Number(c.clicks),
      ctr: Number(c.ctr),
      position: Number(c.position),
      priorImpressions: p ? Number(p.impressions) : 0,
      priorClicks: p ? Number(p.clicks) : 0,
    };
  });
}

/**
 * Scan Search Console aggregates and upsert durable opportunities.
 * Never auto-publishes content.
 */
export async function runAuthorityOpportunityScan(options?: {
  asOf?: Date;
}): Promise<{
  ok: boolean;
  detected: number;
  inserted: number;
  refreshed: number;
  message: string;
}> {
  await ensureAuthoritySchema();
  await ensureExternalMetricsSchema();

  const asOf = options?.asOf ?? new Date();
  const end = addDays(
    new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate())),
    -1
  );
  const start28 = addDays(end, -27);
  const priorEnd = addDays(start28, -1);
  const priorStart = addDays(priorEnd, -27);

  const stats = await loadQueryPeriodStats({
    start: ymd(start28),
    end: ymd(end),
    priorStart: ymd(priorStart),
    priorEnd: ymd(priorEnd),
  });

  if (stats.length === 0) {
    return {
      ok: true,
      detected: 0,
      inserted: 0,
      refreshed: 0,
      message: "Insufficient SEO evidence for new action.",
    };
  }

  const detected = detectAuthorityOpportunities(stats);

  // Attach conservative internal-link opportunities for known guide pairs
  // when both pages appear in inventory (recommendation only).
  for (const page of getKnownSitePages().filter((p) => p.kind === "guide")) {
    const links = recommendInternalLinks(page.path);
    for (const link of links) {
      if (link.from !== page.path) continue;
      detected.push({
        type: "INTERNAL_LINK_OPPORTUNITY",
        opportunityKey: `INTERNAL_LINK_OPPORTUNITY|${link.from}|${link.to}`,
        primaryQuery: "",
        page: link.from,
        intent: "analytical_educational",
        riskLevel: "LOW",
        priorityScore: 22,
        evidence: {
          from: link.from,
          to: link.to,
          reason: link.reason,
          note: "Recommendation only — does not edit production pages",
        },
        existingPagePath: link.from,
        recommendAction: "internal_link",
      });
    }
  }

  const { inserted, refreshed } = await upsertAuthorityOpportunities(detected);
  return {
    ok: true,
    detected: detected.length,
    inserted,
    refreshed,
    message:
      detected.length === 0
        ? "Insufficient SEO evidence for new action."
        : `Detected ${detected.length} opportunity signal(s).`,
  };
}
