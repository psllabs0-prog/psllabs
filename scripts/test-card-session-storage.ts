import assert from "node:assert/strict";
import {
  CARD_SESSION_KEY, CARD_SESSION_TTL_MS, createCardSessionStore, getCardReturnHints,
  cardCartFingerprint, cardSessionMatchesCart, cardSessionReadyToCharge, parseCardCheckout, retryCardConfirmation, sanitizeCardSession,
  type TagadaCardSession,
} from "../lib/checkout/card-session-storage";

const session: TagadaCardSession = {
  orderId: "PSL-fixture", checkoutToken: "checkout_fixture", sessionToken: "fixture-session-token",
  storeId: "store_fixture", customer: { email: "fixture@example.test", firstName: "Test", lastName: "Buyer" },
  shippingAddress: { line1: "100 Test Way", city: "Phoenix", state: "AZ", postalCode: "85001", country: "US" },
  items: [{ variantId: "variant_fixture", quantity: 1 }], shippingCost: 8.99, total: 68.98,
  cartFingerprint: cardCartFingerprint([{ handle: "fixture", quantity: 1, unitPrice: 59.99 }]),
};
let checks = 0;
function check(value: unknown, message?: string) { checks++; assert.ok(value, message); }

async function main() {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("Network is forbidden in this test"); };
  try {
    let clock = 100000;
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); },
    };
    const store = createCardSessionStore(() => storage, () => clock);
    check(store.getServerSnapshot() === null, "SSR snapshot is deterministic");
    check(store.start(session));
    const ready = store.getSnapshot()!;
    check(ready.phase === "ready");
    check(ready === store.getSnapshot(), "snapshot reference remains stable");
    check(ready.expiresAt - ready.createdAt === CARD_SESSION_TTL_MS);
    const raw = values.get(CARD_SESSION_KEY)!;
    assert.deepEqual(parseCardCheckout(raw, clock)?.session, session);
    checks++;
    const restored = createCardSessionStore(() => storage, () => clock);
    check(restored.getSnapshot()?.session?.orderId === session.orderId);
    check(restored.markProcessing(session.orderId));
    check(!restored.markProcessing(session.orderId), "another charge cannot start while processing");
    check(restored.rememberConfirmation(session.orderId, { paymentId: "pay_fixture" }, true));
    check(restored.getSnapshot()?.phase === "confirming");
    check(restored.getSnapshot()?.phase === "confirming", "reported success never reopens charging");
    check(!restored.start({ ...session, orderId: "PSL-new" }), "new checkout cannot replace unresolved payment");
    const afterReload = createCardSessionStore(() => storage, () => clock);
    check(afterReload.getSnapshot()?.confirmation?.paymentId === "pay_fixture");
    check(afterReload.getSnapshot()?.reportedSuccess === true);
    check(!afterReload.rememberConfirmation("other-order", { paymentId: "pay_other" }));
    afterReload.clear("other-order");
    check(afterReload.getSnapshot() !== null, "stale callbacks cannot clear another order");
    clock = ready.expiresAt;
    const expiredUnresolved = afterReload.getSnapshot()!;
    check(expiredUnresolved.session === null && expiredUnresolved.orderId === session.orderId);
    check(!afterReload.markProcessing(session.orderId), "expired unresolved payment cannot recharge");
    check(!afterReload.start(session), "expiry cannot start a replacement checkout");
    const unsubscribeTombstone = afterReload.subscribe(() => {});
    const tombstoneRaw = values.get(CARD_SESSION_KEY)!;
    for (const secret of [session.checkoutToken, session.sessionToken!, session.customer.email, session.shippingAddress.line1, "cartFingerprint", "variant_fixture"]) {
      check(!tombstoneRaw.includes(secret), "expired unresolved context strips session secrets and customer/cart fields");
    }
    const tombstoneReload = createCardSessionStore(() => storage, () => clock + CARD_SESSION_TTL_MS * 10);
    check(tombstoneReload.getSnapshot()?.orderId === session.orderId);
    check(tombstoneReload.getSnapshot()?.session === null);
    check(tombstoneReload.getSnapshot()?.confirmation?.paymentId === "pay_fixture");
    check(tombstoneReload.rememberConfirmation(session.orderId, { paymentId: "pay_fixture" }));
    unsubscribeTombstone();
    afterReload.clear(session.orderId);
    check(afterReload.getSnapshot() === null && !values.has(CARD_SESSION_KEY));
    clock = ready.createdAt;

    for (const invalid of [null, "{", "[]", "null", "{}", "x".repeat(30001)]) {
      check(parseCardCheckout(invalid, clock) === null);
    }
    for (const change of [
      { version: 2 }, { createdAt: clock + 1 }, { expiresAt: clock },
      { expiresAt: clock + CARD_SESSION_TTL_MS + 1 }, { phase: "unknown" },
      { reportedSuccess: "true" }, { phase: "confirming", confirmation: null },
      { reportedSuccess: true, confirmation: null }, { cardNumber: "4111111111111111" },
      { orderId: "PSL-other" }, { session: null },
      { confirmation: { paymentId: "../../fake" } },
    ]) check(parseCardCheckout(JSON.stringify({ ...ready, ...change }), clock) === null);
    for (const change of [
      { sessionToken: 1 }, { items: [] }, { items: [{ variantId: "variant_fixture", quantity: -1 }] },
      { shippingCost: NaN }, { cardNumber: "4111111111111111" },
      { customer: { ...session.customer, cvc: "123" } },
      { shippingAddress: { ...session.shippingAddress, country: "United States" } },
    ]) check(parseCardCheckout(JSON.stringify({ ...ready, session: { ...session, ...change } }), clock) === null);
    clock = ready.expiresAt;
    check(parseCardCheckout(raw, clock) === null, "expires exactly at TTL");
    check(store.getSnapshot() === null);
    const expiredStore = createCardSessionStore(() => storage, () => clock);
    values.set(CARD_SESSION_KEY, raw);
    const unsubscribeExpired = expiredStore.subscribe(() => {});
    check(!values.has(CARD_SESSION_KEY), "expired context removed on subscribe");
    unsubscribeExpired();

    const forbidden = {
      ...session, cardNumber: "4111111111111111", cvc: "123", expiryDate: "12/30", cardholderName: "NEVER_STORE",
      tagadaToken: "CARD_SECRET", paymentInstrument: { pan: "CARD_SECRET" },
      customer: { ...session.customer, pan: "CARD_SECRET" },
      items: [{ ...session.items[0], cardNumber: "CARD_SECRET" }],
    };
    check(store.start(forbidden));
    const safeRaw = values.get(CARD_SESSION_KEY)!;
    for (const secret of ["4111111111111111", "CARD_SECRET", "NEVER_STORE", "expiryDate", "cardholderName", '"cvc"']) {
      check(!safeRaw.includes(secret), `forbidden field/value excluded: ${secret}`);
    }
    check(sanitizeCardSession({ ...session, customer: {} }) === null);
    check(!store.start({ ...session, items: [{ variantId: "variant_fixture", quantity: "1" }] }));
    check(store.getSnapshot() === null, "invalid replacement clears old checkout");
    check(store.start(session));
    check(store.markProcessing(session.orderId));
    check(!store.markProcessing(session.orderId), "uncertain failure cannot offer another charge");
    check(!store.start({ ...session, orderId: "PSL-new" }));
    store.clear();
    check(store.start({ ...session, orderId: "PSL-new" }));
    check(store.getSnapshot()?.session?.orderId === "PSL-new", "deliberate new checkout replaces a cleared ready context");
    store.clear();
    check(!values.has(CARD_SESSION_KEY));

    for (const access of [
      () => null,
      () => { throw new Error("storage blocked"); },
      () => ({ getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("quota"); }, removeItem: () => { throw new Error("blocked"); } }),
    ]) {
      const memoryOnly = createCardSessionStore(access, () => clock);
      check(memoryOnly.start(session));
      check(memoryOnly.getSnapshot()?.session?.orderId === session.orderId);
      check(!memoryOnly.markProcessing(session.orderId), "charge requires a durable recovery record");
      check(memoryOnly.getSnapshot()?.phase === "ready", "failed persistence leaves a usable uncharged form");
      memoryOnly.clear();
      check(memoryOnly.getSnapshot() === null);
    }
    const cart = [{ handle: "fixture", quantity: 1, unitPrice: 59.99 }];
    check(cardSessionMatchesCart(session, cart));
    for (const changed of [{ handle: "other" }, { quantity: 2 }, { unitPrice: 60 }]) {
      check(!cardSessionMatchesCart(session, [{ ...cart[0], ...changed }]));
    }
    const multiple = [...cart, { handle: "another", quantity: 2, unitPrice: 20 }];
    check(cardCartFingerprint(multiple) === cardCartFingerprint([...multiple].reverse()), "cart order alone does not invalidate checkout");
    check(!cardCartFingerprint([{ ...cart[0], cardNumber: "CARD_SECRET" } as typeof cart[0]]).includes("CARD_SECRET"));
    const providerSession = {
      id: "session_fixture", storeId: session.storeId, checkoutToken: session.checkoutToken,
      currency: "USD", totals: { total: 6898, currency: "USD" },
    };
    check(cardSessionReadyToCharge(session, providerSession, providerSession.id));
    for (const changed of [
      { id: "session_other" }, { storeId: "store_other" }, { checkoutToken: "checkout_other" },
      { currency: "EUR" }, { totals: {} }, { totals: { total: 6898, currency: "EUR" } },
      { totals: { total: 68.98, currency: "USD" } }, { totals: { total: 6899, currency: "USD" } },
      { totals: { total: "6898", currency: "USD" } }, { totals: { total: null, currency: "USD" } },
      { totals: { total: 0, currency: "USD" } }, { totals: { total: NaN, currency: "USD" } },
    ]) check(!cardSessionReadyToCharge(session, { ...providerSession, ...changed }, providerSession.id), "pre-charge amount/session/currency mismatch fails closed");
    check(!cardSessionReadyToCharge({ ...session, total: 59.99 }, providerSession, providerSession.id), "catalog/shipping/tax discrepancy cannot charge before verification");
    const failureValues = new Map<string, string>();
    let failWrites = false;
    const unreliable = createCardSessionStore(() => ({
      getItem: (key: string) => failureValues.get(key) ?? null,
      setItem: (key: string, value: string) => { if (failWrites) throw new Error("quota"); failureValues.set(key, value); },
      removeItem: (key: string) => { failureValues.delete(key); },
    }), () => clock);
    check(unreliable.start(session));
    failWrites = true;
    check(!unreliable.markProcessing(session.orderId));
    check(!failureValues.has(CARD_SESSION_KEY), "failed processing write removes stale ready record before any charge");
    failWrites = false;
    check(unreliable.start(session));
    check(unreliable.markProcessing(session.orderId));
    failWrites = true;
    check(unreliable.rememberConfirmation(session.orderId, { paymentId: "pay_fixture" }, true));
    check(parseCardCheckout(failureValues.get(CARD_SESSION_KEY)!, clock)?.phase === "processing", "failed hint write preserves prior durable unresolved lock");
    check(getCardReturnHints("?paymentAction=requireAction&paymentActionStatus=completed&paymentId=pay_fixture")?.paymentId === "pay_fixture");
    check(getCardReturnHints("?paymentId=pay_fixture") === null);
    check(getCardReturnHints("?paymentAction=requireAction&paymentId=../../fake") === null);

    const pauses: number[] = [];
    const payloads: unknown[] = [];
    const replies = [202, 500, 200];
    const result = await retryCardConfirmation(session.orderId, { paymentId: "pay_fixture" }, async (payload) => {
      payloads.push(payload);
      return { status: replies.shift()!, json: async () => ({ redirectTo: "/success?orderId=PSL-fixture" }) };
    }, async (milliseconds) => { pauses.push(milliseconds); });
    check(result.ok);
    check(payloads.length === 3, "bounded confirmation retries");
    assert.deepEqual(payloads, Array(3).fill({ orderId: "PSL-fixture", paymentId: "pay_fixture" })); checks++;
    assert.deepEqual(pauses, [1000, 2000]); checks++;
    let calls = 0;
    const mismatch = await retryCardConfirmation(session.orderId, { paymentId: "pay_fixture" }, async () => {
      calls++; return { status: 409, json: async () => ({ error: "Payment does not match this order" }) };
    }, async () => {});
    check(!mismatch.ok && !mismatch.retryable && calls === 1, "mismatch is not automatically retried");
    calls = 0;
    const unavailable = await retryCardConfirmation(session.orderId, { paymentId: "pay_fixture" }, async () => {
      calls++; throw new Error("network");
    }, async () => {});
    check(!unavailable.ok && unavailable.retryable && calls === 3);
    const unsafeRedirect = await retryCardConfirmation(session.orderId, { paymentId: "pay_fixture" }, async () => ({
      status: 200, json: async () => ({ redirectTo: "https://other.test/charge" }),
    }), async () => {});
    check(!unsafeRedirect.ok);
    const missing = await retryCardConfirmation(session.orderId, {}, async () => { throw new Error("must not call"); });
    check(!missing.ok && !missing.retryable);
    console.log(`Card session storage: ${checks} offline restore, privacy, cleanup and confirmation checks passed.`);
  } finally { globalThis.fetch = previousFetch; }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
