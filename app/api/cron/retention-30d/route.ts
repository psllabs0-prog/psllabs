import { NextResponse } from "next/server";

import { verifyCronRequest } from "@/lib/cron/auth";
import { runRetention30dJob } from "@/lib/retention/run";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Daily post-purchase retention — 12:00 UTC. */
export async function GET(request: Request) {
  const authError = verifyCronRequest(request);
  if (authError) return authError;

  try {
    const summary = await runRetention30dJob();
    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    console.error("[cron/retention-30d]", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Retention job failed",
      },
      { status: 500 }
    );
  }
}
