import { NextResponse } from "next/server";

import { requireAdminAuth } from "@/lib/admin/require-auth";
import {
  buildCustomerIntelligenceDashboard,
  customerIntelligenceAdminAction,
} from "@/lib/customer-intelligence/dashboard";
import type { CiSignalStatus } from "@/lib/customer-intelligence/taxonomy";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  const authError = await requireAdminAuth();
  if (authError) return authError;

  try {
    const dashboard = await buildCustomerIntelligenceDashboard();
    return NextResponse.json(dashboard);
  } catch (error) {
    console.error("[admin/customer-intelligence] GET", error);
    return NextResponse.json(
      { error: "Unable to load customer intelligence." },
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
  const signalId =
    typeof body.signalId === "number"
      ? body.signalId
      : typeof body.signalId === "string"
        ? Number(body.signalId)
        : undefined;

  try {
    const result = await customerIntelligenceAdminAction({
      action,
      signalId: Number.isFinite(signalId) ? signalId : undefined,
      status: body.status as CiSignalStatus | undefined,
    });
    if (result.ok === false) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error("[admin/customer-intelligence] POST", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Action failed",
      },
      { status: 500 }
    );
  }
}
