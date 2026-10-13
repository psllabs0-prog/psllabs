import { NextResponse } from "next/server";

import { requireAdminAuth } from "@/lib/admin/require-auth";
import { getRetentionReadiness } from "@/lib/retention/config";
import { buildRetention30dEmail, verifyRetentionEmailTransport } from "@/lib/retention/email";
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

const TRANSPORT_CHECK_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TRANSPORT_CHECK_CATEGORIES = new Set([
  "config", "auth", "connection", "temporary", "message_build", "timeout_ambiguous",
  "rejected_recipient", "rejected_sender", "rejected_message", "unknown", "verification_error",
]);

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
    if (!body || typeof body !== "object" || Array.isArray(body)) body = {};
  } catch {
    body = {};
  }

  const action = typeof body.action === "string" ? body.action : "";

  try {
    if (action === "verify_transport") {
      if (body.checkId !== undefined && (typeof body.checkId !== "string" || !TRANSPORT_CHECK_ID.test(body.checkId))) {
        return NextResponse.json({ ok: false, error: "checkId must be a valid UUID.", messagesSent: 0 },
          { status: 400, headers: { "Cache-Control": "no-store" } });
      }
      const checkId = typeof body.checkId === "string" ? body.checkId.toLowerCase() : null;
      let checked: Awaited<ReturnType<typeof verifyRetentionEmailTransport>>;
      try { checked = await verifyRetentionEmailTransport(); }
      catch { checked = { verified: false, category: "verification_error" }; }
      const result = { verified: checked.verified === true, category: checked.category === null ? null :
        TRANSPORT_CHECK_CATEGORIES.has(checked.category) ? checked.category : "unknown" };
      // Exactly these safe fields are logged. Never log request bodies, SMTP
      // responses/errors, server names, addresses, usernames, or credentials.
      console.info(JSON.stringify({ event: "retention_transport_verification", checkId,
        verified: result.verified, category: result.category, messagesSent: 0 }));
      return NextResponse.json({ ok: result.verified, result, messagesSent: 0,
        ...(checkId ? { checkId } : {}) },
      { status: result.verified ? 200 : 503, headers: { "Cache-Control": "no-store" } });
    }
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
      if (pref.blockedByUnsubscribe) {
        return NextResponse.json({
          ok: false,
          error:
            "This address unsubscribed. Eligibility toggle cannot clear unsubscribe; distinct re-consent required later.",
          preference: pref,
        });
      }
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
