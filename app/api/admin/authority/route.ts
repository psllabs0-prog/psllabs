import { NextResponse } from "next/server";

import { requireAdminAuth } from "@/lib/admin/require-auth";
import {
  authorityAdminAction,
  buildAuthorityDashboard,
} from "@/lib/authority/dashboard";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  const authError = await requireAdminAuth();
  if (authError) return authError;

  try {
    const dashboard = await buildAuthorityDashboard();
    return NextResponse.json(dashboard);
  } catch (error) {
    console.error("[admin/authority] GET", error);
    return NextResponse.json(
      { error: "Unable to load authority dashboard." },
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
  const opportunityId =
    typeof body.opportunityId === "number"
      ? body.opportunityId
      : typeof body.opportunityId === "string"
        ? Number(body.opportunityId)
        : undefined;
  const briefId =
    typeof body.briefId === "number"
      ? body.briefId
      : typeof body.briefId === "string"
        ? Number(body.briefId)
        : undefined;

  try {
    const result = await authorityAdminAction({
      action,
      opportunityId: Number.isFinite(opportunityId) ? opportunityId : undefined,
      briefId: Number.isFinite(briefId) ? briefId : undefined,
    });
    if (result.ok === false) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error("[admin/authority] POST", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Action failed",
      },
      { status: 500 }
    );
  }
}
