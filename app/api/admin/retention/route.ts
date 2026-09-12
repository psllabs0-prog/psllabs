import { NextResponse } from "next/server";

import { requireAdminAuth } from "@/lib/admin/require-auth";
import { getRetentionReadiness } from "@/lib/retention/config";
import { buildRetention30dEmail } from "@/lib/retention/email";
import { runRetention30dJob } from "@/lib/retention/run";
import { ensureRetentionSchema } from "@/lib/retention/schema";
import {
  addMarketingSuppression,
  countRetentionStats,
  getLatestRetentionJobRun,
  listRetentionCandidates,
  setMarketingEligible,
} from "@/lib/retention/store";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  const authError = await requireAdminAuth();
  if (authError) return authError;

  try {
    await ensureRetentionSchema();
    const [stats, lastJob, candidates, readiness] = await Promise.all([
      countRetentionStats(),
      getLatestRetentionJobRun(),
      listRetentionCandidates(20),
      Promise.resolve(getRetentionReadiness()),
    ]);

    return NextResponse.json({
      readiness,
      stats,
      lastJob,
      nextCandidates: candidates.map((c) => ({
        orderId: c.orderId,
        email: c.email.replace(/(^.).*(@.*$)/, "$1***$2"),
        paidAt: c.paidAt,
      })),
      preview: buildRetention30dEmail({ email: "preview@example.com" }),
    });
  } catch (error) {
    console.error("[admin/retention] GET", error);
    return NextResponse.json(
      { error: "Unable to load retention status." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const authError = await requireAdminAuth();
  if (authError) return authError;

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const action = typeof body.action === "string" ? body.action : "";

  try {
    if (action === "run_job") {
      const result = await runRetention30dJob();
      return NextResponse.json({ ok: true, result });
    }

    if (action === "suppress") {
      const email = typeof body.email === "string" ? body.email.trim() : "";
      if (!email.includes("@")) {
        return NextResponse.json({ error: "Valid email required" }, { status: 400 });
      }
      await addMarketingSuppression({
        email,
        reason: "manual",
        source: "admin",
      });
      return NextResponse.json({ ok: true });
    }

    if (action === "set_eligible") {
      const email = typeof body.email === "string" ? body.email.trim() : "";
      const eligible = body.eligible === true;
      if (!email.includes("@")) {
        return NextResponse.json({ error: "Valid email required" }, { status: 400 });
      }
      const pref = await setMarketingEligible({
        email,
        eligible,
        source: "admin_explicit",
      });
      return NextResponse.json({ ok: true, preference: pref });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("[admin/retention] POST", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Action failed",
      },
      { status: 500 }
    );
  }
}
