// Server-only, read-only order verification. No webhook, historical queue or browser Purchase.
import { getSql } from "../db/sql";
import { createMetaPurchaseSqlStore, type MetaPurchaseStore, type MetaPurchaseSnapshot } from "../meta-ads/purchase";
import type { PrivacyConsentBinding } from "../privacy/types";
import { getCatalogProductByHandle } from "../products/catalog";
import { verifyTagadaCardPayment, type TagadaCardReads } from "../tagada/verify-payment";
import { readTikTokServerConfig, type TikTokServerConfig } from "./config";
import { prepareTikTokEvent, type TikTokEventPolicy } from "./events";
import { sendPreparedTikTokEvent, type TikTokTechnicalData } from "./transport";
import { tikTokEventId } from "./event-id";

export type TikTokPurchaseResult = { ok: boolean; reason: string };
export function isTikTokPurchaseOrderId(value: unknown): value is string {
  return typeof value === "string" && /^psl_[A-Za-z0-9_-]{1,100}$/.test(value);
}
function sameBinding(a?: PrivacyConsentBinding | null, b?: PrivacyConsentBinding | null): boolean {
  return !!a && !!b && /^[a-f0-9]{64}$/.test(a.digest) && a.digest === b.digest &&
    Number.isSafeInteger(a.revision) && a.revision > 0 && a.revision === b.revision &&
    Number.isSafeInteger(a.version) && a.version > 0 && a.version === b.version;
}
export function createTikTokPurchaseService(dependencies: {
  getConfig?: () => TikTokServerConfig | null; getStore?: () => MetaPurchaseStore;
  currentPermission?: (binding: PrivacyConsentBinding) => Promise<boolean>;
  tagadaReads?: TagadaCardReads; policy?: TikTokEventPolicy; now?: () => number;
  send?: typeof sendPreparedTikTokEvent; providerTimeoutMs?: number;
} = {}) {
  let sqlStore: MetaPurchaseStore | undefined;
  const now = dependencies.now ?? Date.now;
  const currentPermission = dependencies.currentPermission ?? (async (binding: PrivacyConsentBinding) => {
    const { privacyService } = await import("../privacy/server");
    return privacyService.current(binding, "tiktok", true);
  });
  return {
    async sendPurchase(input: { orderId: string; binding: PrivacyConsentBinding | null;
      sourceUrl: string; technical: TikTokTechnicalData }): Promise<TikTokPurchaseResult> {
      try {
        const config = (dependencies.getConfig ?? readTikTokServerConfig)();
        if (!config) return { ok: false, reason: "inactive" };
        if (!isTikTokPurchaseOrderId(input.orderId) || input.sourceUrl !== "https://www.psllabs.org/success" ||
            !sameBinding(input.binding, input.binding)) return { ok: false, reason: "invalid_request" };
        const binding = input.binding!;
        if (!await currentPermission(binding)) return { ok: false, reason: "consent_unavailable" };
        // Reuse the existing verified finance reader, not a new order store. It
        // excludes reporting-excluded/test/demo rows, ambiguous settlements and refunds.
        const store = dependencies.getStore?.() ?? (sqlStore ??= createMetaPurchaseSqlStore(getSql()));
        const snapshot: MetaPurchaseSnapshot | null = await store.read(input.orderId);
        if (!snapshot || snapshot.order.orderId !== input.orderId ||
            !sameBinding(snapshot.order.attribution?.privacyConsent, binding)) return { ok: false, reason: "purchase_unavailable" };
        const order = snapshot.order;
        const paidAt = typeof order.paidAt === "string" ? Date.parse(order.paidAt) : NaN;
        const time = now();
        const cents = Math.round(order.total * 100);
        if (order.paymentMethod !== "card" || !["paid", "shipped"].includes(order.status) ||
            !Number.isFinite(paidAt) || paidAt > time || time - paidAt > 86_400_000 ||
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
        const prepared = prepareTikTokEvent({ name: "Purchase", eventId: tikTokEventId("Purchase", order.orderId),
          occurredAt: paidAt, sourceUrl: input.sourceUrl, productIds: [...new Set(productIds)],
          valueCents: cents, currency: "USD", settledPayment: true,
        }, { policy: dependencies.policy, now: time, currentConsent: true });
        if (!prepared.ok) return { ok: false, reason: prepared.reason };
        let timeout: ReturnType<typeof setTimeout> | undefined;
        let payment: Awaited<ReturnType<typeof verifyTagadaCardPayment>>;
        try {
          payment = await Promise.race([
            verifyTagadaCardPayment(order, { paymentId: snapshot.paymentId }, dependencies.tagadaReads),
            new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error("provider_timeout")),
              dependencies.providerTimeoutMs ?? 10000); }),
          ]);
        } finally { if (timeout) clearTimeout(timeout); }
        if (!payment.ok || payment.amountCents !== cents || payment.currency !== "USD") return { ok: false, reason: "payment_unverified" };
        const canSend = async () => await store.confirmCurrent(snapshot) && await currentPermission(binding);
        if (!await canSend()) return { ok: false, reason: "purchase_or_consent_changed" };
        const result = await (dependencies.send ?? sendPreparedTikTokEvent)({ config,
          event: prepared.event, technical: input.technical, currentPermission: canSend });
        return result.ok ? { ok: true, reason: "accepted" } : { ok: false, reason: result.reason ?? "unconfirmed_acceptance" };
      } catch { return { ok: false, reason: "purchase_unavailable" }; }
    },
  };
}
export const sendVerifiedTikTokPurchase = createTikTokPurchaseService().sendPurchase;
