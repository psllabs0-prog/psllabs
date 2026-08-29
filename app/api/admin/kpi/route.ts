import { NextResponse } from "next/server";

import { requireAdminAuth } from "@/lib/admin/require-auth";
import { getLedgerKpi } from "@/lib/ledger/store";

export const runtime = "nodejs";

export async function GET() {
  const authError = await requireAdminAuth();
  if (authError) return authError;

  try {
    const kpi = await getLedgerKpi();
    return NextResponse.json(kpi);
  } catch (error) {
    console.error("[admin/kpi]", error);
    return NextResponse.json(
      { error: "Unable to load KPI data." },
      { status: 500 }
    );
  }
}
