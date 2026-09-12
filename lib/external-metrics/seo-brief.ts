import type { BriefPeriod } from "@/lib/ceo-brief/period";
import type { CeoSeoSnapshot } from "@/lib/ceo-brief/types";
import { formatPctChange } from "@/lib/ceo-brief/period";

import {
  aggregateSearchConsolePeriod,
  countSearchConsoleRows,
  getLatestExternalMetricSyncRun,
  getLatestSuccessfulExternalMetricSyncRun,
  topGainingSearchConsolePages,
  topGainingSearchConsoleQueries,
} from "./store";
import { getSearchConsoleConnectorStatus } from "./search-console";

/** Minimum impressions before a page/query gain is considered meaningful. */
export const SEO_MIN_IMPRESSIONS_FOR_SIGNAL = 25;

/** Minimum non-brand clicks in a week before SEO Luke actions are eligible. */
export const SEO_MIN_NONBRAND_CLICKS_FOR_ACTION = 50;

export async function collectSeoSnapshotFromStore(
  period: BriefPeriod,
  prior: BriefPeriod
): Promise<CeoSeoSnapshot> {
  const rowCount = await countSearchConsoleRows().catch(() => 0);
  const lastRun = await getLatestExternalMetricSyncRun("search_console").catch(
    () => null
  );
  const lastOk = await getLatestSuccessfulExternalMetricSyncRun(
    "search_console"
  ).catch(() => null);

  const connector = getSearchConsoleConnectorStatus({
    lastError: lastRun?.status === "error" ? lastRun.errorSummary : null,
    hasRows: rowCount > 0,
  });

  if (rowCount === 0) {
    return {
      status: "pending",
      message:
        connector.status === "error"
          ? `External SEO data pending sync. ${connector.message}`
          : connector.status === "not_configured"
            ? "External SEO data pending sync."
            : "External SEO data pending sync. Run Search Console sync from /admin-data after granting SA access.",
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
  }

  const current = await aggregateSearchConsolePeriod({
    startDate: period.labelStart,
    endDate: period.labelEnd,
  });
  const previous = await aggregateSearchConsolePeriod({
    startDate: prior.labelStart,
    endDate: prior.labelEnd,
  });

  const pagesGaining = await topGainingSearchConsolePages({
    currentStart: period.labelStart,
    currentEnd: period.labelEnd,
    priorStart: prior.labelStart,
    priorEnd: prior.labelEnd,
    minImpressions: SEO_MIN_IMPRESSIONS_FOR_SIGNAL,
  });
  const queryChanges = await topGainingSearchConsoleQueries({
    currentStart: period.labelStart,
    currentEnd: period.labelEnd,
    priorStart: prior.labelStart,
    priorEnd: prior.labelEnd,
    minImpressions: SEO_MIN_IMPRESSIONS_FOR_SIGNAL,
  });

  const insufficient =
    current.impressions < SEO_MIN_IMPRESSIONS_FOR_SIGNAL &&
    previous.impressions < SEO_MIN_IMPRESSIONS_FOR_SIGNAL;

  const materialOpportunity =
    current.nonBrandClicks >= SEO_MIN_NONBRAND_CLICKS_FOR_ACTION &&
    (pagesGaining.length > 0 || queryChanges.length > 0);

  return {
    status: "available",
    message: insufficient
      ? "Search Console connected, but weekly volume is too low for reliable comparison."
      : lastOk
        ? `Search Console data through last successful sync ${lastOk.completedAt ?? lastOk.startedAt}.`
        : "Search Console rows present in Neon.",
    clicks: current.clicks,
    impressions: current.impressions,
    nonBrandImpressions: current.nonBrandImpressions,
    nonBrandClicks: current.nonBrandClicks,
    ctr: current.ctr,
    averagePosition: current.averagePosition,
    priorClicks: previous.clicks,
    priorImpressions: previous.impressions,
    clicksChangeNote: formatPctChange(current.clicks, previous.clicks),
    impressionsChangeNote: formatPctChange(
      current.impressions,
      previous.impressions
    ),
    pagesGaining,
    queryChanges,
    materialOpportunity,
  };
}
