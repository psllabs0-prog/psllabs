import {
  finishExternalMetricSyncRun,
  startExternalMetricSyncRun,
  upsertPaidAcquisitionDailyRows,
  type PaidAcquisitionDailyRow,
} from "@/lib/external-metrics/store";

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d.getTime());
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

type TikTokReportRow = {
  dimensions?: Record<string, string>;
  metrics?: Record<string, string>;
};

/**
 * Read-only TikTok Ads reporting sync into paid_acquisition_daily.
 * Never mutates campaigns/budgets.
 */
export async function syncTikTokAdsDaily(options?: {
  asOf?: Date;
  lookbackDays?: number;
}): Promise<{
  ok: boolean;
  status: "ok" | "error" | "not_configured";
  recordsWritten: number;
  errorSummary?: string;
}> {
  const token = process.env.TIKTOK_ADS_ACCESS_TOKEN?.trim();
  const advertiserId = process.env.TIKTOK_ADS_ADVERTISER_ID?.trim();
  if (!token || !advertiserId) {
    return {
      ok: false,
      status: "not_configured",
      recordsWritten: 0,
      errorSummary: "TikTok Ads credentials not configured.",
    };
  }

  const runId = await startExternalMetricSyncRun("tiktok_ads");
  const asOf = options?.asOf ?? new Date();
  const lookback = Math.min(Math.max(options?.lookbackDays ?? 28, 1), 90);
  const until = addDays(
    new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate())),
    -1
  );
  const since = addDays(until, -(lookback - 1));

  try {
    const rows: PaidAcquisitionDailyRow[] = [];
    let page = 1;
    const pageSize = 200;

    for (;;) {
      const url =
        "https://business-api.tiktok.com/open_api/v1.3/report/integrated/get/?" +
        new URLSearchParams({
          advertiser_id: advertiserId,
          report_type: "BASIC",
          data_level: "AUCTION_AD",
          dimensions: JSON.stringify([
            "stat_time_day",
            "campaign_id",
            "adgroup_id",
            "ad_id",
          ]),
          metrics: JSON.stringify([
            "campaign_name",
            "adgroup_name",
            "ad_name",
            "spend",
            "impressions",
            "clicks",
            "conversion",
            "total_purchase_value",
          ]),
          start_date: ymd(since),
          end_date: ymd(until),
          page: String(page),
          page_size: String(pageSize),
        }).toString();

      const res = await fetch(url, {
        method: "GET",
        headers: { "Access-Token": token },
      });
      const text = await res.text();
      if (!res.ok) {
        throw new Error(
          `TikTok report failed (${res.status}): ${text.slice(0, 300)}`
        );
      }
      const parsed = JSON.parse(text) as {
        code?: number;
        message?: string;
        data?: {
          list?: TikTokReportRow[];
          page_info?: { total_page?: number };
        };
      };
      if (parsed.code !== 0) {
        throw new Error(
          `TikTok report error: ${parsed.message ?? "unknown"} (${parsed.code})`
        );
      }

      const list = parsed.data?.list ?? [];
      for (const item of list) {
        const dim = item.dimensions ?? {};
        const met = item.metrics ?? {};
        const dayRaw = dim.stat_time_day ?? "";
        const date = dayRaw.slice(0, 10);
        const campaignId = dim.campaign_id ?? "";
        if (!date || !campaignId) continue;
        rows.push({
          date,
          platform: "tiktok",
          accountId: advertiserId,
          campaignId: String(campaignId),
          campaignName: met.campaign_name ?? "",
          adsetId: dim.adgroup_id ? String(dim.adgroup_id) : null,
          adsetName: met.adgroup_name ?? null,
          adId: dim.ad_id ? String(dim.ad_id) : null,
          adName: met.ad_name ?? null,
          spendUsd: Number(met.spend ?? 0),
          impressions: Number(met.impressions ?? 0),
          clicks: Number(met.clicks ?? 0),
          platformPurchases:
            met.conversion != null ? Number(met.conversion) : null,
          platformPurchaseValueUsd:
            met.total_purchase_value != null
              ? Number(met.total_purchase_value)
              : null,
        });
      }

      const totalPage = parsed.data?.page_info?.total_page ?? 1;
      if (page >= totalPage || list.length === 0) break;
      page += 1;
      if (page > 50) break;
    }

    const written = await upsertPaidAcquisitionDailyRows(rows);
    await finishExternalMetricSyncRun({
      id: runId,
      status: "ok",
      recordsReceived: rows.length,
      recordsWritten: written,
    });
    return { ok: true, status: "ok", recordsWritten: written };
  } catch (error) {
    const msg =
      error instanceof Error ? error.message.slice(0, 500) : "TikTok sync failed";
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
    };
  }
}
