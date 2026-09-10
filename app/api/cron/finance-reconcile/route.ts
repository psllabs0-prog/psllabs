import { NextResponse } from "next/server";

import { verifyCronRequest } from "@/lib/cron/auth";
import { runFinanceReconciliation } from "@/lib/finance/reconciliation";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const authError = verifyCronRequest(request);
  if (authError) return authError;

  try {
    const summary = await runFinanceReconciliation();
    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    console.error("[cron/finance-reconcile]", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Reconciliation failed",
      },
      { status: 500 }
    );
  }
}
