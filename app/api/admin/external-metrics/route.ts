import { NextResponse } from "next/server";

import { requireAdminAuth } from "@/lib/admin/require-auth";
import {
  getSearchConsoleConnectorStatus,
  getSearchConsoleProperty,
  syncSearchConsoleDaily,
} from "@/lib/external-metrics/search-console";
import {
  countSearchConsoleRows,
  getLatestExternalMetricSyncRun,
  getLatestSuccessfulExternalMetricSyncRun,
} from "@/lib/external-metrics/store";
import { getAllPaidProviderStatuses } from "@/lib/external-metrics/paid/providers";
import { getGoogleServiceAccountCreds } from "@/lib/google/service-account";
import { ensureExternalMetricsSchema } from "@/lib/external-metrics/schema";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  const authError = await requireAdminAuth();
  if (authError) return authError;

  try {
    await ensureExternalMetricsSchema();
    const [rows, last, lastOk, paid] = await Promise.all([
      countSearchConsoleRows(),
      getLatestExternalMetricSyncRun("search_console"),
      getLatestSuccessfulExternalMetricSyncRun("search_console"),
      getAllPaidProviderStatuses(),
    ]);

    const creds = getGoogleServiceAccountCreds();
    const connector = getSearchConsoleConnectorStatus({
      lastError: last?.status === "error" ? last.errorSummary : null,
      hasRows: rows > 0,
    });

    return NextResponse.json({
      searchConsole: {
        configured: Boolean(getSearchConsoleProperty() && creds),
        property: getSearchConsoleProperty(),
        serviceAccountPresent: Boolean(creds),
        // Never expose email/key — only a boolean.
        connectorStatus: connector.status,
        connectorMessage: connector.message,
        lastSuccessfulSync: lastOk
          ? {
              at: lastOk.completedAt ?? lastOk.startedAt,
              recordsWritten: lastOk.recordsWritten,
            }
          : null,
        lastRun: last
          ? {
              at: last.completedAt ?? last.startedAt,
              status: last.status,
              recordsReceived: last.recordsReceived,
              recordsWritten: last.recordsWritten,
              errorSummary: last.errorSummary,
            }
          : null,
        rowsSynced: rows,
      },
      meta: paid.find((p) => p.provider === "meta") ?? null,
      tiktok: paid.find((p) => p.provider === "tiktok") ?? null,
    });
  } catch (error) {
    console.error("[admin/external-metrics] GET", error);
    return NextResponse.json(
      { error: "Unable to load external metrics status." },
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
    if (action === "sync_search_console") {
      const result = await syncSearchConsoleDaily();
      return NextResponse.json({ ok: result.ok, result });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("[admin/external-metrics] POST", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Sync failed",
      },
      { status: 500 }
    );
  }
}
