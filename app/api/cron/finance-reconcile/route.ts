import { NextResponse } from "next/server";

import { verifyCronRequest } from "@/lib/cron/auth";
import { runFinanceReconciliation } from "@/lib/finance/reconciliation";
import { flushOpenAIPurchases } from "@/lib/openai-ads/delivery";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Daily backup reconciliation (vercel.json: 30 15 * * *). Not hourly. */
export async function GET(request: Request) {
  const authError = verifyCronRequest(request);
  if (authError) return authError;

  try {
    // Reuse the existing daily schedule; the purchase queue is bounded to
    // three events and runs independently of finance-provider outages.
    const [finance, conversions] = await Promise.allSettled([
      runFinanceReconciliation(),
      flushOpenAIPurchases(),
    ]);
    // Keep both operations alive until completion even if reconciliation fails.
    if (finance.status === "rejected") throw finance.reason;
    return NextResponse.json({
      ok: true,
      summary: finance.value,
      conversions: conversions.status === "fulfilled"
        ? conversions.value
        : { configured: false, errors: 1 },
    });
  } catch (error) {
    console.error("[cron/finance-reconcile]", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Reconciliation failed",
      },
      { status: 500 }
    );
  }
}
