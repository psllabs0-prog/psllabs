import { NextResponse } from "next/server";

import { requireAdminAuth } from "@/lib/admin/require-auth";
import {
  computeInventoryMonitorMetrics,
  runInventoryMonitor,
} from "@/lib/inventory/monitor/run";
import { listPipelineLots } from "@/lib/inventory/monitor/pipeline";
import { isGoogleSheetsConfigured } from "@/lib/finance/google-sheets";
import {
  DEPLETION_WATCH_PCT,
  INVENTORY_MOQ,
  PLANNING_LEAD_DAYS,
  REORDER_REVIEW_DAYS,
  RISK_LEAD_DAYS,
  TESTING_COST_HIGH_USD,
  TESTING_COST_LOW_USD,
  TESTING_TURNAROUND_DAYS,
} from "@/lib/inventory/monitor/constants";
import { LOW_STOCK_THRESHOLD } from "@/lib/inventory/constants";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  const authError = await requireAdminAuth();
  if (authError) return authError;

  try {
    const [metrics, lots] = await Promise.all([
      computeInventoryMonitorMetrics(),
      listPipelineLots({ includeReleased: true, limit: 100 }),
    ]);
    return NextResponse.json({
      metrics,
      lots,
      sheetsConfigured: isGoogleSheetsConfigured(),
      assumptions: {
        moq: INVENTORY_MOQ,
        planningLeadDays: PLANNING_LEAD_DAYS,
        riskLeadDays: RISK_LEAD_DAYS,
        testingTurnaroundDays: TESTING_TURNAROUND_DAYS,
        testingCostLowUsd: TESTING_COST_LOW_USD,
        testingCostHighUsd: TESTING_COST_HIGH_USD,
        reorderReviewDays: REORDER_REVIEW_DAYS,
        depletionWatchPct: DEPLETION_WATCH_PCT,
        absoluteLowThreshold: LOW_STOCK_THRESHOLD,
      },
    });
  } catch (error) {
    console.error("[admin/inventory/monitor] GET", error);
    return NextResponse.json(
      { error: "Unable to load inventory monitor." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const authError = await requireAdminAuth();
  if (authError) return authError;

  let body: { action?: unknown; sendAlerts?: unknown; syncSheets?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.action !== "run") {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  try {
    const summary = await runInventoryMonitor({
      sendAlerts: body.sendAlerts !== false,
      syncSheets: body.syncSheets !== false,
    });
    return NextResponse.json({
      ok: true,
      asOf: summary.asOf,
      skuCount: summary.skuCount,
      snapshotsWritten: summary.snapshotsWritten,
      alertsSent: summary.alertsSent,
      alertsFailed: summary.alertsFailed,
      sheets: summary.sheets,
      metrics: summary.metrics,
    });
  } catch (error) {
    console.error("[admin/inventory/monitor] POST", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Monitor run failed",
      },
      { status: 500 }
    );
  }
}
