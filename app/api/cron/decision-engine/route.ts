import { NextResponse } from "next/server";

import { verifyCronRequest } from "@/lib/cron/auth";
import { runDecisionEngine } from "@/lib/decision-engine/run";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Daily decision engine — after major operational/data jobs (17:00 UTC). */
export async function GET(request: Request) {
  const authError = verifyCronRequest(request);
  if (authError) return authError;

  try {
    const result = await runDecisionEngine({ sendDigest: true });
    if (!result.ok) {
      return NextResponse.json(result, { status: 500 });
    }
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error("[cron/decision-engine]", error);
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Decision engine cron failed",
      },
      { status: 500 }
    );
  }
}
