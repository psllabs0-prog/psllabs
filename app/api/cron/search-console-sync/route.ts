import { NextResponse } from "next/server";

import { verifyCronRequest } from "@/lib/cron/auth";
import { syncSearchConsoleDaily } from "@/lib/external-metrics/search-console";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Daily Search Console sync — 13:00 UTC (before inventory/finance/support). */
export async function GET(request: Request) {
  const authError = verifyCronRequest(request);
  if (authError) return authError;

  try {
    const result = await syncSearchConsoleDaily();
    return NextResponse.json({
      ok: result.ok,
      status: result.status,
      recordsReceived: result.recordsReceived,
      recordsWritten: result.recordsWritten,
      errorSummary: result.errorSummary ?? null,
    });
  } catch (error) {
    console.error("[cron/search-console-sync]", error);
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "Search Console sync failed",
      },
      { status: 500 }
    );
  }
}
