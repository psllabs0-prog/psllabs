import { NextResponse } from "next/server";

import { requireAdminAuth } from "@/lib/admin/require-auth";
import { handleMissionControlGet } from "@/lib/ops/mission-control/api";

export const runtime = "nodejs";
export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const authError = await requireAdminAuth();
  if (authError) return authError;

  try {
    const { status, body } = await handleMissionControlGet({
      url: new URL(request.url),
      headers: request.headers,
    });
    return NextResponse.json(body, { status, headers: NO_STORE });
  } catch (error) {
    console.error("[admin/ops/mission-control] GET", error);
    return NextResponse.json(
      { error: "Unable to load Mission Control." },
      { status: 500, headers: NO_STORE }
    );
  }
}
