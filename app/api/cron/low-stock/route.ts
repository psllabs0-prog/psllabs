import { NextResponse } from "next/server";

import { verifyCronRequest } from "@/lib/cron/auth";
import { runInventoryMonitor } from "@/lib/inventory/monitor/run";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Compatibility wrapper: inventory monitor owns absolute low-stock + review alerts.
 * Prefer `/api/cron/inventory-monitor` (the scheduled job).
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
      compatibility: "delegates-to-inventory-monitor",
      asOf: summary.asOf,
      alertsSent: summary.alertsSent,
      alertsFailed: summary.alertsFailed,
      sheetsFailed: summary.sheets.failed,
    });
  } catch (error) {
    console.error("[cron/low-stock] (compat) job error:", error);
    return NextResponse.json({ error: "Job failed" }, { status: 500 });
  }
}
