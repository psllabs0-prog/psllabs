import {
  finishExternalMetricSyncRun,
  startExternalMetricSyncRun,
  upsertPaidAcquisitionDailyRows,
  type PaidAcquisitionDailyRow,
} from "@/lib/external-metrics/store";
import {
  buildMetaInsightsUrl,
  resolveMetaMarketingApiVersion,
} from "./meta-api-version";

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d.getTime());
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

function normalizeAccountId(raw: string): string {
  const t = raw.trim();
  return t.startsWith("act_") ? t.slice(4) : t;
}

type MetaInsightRow = {
  date_start?: string;
  campaign_id?: string;
  campaign_name?: string;
  adset_id?: string;
  adset_name?: string;
  ad_id?: string;
  ad_name?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  actions?: Array<{ action_type?: string; value?: string }>;
  action_values?: Array<{ action_type?: string; value?: string }>;
};

function extractPurchase(actions?: Array<{ action_type?: string; value?: string }>) {
  if (!actions) return null;
  const hit = actions.find(
    (a) =>
      a.action_type === "purchase" ||
      a.action_type === "omni_purchase" ||
      a.action_type === "offsite_conversion.fb_pixel_purchase"
  );
  return hit?.value != null ? Number(hit.value) : null;
}

/**
 * Read-only Meta Ads Insights sync into paid_acquisition_daily.
 * Never mutates campaigns/budgets.
 */
export async function syncMetaAdsDaily(options?: {
  asOf?: Date;
  lookbackDays?: number;
}): Promise<{
  ok: boolean;
  status: "ok" | "error" | "not_configured";
  recordsWritten: number;
  errorSummary?: string;
  apiVersion?: string;
}> {
  const token = process.env.META_ADS_ACCESS_TOKEN?.trim();
  const accountRaw = process.env.META_ADS_ACCOUNT_ID?.trim();
  if (!token || !accountRaw) {
    return {
      ok: false,
      status: "not_configured",
      recordsWritten: 0,
      errorSummary: "Meta Ads credentials not configured.",
    };
  }

  const apiVersion = resolveMetaMarketingApiVersion();
  const accountId = normalizeAccountId(accountRaw);
  const runId = await startExternalMetricSyncRun("meta_ads");
  const asOf = options?.asOf ?? new Date();
  const lookback = Math.min(Math.max(options?.lookbackDays ?? 28, 1), 90);
  const until = addDays(
    new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate())),
    -1
  );
  const since = addDays(until, -(lookback - 1));

  try {
    const rows: PaidAcquisitionDailyRow[] = [];
    const query = new URLSearchParams({
      level: "ad",
      fields:
        "campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,impressions,clicks,actions,action_values,date_start",
      time_increment: "1",
      time_range: JSON.stringify({
        since: ymd(since),
        until: ymd(until),
      }),
      limit: "500",
      access_token: token,
    }).toString();

    let nextUrl: string | null = buildMetaInsightsUrl({
      version: apiVersion.version,
      accountId,
      query,
    });

    let pages = 0;
    while (nextUrl && pages < 20) {
      pages += 1;
      const res = await fetch(nextUrl);
      const text = await res.text();
      if (!res.ok) {
        throw new Error(
          `Meta Insights failed (${res.status}): ${text.slice(0, 300)}`
        );
      }
      const data = JSON.parse(text) as {
        data?: MetaInsightRow[];
        paging?: { next?: string };
      };
      for (const r of data.data ?? []) {
        if (!r.date_start || !r.campaign_id) continue;
        rows.push({
          date: r.date_start,
          platform: "meta",
          accountId,
          campaignId: String(r.campaign_id),
          campaignName: r.campaign_name ?? "",
          adsetId: r.adset_id ? String(r.adset_id) : null,
          adsetName: r.adset_name ?? null,
          adId: r.ad_id ? String(r.ad_id) : null,
          adName: r.ad_name ?? null,
          spendUsd: Number(r.spend ?? 0),
          impressions: Number(r.impressions ?? 0),
          clicks: Number(r.clicks ?? 0),
          platformPurchases: extractPurchase(r.actions),
          platformPurchaseValueUsd: extractPurchase(r.action_values),
          platformConversions: null,
          platformConversionValueUsd: null,
        });
      }
      // Paging next is Graph-provided absolute URL — accept only graph.facebook.com.
      const pagingNext = data.paging?.next ?? null;
      if (
        pagingNext &&
        pagingNext.startsWith("https://graph.facebook.com/")
      ) {
        nextUrl = pagingNext;
      } else {
        nextUrl = null;
      }
    }

    const written = await upsertPaidAcquisitionDailyRows(rows);
    await finishExternalMetricSyncRun({
      id: runId,
      status: "ok",
      recordsReceived: rows.length,
      recordsWritten: written,
    });
    return {
      ok: true,
      status: "ok",
      recordsWritten: written,
      apiVersion: apiVersion.version,
    };
  } catch (error) {
    const msg =
      error instanceof Error ? error.message.slice(0, 500) : "Meta sync failed";
    const safe = msg.replace(token, "[redacted]");
    await finishExternalMetricSyncRun({
      id: runId,
      status: "error",
      errorSummary: safe,
    });
    return {
      ok: false,
      status: "error",
      recordsWritten: 0,
      errorSummary: safe,
      apiVersion: apiVersion.version,
    };
  }
}
