import { NextResponse } from "next/server";

import { verifyCronRequest } from "@/lib/cron/auth";
import { runWeeklyCeoBriefJob } from "@/lib/ceo-brief/run";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Weekly CEO brief — Monday 15:00 UTC (Hobby-compatible). */
export async function GET(request: Request) {
  const authError = verifyCronRequest(request);
  if (authError) return authError;

  try {
    const summary = await runWeeklyCeoBriefJob();
    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    console.error("[cron/weekly-ceo-brief]", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "CEO brief failed",
      },
      { status: 500 }
    );
  }
}
