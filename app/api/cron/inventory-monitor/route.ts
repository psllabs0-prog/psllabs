import { NextResponse } from "next/server";

import { verifyCronRequest } from "@/lib/cron/auth";
import { runInventoryMonitor } from "@/lib/inventory/monitor/run";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Daily inventory monitor (replaces competing low-stock-only cron).
 * Schedule: vercel.json `0 15 * * *`
 */
export async function GET(request: Request) {
  const authError = verifyCronRequest(request);
  if (authError) return authError;

  try {
    const summary = await runInventoryMonitor({
      sendAlerts: true,
      syncSheets: true,
    });
    return NextResponse.json({
      ok: true,
      asOf: summary.asOf,
      skuCount: summary.skuCount,
      snapshotsWritten: summary.snapshotsWritten,
      alertsSent: summary.alertsSent,
      alertsFailed: summary.alertsFailed,
      alertsResolved: summary.alertsResolved,
      sheets: {
        synced: summary.sheets.synced,
        failed: summary.sheets.failed,
        error: summary.sheets.error ?? null,
      },
      statuses: summary.metrics.map((m) => ({
        sku: m.sku,
        status: m.monitorStatus,
        sellable: m.sellableStock,
      })),
    });
  } catch (error) {
    console.error("[cron/inventory-monitor]", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Inventory monitor failed",
      },
      { status: 500 }
    );
  }
}
