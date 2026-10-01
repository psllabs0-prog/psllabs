import { NextResponse } from "next/server";

import { verifyCronRequest } from "@/lib/cron/auth";
import { runNewsletterWelcomeJob } from "@/lib/newsletter/run";
import { newsletterContext } from "@/lib/newsletter/service";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Daily welcome-step sweep — 18:00 UTC. No-op while the journey is off. */
export async function GET(request: Request) {
  const authError = verifyCronRequest(request);
  if (authError) return authError;

  try {
    const summary = await runNewsletterWelcomeJob(newsletterContext());
    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    console.error("[cron/newsletter-welcome]", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ ok: false, error: "Newsletter welcome run failed" }, { status: 500 });
  }
}
