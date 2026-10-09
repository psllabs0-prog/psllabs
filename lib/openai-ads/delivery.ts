// Private server delivery queue. No schema creation, historical backfill or PII.
import { randomUUID } from "node:crypto";
import { getSql } from "../db/sql";
import type { Order } from "../orders/types";
import type { InvoiceStatusResult } from "../payments";
import { verifyTagadaCardPayment, type TagadaCardReads } from "../tagada/verify-payment";
import type { PrivacyConsentBinding } from "../privacy/types";
import {
  buildOpenAIOrderCreatedEvent,
  prepareOpenAIOrderCreatedEvent,
  OPENAI_EVENT_MAX_AGE_MS,
  type OpenAIOrderCreatedEvent,
} from "./events";
import {
  readOpenAIAdsConfig,
  sendOpenAIOrderCreatedEvent,
  type OpenAIAdsConfig,
  type OpenAIAdsConfigResult,
  type OpenAIAdsSendResult,
} from "./client";

const LEASE_MS = 60000;
const PROVIDER_TIMEOUT_MS = 5000;
const MAX_FLUSH = 3;
// ECMAScript String.trim characters, mirrored by SQL btrim for opaque card tokens.
const TRIM_CHARACTERS = "\u0009\u000a\u000b\u000c\u000d\u0020\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff";

export type OpenAIAdsPaymentProof = { provider: "tagada" | "btcpay"; paymentId: string };
export type OpenAIAdsDeliveryOrder = Pick<
  Order, "orderId" | "status" | "paidAt" | "total" | "currency" |
    "paymentMethod" | "invoiceId" | "attribution"
>;

export type OpenAIAdsDeliveryMarker = {
  version: 1;
  status: "pending" | "sent" | "rejected";
  event: OpenAIOrderCreatedEvent;
  proof: OpenAIAdsPaymentProof;
  attempts: number;
  claimToken: string | null;
  leaseUntilMs: number | null;
  nextAttemptMs: number | null;
  lastReason: string | null;
};

type ClaimedPurchase = { order: OpenAIAdsDeliveryOrder; marker: OpenAIAdsDeliveryMarker };
type Completion = {
  status: "pending" | "sent" | "rejected";
  nextAttemptMs: number | null;
  lastReason: string | null;
};
type ClaimInput = {
  order: OpenAIAdsDeliveryOrder;
  initial: OpenAIAdsDeliveryMarker;
  token: string;
  nowMs: number;
  existingOnly: boolean;
};

/** Injection is read/write persistence only; production uses atomic SQL below. */
export type OpenAIAdsDeliveryStore = {
  claim(input: ClaimInput): Promise<ClaimedPurchase | null>;
  confirmLease(order: OpenAIAdsDeliveryOrder, token: string, nowMs: number): Promise<boolean>;
  finish(orderId: string, token: string, completion: Completion): Promise<boolean>;
  expireQueued(nowMs: number, limit: number): Promise<number>;
  listQueued(nowMs: number, limit: number): Promise<ClaimedPurchase[]>;
};

type DeliveryRow = {
  order_id: string;
  status: Order["status"];
  paid_at: string | null;
  total: string | number;
  currency: string;
  payment_method: Order["paymentMethod"];
  invoice_id: string | null;
  attribution: Order["attribution"] | string | null;
  marker: OpenAIAdsDeliveryMarker | string;
};

function rowPurchase(row: DeliveryRow): ClaimedPurchase {
  return {
    order: {
      orderId: row.order_id, status: row.status,
      paidAt: row.paid_at ? new Date(row.paid_at).toISOString() : null,
      total: Number(row.total), currency: row.currency,
      paymentMethod: row.payment_method, invoiceId: row.invoice_id,
      attribution: typeof row.attribution === "string" ? JSON.parse(row.attribution) : row.attribution,
    },
    marker: typeof row.marker === "string" ? JSON.parse(row.marker) : row.marker,
  };
}

/** Does not call ensureOrdersSchema: this queue uses the existing JSONB column. */
export function createOpenAIAdsSqlStore(sql: ReturnType<typeof getSql>): OpenAIAdsDeliveryStore {
  return {
    async claim({ order, initial, token, nowMs, existingOnly }) {
      const rows = await sql`
        UPDATE orders
        SET attribution = jsonb_set(
          COALESCE(attribution, '{}'::jsonb), '{openaiAdsDelivery}',
          COALESCE(attribution->'openaiAdsDelivery', ${JSON.stringify(initial)}::jsonb)
          || jsonb_build_object(
            'status', 'pending', 'claimToken', ${token}::text,
            'leaseUntilMs', ${nowMs + LEASE_MS}::bigint, 'nextAttemptMs', NULL,
            'attempts', COALESCE((attribution->'openaiAdsDelivery'->>'attempts')::int, 0) + 1
          ), true
        ), updated_at = now()
        WHERE order_id = ${order.orderId}
          AND status IN ('paid', 'shipped')
          AND payment_method = ${order.paymentMethod}
          AND invoice_id = ${order.invoiceId}
          AND total = ${order.total}::numeric AND currency = ${order.currency}
          AND date_trunc('milliseconds', paid_at) = ${order.paidAt}::timestamptz
          AND (attribution IS NULL OR jsonb_typeof(attribution) = 'object')
          AND COALESCE(attribution->>'openaiAdsMeasurementOptOut', 'false') <> 'true'
          AND attribution->'privacyConsent' = ${JSON.stringify(order.attribution?.privacyConsent ?? null)}::jsonb
          AND jsonb_typeof(attribution->'privacyConsent') = 'object'
          AND NOT EXISTS (SELECT 1 FROM finance_transactions f
            WHERE f.psl_order_id = orders.order_id AND f.reporting_excluded = true)
          AND (${existingOnly}::boolean = false OR attribution->'openaiAdsDelivery' IS NOT NULL)
          AND (
            attribution->'openaiAdsDelivery' IS NULL
            OR (
              attribution->'openaiAdsDelivery'->>'version' = '1'
              AND attribution->'openaiAdsDelivery'->>'status' = 'pending'
              AND attribution->'openaiAdsDelivery'->'proof'->>'provider' = ${initial.proof.provider}
              AND attribution->'openaiAdsDelivery'->'proof'->>'paymentId' = ${initial.proof.paymentId}
              AND COALESCE((attribution->'openaiAdsDelivery'->>'leaseUntilMs')::bigint, 0) <= ${nowMs}::bigint
              AND COALESCE((attribution->'openaiAdsDelivery'->>'nextAttemptMs')::bigint, 0) <= ${nowMs}::bigint
            )
          )
        RETURNING order_id, status, paid_at, total, currency, payment_method, invoice_id,
          attribution, attribution->'openaiAdsDelivery' AS marker
      `;
      return rows.length ? rowPurchase(rows[0] as DeliveryRow) : null;
    },
    async confirmLease(order, token, nowMs) {
      const rows = await sql`
        SELECT order_id FROM orders
        WHERE order_id = ${order.orderId} AND status IN ('paid', 'shipped')
          AND payment_method = ${order.paymentMethod} AND invoice_id = ${order.invoiceId}
          AND total = ${order.total}::numeric AND currency = ${order.currency}
          AND date_trunc('milliseconds', paid_at) = ${order.paidAt}::timestamptz
          AND COALESCE(attribution->>'openaiAdsMeasurementOptOut', 'false') <> 'true'
          AND attribution->'privacyConsent' = ${JSON.stringify(order.attribution?.privacyConsent ?? null)}::jsonb
          AND NOT EXISTS (SELECT 1 FROM finance_transactions f
            WHERE f.psl_order_id = orders.order_id AND f.reporting_excluded = true)
          AND attribution->'openaiAdsDelivery'->>'status' = 'pending'
          AND attribution->'openaiAdsDelivery'->>'claimToken' = ${token}
          AND (attribution->'openaiAdsDelivery'->>'leaseUntilMs')::bigint > ${nowMs}::bigint
        LIMIT 1
      `;
      return rows.length === 1;
    },
    async finish(orderId, token, completion) {
      const patch = { ...completion, claimToken: null, leaseUntilMs: null };
      const rows = await sql`
        UPDATE orders SET attribution = jsonb_set(
          attribution, '{openaiAdsDelivery}',
          (attribution->'openaiAdsDelivery') || ${JSON.stringify(patch)}::jsonb, true
        ), updated_at = now()
        WHERE order_id = ${orderId}
          AND attribution->'openaiAdsDelivery'->>'status' = 'pending'
          AND attribution->'openaiAdsDelivery'->>'claimToken' = ${token}
        RETURNING order_id
      `;
      return rows.length === 1;
    },
    async expireQueued(nowMs, limit) {
      const rows = await sql`
        WITH expired AS (
          SELECT order_id FROM orders
          WHERE attribution->'openaiAdsDelivery'->>'version' = '1'
            AND attribution->'openaiAdsDelivery'->>'status' = 'pending'
            AND COALESCE((attribution->'openaiAdsDelivery'->>'leaseUntilMs')::bigint, 0) <= ${nowMs}::bigint
            AND (
              paid_at < ${new Date(nowMs - OPENAI_EVENT_MAX_AGE_MS).toISOString()}::timestamptz
              OR (attribution->'openaiAdsDelivery'->'event'->>'timestamp_ms')::bigint < ${nowMs - OPENAI_EVENT_MAX_AGE_MS}::bigint
            )
          ORDER BY paid_at ASC LIMIT ${limit} FOR UPDATE SKIP LOCKED
        )
        UPDATE orders o SET attribution = jsonb_set(
          o.attribution, '{openaiAdsDelivery}',
          (o.attribution->'openaiAdsDelivery') ||
          '{"status":"rejected","lastReason":"event_too_old","claimToken":null,"leaseUntilMs":null,"nextAttemptMs":null}'::jsonb,
          true
        ), updated_at = now()
        FROM expired WHERE o.order_id = expired.order_id RETURNING o.order_id
      `;
      return rows.length;
    },
    async listQueued(nowMs, limit) {
      const rows = await sql`
        SELECT order_id, status, paid_at, total, currency, payment_method, invoice_id,
          attribution, attribution->'openaiAdsDelivery' AS marker
        FROM orders
        WHERE status IN ('paid', 'shipped')
          AND paid_at >= ${new Date(nowMs - OPENAI_EVENT_MAX_AGE_MS).toISOString()}::timestamptz
          AND attribution->'openaiAdsDelivery'->>'version' = '1'
          AND attribution->'openaiAdsDelivery'->>'status' = 'pending'
          AND COALESCE((attribution->'openaiAdsDelivery'->>'leaseUntilMs')::bigint, 0) <= ${nowMs}::bigint
          AND COALESCE((attribution->'openaiAdsDelivery'->>'nextAttemptMs')::bigint, 0) <= ${nowMs}::bigint
          AND COALESCE(attribution->>'openaiAdsMeasurementOptOut', 'false') <> 'true'
          AND char_length(attribution->'openaiAdsDelivery'->'proof'->>'paymentId') BETWEEN 1 AND 256
          AND jsonb_typeof(attribution->'privacyConsent') = 'object'
          AND NOT EXISTS (SELECT 1 FROM finance_transactions f
            WHERE f.psl_order_id = orders.order_id AND f.reporting_excluded = true)
          AND (
            (payment_method = 'card'
              AND attribution->'openaiAdsDelivery'->'proof'->>'provider' = 'tagada'
              AND attribution->'openaiAdsDelivery'->'proof'->>'paymentId' ~ '^pay(ment)?_[A-Za-z0-9_-]+$'
              AND invoice_id <> '' AND invoice_id = btrim(invoice_id, ${TRIM_CHARACTERS})
              AND invoice_id !~ '^(pay(ment)?|ord|order)_[A-Za-z0-9_-]+$')
            OR (payment_method = 'bitcoin'
              AND attribution->'openaiAdsDelivery'->'proof'->>'provider' = 'btcpay'
              AND invoice_id ~ '^[A-Za-z0-9_-]{1,256}$'
              AND attribution->'openaiAdsDelivery'->'proof'->>'paymentId' = invoice_id)
          )
        ORDER BY paid_at ASC LIMIT ${limit}
      `;
      return rows.map(row => rowPurchase(row as DeliveryRow));
    },
  };
}

export type OpenAIAdsDeliveryResult = {
  status: "sent" | "pending" | "rejected" | "skipped" | "error" | "opt_out";
  reason: string | null;
};
export type OpenAIAdsFlushResult = {
  configured: boolean;
  selected: number;
  sent: number;
  pending: number;
  rejected: number;
  skipped: number;
  errors: number;
  expired: number;
  optOut: number;
};
export type OpenAIAdsDeliveryDependencies = {
  getConfig?: () => OpenAIAdsConfigResult;
  getStore?: () => OpenAIAdsDeliveryStore;
  nowMs?: () => number;
  claimToken?: () => string;
  send?: (event: OpenAIOrderCreatedEvent, config: OpenAIAdsConfig, nowMs: number) => Promise<OpenAIAdsSendResult>;
  tagadaReads?: TagadaCardReads;
  getInvoiceStatus?: (invoiceId: string, options?: { signal?: AbortSignal }) => Promise<InvoiceStatusResult>;
  providerTimeoutMs?: number;
  isCurrentMeasurementConsent?: (binding: PrivacyConsentBinding, provider: "openai") => Promise<boolean>;
};

function validProof(order: OpenAIAdsDeliveryOrder, proof: OpenAIAdsPaymentProof): boolean {
  if (!proof || typeof proof !== "object" ||
      typeof proof.paymentId !== "string" || !/^[A-Za-z0-9_-]{1,256}$/.test(proof.paymentId) ||
      typeof order.invoiceId !== "string") return false;
  return proof.provider === "tagada"
    ? order.paymentMethod === "card" && /^pay(?:ment)?_[A-Za-z0-9_-]+$/.test(proof.paymentId) &&
      order.invoiceId.length > 0 && order.invoiceId === order.invoiceId.trim() &&
      !/^(?:pay(?:ment)?|ord|order)_[A-Za-z0-9_-]+$/.test(order.invoiceId)
    : proof.provider === "btcpay" && order.paymentMethod === "bitcoin" &&
      /^[A-Za-z0-9_-]{1,256}$/.test(order.invoiceId) && proof.paymentId === order.invoiceId;
}

async function bounded<T>(operation: (signal: AbortSignal) => Promise<T>, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation(controller.signal),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error("Provider read timed out"));
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function retryDelayMs(attempts: number): number {
  return Math.min(60000 * 2 ** Math.min(Math.max(attempts - 1, 0), 9), 6 * 60 * 60 * 1000);
}

/** Creates the service without reading env, opening DB or making provider calls. */
export function createOpenAIAdsDelivery(dependencies: OpenAIAdsDeliveryDependencies = {}) {
  const clock = dependencies.nowMs ?? Date.now;
  const token = dependencies.claimToken ?? randomUUID;
  const getConfig = dependencies.getConfig ?? readOpenAIAdsConfig;
  let sqlStore: OpenAIAdsDeliveryStore | undefined;
  const store = () => dependencies.getStore?.() ?? (sqlStore ??= createOpenAIAdsSqlStore(getSql()));
  const providerTimeoutMs = dependencies.providerTimeoutMs ?? PROVIDER_TIMEOUT_MS;
  async function consentCurrent(binding: PrivacyConsentBinding | undefined): Promise<boolean> {
    if (!binding) return false;
    try {
      const check = dependencies.isCurrentMeasurementConsent ??
        (await import("../privacy/server")).isCurrentMeasurementConsent;
      return await check(binding, "openai");
    } catch { return false; }
  }

  async function reverify(order: OpenAIAdsDeliveryOrder, proof: OpenAIAdsPaymentProof): Promise<{ ok: boolean; retryable: boolean }> {
    if (!validProof(order, proof)) return { ok: false, retryable: false };
    try {
      if (proof.provider === "tagada") {
        const verified = await bounded(
          () => verifyTagadaCardPayment(order, { paymentId: proof.paymentId }, dependencies.tagadaReads),
          providerTimeoutMs,
        );
        return { ok: verified.ok, retryable: !verified.ok && verified.retryable };
      }
      const invoice = await bounded(async signal => {
        if (dependencies.getInvoiceStatus) return dependencies.getInvoiceStatus(order.invoiceId!, { signal });
        const { BTCPayProcessor } = await import("../payments/btcpay");
        return new BTCPayProcessor().getInvoiceStatus(order.invoiceId!, { signal });
      }, providerTimeoutMs);
      if (!invoice || invoice.processor !== "btcpay" || invoice.id !== order.invoiceId ||
          invoice.metadata?.orderId !== order.orderId) return { ok: false, retryable: false };
      return { ok: invoice.status === "settled", retryable: invoice.status === "new" || invoice.status === "processing" };
    } catch {
      return { ok: false, retryable: true };
    }
  }

  async function deliver(
    database: OpenAIAdsDeliveryStore,
    claimed: ClaimedPurchase,
    claimToken: string,
    config: OpenAIAdsConfig,
    retry: boolean,
  ): Promise<OpenAIAdsDeliveryResult> {
    const { order, marker } = claimed;
    if (order.attribution?.openaiAdsMeasurementOptOut === true ||
        !await consentCurrent(order.attribution?.privacyConsent)) {
      await database.finish(order.orderId, claimToken, {
        status: "rejected", nextAttemptMs: null, lastReason: "measurement_consent_unavailable",
      });
      return { status: "opt_out", reason: "measurement_consent_unavailable" };
    }
    let completion: Completion;
    const prepared = prepareOpenAIOrderCreatedEvent(marker.event, clock());
    const expected = buildOpenAIOrderCreatedEvent(order, { nowMs: clock(), optOut: true });
    if (!prepared.ok || !expected.ok) {
      completion = { status: "rejected", nextAttemptMs: null, lastReason: !prepared.ok ? prepared.reason : !expected.ok ? expected.reason : "invalid_event" };
    } else if (
      !validProof(order, marker.proof) || marker.event.opt_out !== true ||
      marker.event.id !== expected.event.id || marker.event.timestamp_ms !== expected.event.timestamp_ms ||
      marker.event.data.amount !== expected.event.data.amount || marker.event.data.currency !== expected.event.data.currency ||
      !Number.isSafeInteger(marker.attempts) || marker.attempts < 1
    ) {
      completion = { status: "rejected", nextAttemptMs: null, lastReason: "purchase_binding_mismatch" };
    } else {
      const verified = retry ? await reverify(order, marker.proof) : { ok: true, retryable: false };
      if (!verified.ok) {
        completion = {
          status: verified.retryable ? "pending" : "rejected",
          lastReason: verified.retryable ? "provider_unavailable" : "provider_rejected",
          nextAttemptMs: verified.retryable ? clock() + retryDelayMs(marker.attempts) : null,
        };
      } else {
        if (!await database.confirmLease(order, claimToken, clock()) ||
            !Number.isSafeInteger(marker.leaseUntilMs) || marker.leaseUntilMs! < clock() + 5000) {
          return { status: "skipped", reason: "lease_lost" };
        }
        // Recheck the current receipt after provider and lease reads, immediately before transport.
        if (!await consentCurrent(order.attribution?.privacyConsent)) {
          await database.finish(order.orderId, claimToken, {
            status: "rejected", nextAttemptMs: null, lastReason: "measurement_consent_unavailable",
          });
          return { status: "opt_out", reason: "measurement_consent_unavailable" };
        }
        let sent: OpenAIAdsSendResult;
        try {
          sent = await (dependencies.send
            ? dependencies.send(prepared.event, config, clock())
            : sendOpenAIOrderCreatedEvent(prepared.event, { config, nowMs: clock(), timeoutMs: 5000 }));
        } catch {
          sent = { ok: false, status: "failed", reason: "transport_error", retryable: true };
        }
        completion = sent.ok && sent.status === "accepted"
          ? { status: "sent", nextAttemptMs: null, lastReason: null }
          : !sent.ok && sent.status === "failed" && sent.retryable
            ? { status: "pending", nextAttemptMs: clock() + retryDelayMs(marker.attempts), lastReason: safeSendReason(sent) }
            : { status: "rejected", nextAttemptMs: null, lastReason: sent.ok ? "validation_only_result" : safeSendReason(sent) };
      }
    }
    if (!await database.finish(order.orderId, claimToken, completion)) {
      return { status: "skipped", reason: "lease_lost" };
    }
    return { status: completion.status, reason: completion.lastReason };
  }

  async function safeTrackVerifiedPurchase(
    order: OpenAIAdsDeliveryOrder,
    proof: OpenAIAdsPaymentProof,
  ): Promise<OpenAIAdsDeliveryResult> {
    try {
      const configuration = getConfig();
      if (!configuration.ok) return { status: "skipped", reason: configuration.reason };
      if (order.attribution?.openaiAdsMeasurementOptOut === true) {
        return { status: "opt_out", reason: "measurement_opt_out" };
      }
      if (!await consentCurrent(order.attribution?.privacyConsent)) {
        return { status: "opt_out", reason: "measurement_consent_unavailable" };
      }
      if (!validProof(order, proof)) return { status: "rejected", reason: "invalid_payment_proof" };
      const nowMs = clock();
      const built = buildOpenAIOrderCreatedEvent(order, { nowMs, oppref: order.attribution?.oppref ?? undefined, optOut: true });
      if (!built.ok) return { status: "rejected", reason: built.reason };
      const initial: OpenAIAdsDeliveryMarker = {
        version: 1, status: "pending", event: built.event,
        proof: { provider: proof.provider, paymentId: proof.paymentId },
        attempts: 0, claimToken: null, leaseUntilMs: null, nextAttemptMs: null, lastReason: null,
      };
      const database = store();
      const claimToken = token();
      const claimed = await database.claim({ order, initial, token: claimToken, nowMs, existingOnly: false });
      if (!claimed) return { status: "skipped", reason: "claim_unavailable" };
      // A stored queue record is a retry even when another settlement hook found it.
      return await deliver(database, claimed, claimToken, configuration.config, claimed.marker.attempts > 1);
    } catch {
      return { status: "error", reason: "delivery_unavailable" };
    }
  }

  async function flushOpenAIPurchases(limit = MAX_FLUSH): Promise<OpenAIAdsFlushResult> {
    const summary: OpenAIAdsFlushResult = {
      configured: false, selected: 0, sent: 0, pending: 0, rejected: 0, skipped: 0, errors: 0, expired: 0, optOut: 0,
    };
    try {
      const configuration = getConfig();
      if (!configuration.ok) return summary;
      summary.configured = true;
      const nowMs = clock();
      if (!Number.isSafeInteger(nowMs) || nowMs < OPENAI_EVENT_MAX_AGE_MS) {
        summary.errors++; return summary;
      }
      const safeLimit = Number.isSafeInteger(limit) ? Math.min(Math.max(limit, 1), MAX_FLUSH) : MAX_FLUSH;
      const database = store();
      summary.expired = await database.expireQueued(nowMs, safeLimit);
      const purchases = await database.listQueued(nowMs, safeLimit);
      summary.selected = purchases.length;
      for (const purchase of purchases) {
        try {
          if (purchase.order.attribution?.openaiAdsMeasurementOptOut === true) {
            summary.optOut++; continue;
          }
          if (!validProof(purchase.order, purchase.marker.proof)) {
            summary.errors++; continue;
          }
          const claimToken = token();
          const claimed = await database.claim({ order: purchase.order, initial: purchase.marker, token: claimToken, nowMs: clock(), existingOnly: true });
          if (!claimed) { summary.skipped++; continue; }
          const result = await deliver(database, claimed, claimToken, configuration.config, true);
          if (result.status === "error") summary.errors++;
          else if (result.status === "opt_out") summary.optOut++;
          else summary[result.status]++;
        } catch { summary.errors++; }
      }
    } catch { summary.errors++; }
    return summary;
  }
  return { safeTrackVerifiedPurchase, flushOpenAIPurchases };
}

function safeSendReason(result: Exclude<OpenAIAdsSendResult, { ok: true }>): string {
  // Accept only the client's known codes, never a provider body/error message.
  const allowed = new Set([
    "not_configured", "invalid_configuration", "server_only", "invalid_timeout", "http_error",
    "timeout", "transport_error", "unpaid_order", "invalid_order_id", "invalid_paid_at",
    "unsupported_currency", "invalid_amount", "invalid_event", "invalid_oppref",
    "invalid_clock", "event_too_old", "event_in_future",
  ]);
  return allowed.has(result.reason) ? result.reason : "transport_error";
}

const defaultDelivery = createOpenAIAdsDelivery();
export const safeTrackVerifiedPurchase = defaultDelivery.safeTrackVerifiedPurchase;
export const flushOpenAIPurchases = defaultDelivery.flushOpenAIPurchases;
