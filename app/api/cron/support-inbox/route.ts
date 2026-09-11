import { NextResponse } from "next/server";

import { verifyCronRequest } from "@/lib/cron/auth";
import { runSupportInboxJob } from "@/lib/support/process";
import { isSupportAutoSendEnabled } from "@/lib/support/constants";
import { isSupportImapConfigured } from "@/lib/support/imap";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Daily support inbox poll (vercel.json). Hobby-safe — no persistent IMAP. */
export async function GET(request: Request) {
  const authError = verifyCronRequest(request);
  if (authError) return authError;

  try {
    const summary = await runSupportInboxJob();
    return NextResponse.json({
      ok: summary.failed === 0,
      autoSendEnabled: isSupportAutoSendEnabled(),
      imapConfigured: isSupportImapConfigured(),
      summary,
    });
  } catch (error) {
    console.error("[cron/support-inbox]", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Support inbox job failed",
      },
      { status: 500 }
    );
  }
}
