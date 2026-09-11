import { getSql } from "@/lib/db/sql";

import { ensureFinanceSchema } from "./schema";
import type {
  FinanceJobRunRow,
  FinanceTransactionRow,
  PaymentEventProcessingStatus,
  PaymentEventRow,
  PaymentProvider,
  ReconciliationWarningRow,
  ReconciliationWarningType,
  SheetSyncStatus,
} from "./types";

export { ensureFinanceSchema } from "./schema";

function num(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function mapPaymentEvent(row: {
  id: number | string;
  provider: string;
  provider_event_id: string;
  provider_payment_id: string | null;
  provider_order_id: string | null;
  psl_order_id: string | null;
  event_type: string;
  event_timestamp: string | null;
  amount: string | number | null;
  currency: string | null;
  payment_status: string | null;
  payment_method: string | null;
  processing_status: string;
  processing_error: string | null;
  processed_at: string | null;
  created_at: string;
}): PaymentEventRow {
  return {
    id: Number(row.id),
    provider: row.provider as PaymentProvider,
    providerEventId: row.provider_event_id,
    providerPaymentId: row.provider_payment_id,
    providerOrderId: row.provider_order_id,
    pslOrderId: row.psl_order_id,
    eventType: row.event_type,
    eventTimestamp: row.event_timestamp
      ? new Date(row.event_timestamp).toISOString()
      : null,
    amount: num(row.amount),
    currency: row.currency,
    paymentStatus: row.payment_status,
    paymentMethod: row.payment_method,
    processingStatus: row.processing_status as PaymentEventProcessingStatus,
    processingError: row.processing_error,
    processedAt: row.processed_at
      ? new Date(row.processed_at).toISOString()
      : null,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function mapFinanceTx(row: {
  id: number | string;
  psl_order_id: string;
  provider: string;
  provider_payment_id: string | null;
  payment_method: string | null;
  event_timestamp: string;
  gross_amount: string | number;
  currency: string;
  processor_fee: string | number | null;
  products: string | null;
  quantities: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  landing_page: string | null;
  sheet_sync_status: string;
  sheet_sync_error: string | null;
  sheet_synced_at: string | null;
  source_payment_event_id: number | string | null;
  created_at: string;
  updated_at: string;
}): FinanceTransactionRow {
  return {
    id: Number(row.id),
    pslOrderId: row.psl_order_id,
    provider: row.provider as PaymentProvider,
    providerPaymentId: row.provider_payment_id,
    paymentMethod: row.payment_method,
    eventTimestamp: new Date(row.event_timestamp).toISOString(),
    grossAmount: Number(row.gross_amount),
    currency: row.currency,
    processorFee: num(row.processor_fee),
    products: row.products,
    quantities: row.quantities,
    utmSource: row.utm_source,
    utmMedium: row.utm_medium,
    utmCampaign: row.utm_campaign,
    utmContent: row.utm_content,
    landingPage: row.landing_page,
    sheetSyncStatus: row.sheet_sync_status as SheetSyncStatus,
    sheetSyncError: row.sheet_sync_error,
    sheetSyncedAt: row.sheet_synced_at
      ? new Date(row.sheet_synced_at).toISOString()
      : null,
    sourcePaymentEventId:
      row.source_payment_event_id === null ||
      row.source_payment_event_id === undefined
        ? null
        : Number(row.source_payment_event_id),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export type InsertPaymentEventInput = {
  provider: PaymentProvider;
  providerEventId: string;
  providerPaymentId?: string | null;
  providerOrderId?: string | null;
  pslOrderId?: string | null;
  eventType: string;
  eventTimestamp?: string | Date | null;
  amount?: number | null;
  currency?: string | null;
  paymentStatus?: string | null;
  paymentMethod?: string | null;
  rawEventJson?: unknown;
  processingStatus?: PaymentEventProcessingStatus;
  processingError?: string | null;
};

/**
 * Idempotent insert by (provider, provider_event_id).
 * Returns existing row when the same event is delivered again.
 */
export async function insertPaymentEventIdempotent(
  input: InsertPaymentEventInput
): Promise<{ event: PaymentEventRow; created: boolean }> {
  await ensureFinanceSchema();
  const sql = getSql();
  const ts =
    input.eventTimestamp instanceof Date
      ? input.eventTimestamp.toISOString()
      : input.eventTimestamp ?? null;
  const rawJson =
    input.rawEventJson === undefined ? null : input.rawEventJson;
  const status = input.processingStatus ?? "received";

  const inserted = (await sql`
    INSERT INTO payment_events (
      provider,
      provider_event_id,
      provider_payment_id,
      provider_order_id,
      psl_order_id,
      event_type,
      event_timestamp,
      amount,
      currency,
      payment_status,
      payment_method,
      raw_event_json,
      processing_status,
      processing_error,
      processed_at
    ) VALUES (
      ${input.provider},
      ${input.providerEventId},
      ${input.providerPaymentId ?? null},
      ${input.providerOrderId ?? null},
      ${input.pslOrderId ?? null},
      ${input.eventType},
      ${ts},
      ${input.amount ?? null},
      ${input.currency ?? null},
      ${input.paymentStatus ?? null},
      ${input.paymentMethod ?? null},
      ${rawJson},
      ${status},
      ${input.processingError ?? null},
      ${status === "processed" || status === "ignored" ? new Date().toISOString() : null}
    )
    ON CONFLICT (provider, provider_event_id) DO NOTHING
    RETURNING *
  `) as Array<Parameters<typeof mapPaymentEvent>[0]>;

  if (inserted[0]) {
    return { event: mapPaymentEvent(inserted[0]), created: true };
  }

  const existing = (await sql`
    SELECT *
    FROM payment_events
    WHERE provider = ${input.provider}
      AND provider_event_id = ${input.providerEventId}
    LIMIT 1
  `) as Array<Parameters<typeof mapPaymentEvent>[0]>;

  return { event: mapPaymentEvent(existing[0]), created: false };
}

export async function markPaymentEventProcessed(
  id: number,
  status: PaymentEventProcessingStatus,
  error?: string | null
): Promise<void> {
  await ensureFinanceSchema();
  const sql = getSql();
  await sql`
    UPDATE payment_events
    SET
      processing_status = ${status},
      processing_error = ${error ?? null},
      processed_at = now()
    WHERE id = ${id}
  `;
}

export type UpsertFinanceTransactionInput = {
  pslOrderId: string;
  provider: PaymentProvider;
  providerPaymentId?: string | null;
  paymentMethod?: string | null;
  eventTimestamp: string;
  grossAmount: number;
  currency: string;
  processorFee?: number | null;
  products?: string | null;
  quantities?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  landingPage?: string | null;
  sourcePaymentEventId?: number | null;
};

export async function upsertFinanceTransaction(
  input: UpsertFinanceTransactionInput
): Promise<{ row: FinanceTransactionRow; created: boolean }> {
  await ensureFinanceSchema();
  const sql = getSql();
  const existing = await getFinanceTransactionByOrderId(input.pslOrderId);

  const rows = (await sql`
    INSERT INTO finance_transactions (
      psl_order_id,
      provider,
      provider_payment_id,
      payment_method,
      event_timestamp,
      gross_amount,
      currency,
      processor_fee,
      products,
      quantities,
      utm_source,
      utm_medium,
      utm_campaign,
      utm_content,
      landing_page,
      source_payment_event_id,
      sheet_sync_status
    ) VALUES (
      ${input.pslOrderId},
      ${input.provider},
      ${input.providerPaymentId ?? null},
      ${input.paymentMethod ?? null},
      ${input.eventTimestamp},
      ${input.grossAmount},
      ${input.currency},
      ${input.processorFee ?? null},
      ${input.products ?? null},
      ${input.quantities ?? null},
      ${input.utmSource ?? null},
      ${input.utmMedium ?? null},
      ${input.utmCampaign ?? null},
      ${input.utmContent ?? null},
      ${input.landingPage ?? null},
      ${input.sourcePaymentEventId ?? null},
      'pending'
    )
    ON CONFLICT (psl_order_id) DO UPDATE SET
      provider = EXCLUDED.provider,
      provider_payment_id = COALESCE(
        EXCLUDED.provider_payment_id,
        finance_transactions.provider_payment_id
      ),
      payment_method = COALESCE(
        EXCLUDED.payment_method,
        finance_transactions.payment_method
      ),
      event_timestamp = EXCLUDED.event_timestamp,
      gross_amount = EXCLUDED.gross_amount,
      currency = EXCLUDED.currency,
      processor_fee = COALESCE(
        EXCLUDED.processor_fee,
        finance_transactions.processor_fee
      ),
      products = EXCLUDED.products,
      quantities = EXCLUDED.quantities,
      utm_source = EXCLUDED.utm_source,
      utm_medium = EXCLUDED.utm_medium,
      utm_campaign = EXCLUDED.utm_campaign,
      utm_content = EXCLUDED.utm_content,
      landing_page = EXCLUDED.landing_page,
      source_payment_event_id = COALESCE(
        EXCLUDED.source_payment_event_id,
        finance_transactions.source_payment_event_id
      ),
      updated_at = now()
    RETURNING *
  `) as Array<Parameters<typeof mapFinanceTx>[0]>;

  return { row: mapFinanceTx(rows[0]), created: !existing };
}

export async function getFinanceTransactionByOrderId(
  orderId: string
): Promise<FinanceTransactionRow | null> {
  await ensureFinanceSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT * FROM finance_transactions
    WHERE psl_order_id = ${orderId}
    LIMIT 1
  `) as Array<Parameters<typeof mapFinanceTx>[0]>;
  return rows[0] ? mapFinanceTx(rows[0]) : null;
}

export const SHEETS_NOT_CONFIGURED_ERROR = "Google Sheets not configured";

export async function listFinanceTransactionsNeedingSheetSync(
  limit = 50
): Promise<FinanceTransactionRow[]> {
  await ensureFinanceSchema();
  const sql = getSql();
  const safe = Math.min(Math.max(limit, 1), 200);
  const rows = (await sql`
    SELECT * FROM finance_transactions
    WHERE sheet_sync_status IN ('pending', 'failed')
       OR (
         sheet_sync_status = 'skipped'
         AND sheet_sync_error = ${SHEETS_NOT_CONFIGURED_ERROR}
       )
    ORDER BY event_timestamp ASC
    LIMIT ${safe}
  `) as Array<Parameters<typeof mapFinanceTx>[0]>;
  return rows.map(mapFinanceTx);
}

export async function markFinanceSheetSynced(
  id: number
): Promise<void> {
  await ensureFinanceSchema();
  const sql = getSql();
  await sql`
    UPDATE finance_transactions
    SET
      sheet_sync_status = 'synced',
      sheet_sync_error = NULL,
      sheet_synced_at = now(),
      updated_at = now()
    WHERE id = ${id}
  `;
}

export async function markFinanceSheetFailed(
  id: number,
  error: string
): Promise<void> {
  await ensureFinanceSchema();
  const sql = getSql();
  await sql`
    UPDATE finance_transactions
    SET
      sheet_sync_status = 'failed',
      sheet_sync_error = ${error.slice(0, 500)},
      updated_at = now()
    WHERE id = ${id}
  `;
}

export async function markFinanceSheetSkipped(
  id: number,
  reason: string
): Promise<void> {
  await ensureFinanceSchema();
  const sql = getSql();
  await sql`
    UPDATE finance_transactions
    SET
      sheet_sync_status = 'skipped',
      sheet_sync_error = ${reason.slice(0, 500)},
      updated_at = now()
    WHERE id = ${id}
  `;
}

export async function upsertReconciliationWarning(input: {
  warningKey: string;
  warningType: ReconciliationWarningType;
  pslOrderId?: string | null;
  provider?: string | null;
  providerPaymentId?: string | null;
  message: string;
  details?: Record<string, unknown> | null;
}): Promise<void> {
  await ensureFinanceSchema();
  const sql = getSql();
  const detailsJson = input.details ?? null;
  await sql`
    INSERT INTO finance_reconciliation_warnings (
      warning_key,
      warning_type,
      psl_order_id,
      provider,
      provider_payment_id,
      message,
      details_json,
      status
    ) VALUES (
      ${input.warningKey},
      ${input.warningType},
      ${input.pslOrderId ?? null},
      ${input.provider ?? null},
      ${input.providerPaymentId ?? null},
      ${input.message},
      ${detailsJson},
      'open'
    )
    ON CONFLICT (warning_key) DO UPDATE SET
      message = EXCLUDED.message,
      details_json = EXCLUDED.details_json,
      status = 'open',
      updated_at = now()
  `;
}

/** Resolve a specific warning only when its exact condition has been re-checked and cleared. */
export async function resolveReconciliationWarning(
  warningKey: string
): Promise<boolean> {
  await ensureFinanceSchema();
  const sql = getSql();
  const rows = (await sql`
    UPDATE finance_reconciliation_warnings
    SET status = 'resolved', updated_at = now()
    WHERE warning_key = ${warningKey}
      AND status = 'open'
    RETURNING id
  `) as { id: number | string }[];
  return rows.length > 0;
}

export async function startFinanceJobRun(
  jobName: string
): Promise<number> {
  await ensureFinanceSchema();
  const sql = getSql();
  const rows = (await sql`
    INSERT INTO finance_job_runs (job_name, status)
    VALUES (${jobName}, 'running')
    RETURNING id
  `) as { id: number | string }[];
  return Number(rows[0].id);
}

export async function finishFinanceJobRun(
  id: number,
  status: "ok" | "error",
  summary?: Record<string, unknown> | null,
  error?: string | null
): Promise<void> {
  await ensureFinanceSchema();
  const sql = getSql();
  const summaryJson = summary ?? null;
  await sql`
    UPDATE finance_job_runs
    SET
      finished_at = now(),
      status = ${status},
      summary_json = ${summaryJson},
      error = ${error ?? null}
    WHERE id = ${id}
  `;
}

export async function listRecentPaymentEvents(
  limit = 50
): Promise<PaymentEventRow[]> {
  await ensureFinanceSchema();
  const sql = getSql();
  const safe = Math.min(Math.max(limit, 1), 200);
  const rows = (await sql`
    SELECT *
    FROM payment_events
    ORDER BY created_at DESC
    LIMIT ${safe}
  `) as Array<Parameters<typeof mapPaymentEvent>[0]>;
  return rows.map(mapPaymentEvent);
}

export async function listRecentFinanceTransactions(
  limit = 50
): Promise<FinanceTransactionRow[]> {
  await ensureFinanceSchema();
  const sql = getSql();
  const safe = Math.min(Math.max(limit, 1), 200);
  const rows = (await sql`
    SELECT *
    FROM finance_transactions
    ORDER BY event_timestamp DESC
    LIMIT ${safe}
  `) as Array<Parameters<typeof mapFinanceTx>[0]>;
  return rows.map(mapFinanceTx);
}

export async function listOpenReconciliationWarnings(
  limit = 50
): Promise<ReconciliationWarningRow[]> {
  await ensureFinanceSchema();
  const sql = getSql();
  const safe = Math.min(Math.max(limit, 1), 200);
  const rows = (await sql`
    SELECT *
    FROM finance_reconciliation_warnings
    WHERE status = 'open'
    ORDER BY created_at DESC
    LIMIT ${safe}
  `) as Array<{
    id: number | string;
    warning_key: string;
    warning_type: string;
    psl_order_id: string | null;
    provider: string | null;
    provider_payment_id: string | null;
    message: string;
    status: string;
    created_at: string;
    updated_at: string;
  }>;

  return rows.map((row) => ({
    id: Number(row.id),
    warningKey: row.warning_key,
    warningType: row.warning_type as ReconciliationWarningType,
    pslOrderId: row.psl_order_id,
    provider: row.provider,
    providerPaymentId: row.provider_payment_id,
    message: row.message,
    status: row.status as "open" | "resolved",
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  }));
}

export async function getLatestFinanceJobRun(
  jobName: string
): Promise<FinanceJobRunRow | null> {
  await ensureFinanceSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT *
    FROM finance_job_runs
    WHERE job_name = ${jobName}
    ORDER BY started_at DESC
    LIMIT 1
  `) as Array<{
    id: number | string;
    job_name: string;
    started_at: string;
    finished_at: string | null;
    status: string;
    summary_json: Record<string, unknown> | string | null;
    error: string | null;
  }>;

  const row = rows[0];
  if (!row) return null;

  const summary =
    typeof row.summary_json === "string"
      ? (JSON.parse(row.summary_json) as Record<string, unknown>)
      : row.summary_json;

  return {
    id: Number(row.id),
    jobName: row.job_name,
    startedAt: new Date(row.started_at).toISOString(),
    finishedAt: row.finished_at
      ? new Date(row.finished_at).toISOString()
      : null,
    status: row.status as FinanceJobRunRow["status"],
    summaryJson: summary,
    error: row.error,
  };
}

export async function findDuplicateProviderPaymentIds(): Promise<
  Array<{ providerPaymentId: string; orderIds: string[] }>
> {
  await ensureFinanceSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT
      provider_payment_id,
      array_agg(psl_order_id ORDER BY psl_order_id) AS order_ids
    FROM finance_transactions
    WHERE provider_payment_id IS NOT NULL
      AND trim(provider_payment_id) <> ''
    GROUP BY provider_payment_id
    HAVING COUNT(*) > 1
  `) as Array<{
    provider_payment_id: string;
    order_ids: string[] | string;
  }>;

  return rows.map((row) => ({
    providerPaymentId: row.provider_payment_id,
    orderIds: Array.isArray(row.order_ids)
      ? row.order_ids
      : String(row.order_ids)
          .replace(/^\{|\}$/g, "")
          .split(",")
          .filter(Boolean),
  }));
}
