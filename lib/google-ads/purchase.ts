// Node-only. Browser code must import purchase-types, never this module.
// Uses existing order JSONB only: no migration, historical backfill or Google request.
import { createHash } from "node:crypto";
import { getSql } from "../db/sql";
import type { Order } from "../orders/types";
import type { InvoiceStatusResult } from "../payments";
import { verifyTagadaCardPayment, type TagadaCardReads } from "../tagada/verify-payment";
import { readGoogleAdsConfig, type GoogleAdsConfig } from "./config";
import type { GoogleAdsPurchaseReceipt } from "./purchase-types";
import type { PrivacyConsentBinding } from "../privacy/types";

export const GOOGLE_PURCHASE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const PROVIDER_TIMEOUT_MS = 5000;
const FUTURE_TOLERANCE_MS = 60 * 1000;

export type GooglePurchaseProof = { provider: "tagada" | "btcpay"; paymentId: string };
export type GooglePurchaseOrder = Pick<Order,
  "orderId" | "status" | "paidAt" | "total" | "currency" |
  "paymentMethod" | "invoiceId" | "attribution"
>;
export type GooglePurchaseMarker = {
  version: 1;
  transactionId: string;
  amountCents: number;
  currency: "USD";
  paidAt: string;
  paymentMethod: "card" | "bitcoin";
  invoiceId: string;
  proof: GooglePurchaseProof;
  sendTo: string;
};
export type StoredGooglePurchase = { order: GooglePurchaseOrder; marker: unknown };
export type GooglePurchaseStore = {
  saveFirst(order: GooglePurchaseOrder, marker: GooglePurchaseMarker, nowMs: number): Promise<boolean>;
  read(orderId: string): Promise<StoredGooglePurchase | null>;
  confirmCurrent(order: GooglePurchaseOrder, marker: GooglePurchaseMarker, nowMs: number): Promise<boolean>;
};
export type GooglePurchaseDependencies = {
  getConfig?: () => GoogleAdsConfig | null;
  getStore?: () => GooglePurchaseStore;
  nowMs?: () => number;
  tagadaReads?: TagadaCardReads;
  getInvoiceStatus?: (invoiceId: string, options: { signal: AbortSignal }) => Promise<InvoiceStatusResult>;
  providerTimeoutMs?: number;
  isCurrentMeasurementConsent?: (binding: PrivacyConsentBinding, provider: "google") => Promise<boolean>;
};

export function isGooglePurchaseOrderId(value: unknown): value is string {
  return typeof value === "string" && /^psl_[A-Za-z0-9_-]{1,100}$/.test(value);
}

function transactionId(orderId: string): string {
  return `psl_${createHash("sha256").update(`google-purchase-v1:${orderId}`).digest("hex").slice(0, 48)}`;
}

function eligible(order: GooglePurchaseOrder, nowMs: number): boolean {
  const paidMs = typeof order.paidAt === "string" ? Date.parse(order.paidAt) : NaN;
  const amountCents = Math.round(order.total * 100);
  return isGooglePurchaseOrderId(order.orderId) &&
    (order.status === "paid" || order.status === "shipped") &&
    order.attribution?.googleAdsMeasurementConsent === true &&
    order.currency === "USD" && Number.isFinite(order.total) && order.total > 0 &&
    Number.isSafeInteger(amountCents) && amountCents > 0 &&
    Math.abs(order.total - amountCents / 100) < 1e-9 &&
    Number.isSafeInteger(nowMs) && Number.isFinite(paidMs) &&
    paidMs >= nowMs - GOOGLE_PURCHASE_MAX_AGE_MS && paidMs <= nowMs + FUTURE_TOLERANCE_MS;
}

function validProof(order: GooglePurchaseOrder, proof: GooglePurchaseProof): boolean {
  if (!proof || typeof proof !== "object" || typeof proof.paymentId !== "string" ||
      !/^[A-Za-z0-9_-]{1,256}$/.test(proof.paymentId) || typeof order.invoiceId !== "string") return false;
  if (proof.provider === "tagada") {
    return order.paymentMethod === "card" && /^pay(?:ment)?_[A-Za-z0-9_-]+$/.test(proof.paymentId) &&
      order.invoiceId.length > 0 && order.invoiceId.length <= 512 &&
      order.invoiceId === order.invoiceId.trim() &&
      !/^(?:pay(?:ment)?|ord|order)_[A-Za-z0-9_-]+$/.test(order.invoiceId);
  }
  return proof.provider === "btcpay" && order.paymentMethod === "bitcoin" &&
    proof.paymentId === order.invoiceId;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function matchingMarker(order: GooglePurchaseOrder, value: unknown, config: GoogleAdsConfig): GooglePurchaseMarker | null {
  const marker = record(value);
  const proof = record(marker?.proof);
  if (!marker || !proof || marker.version !== 1 || marker.transactionId !== transactionId(order.orderId) ||
      marker.amountCents !== Math.round(order.total * 100) || marker.currency !== order.currency ||
      marker.paidAt !== order.paidAt || marker.invoiceId !== order.invoiceId ||
      marker.paymentMethod !== order.paymentMethod || marker.sendTo !== config.sendTo ||
      !validProof(order, proof as GooglePurchaseProof)) return null;
  return marker as GooglePurchaseMarker;
}

type PurchaseRow = {
  order_id: string; status: Order["status"]; paid_at: string | null;
  total: string | number; currency: string; payment_method: Order["paymentMethod"];
  invoice_id: string | null; attribution: Order["attribution"] | string | null; marker: unknown;
};

/** Every write/check is conditional on current order facts and reporting eligibility. */
export function createGooglePurchaseSqlStore(sql: ReturnType<typeof getSql>): GooglePurchaseStore {
  return {
    async saveFirst(order, marker, nowMs) {
      const rows = await sql`
        UPDATE orders o SET attribution = jsonb_set(
          attribution, '{googleAdsVerifiedPurchase}', ${JSON.stringify(marker)}::jsonb, true
        ), updated_at = now()
        WHERE o.order_id = ${order.orderId} AND o.status IN ('paid', 'shipped')
          AND o.payment_method = ${order.paymentMethod} AND o.invoice_id = ${order.invoiceId}
          AND o.total = ${order.total}::numeric AND o.currency = ${order.currency}
          AND date_trunc('milliseconds', o.paid_at) = ${order.paidAt}::timestamptz
          AND o.paid_at >= ${new Date(nowMs - GOOGLE_PURCHASE_MAX_AGE_MS).toISOString()}::timestamptz
          AND o.paid_at <= ${new Date(nowMs + FUTURE_TOLERANCE_MS).toISOString()}::timestamptz
          AND jsonb_typeof(o.attribution) = 'object'
          AND o.attribution->'googleAdsMeasurementConsent' = 'true'::jsonb
          AND o.attribution->'privacyConsent' = ${JSON.stringify(order.attribution?.privacyConsent ?? null)}::jsonb
          AND NOT (o.attribution ? 'googleAdsVerifiedPurchase')
          AND NOT EXISTS (SELECT 1 FROM finance_transactions f
            WHERE f.psl_order_id = o.order_id AND f.reporting_excluded = true)
        RETURNING o.order_id
      `;
      return rows.length === 1;
    },
    async read(orderId) {
      const rows = await sql`
        SELECT o.order_id, o.status, o.paid_at, o.total, o.currency,
          o.payment_method, o.invoice_id, o.attribution,
          o.attribution->'googleAdsVerifiedPurchase' AS marker
        FROM orders o
        WHERE o.order_id = ${orderId} AND o.status IN ('paid', 'shipped')
          AND o.attribution->'googleAdsMeasurementConsent' = 'true'::jsonb
          AND jsonb_typeof(o.attribution->'privacyConsent') = 'object'
          AND o.attribution->'googleAdsVerifiedPurchase' IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM finance_transactions f
            WHERE f.psl_order_id = o.order_id AND f.reporting_excluded = true)
        LIMIT 1
      `;
      if (rows.length !== 1) return null;
      const row = rows[0] as PurchaseRow;
      return {
        order: {
          orderId: row.order_id, status: row.status,
          paidAt: row.paid_at ? new Date(row.paid_at).toISOString() : null,
          total: Number(row.total), currency: row.currency, paymentMethod: row.payment_method,
          invoiceId: row.invoice_id,
          attribution: typeof row.attribution === "string" ? JSON.parse(row.attribution) : row.attribution,
        },
        marker: typeof row.marker === "string" ? JSON.parse(row.marker) : row.marker,
      };
    },
    async confirmCurrent(order, marker, nowMs) {
      const rows = await sql`
        SELECT o.order_id FROM orders o
        WHERE o.order_id = ${order.orderId} AND o.status IN ('paid', 'shipped')
          AND o.payment_method = ${order.paymentMethod} AND o.invoice_id = ${order.invoiceId}
          AND o.total = ${order.total}::numeric AND o.currency = ${order.currency}
          AND date_trunc('milliseconds', o.paid_at) = ${order.paidAt}::timestamptz
          AND o.paid_at >= ${new Date(nowMs - GOOGLE_PURCHASE_MAX_AGE_MS).toISOString()}::timestamptz
          AND o.paid_at <= ${new Date(nowMs + FUTURE_TOLERANCE_MS).toISOString()}::timestamptz
          AND o.attribution->'googleAdsMeasurementConsent' = 'true'::jsonb
          AND o.attribution->'privacyConsent' = ${JSON.stringify(order.attribution?.privacyConsent ?? null)}::jsonb
          AND o.attribution->'googleAdsVerifiedPurchase' = ${JSON.stringify(marker)}::jsonb
          AND NOT EXISTS (SELECT 1 FROM finance_transactions f
            WHERE f.psl_order_id = o.order_id AND f.reporting_excluded = true)
        LIMIT 1
      `;
      return rows.length === 1;
    },
  };
}

async function bounded<T>(operation: (signal: AbortSignal) => Promise<T>, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation(controller.signal),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error("Provider timeout")); }, timeoutMs);
      }),
    ]);
  } finally { clearTimeout(timer); }
}

export function createGooglePurchaseService(dependencies: GooglePurchaseDependencies = {}) {
  const now = dependencies.nowMs ?? Date.now;
  const getConfig = dependencies.getConfig ?? readGoogleAdsConfig;
  let sqlStore: GooglePurchaseStore | undefined;
  const store = () => dependencies.getStore?.() ?? (sqlStore ??= createGooglePurchaseSqlStore(getSql()));
  async function consentCurrent(binding: PrivacyConsentBinding | undefined): Promise<boolean> {
    if (!binding) return false;
    try {
      const check = dependencies.isCurrentMeasurementConsent ??
        (await import("../privacy/server")).isCurrentMeasurementConsent;
      return await check(binding, "google");
    } catch { return false; }
  }

  async function reverify(order: GooglePurchaseOrder, proof: GooglePurchaseProof): Promise<boolean> {
    return bounded(async signal => {
      if (proof.provider === "tagada") {
        const result = await verifyTagadaCardPayment(order, { paymentId: proof.paymentId }, dependencies.tagadaReads);
        return result.ok;
      }
      const invoice = dependencies.getInvoiceStatus
        ? await dependencies.getInvoiceStatus(order.invoiceId!, { signal })
        : await (async () => {
          const { BTCPayProcessor } = await import("../payments/btcpay");
          return new BTCPayProcessor().getInvoiceStatus(order.invoiceId!, { signal });
        })();
      return invoice?.processor === "btcpay" && invoice.id === order.invoiceId &&
        invoice.metadata?.orderId === order.orderId && invoice.status === "settled";
    }, dependencies.providerTimeoutMs ?? PROVIDER_TIMEOUT_MS);
  }

  /** Called only beside strict provider-verified fulfillment hooks, never from a success-page read. */
  async function safeRecordVerifiedGooglePurchase(order: GooglePurchaseOrder, proof: GooglePurchaseProof): Promise<void> {
    try {
      const config = getConfig();
      const nowMs = now();
      if (!config || !eligible(order, nowMs) || !validProof(order, proof) ||
          !await consentCurrent(order.attribution?.privacyConsent)) return;
      const marker: GooglePurchaseMarker = {
        version: 1, transactionId: transactionId(order.orderId),
        amountCents: Math.round(order.total * 100), currency: "USD", paidAt: order.paidAt!,
        invoiceId: order.invoiceId!, paymentMethod: order.paymentMethod!,
        proof: { provider: proof.provider, paymentId: proof.paymentId }, sendTo: config.sendTo,
      };
      await store().saveFirst(order, marker, nowMs);
    } catch {
      // Measurement must never break checkout, reveal provider data or overwrite payment facts.
    }
  }

  async function getVerifiedGooglePurchaseReceipt(
    orderId: string,
    requestBinding: PrivacyConsentBinding | null = null,
  ): Promise<GoogleAdsPurchaseReceipt | null> {
    try {
      const config = getConfig();
      if (!config || !isGooglePurchaseOrderId(orderId) || !requestBinding) return null;
      const database = store();
      const stored = await database.read(orderId);
      if (!stored || !eligible(stored.order, now())) return null;
      const binding = stored.order.attribution?.privacyConsent;
      if (!binding || binding.digest !== requestBinding.digest || binding.revision !== requestBinding.revision ||
          binding.version !== requestBinding.version || !await consentCurrent(binding)) return null;
      const marker = matchingMarker(stored.order, stored.marker, config);
      if (!marker || !await reverify(stored.order, marker.proof)) return null;
      // Recheck after external reads: consent, exclusions and order edits may have changed meanwhile.
      if (getConfig()?.sendTo !== config.sendTo ||
          !eligible(stored.order, now()) || !await database.confirmCurrent(stored.order, marker, now()) ||
          !await consentCurrent(binding)) return null;
      return { transactionId: marker.transactionId, value: marker.amountCents / 100, currency: "USD" };
    } catch { return null; }
  }

  return { safeRecordVerifiedGooglePurchase, getVerifiedGooglePurchaseReceipt };
}

const service = createGooglePurchaseService();
export const safeRecordVerifiedGooglePurchase = service.safeRecordVerifiedGooglePurchase;
export const getVerifiedGooglePurchaseReceipt = service.getVerifiedGooglePurchaseReceipt;
