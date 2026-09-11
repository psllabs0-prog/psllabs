import { NextResponse } from "next/server";

import { requireAdminAuth } from "@/lib/admin/require-auth";
import { isGoogleSheetsConfigured } from "@/lib/finance/google-sheets";
import { runFinanceReconciliation } from "@/lib/finance/reconciliation";
import {
  getLatestFinanceJobRun,
  listOpenReconciliationWarnings,
  listRecentFinanceTransactions,
  listRecentPaymentEvents,
} from "@/lib/finance/store";
import { isTagadaConfigured } from "@/lib/tagada";

export const runtime = "nodejs";

function isTagadaWebhookConfigured(): boolean {
  return Boolean(process.env.TAGADA_WEBHOOK_SECRET?.trim());
}

export async function GET() {
  const unauthorized = await requireAdminAuth();
  if (unauthorized) return unauthorized;

  try {
    const [events, transactions, warnings, lastRun] = await Promise.all([
      listRecentPaymentEvents(40),
      listRecentFinanceTransactions(40),
      listOpenReconciliationWarnings(40),
      getLatestFinanceJobRun("finance_reconciliation"),
    ]);

    return NextResponse.json({
      sheetsConfigured: isGoogleSheetsConfigured(),
      tagadaApiConfigured: isTagadaConfigured(),
      // Optional backup only — absence is not a production launch blocker.
      tagadaWebhookConfigured: isTagadaWebhookConfigured(),
      lastReconciliation: lastRun,
      events,
      transactions,
      warnings,
    });
  } catch (error) {
    console.error("[admin/finance]", error);
    return NextResponse.json(
      { error: "Failed to load finance status." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const unauthorized = await requireAdminAuth();
  if (unauthorized) return unauthorized;

  let body: { action?: string } = {};
  try {
    body = (await request.json()) as { action?: string };
  } catch {
    body = {};
  }

  if (body.action !== "reconcile") {
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }

  try {
    const summary = await runFinanceReconciliation();
    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Reconciliation failed",
      },
      { status: 500 }
    );
  }
}
