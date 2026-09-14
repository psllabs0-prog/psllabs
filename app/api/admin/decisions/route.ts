import { NextResponse } from "next/server";

import { requireAdminAuth } from "@/lib/admin/require-auth";
import {
  acknowledgeDecisionSignal,
  buildDecisionDashboard,
  dismissDecisionSignal,
  markDecisionSignalResolved,
  runDecisionEngine,
} from "@/lib/decision-engine";
import { ensureDecisionEngineSchema } from "@/lib/decision-engine/schema";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  const authError = await requireAdminAuth();
  if (authError) return authError;

  try {
    await ensureDecisionEngineSchema();
    const dashboard = await buildDecisionDashboard();
    return NextResponse.json(dashboard);
  } catch (error) {
    console.error("[admin/decisions] GET", error);
    return NextResponse.json(
      { error: "Unable to load decision engine." },
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
  const signalKey =
    typeof body.signalKey === "string" ? body.signalKey : "";

  try {
    if (action === "run") {
      // Manual run: never send digest / never execute business actions
      const result = await runDecisionEngine({ sendDigest: false });
      return NextResponse.json({ ok: result.ok, result });
    }
    if (action === "acknowledge") {
      if (!signalKey) {
        return NextResponse.json({ error: "signalKey required" }, { status: 400 });
      }
      const ok = await acknowledgeDecisionSignal(signalKey);
      return NextResponse.json({ ok });
    }
    if (action === "dismiss") {
      if (!signalKey) {
        return NextResponse.json({ error: "signalKey required" }, { status: 400 });
      }
      const ok = await dismissDecisionSignal(signalKey);
      return NextResponse.json({ ok });
    }
    if (action === "resolve") {
      if (!signalKey) {
        return NextResponse.json({ error: "signalKey required" }, { status: 400 });
      }
      const ok = await markDecisionSignalResolved(signalKey);
      return NextResponse.json({ ok });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("[admin/decisions] POST", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Action failed",
      },
      { status: 500 }
    );
  }
}
