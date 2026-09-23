import { getSql } from "@/lib/db/sql";

import { ensureBtcpostageSchema } from "./schema";
import type {
  BtcpostageLabelPublic,
  BtcpostageLabelRecord,
  BtcpostagePurchaseStatus,
} from "./types";

type LabelRow = {
  psl_order_id: string;
  purchase_status: string;
  btcp_order_id: string | null;
  shipment_id: string | null;
  carrier: string | null;
  service: string | null;
  postage_cost: string | number | null;
  tracking_number: string | null;
  label_url: string | null;
  label_format: string | null;
  test_mode: boolean;
  purchased_at: string | null;
  purchase_claimed_at: string | null;
  last_error: string | null;
  verified_street1: string | null;
  verified_street2: string | null;
  verified_city: string | null;
  verified_state: string | null;
  verified_zip: string | null;
  verified_country: string | null;
  weight_lbs: string | number | null;
  weight_oz: string | number | null;
  height_in: string | number | null;
  width_in: string | number | null;
  depth_in: string | number | null;
  updated_at: string | null;
};

const CLAIM_STALE_MS = 10 * 60 * 1000;

function num(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function asStatus(value: string): BtcpostagePurchaseStatus {
  switch (value) {
    case "purchasing":
    case "purchased":
    case "failed":
    case "needs_review":
      return value;
    default:
      return "none";
  }
}

function rowToRecord(row: LabelRow): BtcpostageLabelRecord {
  return {
    pslOrderId: row.psl_order_id,
    purchaseStatus: asStatus(row.purchase_status),
    btcpOrderId: row.btcp_order_id,
    shipmentId: row.shipment_id,
    carrier: row.carrier,
    service: row.service,
    postageCost: num(row.postage_cost),
    trackingNumber: row.tracking_number,
    labelUrl: row.label_url,
    labelFormat: row.label_format,
    testMode: Boolean(row.test_mode),
    purchasedAt: row.purchased_at
      ? new Date(row.purchased_at).toISOString()
      : null,
    purchaseClaimedAt: row.purchase_claimed_at
      ? new Date(row.purchase_claimed_at).toISOString()
      : null,
    lastError: row.last_error,
    verifiedStreet1: row.verified_street1,
    verifiedStreet2: row.verified_street2,
    verifiedCity: row.verified_city,
    verifiedState: row.verified_state,
    verifiedZip: row.verified_zip,
    verifiedCountry: row.verified_country,
    weightLbs: num(row.weight_lbs),
    weightOz: num(row.weight_oz),
    heightIn: num(row.height_in),
    widthIn: num(row.width_in),
    depthIn: num(row.depth_in),
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
  };
}

export function toPublicLabel(record: BtcpostageLabelRecord): BtcpostageLabelPublic {
  return {
    pslOrderId: record.pslOrderId,
    purchaseStatus: record.purchaseStatus,
    btcpOrderId: record.btcpOrderId,
    shipmentId: record.shipmentId,
    carrier: record.carrier,
    service: record.service,
    postageCost: record.postageCost,
    trackingNumber: record.trackingNumber,
    labelUrl: record.labelUrl,
    testMode: record.testMode,
    purchasedAt: record.purchasedAt,
    lastError: record.lastError,
    isRealShipment:
      record.purchaseStatus === "purchased" && !record.testMode,
  };
}

export async function getBtcpostageLabel(
  pslOrderId: string
): Promise<BtcpostageLabelRecord | null> {
  await ensureBtcpostageSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT * FROM btcpostage_labels WHERE psl_order_id = ${pslOrderId} LIMIT 1
  `) as LabelRow[];
  return rows.length ? rowToRecord(rows[0]) : null;
}

export async function listBtcpostageLabelsForOrders(
  orderIds: string[]
): Promise<BtcpostageLabelRecord[]> {
  if (orderIds.length === 0) return [];
  await ensureBtcpostageSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT * FROM btcpostage_labels
    WHERE psl_order_id = ANY(${orderIds})
  `) as LabelRow[];
  return rows.map(rowToRecord);
}

export async function ensureLabelRow(pslOrderId: string): Promise<void> {
  await ensureBtcpostageSchema();
  const sql = getSql();
  await sql`
    INSERT INTO btcpostage_labels (psl_order_id, purchase_status, updated_at)
    VALUES (${pslOrderId}, 'none', now())
    ON CONFLICT (psl_order_id) DO NOTHING
  `;
}

export async function saveVerifiedAddress(
  pslOrderId: string,
  address: {
    street1: string;
    street2?: string;
    city: string;
    state: string;
    zip: string;
    country: string;
  }
): Promise<void> {
  await ensureLabelRow(pslOrderId);
  const sql = getSql();
  await sql`
    UPDATE btcpostage_labels
    SET verified_street1 = ${address.street1},
        verified_street2 = ${address.street2 ?? ""},
        verified_city = ${address.city},
        verified_state = ${address.state},
        verified_zip = ${address.zip},
        verified_country = ${address.country},
        updated_at = now()
    WHERE psl_order_id = ${pslOrderId}
  `;
}

export type ClaimPurchaseResult =
  | { ok: true }
  | {
      ok: false;
      reason: "already_purchased" | "in_flight" | "needs_review";
      label: BtcpostageLabelRecord;
    };

/**
 * Claim exclusive right to call create-purchase for this PSL order.
 * Never claims when a successful purchase is already stored.
 */
export async function claimLabelPurchase(
  pslOrderId: string
): Promise<ClaimPurchaseResult> {
  await ensureLabelRow(pslOrderId);
  const existing = await getBtcpostageLabel(pslOrderId);
  if (!existing) {
    throw new Error("Failed to initialize BTCPostage label row.");
  }

  if (existing.purchaseStatus === "purchased") {
    return { ok: false, reason: "already_purchased", label: existing };
  }
  if (existing.purchaseStatus === "needs_review") {
    return { ok: false, reason: "needs_review", label: existing };
  }

  if (
    existing.purchaseStatus === "purchasing" &&
    existing.purchaseClaimedAt
  ) {
    const age = Date.now() - new Date(existing.purchaseClaimedAt).getTime();
    if (age < CLAIM_STALE_MS) {
      return { ok: false, reason: "in_flight", label: existing };
    }
    // Stale claim without confirmed purchase → needs_review (do not blind retry).
    const sql = getSql();
    await sql`
      UPDATE btcpostage_labels
      SET purchase_status = 'needs_review',
          last_error = COALESCE(last_error, 'Stale in-flight purchase — review before retrying.'),
          updated_at = now()
      WHERE psl_order_id = ${pslOrderId}
        AND purchase_status = 'purchasing'
    `;
    const refreshed = await getBtcpostageLabel(pslOrderId);
    return {
      ok: false,
      reason: "needs_review",
      label: refreshed ?? existing,
    };
  }

  const sql = getSql();
  const rows = (await sql`
    UPDATE btcpostage_labels
    SET purchase_status = 'purchasing',
        purchase_claimed_at = now(),
        last_error = NULL,
        updated_at = now()
    WHERE psl_order_id = ${pslOrderId}
      AND purchase_status IN ('none', 'failed')
    RETURNING psl_order_id
  `) as Array<{ psl_order_id: string }>;

  if (rows.length === 0) {
    const again = await getBtcpostageLabel(pslOrderId);
    if (again?.purchaseStatus === "purchased") {
      return { ok: false, reason: "already_purchased", label: again };
    }
    if (again?.purchaseStatus === "needs_review") {
      return { ok: false, reason: "needs_review", label: again };
    }
    return {
      ok: false,
      reason: "in_flight",
      label: again ?? existing,
    };
  }

  return { ok: true };
}

export async function markPurchaseSucceeded(input: {
  pslOrderId: string;
  btcpOrderId: string;
  shipmentId: string | null;
  carrier: string | null;
  service: string | null;
  postageCost: number | null;
  trackingNumber: string | null;
  labelUrl: string | null;
  labelFormat: string | null;
  testMode: boolean;
  weightLbs: number;
  weightOz: number;
  heightIn: number;
  widthIn: number;
  depthIn: number;
  rawResponse: unknown;
}): Promise<BtcpostageLabelRecord> {
  await ensureBtcpostageSchema();
  const sql = getSql();
  await sql`
    UPDATE btcpostage_labels
    SET purchase_status = 'purchased',
        btcp_order_id = ${input.btcpOrderId},
        shipment_id = ${input.shipmentId},
        carrier = ${input.carrier},
        service = ${input.service},
        postage_cost = ${input.postageCost},
        tracking_number = ${input.trackingNumber},
        label_url = ${input.labelUrl},
        label_format = ${input.labelFormat},
        test_mode = ${input.testMode},
        purchased_at = COALESCE(purchased_at, now()),
        purchase_claimed_at = NULL,
        last_error = NULL,
        weight_lbs = ${input.weightLbs},
        weight_oz = ${input.weightOz},
        height_in = ${input.heightIn},
        width_in = ${input.widthIn},
        depth_in = ${input.depthIn},
        raw_response = ${JSON.stringify(input.rawResponse)}::jsonb,
        updated_at = now()
    WHERE psl_order_id = ${input.pslOrderId}
  `;
  const record = await getBtcpostageLabel(input.pslOrderId);
  if (!record) throw new Error("Purchase succeeded but label row missing.");
  return record;
}

export async function markPurchaseFailed(
  pslOrderId: string,
  errorMessage: string
): Promise<void> {
  await ensureBtcpostageSchema();
  const sql = getSql();
  await sql`
    UPDATE btcpostage_labels
    SET purchase_status = 'failed',
        purchase_claimed_at = NULL,
        last_error = ${errorMessage.slice(0, 1000)},
        updated_at = now()
    WHERE psl_order_id = ${pslOrderId}
      AND purchase_status <> 'purchased'
  `;
}

export async function markPurchaseNeedsReview(
  pslOrderId: string,
  errorMessage: string,
  partial?: { btcpOrderId?: string | null }
): Promise<void> {
  await ensureBtcpostageSchema();
  const sql = getSql();
  await sql`
    UPDATE btcpostage_labels
    SET purchase_status = 'needs_review',
        btcp_order_id = COALESCE(${partial?.btcpOrderId ?? null}, btcp_order_id),
        last_error = ${errorMessage.slice(0, 1000)},
        updated_at = now()
    WHERE psl_order_id = ${pslOrderId}
      AND purchase_status <> 'purchased'
  `;
}

/**
 * Suggested tracking for the existing ledger workflow.
 * Test labels are excluded — they are not real customer shipments.
 */
export async function getSuggestedTrackingForPaidOrders(
  orderIds: string[]
): Promise<Record<string, { trackingNumber: string; carrier: string; testMode: false }>> {
  const labels = await listBtcpostageLabelsForOrders(orderIds);
  const out: Record<
    string,
    { trackingNumber: string; carrier: string; testMode: false }
  > = {};
  for (const label of labels) {
    if (
      label.purchaseStatus === "purchased" &&
      !label.testMode &&
      label.trackingNumber?.trim()
    ) {
      out[label.pslOrderId] = {
        trackingNumber: label.trackingNumber.trim(),
        carrier: (label.carrier || "USPS").toUpperCase(),
        testMode: false,
      };
    }
  }
  return out;
}
