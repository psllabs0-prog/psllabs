import { NextResponse } from "next/server";

import { requireAdminAuth } from "@/lib/admin/require-auth";
import { isGoogleSheetsConfigured } from "@/lib/finance/google-sheets";
import { runFinanceReconciliation } from "@/lib/finance/reconciliation";
import {
  getLatestFinanceJobRun,
  listOpenReconciliationWarnings,
  listRecentFinanceTransactions,
  listRecentPaymentEvents,
  markFinanceTransactionReportingExcluded,
  sumBusinessGrossRevenueUsd,
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
    const [events, transactions, warnings, lastRun, businessGrossRevenueUsd] =
      await Promise.all([
        listRecentPaymentEvents(40),
        listRecentFinanceTransactions(40),
        listOpenReconciliationWarnings(40),
        getLatestFinanceJobRun("finance_reconciliation"),
        sumBusinessGrossRevenueUsd(),
      ]);

    return NextResponse.json({
      sheetsConfigured: isGoogleSheetsConfigured(),
      tagadaApiConfigured: isTagadaConfigured(),
      // Optional backup only — absence is not a production launch blocker.
      tagadaWebhookConfigured: isTagadaWebhookConfigured(),
      businessGrossRevenueUsd,
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

  let body: {
    action?: string;
    pslOrderId?: string;
    reason?: string;
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  if (body.action === "reconcile") {
    try {
      const summary = await runFinanceReconciliation();
      return NextResponse.json({ ok: true, summary });
    } catch (error) {
      return NextResponse.json(
        {
          ok: false,
          error:
            error instanceof Error ? error.message : "Reconciliation failed",
        },
        { status: 500 }
      );
    }
  }

  if (body.action === "mark_reporting_excluded") {
    const pslOrderId =
      typeof body.pslOrderId === "string" ? body.pslOrderId.trim() : "";
    if (!pslOrderId) {
      return NextResponse.json(
        { error: "Missing pslOrderId." },
        { status: 400 }
      );
    }
    try {
      const row = await markFinanceTransactionReportingExcluded(
        pslOrderId,
        typeof body.reason === "string" ? body.reason : undefined
      );
      if (!row) {
        return NextResponse.json(
          { error: "Finance transaction not found." },
          { status: 404 }
        );
      }
      return NextResponse.json({ ok: true, transaction: row });
    } catch (error) {
      return NextResponse.json(
        {
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : "Failed to mark reporting excluded",
        },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
