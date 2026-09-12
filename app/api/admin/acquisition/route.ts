import { NextResponse } from "next/server";

import { requireAdminAuth } from "@/lib/admin/require-auth";
import { buildAcquisitionDashboard } from "@/lib/acquisition/dashboard";
import { syncPaidAcquisition } from "@/lib/external-metrics/paid/sync";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  const authError = await requireAdminAuth();
  if (authError) return authError;

  try {
    const dashboard = await buildAcquisitionDashboard();
    return NextResponse.json(dashboard);
  } catch (error) {
    console.error("[admin/acquisition] GET", error);
    return NextResponse.json(
      { error: "Unable to load acquisition dashboard." },
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
    if (action === "sync_paid") {
      const result = await syncPaidAcquisition();
      return NextResponse.json({ ok: result.ok, result });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("[admin/acquisition] POST", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Sync failed",
      },
      { status: 500 }
    );
  }
}
