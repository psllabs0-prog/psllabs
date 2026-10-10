import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { getSql } from "../lib/db/sql";
import type { TagadaCardReads } from "../lib/tagada/verify-payment";
import type { OpenAIAdsSendResult } from "../lib/openai-ads/client";
import type { OpenAIOrderCreatedEvent } from "../lib/openai-ads/events";
import { PRIVACY_CONSENT_VERSION, type PrivacyConsentBinding } from "../lib/privacy/types";
import {
  createOpenAIAdsDelivery,
  createOpenAIAdsSqlStore,
  type OpenAIAdsDeliveryOrder,
  type OpenAIAdsDeliveryStore,
  type OpenAIAdsDeliveryMarker,
  type OpenAIAdsPaymentProof,
} from "../lib/openai-ads/delivery";

const INITIAL_TIME = Date.parse("2026-10-04T18:00:00.000Z");
const config = { pixelId: "fixture_pixel", capiKey: "offline_fixture_key" };
const proof: OpenAIAdsPaymentProof = { provider: "tagada", paymentId: "pay_fixture" };
const CONSENT_BINDING: PrivacyConsentBinding = { digest: "a".repeat(64), revision: 1, version: PRIVACY_CONSENT_VERSION };
const orderFixture: OpenAIAdsDeliveryOrder = {
  orderId: "psl_fixture", status: "paid", paidAt: new Date(INITIAL_TIME - 60000).toISOString(),
  total: 59.99, currency: "USD", paymentMethod: "card", invoiceId: "checkout_fixture",
  attribution: {
    privacyConsent: CONSENT_BINDING,
    utmSource: "chatgpt", utmMedium: "paid", utmCampaign: "fixture_campaign", utmContent: "fixture",
    utmTerm: null, landingPage: "/products/fixture", referrer: null,
    gclid: null, fbclid: null, msclkid: null, ttclid: null,
    oppref: " original/opaque+fixture== ", firstPaidTouchAt: null, lastPaidTouchAt: null,
    firstPaid: null, lastPaid: null,
  },
};
const payment = {
  id: "pay_fixture", orderId: "order_fixture", storeId: "store_fixture", accountId: "account_fixture",
  amount: 5999, currency: "USD", status: "succeeded", subStatus: "approved",
  transactions: [{
    id: "txn_fixture", paymentId: "pay_fixture", storeId: "store_fixture", accountId: "account_fixture",
    amount: 5999, currency: "USD", type: "purchase", status: "succeeded", result: "approved",
    isTest: false, draft: false,
  }],
};
const providerOrder = {
  id: "order_fixture", storeId: "store_fixture", accountId: "account_fixture", status: "paid",
  currency: "USD", paidAmount: 5999, checkoutSessionId: "ch_fixture", draft: false,
  checkoutSession: { id: "ch_fixture", storeId: "store_fixture", checkoutToken: "checkout_fixture", draft: false },
  summaries: [{ orderId: "order_fixture", checkoutSessionId: "ch_fixture", totalAmount: 5999, currency: "USD" }],
  payments: [payment],
};

type Purchase = { order: OpenAIAdsDeliveryOrder; marker: OpenAIAdsDeliveryMarker };
function attr(order: OpenAIAdsDeliveryOrder): Record<string, unknown> {
  return (order.attribution ?? {}) as unknown as Record<string, unknown>;
}
function marker(order: OpenAIAdsDeliveryOrder): OpenAIAdsDeliveryMarker | undefined {
  return attr(order).openaiAdsDelivery as OpenAIAdsDeliveryMarker | undefined;
}
function sameBinding(a: OpenAIAdsDeliveryOrder, b: OpenAIAdsDeliveryOrder) {
  return a.orderId === b.orderId && a.paymentMethod === b.paymentMethod && a.invoiceId === b.invoiceId &&
    a.total === b.total && a.currency === b.currency && a.paidAt === b.paidAt;
}
function eligibleProof(order: OpenAIAdsDeliveryOrder, proof: OpenAIAdsPaymentProof) {
  return typeof order.invoiceId === "string" &&
    !!proof && typeof proof.paymentId === "string" && /^[A-Za-z0-9_-]{1,256}$/.test(proof.paymentId) &&
    (proof.provider === "tagada" ? order.paymentMethod === "card" && /^pay(?:ment)?_[A-Za-z0-9_-]+$/.test(proof.paymentId) &&
        order.invoiceId.length > 0 && order.invoiceId === order.invoiceId.trim() &&
        !/^(?:pay(?:ment)?|ord|order)_[A-Za-z0-9_-]+$/.test(order.invoiceId)
      : proof.provider === "btcpay" && order.paymentMethod === "bitcoin" &&
        /^[A-Za-z0-9_-]{1,256}$/.test(order.invoiceId) && proof.paymentId === order.invoiceId);
}
let checks = 0;
function check(actual: unknown, expected: unknown, message?: string) { checks++; assert.deepEqual(actual, expected, message); }

/** Models atomic row ownership; no actual DB or provider connections exist here. */
function fixture() {
  let now = INITIAL_TIME;
  const rows = new Map([[orderFixture.orderId, structuredClone(orderFixture)]]);
  const effects = { stores: 0, claims: 0, confirms: 0, finishes: 0, providerReads: 0, sends: [] as OpenAIOrderCreatedEvent[] };
  let providerFails = false;
  let providerPayment: unknown = structuredClone(payment);
  let providerResponse: unknown = { order: structuredClone(providerOrder) };
  let sendResult: OpenAIAdsSendResult = { ok: true, status: "accepted", httpStatus: 200, eventId: "fixture" };
  let sendHook: ((event: OpenAIOrderCreatedEvent) => Promise<OpenAIAdsSendResult>) | undefined;
  let confirmHook: (() => void) | undefined;
  let finishFails = false;
  let consentGranted = true;
  let consentRevision = 1;
  const store: OpenAIAdsDeliveryStore = {
    async claim(input) {
      effects.claims++;
      const row = rows.get(input.order.orderId);
      if (!row || !["paid", "shipped"].includes(row.status) || !sameBinding(row, input.order) ||
          row.attribution?.openaiAdsMeasurementOptOut === true) return null;
      const existing = marker(row);
      if (input.existingOnly && !existing) return null;
      if (existing && (existing.status !== "pending" ||
          existing.proof.provider !== input.initial.proof.provider || existing.proof.paymentId !== input.initial.proof.paymentId ||
          (existing.leaseUntilMs ?? 0) > input.nowMs || (existing.nextAttemptMs ?? 0) > input.nowMs)) return null;
      const next: OpenAIAdsDeliveryMarker = {
        ...(existing ?? structuredClone(input.initial)),
        status: "pending", claimToken: input.token, leaseUntilMs: input.nowMs + 60000, nextAttemptMs: null,
        attempts: (existing?.attempts ?? 0) + 1,
      };
      row.attribution = { ...attr(row), openaiAdsDelivery: next } as unknown as OpenAIAdsDeliveryOrder["attribution"];
      return { order: structuredClone(row), marker: structuredClone(next) };
    },
    async confirmLease(snapshot, token, at) {
      effects.confirms++; confirmHook?.();
      const row = rows.get(snapshot.orderId);
      const current = row && marker(row);
      return !!row && sameBinding(row, snapshot) && ["paid", "shipped"].includes(row.status) &&
        row.attribution?.openaiAdsMeasurementOptOut !== true && current?.status === "pending" &&
        current.claimToken === token && (current.leaseUntilMs ?? 0) > at;
    },
    async finish(orderId, token, completion) {
      effects.finishes++;
      if (finishFails) throw new Error("private_fixture_storage_error");
      const row = rows.get(orderId);
      const current = row && marker(row);
      if (!row || current?.status !== "pending" || current.claimToken !== token) return false;
      attr(row).openaiAdsDelivery = { ...current, ...completion, claimToken: null, leaseUntilMs: null };
      return true;
    },
    async expireQueued(at, limit) {
      let count = 0;
      for (const row of rows.values()) {
        const current = marker(row);
        if (count < limit && current?.status === "pending" && (current.leaseUntilMs ?? 0) <= at &&
            (Date.parse(row.paidAt!) < at - 7 * 86400000 || current.event.timestamp_ms < at - 7 * 86400000)) {
          attr(row).openaiAdsDelivery = { ...current, status: "rejected", lastReason: "event_too_old", claimToken: null, leaseUntilMs: null, nextAttemptMs: null };
          count++;
        }
      }
      return count;
    },
    async listQueued(at, limit) {
      const result: Purchase[] = [];
      for (const row of rows.values()) {
        const current = marker(row);
        if (result.length < limit && ["paid", "shipped"].includes(row.status) &&
            row.attribution?.openaiAdsMeasurementOptOut !== true &&
            Date.parse(row.paidAt!) >= at - 7 * 86400000 && current?.status === "pending" &&
            eligibleProof(row, current.proof) &&
            (current.leaseUntilMs ?? 0) <= at && (current.nextAttemptMs ?? 0) <= at) {
          result.push({ order: structuredClone(row), marker: structuredClone(current) });
        }
      }
      return result;
    },
  };
  const reads: TagadaCardReads = {
    storeId: "store_fixture",
    retrievePayment: async () => {
      effects.providerReads++;
      if (providerFails) throw new Error("private_fixture_provider_error");
      return structuredClone(providerPayment);
    },
    retrieveOrder: async () => { effects.providerReads++; return structuredClone(providerResponse); },
  };
  const dependencies = {
    getConfig: () => ({ ok: true as const, config }),
    getStore: () => { effects.stores++; return store; },
    nowMs: () => now, tagadaReads: reads,
    isCurrentMeasurementConsent: async (binding: PrivacyConsentBinding, provider: "openai") =>
      provider === "openai" && consentGranted && binding.digest === CONSENT_BINDING.digest &&
      binding.version === CONSENT_BINDING.version && binding.revision === consentRevision,
    send: async (event: OpenAIOrderCreatedEvent) => {
      effects.sends.push(structuredClone(event));
      return sendHook ? sendHook(event) : sendResult;
    },
    providerTimeoutMs: 10,
  };
  return {
    rows, effects, store, dependencies,
    service: createOpenAIAdsDelivery(dependencies),
    advance: (ms: number) => { now += ms; },
    setResult: (value: OpenAIAdsSendResult) => { sendResult = value; },
    setSendHook: (value: typeof sendHook) => { sendHook = value; },
    setConfirmHook: (value: typeof confirmHook) => { confirmHook = value; },
    setProviderFails: () => { providerFails = true; },
    setPayment: (value: unknown) => { providerPayment = value; },
    setProviderOrder: (value: unknown) => { providerResponse = value; },
    setFinishFails: () => { finishFails = true; },
    setConsent: (granted: boolean) => { consentGranted = granted; },
    reviseConsent: () => { consentRevision++; },
  };
}

const retryable: OpenAIAdsSendResult = { ok: false, status: "failed", reason: "http_error", retryable: true, httpStatus: 503 };
async function queued() {
  const f = fixture(); f.setResult(retryable);
  check(await f.service.safeTrackVerifiedPurchase(orderFixture, proof), { status: "pending", reason: "http_error" });
  f.advance(60000);
  return f;
}

async function sqlContractChecks() {
  const f = await queued();
  const current = marker(f.rows.get(orderFixture.orderId)!)!;
  const observed: Array<{ text: string; values: unknown[] }> = [];
  const fakeSql = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
    observed.push({ text: strings.join("?").replace(/\s+/g, " "), values });
    if (strings.join("").includes("AS marker")) return [{
      order_id: orderFixture.orderId, status: "paid", paid_at: orderFixture.paidAt,
      total: "59.99", currency: "USD", payment_method: "card", invoice_id: "checkout_fixture",
      attribution: JSON.stringify({ ...orderFixture.attribution, openaiAdsDelivery: current }),
      marker: JSON.stringify(current),
    }];
    return [];
  }) as unknown as ReturnType<typeof getSql>;
  const store = createOpenAIAdsSqlStore(fakeSql);
  const claim = await store.claim({ order: orderFixture, initial: current, token: randomUUID(), nowMs: INITIAL_TIME, existingOnly: true });
  check(claim?.order.total, 59.99);
  check(claim?.marker.event.oppref, orderFixture.attribution!.oppref);
  const statement = observed[0].text;
  for (const guard of ["status IN ('paid', 'shipped')", "payment_method =", "invoice_id =", "total =", "currency =", "date_trunc('milliseconds', paid_at) =", "openaiAdsMeasurementOptOut", "claimToken", "leaseUntilMs", "nextAttemptMs", "'proof'->>'paymentId'"]) {
    check(statement.includes(guard), true);
  }
  check(statement.includes("COALESCE(attribution->'openaiAdsDelivery',"), true);
  check(statement.includes("jsonb_set( COALESCE(attribution, '{}'::jsonb)"), true);
  await store.confirmLease(orderFixture, "fixture_token", INITIAL_TIME);
  check(observed[1].text.includes("->>'claimToken' ="), true);
  check(observed[1].text.includes("openaiAdsMeasurementOptOut"), true);
  check(observed[1].text.includes("date_trunc('milliseconds', paid_at) ="), true);
  check(new Date("2026-10-04T17:59:00.123456Z").toISOString(), "2026-10-04T17:59:00.123Z");
  await store.finish(orderFixture.orderId, "fixture_token", { status: "sent", nextAttemptMs: null, lastReason: null });
  check(observed[2].text.includes("->>'claimToken' ="), true);
  const completion = JSON.parse(observed[2].values[0] as string);
  check("event" in completion, false); check("proof" in completion, false);
  await store.expireQueued(INITIAL_TIME, 3);
  check(observed[3].text.includes("FOR UPDATE SKIP LOCKED"), true);
  await store.listQueued(INITIAL_TIME, 3);
  check(observed[4].text.includes("->>'status' = 'pending'"), true);
  check(observed[4].text.includes("paid_at >="), true);
  check(observed[4].text.includes("openaiAdsMeasurementOptOut"), true);
  check(observed[4].text.includes("'proof'->>'paymentId' = invoice_id"), true);
  check(observed[4].text.includes("invoice_id = btrim(invoice_id,"), true);
  check(observed[4].text.includes("invoice_id !~ '^(pay(ment)?|ord|order)_"), true);
  check(observed.every(query => !/CREATE|ALTER|DROP|SELECT \*/.test(query.text)), true);
}

async function main() {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("External requests are forbidden in this offline test"); };
  try {
    {
      const f = fixture();
      const legacy = structuredClone(orderFixture); delete legacy.attribution!.privacyConsent;
      check(await f.service.safeTrackVerifiedPurchase(legacy, proof), { status: "opt_out", reason: "measurement_consent_unavailable" });
      check(f.effects.stores, 0); check(f.effects.sends.length, 0);
      f.setConsent(false);
      check((await f.service.safeTrackVerifiedPurchase(orderFixture, proof)).status, "opt_out");
      f.setConsent(true); f.reviseConsent();
      check((await f.service.safeTrackVerifiedPurchase(orderFixture, proof)).status, "opt_out");
      check(f.effects.sends.length, 0);
    }
    {
      const f = fixture(); f.setConfirmHook(() => f.setConsent(false));
      check((await f.service.safeTrackVerifiedPurchase(orderFixture, proof)).status, "opt_out");
      check(f.effects.sends.length, 0);
      check(marker(f.rows.get(orderFixture.orderId)!)!.status, "rejected");
    }
    {
      const f = await queued(); f.setConsent(false);
      check((await f.service.flushOpenAIPurchases()).optOut, 1);
      check(f.effects.providerReads, 0); check(f.effects.sends.length, 1);
      f.setConsent(true); f.reviseConsent();
      check((await f.service.flushOpenAIPurchases()).selected, 0);
      check(f.effects.sends.length, 1, "a withdrawn queue event cannot revive after a new grant");
    }
    {
      const f = fixture();
      const service = createOpenAIAdsDelivery({ ...f.dependencies, isCurrentMeasurementConsent: async () => { throw new Error("offline consent DB unavailable"); } });
      check((await service.safeTrackVerifiedPurchase(orderFixture, proof)).status, "opt_out");
      check(f.effects.sends.length, 0); check(f.effects.stores, 0);
    }
    {
      let calls = 0;
      const service = createOpenAIAdsDelivery({
        getConfig: () => ({ ok: false, reason: "not_configured" }),
        getStore: () => { calls++; throw new Error("Must not open DB"); },
        getInvoiceStatus: async () => { calls++; throw new Error("Must not read provider"); },
        send: async () => { calls++; throw new Error("Must not send"); },
      });
      check(await service.safeTrackVerifiedPurchase(orderFixture, proof), { status: "skipped", reason: "not_configured" });
      check((await service.flushOpenAIPurchases()).configured, false);
      check(calls, 0);
    }
    {
      const f = fixture();
      check(await f.service.safeTrackVerifiedPurchase({ ...orderFixture, attribution: { ...orderFixture.attribution!, openaiAdsMeasurementOptOut: true } }, proof), {
        status: "opt_out", reason: "measurement_opt_out",
      });
      check(f.effects.stores, 0); check(f.effects.claims, 0); check(f.effects.providerReads, 0); check(f.effects.sends.length, 0);
    }
    {
      const f = fixture();
      check(await f.service.safeTrackVerifiedPurchase(orderFixture, proof), { status: "sent", reason: null });
      const row = f.rows.get(orderFixture.orderId)!;
      const saved = marker(row)!;
      check(saved.status, "sent"); check(saved.attempts, 1); check(saved.claimToken, null);
      check(row.attribution!.utmCampaign, "fixture_campaign");
      check(saved.event.oppref, " original/opaque+fixture== ");
      check(saved.event.data.amount, 5999); check(saved.event.opt_out, true);
      check(f.effects.providerReads, 0);
      check(await f.service.safeTrackVerifiedPurchase(orderFixture, proof), { status: "skipped", reason: "claim_unavailable" });
      check(f.effects.sends.length, 1);
      check(JSON.stringify(saved).includes("email"), false);
    }
    for (const changes of [{ status: "pending" as const }, { total: 60 }, { invoiceId: "different_invoice" }, { currency: "EUR" }]) {
      const f = fixture();
      const result = await f.service.safeTrackVerifiedPurchase({ ...orderFixture, ...changes }, proof);
      check(["rejected", "skipped"].includes(result.status), true); check(f.effects.sends.length, 0);
    }
    {
      const f = fixture();
      check((await f.service.safeTrackVerifiedPurchase(orderFixture, { provider: "btcpay", paymentId: "invoice_fixture" })).status, "rejected");
      check((await f.service.safeTrackVerifiedPurchase(orderFixture, { provider: "tagada", paymentId: "pay_../../secret" })).status, "rejected");
      check(f.effects.stores, 0);
    }
    {
      const f = await queued();
      const original = structuredClone(marker(f.rows.get(orderFixture.orderId)!)!.event);
      f.rows.get(orderFixture.orderId)!.attribution!.oppref = "different_later_reference";
      f.setResult({ ok: true, status: "accepted", httpStatus: 200, eventId: original.id });
      const result = await f.service.flushOpenAIPurchases();
      check(result.sent, 1); check(result.selected, 1); check(result.errors, 0);
      check(f.effects.providerReads, 2); check(f.effects.sends.length, 2);
      check(f.effects.sends[1], original); check(marker(f.rows.get(orderFixture.orderId)!)!.attempts, 2);
      check(f.rows.get(orderFixture.orderId)!.attribution!.utmCampaign, "fixture_campaign");
    }
    for (const invoiceId of ["checkout/opaque.token+part==", "x".repeat(300)]) {
      const f = fixture();
      const opaqueOrder = { ...orderFixture, invoiceId };
      f.rows.set(opaqueOrder.orderId, structuredClone(opaqueOrder));
      f.setResult(retryable);
      check((await f.service.safeTrackVerifiedPurchase(opaqueOrder, proof)).status, "pending");
      f.setProviderOrder({ order: { ...providerOrder, checkoutSession: { ...providerOrder.checkoutSession, checkoutToken: invoiceId } } });
      f.advance(60000); f.setResult({ ok: true, status: "accepted", httpStatus: 200, eventId: "fixture" });
      check((await f.service.flushOpenAIPurchases()).sent, 1);
      check(f.effects.providerReads, 2); check(f.effects.sends.length, 2);
    }
    for (const invoiceId of ["", " token", "token\t", "token\u00a0", "pay_fixture", "payment_fixture", "ord_fixture", "order_fixture"]) {
      const f = fixture();
      const invalid = { ...orderFixture, invoiceId };
      f.rows.set(invalid.orderId, structuredClone(invalid));
      check((await f.service.safeTrackVerifiedPurchase(invalid, proof)).status, "rejected");
      check(f.effects.stores, 0); check(f.effects.providerReads, 0); check(f.effects.sends.length, 0);
    }
    {
      const f = await queued();
      const firstAttempts = marker(f.rows.get(orderFixture.orderId)!)!.attempts;
      f.rows.get(orderFixture.orderId)!.attribution!.openaiAdsMeasurementOptOut = true;
      const result = await f.service.flushOpenAIPurchases();
      check(result.selected, 0); check(f.effects.providerReads, 0); check(f.effects.sends.length, 1);
      check(marker(f.rows.get(orderFixture.orderId)!)!.attempts, firstAttempts);
    }
    {
      const f = fixture();
      f.setConfirmHook(() => { f.rows.get(orderFixture.orderId)!.attribution!.openaiAdsMeasurementOptOut = true; });
      check(await f.service.safeTrackVerifiedPurchase(orderFixture, proof), { status: "skipped", reason: "lease_lost" });
      check(f.effects.sends.length, 0);
    }
    {
      const f = fixture();
      f.setConfirmHook(() => { f.advance(60000); });
      check(await f.service.safeTrackVerifiedPurchase(orderFixture, proof), { status: "skipped", reason: "lease_lost" });
      check(f.effects.sends.length, 0);
    }
    for (const blockedKind of ["opted_out", "invalid_proof"]) {
      const f = await queued();
      const eligible = structuredClone(f.rows.get(orderFixture.orderId)!);
      f.rows.clear();
      for (let i = 0; i < 3; i++) {
        const blocked = structuredClone(eligible);
        blocked.orderId = `psl_blocked_${i}`;
        if (blockedKind === "opted_out") blocked.attribution!.openaiAdsMeasurementOptOut = true;
        else marker(blocked)!.proof = { provider: "btcpay", paymentId: "mismatched_invoice" };
        f.rows.set(blocked.orderId, blocked);
      }
      f.rows.set(eligible.orderId, eligible);
      f.setResult({ ok: true, status: "accepted", httpStatus: 200, eventId: "fixture" });
      const result = await f.service.flushOpenAIPurchases();
      check(result.selected, 1); check(result.sent, 1); check(result.errors, 0);
      check(f.effects.providerReads, 2); check(f.effects.sends.length, 2);
    }
    {
      const f = await queued(); f.setProviderFails();
      const result = await f.service.flushOpenAIPurchases();
      check(result.pending, 1); check(f.effects.sends.length, 1);
      check(marker(f.rows.get(orderFixture.orderId)!)!.lastReason, "provider_unavailable");
      check(JSON.stringify(marker(f.rows.get(orderFixture.orderId)!)).includes("private_fixture"), false);
    }
    for (const altered of [
      { ...payment, amount: 1 }, { ...payment, status: "authorized" },
      { ...payment, isTest: true }, { ...payment, refundedAmount: 5999 },
    ]) {
      const f = await queued(); f.setPayment(altered);
      const outcome = await f.service.flushOpenAIPurchases();
      check(altered.status === "authorized" ? outcome.pending : outcome.rejected, 1);
      check(f.effects.sends.length, 1);
    }
    {
      const f = await queued();
      f.setProviderOrder({ order: { ...providerOrder, checkoutSession: { ...providerOrder.checkoutSession, checkoutToken: "other_checkout" } } });
      check((await f.service.flushOpenAIPurchases()).rejected, 1); check(f.effects.sends.length, 1);
    }
    {
      const f = await queued();
      const service = createOpenAIAdsDelivery({
        ...f.dependencies,
        tagadaReads: { storeId: "store_fixture", retrievePayment: () => new Promise(() => {}), retrieveOrder: () => new Promise(() => {}) },
      });
      check((await service.flushOpenAIPurchases()).pending, 1); check(f.effects.sends.length, 1);
    }
    for (const invoice of [
      { id: "invoice_fixture", status: "settled" as const, processor: "btcpay", metadata: { orderId: "psl_fixture" } },
      { id: "wrong_invoice", status: "settled" as const, processor: "btcpay", metadata: { orderId: "psl_fixture" } },
      { id: "invoice_fixture", status: "settled" as const, processor: "btcpay", metadata: { orderId: "different_order" } },
      { id: "invoice_fixture", status: "expired" as const, processor: "btcpay", metadata: { orderId: "psl_fixture" } },
      { id: "invoice_fixture", status: "processing" as const, processor: "btcpay", metadata: { orderId: "psl_fixture" } },
    ]) {
      const f = fixture();
      const bitcoin = { ...orderFixture, paymentMethod: "bitcoin" as const, invoiceId: "invoice_fixture" };
      const btcProof: OpenAIAdsPaymentProof = { provider: "btcpay", paymentId: "invoice_fixture" };
      f.rows.set(bitcoin.orderId, structuredClone(bitcoin)); f.setResult(retryable);
      let btcReads = 0;
      const service = createOpenAIAdsDelivery({
        ...f.dependencies,
        getInvoiceStatus: async id => { check(id, "invoice_fixture"); btcReads++; return invoice; },
      });
      check((await service.safeTrackVerifiedPurchase(bitcoin, btcProof)).status, "pending");
      f.advance(60000); f.setResult({ ok: true, status: "accepted", httpStatus: 200, eventId: "fixture" });
      const result = await service.flushOpenAIPurchases();
      const valid = invoice.id === bitcoin.invoiceId && invoice.metadata.orderId === bitcoin.orderId && invoice.status === "settled";
      check(result.sent, valid ? 1 : 0); check(btcReads, 1); check(f.effects.sends.length, valid ? 2 : 1);
      if (invoice.status === "processing") check(result.pending, 1);
    }
    {
      const f = fixture();
      const bitcoin = { ...orderFixture, paymentMethod: "bitcoin" as const, invoiceId: "invoice_fixture" };
      f.rows.set(bitcoin.orderId, structuredClone(bitcoin)); f.setResult(retryable);
      let aborted = 0;
      const service = createOpenAIAdsDelivery({
        ...f.dependencies,
        getInvoiceStatus: async (_id, options) => new Promise((_, reject) => {
          options!.signal!.addEventListener("abort", () => { aborted++; reject(new Error("Fixture request aborted")); }, { once: true });
        }),
      });
      await service.safeTrackVerifiedPurchase(bitcoin, { provider: "btcpay", paymentId: "invoice_fixture" });
      f.advance(60000);
      check((await service.flushOpenAIPurchases()).pending, 1);
      check(aborted, 1); check(f.effects.sends.length, 1);
    }
    {
      // Exercise the real BTCPay read path, including authentication and abort.
      // Values are offline fixtures, and every other URL remains forbidden.
      const savedEnvironment = ["BTCPAY_URL", "BTCPAY_STORE_ID", "BTCPAY_API_KEY"].map(key => [key, process.env[key]] as const);
      const blockedFetch = globalThis.fetch;
      process.env.BTCPAY_URL = "https://btcpay-fixture.example.invalid";
      process.env.BTCPAY_STORE_ID = "store_fixture";
      process.env.BTCPAY_API_KEY = "offline_fixture_key";
      let aborted = 0;
      globalThis.fetch = async (input, options) => {
        check(String(input), "https://btcpay-fixture.example.invalid/api/v1/stores/store_fixture/invoices/invoice_fixture");
        check((options!.headers as Record<string, string>).Authorization, "token offline_fixture_key");
        assert.ok(options?.signal);
        return new Promise((_, reject) => {
          options.signal!.addEventListener("abort", () => { aborted++; reject(new Error("Offline fixture fetch aborted")); }, { once: true });
        });
      };
      try {
        const f = fixture();
        const bitcoin = { ...orderFixture, paymentMethod: "bitcoin" as const, invoiceId: "invoice_fixture" };
        f.rows.set(bitcoin.orderId, structuredClone(bitcoin)); f.setResult(retryable);
        await f.service.safeTrackVerifiedPurchase(bitcoin, { provider: "btcpay", paymentId: "invoice_fixture" });
        f.advance(60000);
        check((await f.service.flushOpenAIPurchases()).pending, 1);
        check(aborted, 1); check(f.effects.sends.length, 1);
      } finally {
        globalThis.fetch = blockedFetch;
        for (const [key, value] of savedEnvironment) {
          if (value === undefined) delete process.env[key]; else process.env[key] = value;
        }
      }
    }
    {
      const f = fixture();
      let release: (() => void) | undefined;
      f.setSendHook(async event => {
        await new Promise<void>(resolve => { release = resolve; });
        return { ok: true, status: "accepted", httpStatus: 200, eventId: event.id };
      });
      const first = f.service.safeTrackVerifiedPurchase(orderFixture, proof);
      for (let turn = 0; turn < 10 && !release; turn++) await Promise.resolve();
      assert.ok(release);
      check(await f.service.safeTrackVerifiedPurchase(orderFixture, proof), { status: "skipped", reason: "claim_unavailable" });
      release(); check((await first).status, "sent"); check(f.effects.sends.length, 1);
    }
    {
      const f = fixture();
      f.setSendHook(async () => {
        const current = marker(f.rows.get(orderFixture.orderId)!)!;
        current.claimToken = "replacement_claim_token";
        return { ok: true, status: "accepted", httpStatus: 200, eventId: current.event.id };
      });
      check(await f.service.safeTrackVerifiedPurchase(orderFixture, proof), { status: "skipped", reason: "lease_lost" });
      check(marker(f.rows.get(orderFixture.orderId)!)!.status, "pending");
      check(marker(f.rows.get(orderFixture.orderId)!)!.claimToken, "replacement_claim_token");
    }
    {
      const f = await queued(); f.advance(8 * 86400000);
      const result = await f.service.flushOpenAIPurchases();
      check(result.expired, 1); check(result.selected, 0); check(f.effects.providerReads, 0); check(f.effects.sends.length, 1);
      check(marker(f.rows.get(orderFixture.orderId)!)!.status, "rejected");
    }
    {
      const f = fixture();
      check((await f.service.flushOpenAIPurchases()).selected, 0); check(f.effects.claims, 0); check(f.effects.sends.length, 0);
      f.advance(8 * 86400000);
      check((await f.service.safeTrackVerifiedPurchase(orderFixture, proof)).reason, "event_too_old");
      check(f.effects.claims, 0);
    }
    {
      const f = fixture(); f.setFinishFails();
      check(await f.service.safeTrackVerifiedPurchase(orderFixture, proof), { status: "error", reason: "delivery_unavailable" });
      check(marker(f.rows.get(orderFixture.orderId)!)!.status, "pending");
    }
    {
      const f = fixture();
      const service = createOpenAIAdsDelivery({ ...f.dependencies, getStore: () => { throw new Error("private_fixture_db_secret"); } });
      check(await service.safeTrackVerifiedPurchase(orderFixture, proof), { status: "error", reason: "delivery_unavailable" });
      check((await service.flushOpenAIPurchases()).errors, 1);
    }
    await sqlContractChecks();
    console.log(`OpenAI Ads durable delivery offline checks passed: ${checks}`);
  } finally { globalThis.fetch = originalFetch; }
}

main().catch(error => {
  console.error("OpenAI Ads durable delivery offline tests failed:", error);
  process.exitCode = 1;
});
