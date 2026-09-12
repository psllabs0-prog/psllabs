import {
  getGoogleAccessToken,
  getGoogleServiceAccountCreds,
} from "@/lib/google/service-account";

import { isBrandSearchQuery } from "./brand";
import {
  finishExternalMetricSyncRun,
  startExternalMetricSyncRun,
  upsertSearchConsoleDailyRows,
  type SearchConsoleDailyRow,
} from "./store";

export const SEARCH_CONSOLE_READONLY_SCOPE =
  "https://www.googleapis.com/auth/webmasters.readonly";

export type SearchConsoleConnectorStatus =
  | "configured"
  | "not_configured"
  | "error"
  | "healthy";

export function getSearchConsoleProperty(): string | null {
  return process.env.GOOGLE_SEARCH_CONSOLE_PROPERTY?.trim() || null;
}

export function getSearchConsoleConnectorStatus(input?: {
  lastError?: string | null;
  hasRows?: boolean;
}): {
  status: SearchConsoleConnectorStatus;
  property: string | null;
  message: string;
} {
  const property = getSearchConsoleProperty();
  const creds = getGoogleServiceAccountCreds();
  if (!property || !creds) {
    return {
      status: "not_configured",
      property,
      message:
        "Set GOOGLE_SEARCH_CONSOLE_PROPERTY and Google service-account credentials, then grant the SA access to the Search Console property.",
    };
  }
  if (input?.lastError) {
    return {
      status: "error",
      property,
      message: input.lastError,
    };
  }
  if (input?.hasRows) {
    return {
      status: "healthy",
      property,
      message: "Search Console sync has written rows.",
    };
  }
  return {
    status: "configured",
    property,
    message:
      "Credentials present. Grant Search Console property access to the service account if sync has not succeeded yet.",
  };
}

type GscApiRow = {
  keys?: string[];
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
};

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, days: number): Date {
  const x = new Date(d.getTime());
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}

async function fetchSearchAnalytics(input: {
  accessToken: string;
  property: string;
  startDate: string;
  endDate: string;
  startRow: number;
}): Promise<GscApiRow[]> {
  const encoded = encodeURIComponent(input.property);
  const url = `https://www.googleapis.com/webmasters/v3/sites/${encoded}/searchAnalytics/query`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      startDate: input.startDate,
      endDate: input.endDate,
      dimensions: ["date", "page", "query"],
      rowLimit: 25000,
      startRow: input.startRow,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    const snippet = text.slice(0, 300);
    if (res.status === 403 || /permission|forbidden|not.*access/i.test(snippet)) {
      throw new Error(
        `Search Console permission denied (${res.status}). Grant the service account access to ${input.property}. ${snippet}`
      );
    }
    throw new Error(`Search Console API failed (${res.status}): ${snippet}`);
  }

  const data = (await res.json()) as { rows?: GscApiRow[] };
  return data.rows ?? [];
}

export type SearchConsoleSyncResult = {
  ok: boolean;
  status: "ok" | "error" | "not_configured";
  recordsReceived: number;
  recordsWritten: number;
  errorSummary?: string;
};

/**
 * Sync up to 90 days of Search Console query×page×date rows into Neon.
 * Idempotent upserts. Never fabricates metrics.
 */
export async function syncSearchConsoleDaily(options?: {
  asOf?: Date;
  lookbackDays?: number;
}): Promise<SearchConsoleSyncResult> {
  const property = getSearchConsoleProperty();
  const creds = getGoogleServiceAccountCreds();
  if (!property || !creds) {
    const runId = await startExternalMetricSyncRun("search_console");
    await finishExternalMetricSyncRun({
      id: runId,
      status: "not_configured",
      errorSummary:
        "Search Console not configured (property and/or service account missing).",
    });
    return {
      ok: false,
      status: "not_configured",
      recordsReceived: 0,
      recordsWritten: 0,
      errorSummary: "Search Console not configured.",
    };
  }

  const runId = await startExternalMetricSyncRun("search_console");
  const asOf = options?.asOf ?? new Date();
  // GSC data typically lags ~2–3 days; end at asOf-3 days.
  const end = addDays(
    new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate())),
    -3
  );
  const lookback = Math.min(Math.max(options?.lookbackDays ?? 90, 1), 90);
  const start = addDays(end, -(lookback - 1));

  try {
    const accessToken = await getGoogleAccessToken(
      creds,
      SEARCH_CONSOLE_READONLY_SCOPE
    );

    const mapped: SearchConsoleDailyRow[] = [];
    let startRow = 0;
    let received = 0;

    for (;;) {
      const rows = await fetchSearchAnalytics({
        accessToken,
        property,
        startDate: ymd(start),
        endDate: ymd(end),
        startRow,
      });
      if (rows.length === 0) break;
      received += rows.length;

      for (const row of rows) {
        const keys = row.keys ?? [];
        const date = keys[0] ?? "";
        const page = keys[1] ?? "";
        const query = keys[2] ?? "";
        if (!date) continue;
        mapped.push({
          date,
          property,
          page,
          query,
          clicks: Number(row.clicks ?? 0),
          impressions: Number(row.impressions ?? 0),
          ctr: Number(row.ctr ?? 0),
          position: Number(row.position ?? 0),
          isBrand: isBrandSearchQuery(query),
        });
      }

      if (rows.length < 25000) break;
      startRow += rows.length;
      if (startRow > 100000) break; // safety
    }

    const written = await upsertSearchConsoleDailyRows(mapped);
    await finishExternalMetricSyncRun({
      id: runId,
      status: "ok",
      recordsReceived: received,
      recordsWritten: written,
    });
    return {
      ok: true,
      status: "ok",
      recordsReceived: received,
      recordsWritten: written,
    };
  } catch (error) {
    const msg =
      error instanceof Error ? error.message.slice(0, 500) : "Search Console sync failed";
    await finishExternalMetricSyncRun({
      id: runId,
      status: "error",
      errorSummary: msg,
    });
    return {
      ok: false,
      status: "error",
      recordsReceived: 0,
      recordsWritten: 0,
      errorSummary: msg,
    };
  }
}
