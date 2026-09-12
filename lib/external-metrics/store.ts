import { getSql } from "@/lib/db/sql";

import { ensureExternalMetricsSchema } from "./schema";

export type ExternalMetricProvider =
  | "search_console"
  | "meta_ads"
  | "tiktok_ads";

export type SyncRunStatus = "running" | "ok" | "error" | "not_configured";

export type ExternalMetricSyncRun = {
  id: number;
  provider: string;
  startedAt: string;
  completedAt: string | null;
  status: SyncRunStatus;
  recordsReceived: number;
  recordsWritten: number;
  errorSummary: string | null;
  createdAt: string;
};

export type SearchConsoleDailyRow = {
  date: string;
  property: string;
  page: string;
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  isBrand: boolean;
};

function mapRun(row: Record<string, unknown>): ExternalMetricSyncRun {
  return {
    id: Number(row.id),
    provider: String(row.provider),
    startedAt: new Date(String(row.started_at)).toISOString(),
    completedAt: row.completed_at
      ? new Date(String(row.completed_at)).toISOString()
      : null,
    status: row.status as SyncRunStatus,
    recordsReceived: Number(row.records_received ?? 0),
    recordsWritten: Number(row.records_written ?? 0),
    errorSummary: row.error_summary ? String(row.error_summary) : null,
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}

export async function startExternalMetricSyncRun(
  provider: ExternalMetricProvider
): Promise<number> {
  await ensureExternalMetricsSchema();
  const sql = getSql();
  const rows = (await sql`
    INSERT INTO external_metric_sync_runs (provider, status)
    VALUES (${provider}, 'running')
    RETURNING id
  `) as Array<{ id: number | string }>;
  return Number(rows[0].id);
}

export async function finishExternalMetricSyncRun(input: {
  id: number;
  status: SyncRunStatus;
  recordsReceived?: number;
  recordsWritten?: number;
  errorSummary?: string | null;
}): Promise<void> {
  await ensureExternalMetricsSchema();
  const sql = getSql();
  await sql`
    UPDATE external_metric_sync_runs
    SET
      completed_at = now(),
      status = ${input.status},
      records_received = ${input.recordsReceived ?? 0},
      records_written = ${input.recordsWritten ?? 0},
      error_summary = ${input.errorSummary ?? null}
    WHERE id = ${input.id}
  `;
}

export async function getLatestExternalMetricSyncRun(
  provider: ExternalMetricProvider
): Promise<ExternalMetricSyncRun | null> {
  await ensureExternalMetricsSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT * FROM external_metric_sync_runs
    WHERE provider = ${provider}
    ORDER BY started_at DESC
    LIMIT 1
  `) as Record<string, unknown>[];
  return rows[0] ? mapRun(rows[0]) : null;
}

export async function getLatestSuccessfulExternalMetricSyncRun(
  provider: ExternalMetricProvider
): Promise<ExternalMetricSyncRun | null> {
  await ensureExternalMetricsSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT * FROM external_metric_sync_runs
    WHERE provider = ${provider}
      AND status = 'ok'
    ORDER BY started_at DESC
    LIMIT 1
  `) as Record<string, unknown>[];
  return rows[0] ? mapRun(rows[0]) : null;
}

/** Upsert Search Console daily rows (idempotent). */
export async function upsertSearchConsoleDailyRows(
  rows: SearchConsoleDailyRow[]
): Promise<number> {
  if (rows.length === 0) return 0;
  await ensureExternalMetricsSchema();
  const sql = getSql();
  let written = 0;

  // Batch in small chunks to stay within Neon parameter limits.
  const chunkSize = 40;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    for (const row of chunk) {
      await sql`
        INSERT INTO search_console_daily (
          date, property, page, query, clicks, impressions, ctr, position, is_brand, synced_at
        ) VALUES (
          ${row.date}::date,
          ${row.property},
          ${row.page},
          ${row.query},
          ${row.clicks},
          ${row.impressions},
          ${row.ctr},
          ${row.position},
          ${row.isBrand},
          now()
        )
        ON CONFLICT (date, property, page, query) DO UPDATE SET
          clicks = EXCLUDED.clicks,
          impressions = EXCLUDED.impressions,
          ctr = EXCLUDED.ctr,
          position = EXCLUDED.position,
          is_brand = EXCLUDED.is_brand,
          synced_at = now()
      `;
      written += 1;
    }
  }
  return written;
}

export async function countSearchConsoleRows(): Promise<number> {
  await ensureExternalMetricsSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT COUNT(*)::int AS n FROM search_console_daily
  `) as Array<{ n: number }>;
  return Number(rows[0]?.n ?? 0);
}

export async function sumPaidAcquisitionSpendUsd(): Promise<number> {
  await ensureExternalMetricsSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT COALESCE(SUM(spend_usd), 0)::float AS total
    FROM paid_acquisition_daily
  `) as Array<{ total: number }>;
  return Number(rows[0]?.total ?? 0);
}

export type PeriodSeoTotals = {
  clicks: number;
  impressions: number;
  nonBrandClicks: number;
  nonBrandImpressions: number;
  ctr: number | null;
  averagePosition: number | null;
};

export async function aggregateSearchConsolePeriod(input: {
  startDate: string; // YYYY-MM-DD inclusive
  endDate: string; // YYYY-MM-DD inclusive
}): Promise<PeriodSeoTotals> {
  await ensureExternalMetricsSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT
      COALESCE(SUM(clicks), 0)::float AS clicks,
      COALESCE(SUM(impressions), 0)::float AS impressions,
      COALESCE(SUM(clicks) FILTER (WHERE is_brand = false), 0)::float AS nb_clicks,
      COALESCE(SUM(impressions) FILTER (WHERE is_brand = false), 0)::float AS nb_impressions,
      CASE
        WHEN COALESCE(SUM(impressions), 0) > 0
        THEN SUM(position * impressions) / SUM(impressions)
        ELSE NULL
      END AS avg_position
    FROM search_console_daily
    WHERE date >= ${input.startDate}::date
      AND date <= ${input.endDate}::date
  `) as Array<{
    clicks: number;
    impressions: number;
    nb_clicks: number;
    nb_impressions: number;
    avg_position: number | null;
  }>;

  const r = rows[0];
  const clicks = Number(r?.clicks ?? 0);
  const impressions = Number(r?.impressions ?? 0);
  return {
    clicks,
    impressions,
    nonBrandClicks: Number(r?.nb_clicks ?? 0),
    nonBrandImpressions: Number(r?.nb_impressions ?? 0),
    ctr: impressions > 0 ? clicks / impressions : null,
    averagePosition:
      r?.avg_position === null || r?.avg_position === undefined
        ? null
        : Number(r.avg_position),
  };
}

export async function topGainingSearchConsolePages(input: {
  currentStart: string;
  currentEnd: string;
  priorStart: string;
  priorEnd: string;
  minImpressions?: number;
  limit?: number;
}): Promise<string[]> {
  const minImp = input.minImpressions ?? 25;
  const limit = input.limit ?? 5;
  await ensureExternalMetricsSchema();
  const sql = getSql();
  const rows = (await sql`
    WITH cur AS (
      SELECT page, SUM(impressions)::float AS impressions, SUM(clicks)::float AS clicks
      FROM search_console_daily
      WHERE date >= ${input.currentStart}::date
        AND date <= ${input.currentEnd}::date
        AND page <> ''
      GROUP BY page
    ),
    prior AS (
      SELECT page, SUM(impressions)::float AS impressions, SUM(clicks)::float AS clicks
      FROM search_console_daily
      WHERE date >= ${input.priorStart}::date
        AND date <= ${input.priorEnd}::date
        AND page <> ''
      GROUP BY page
    )
    SELECT
      c.page,
      c.impressions - COALESCE(p.impressions, 0) AS delta_imp
    FROM cur c
    LEFT JOIN prior p ON p.page = c.page
    WHERE c.impressions >= ${minImp}
      AND (c.impressions - COALESCE(p.impressions, 0)) >= ${minImp}
    ORDER BY delta_imp DESC
    LIMIT ${limit}
  `) as Array<{ page: string; delta_imp: number }>;
  return rows.map((r) => r.page);
}

export async function topGainingSearchConsoleQueries(input: {
  currentStart: string;
  currentEnd: string;
  priorStart: string;
  priorEnd: string;
  minImpressions?: number;
  limit?: number;
}): Promise<string[]> {
  const minImp = input.minImpressions ?? 25;
  const limit = input.limit ?? 5;
  await ensureExternalMetricsSchema();
  const sql = getSql();
  const rows = (await sql`
    WITH cur AS (
      SELECT query, SUM(impressions)::float AS impressions, SUM(clicks)::float AS clicks
      FROM search_console_daily
      WHERE date >= ${input.currentStart}::date
        AND date <= ${input.currentEnd}::date
        AND query <> ''
        AND is_brand = false
      GROUP BY query
    ),
    prior AS (
      SELECT query, SUM(impressions)::float AS impressions, SUM(clicks)::float AS clicks
      FROM search_console_daily
      WHERE date >= ${input.priorStart}::date
        AND date <= ${input.priorEnd}::date
        AND query <> ''
        AND is_brand = false
      GROUP BY query
    )
    SELECT
      c.query,
      c.impressions - COALESCE(p.impressions, 0) AS delta_imp
    FROM cur c
    LEFT JOIN prior p ON p.query = c.query
    WHERE c.impressions >= ${minImp}
      AND (c.impressions - COALESCE(p.impressions, 0)) >= ${minImp}
    ORDER BY delta_imp DESC
    LIMIT ${limit}
  `) as Array<{ query: string; delta_imp: number }>;
  return rows.map((r) => r.query);
}
