// Server-only preparation. No webhook hooks, historical queue or browser Purchase.
import { getSql } from "../db/sql";
import type { Order } from "../orders/types";
import type { PrivacyConsentBinding } from "../privacy/types";
import { getCatalogProductByHandle } from "../products/catalog";
import { verifyTagadaCardPayment, type TagadaCardReads } from "../tagada/verify-payment";
import { readMetaServerConfig, type MetaServerConfig } from "./config";
import { prepareMetaEvent, type MetaEventPolicy } from "./events";
import { sendPreparedMetaEvent, type MetaTechnicalData } from "./transport";
import { metaEventId } from "./event-id";

export const META_PURCHASE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export type MetaPurchaseOrder = Pick<Order,
  "orderId" | "status" | "paidAt" | "total" | "currency" | "paymentMethod" |
  "invoiceId" | "attribution" | "items">;
export type MetaPurchaseSnapshot = { order: MetaPurchaseOrder; paymentId: string };
export type MetaPurchaseStore = {
  read(orderId: string): Promise<MetaPurchaseSnapshot | null>;
  confirmCurrent(snapshot: MetaPurchaseSnapshot): Promise<boolean>;
};
export type MetaPurchaseResult = { ok: boolean; reason: string };

export function isMetaPurchaseOrderId(value: unknown): value is string {
  return typeof value === "string" && /^psl_[A-Za-z0-9_-]{1,100}$/.test(value);
}
function sameBinding(a?: PrivacyConsentBinding | null, b?: PrivacyConsentBinding | null): boolean {
  return !!a && !!b && /^[a-f0-9]{64}$/.test(a.digest) && a.digest === b.digest &&
    Number.isSafeInteger(a.revision) && a.revision > 0 && a.revision === b.revision &&
    Number.isSafeInteger(a.version) && a.version > 0 && a.version === b.version;
}
function sameSnapshot(a: MetaPurchaseSnapshot, b: MetaPurchaseSnapshot): boolean {
  return a.paymentId === b.paymentId &&
    ["orderId", "status", "paidAt", "total", "currency", "paymentMethod", "invoiceId"]
      .every(key => a.order[key as keyof MetaPurchaseOrder] === b.order[key as keyof MetaPurchaseOrder]) &&
    sameBinding(a.order.attribution?.privacyConsent, b.order.attribution?.privacyConsent) &&
    JSON.stringify(a.order.items) === JSON.stringify(b.order.items);
}

/** Only existing real finance/order rows are read. No schema or order writes. */
export function createMetaPurchaseSqlStore(sql: ReturnType<typeof getSql>): MetaPurchaseStore {
  const store: MetaPurchaseStore = {
    async read(orderId) {
      const rows = await sql`
        SELECT o.order_id, o.status, o.paid_at, o.total, o.currency, o.payment_method,
          o.invoice_id, o.attribution, o.items, f.provider_payment_id
        FROM orders o INNER JOIN finance_transactions f ON f.psl_order_id = o.order_id
        WHERE o.order_id = ${orderId} AND o.status IN ('paid', 'shipped')
          AND o.payment_method = 'card' AND f.provider = 'tagada' AND f.payment_method = 'card'
          AND f.reporting_excluded = false AND f.gross_amount = o.total AND f.currency = o.currency
          AND f.provider_payment_id ~ '^pay(ment)?_[A-Za-z0-9_-]+$'
          AND jsonb_typeof(o.attribution->'privacyConsent') = 'object'
          AND NOT EXISTS (SELECT 1 FROM finance_transactions excluded
            WHERE excluded.psl_order_id = o.order_id AND excluded.reporting_excluded = true)
        LIMIT 2
      `;
      if (rows.length !== 1) return null;
      const row = rows[0];
      return { paymentId: String(row.provider_payment_id), order: {
        orderId: String(row.order_id), status: row.status as Order["status"],
        paidAt: row.paid_at ? new Date(String(row.paid_at)).toISOString() : null,
        total: Number(row.total), currency: String(row.currency),
        paymentMethod: row.payment_method as Order["paymentMethod"],
        invoiceId: row.invoice_id === null ? null : String(row.invoice_id),
        attribution: typeof row.attribution === "string" ? JSON.parse(row.attribution) : row.attribution,
        items: typeof row.items === "string" ? JSON.parse(row.items) : row.items,
      } };
    },
    async confirmCurrent(snapshot) {
      const current = await store.read(snapshot.order.orderId);
      return !!current && sameSnapshot(current, snapshot);
    },
  };
  return store;
}

export function createMetaPurchaseService(dependencies: {
  getConfig?: () => MetaServerConfig | null;
  getStore?: () => MetaPurchaseStore;
  currentPermission?: (binding: PrivacyConsentBinding) => Promise<boolean>;
  tagadaReads?: TagadaCardReads;
  policy?: MetaEventPolicy;
  now?: () => number;
  send?: typeof sendPreparedMetaEvent;
  providerTimeoutMs?: number;
} = {}) {
  let sqlStore: MetaPurchaseStore | undefined;
  const now = dependencies.now ?? Date.now;
  const currentPermission = dependencies.currentPermission ?? (async (binding: PrivacyConsentBinding) => {
    const { privacyService } = await import("../privacy/server");
    return privacyService.current(binding, "meta", true);
  });
  return {
    async sendPurchase(input: {
      orderId: string; binding: PrivacyConsentBinding | null;
      sourceUrl: string; technical: MetaTechnicalData;
    }): Promise<MetaPurchaseResult> {
      try {
        const config = (dependencies.getConfig ?? readMetaServerConfig)();
        if (!config) return { ok: false, reason: "inactive" };
        if (!isMetaPurchaseOrderId(input.orderId) || input.sourceUrl !== "https://www.psllabs.org/success" ||
            !sameBinding(input.binding, input.binding)) return { ok: false, reason: "invalid_request" };
        const binding = input.binding!;
        if (!await currentPermission(binding)) return { ok: false, reason: "consent_unavailable" };
        const store = dependencies.getStore?.() ?? (sqlStore ??= createMetaPurchaseSqlStore(getSql()));
        const snapshot = await store.read(input.orderId);
        if (!snapshot || snapshot.order.orderId !== input.orderId ||
            !sameBinding(snapshot.order.attribution?.privacyConsent, binding)) {
          return { ok: false, reason: "purchase_unavailable" };
        }
        const order = snapshot.order;
        const paidAt = typeof order.paidAt === "string" ? Date.parse(order.paidAt) : NaN;
        const time = now();
        const cents = Math.round(order.total * 100);
        if (order.paymentMethod !== "card" || !["paid", "shipped"].includes(order.status) ||
            !Number.isFinite(paidAt) || paidAt > time || time - paidAt > META_PURCHASE_MAX_AGE_MS ||
            order.currency !== "USD" || !Number.isSafeInteger(cents) || cents <= 0 ||
            Math.abs(order.total - cents / 100) > 1e-9 || !Array.isArray(order.items) ||
            !order.items.length || order.items.length > 10) return { ok: false, reason: "ineligible_purchase" };
        const productIds: string[] = [];
        for (const item of order.items) {
          const catalog = typeof item?.handle === "string" ? getCatalogProductByHandle(item.handle) : undefined;
          if (!catalog || catalog.status !== "active" || !Number.isSafeInteger(item.quantity) ||
              item.quantity <= 0 || item.quantity > 10) return { ok: false, reason: "ineligible_cart" };
          productIds.push(catalog.sku);
        }
        const prepared = prepareMetaEvent({ name: "Purchase",
          eventId: metaEventId("Purchase", order.orderId),
          occurredAt: paidAt, sourceUrl: input.sourceUrl, productIds,
          valueCents: cents, currency: "USD", settledPayment: true,
        }, { policy: dependencies.policy, now: time, currentConsent: true });
        if (!prepared.ok) return { ok: false, reason: prepared.reason };
        // Client values and the local paid flag cannot establish payment truth.
        let timeout: ReturnType<typeof setTimeout> | undefined;
        let payment: Awaited<ReturnType<typeof verifyTagadaCardPayment>>;
        try {
          payment = await Promise.race([
            verifyTagadaCardPayment(order, { paymentId: snapshot.paymentId }, dependencies.tagadaReads),
            new Promise<never>((_, reject) => {
              timeout = setTimeout(() => reject(new Error("provider_timeout")), dependencies.providerTimeoutMs ?? 10000);
            }),
          ]);
        } finally { if (timeout) clearTimeout(timeout); }
        if (!payment.ok || payment.amountCents !== cents || payment.currency !== "USD") {
          return { ok: false, reason: "payment_unverified" };
        }
        // Re-read finance exclusions, amount/items and receipt after provider I/O,
        // then repeat immediately before the transport's single send attempt.
        const canSend = async () => await store.confirmCurrent(snapshot) && await currentPermission(binding);
        if (!await canSend()) return { ok: false, reason: "purchase_or_consent_changed" };
        const result = await (dependencies.send ?? sendPreparedMetaEvent)({ config,
          event: prepared.event, technical: input.technical, currentPermission: canSend });
        return result.ok ? { ok: true, reason: "received" } : { ok: false, reason: result.reason ?? "unconfirmed_receipt" };
      } catch { return { ok: false, reason: "purchase_unavailable" }; }
    },
  };
}

export const sendVerifiedMetaPurchase = createMetaPurchaseService().sendPurchase;
