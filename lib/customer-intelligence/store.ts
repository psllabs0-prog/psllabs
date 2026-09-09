import { getSql } from "@/lib/db/sql";
import {
  CUSTOMER_FEEDBACK_SUBMITTED_FROM,
  CUSTOMER_FEEDBACK_SURVEY_VERSION,
  type DiscoverySourceValue,
  type PurchaseDriverValue,
} from "./constants";

let schemaReady: Promise<void> | null = null;

export type CustomerFeedbackStatus = "submitted" | "skipped";

export type CustomerFeedbackRow = {
  id: string;
  orderId: string;
  submittedAt: string;
  discoverySourceStated: string | null;
  purchaseDrivers: string[];
  openFeedback: string | null;
  status: CustomerFeedbackStatus;
  surveyVersion: string;
  submittedFrom: string;
};

export async function ensureCustomerFeedbackSchema(): Promise<void> {
  if (schemaReady) return schemaReady;
  const sql = getSql();
  schemaReady = (async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS customer_feedback (
        id                       TEXT PRIMARY KEY,
        order_id                 TEXT NOT NULL,
        submitted_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
        discovery_source_stated  TEXT,
        purchase_drivers         JSONB NOT NULL DEFAULT '[]'::jsonb,
        open_feedback            TEXT,
        status                   TEXT NOT NULL,
        survey_version           TEXT NOT NULL,
        submitted_from           TEXT NOT NULL
      )
    `;
    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS customer_feedback_order_version_uidx
      ON customer_feedback (order_id, survey_version)
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS customer_feedback_submitted_at_idx
      ON customer_feedback (submitted_at DESC)
    `;
  })();
  return schemaReady;
}

function mapRow(row: {
  id: string;
  order_id: string;
  submitted_at: string | Date;
  discovery_source_stated: string | null;
  purchase_drivers: unknown;
  open_feedback: string | null;
  status: string;
  survey_version: string;
  submitted_from: string;
}): CustomerFeedbackRow {
  let drivers: string[] = [];
  if (Array.isArray(row.purchase_drivers)) {
    drivers = row.purchase_drivers.filter(
      (d): d is string => typeof d === "string"
    );
  } else if (typeof row.purchase_drivers === "string") {
    try {
      const parsed = JSON.parse(row.purchase_drivers) as unknown;
      if (Array.isArray(parsed)) {
        drivers = parsed.filter((d): d is string => typeof d === "string");
      }
    } catch {
      drivers = [];
    }
  }

  return {
    id: row.id,
    orderId: row.order_id,
    submittedAt:
      row.submitted_at instanceof Date
        ? row.submitted_at.toISOString()
        : String(row.submitted_at),
    discoverySourceStated: row.discovery_source_stated,
    purchaseDrivers: drivers,
    openFeedback: row.open_feedback,
    status: row.status as CustomerFeedbackStatus,
    surveyVersion: row.survey_version,
    submittedFrom: row.submitted_from,
  };
}

export async function getCustomerFeedbackStatus(
  orderId: string,
  surveyVersion: string = CUSTOMER_FEEDBACK_SURVEY_VERSION
): Promise<CustomerFeedbackStatus | null> {
  await ensureCustomerFeedbackSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT status
    FROM customer_feedback
    WHERE order_id = ${orderId} AND survey_version = ${surveyVersion}
    LIMIT 1
  `) as { status: string }[];

  if (rows.length === 0) return null;
  const status = rows[0]?.status;
  if (status === "submitted" || status === "skipped") return status;
  return null;
}

export type RecordCustomerFeedbackInput =
  | {
      orderId: string;
      action: "skip";
    }
  | {
      orderId: string;
      action: "submit";
      discoverySource: DiscoverySourceValue | null;
      purchaseDrivers: PurchaseDriverValue[];
      openFeedback: string | null;
    };

export type RecordCustomerFeedbackResult =
  | { ok: true; status: CustomerFeedbackStatus; alreadyRecorded: boolean }
  | { ok: false; error: string; code?: "duplicate" | "invalid" };

export async function recordCustomerFeedback(
  input: RecordCustomerFeedbackInput
): Promise<RecordCustomerFeedbackResult> {
  await ensureCustomerFeedbackSchema();
  const sql = getSql();

  const existing = await getCustomerFeedbackStatus(input.orderId);
  if (existing) {
    return {
      ok: true,
      status: existing,
      alreadyRecorded: true,
    };
  }

  const id = `cf_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const status: CustomerFeedbackStatus =
    input.action === "skip" ? "skipped" : "submitted";
  const discovery =
    input.action === "submit" ? input.discoverySource : null;
  const drivers =
    input.action === "submit" ? input.purchaseDrivers : [];
  const openFeedback =
    input.action === "submit" ? input.openFeedback : null;
  const driversJson = JSON.stringify(drivers);

  try {
    const inserted = (await sql`
      INSERT INTO customer_feedback (
        id,
        order_id,
        discovery_source_stated,
        purchase_drivers,
        open_feedback,
        status,
        survey_version,
        submitted_from
      )
      VALUES (
        ${id},
        ${input.orderId},
        ${discovery},
        ${driversJson}::jsonb,
        ${openFeedback},
        ${status},
        ${CUSTOMER_FEEDBACK_SURVEY_VERSION},
        ${CUSTOMER_FEEDBACK_SUBMITTED_FROM}
      )
      ON CONFLICT (order_id, survey_version) DO NOTHING
      RETURNING status
    `) as { status: string }[];

    if (inserted.length === 0) {
      const again = await getCustomerFeedbackStatus(input.orderId);
      return {
        ok: true,
        status: again ?? status,
        alreadyRecorded: true,
      };
    }

    return {
      ok: true,
      status: status,
      alreadyRecorded: false,
    };
  } catch (error) {
    console.error("[customer-feedback] record failed:", error);
    return {
      ok: false,
      error: "We couldn't save that feedback. Your order is already confirmed.",
    };
  }
}

export async function listCustomerFeedback(
  limit = 200
): Promise<CustomerFeedbackRow[]> {
  await ensureCustomerFeedbackSchema();
  const sql = getSql();
  const safeLimit = Math.min(Math.max(limit, 1), 500);
  const rows = (await sql`
    SELECT
      id,
      order_id,
      submitted_at,
      discovery_source_stated,
      purchase_drivers,
      open_feedback,
      status,
      survey_version,
      submitted_from
    FROM customer_feedback
    ORDER BY submitted_at DESC
    LIMIT ${safeLimit}
  `) as {
    id: string;
    order_id: string;
    submitted_at: string | Date;
    discovery_source_stated: string | null;
    purchase_drivers: unknown;
    open_feedback: string | null;
    status: string;
    survey_version: string;
    submitted_from: string;
  }[];

  return rows.map(mapRow);
}
