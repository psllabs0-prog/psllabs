import { NextResponse } from "next/server";

import { verifyCronRequest } from "@/lib/cron/auth";
import { syncPaidAcquisition } from "@/lib/external-metrics/paid/sync";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Daily paid acquisition sync — 11:00 UTC (before retention/GSC). */
export async function GET(request: Request) {
  const authError = verifyCronRequest(request);
  if (authError) return authError;

  try {
    const result = await syncPaidAcquisition();
    return NextResponse.json({
      ok: result.ok,
      providers: result.providers,
    });
  } catch (error) {
    console.error("[cron/paid-acquisition-sync]", error);
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Paid acquisition sync failed",
      },
      { status: 500 }
    );
  }
}
