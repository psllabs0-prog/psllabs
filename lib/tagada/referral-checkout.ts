import type { Order } from "@/lib/orders/types";
import { readTagadaCheckoutPriceEvidence } from "@/lib/tagada/checkout-price-evidence";

/** Provider promotion is selected by the server, never supplied by the shopper. */
export function configuredReferralPromotionCode(): string | null {
  const code = process.env.TAGADA_REFERRAL_PROMOTION_CODE?.trim() ?? "";
  return /^[A-Za-z0-9_-]{1,100}$/.test(code) ? code : null;
}

type RecordValue = Record<string, unknown>;
const object = (value: unknown): RecordValue | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : null;
const minor = (value: number) => Math.round(value * 100);

/** Exact catalog, shipping, and promotion evidence, without trusting browser metadata. */
export function referralCardSessionMatchesOrder(
  order: Pick<Order, "currency" | "subtotal" | "discountAmount" | "shippingCost" | "tax" | "total">,
  expected: { storeId: string; checkoutToken: string; items: Array<{ variantId: string; quantity: number }>; customerEmail?: string; expectedSessionId?: string },
  providerValue: unknown,
): boolean {
  const provider = object(providerValue);
  const totals = object(provider?.totals);
  if (!provider || !totals || typeof provider.id !== "string" || !provider.id ||
      provider.storeId !== expected.storeId || provider.checkoutToken !== expected.checkoutToken ||
      order.currency !== "USD" || provider.currency !== "USD" || totals.currency !== "USD") return false;
  if (expected.expectedSessionId && provider.id !== expected.expectedSessionId) return false;
  if (expected.customerEmail && object(provider.customer)?.email !== expected.customerEmail) return false;
  for (const [field, amount] of Object.entries({ subtotal: order.subtotal, discount: order.discountAmount,
    shipping: order.shippingCost, tax: order.tax, total: order.total })) {
    if (!Number.isFinite(amount) || amount < 0 || !Number.isSafeInteger(totals[field]) || totals[field] !== minor(amount)) return false;
  }
  if (!Array.isArray(provider.items) || provider.items.length !== expected.items.length || expected.items.length === 0) return false;
  const seen = new Set<string>();
  return provider.items.every((value) => {
    const item = object(value);
    if (!item || typeof item.variantId !== "string" || seen.has(item.variantId)) return false;
    seen.add(item.variantId);
    return expected.items.some((line) => line.variantId === item.variantId && line.quantity === item.quantity);
  });
}

export type ReferralCardCheckoutClient = {
  loadSession(token: string, sessionToken?: string): Promise<unknown>;
  updateCustomerAndAddress(id: string, data: { customer: { email: string; firstName: string; lastName: string };
    shippingAddress: { line1: string; city: string; state: string; postalCode: string; country: string } }): Promise<void>;
  getShippingRates(id: string): Promise<Array<{ id: string; amount: number; currency: string }>>;
  selectShippingRate(id: string, rateId: string): Promise<void>;
  applyPromoCode(id: string, code: string): Promise<void>;
};

/** Real checkout use only. Offline tests inject a fixture; previews cannot call the provider. */
export async function configureAndVerifyReferralCardSession(
  order: Order,
  session: { checkoutToken: string; sessionToken: string | null },
  expected: { storeId: string; items: Array<{ variantId: string; quantity: number }> },
  promotionCode: string | null,
  injectedClient?: ReferralCardCheckoutClient,
): Promise<void> {
  if (process.env.PSL_VISUAL_PREVIEW === "1") throw new Error("Payments are disabled in this preview.");
  if (order.discountAmount > 0 && !promotionCode) throw new Error("The first-order card referral promotion is not configured.");
  let checkout = injectedClient;
  if (!checkout) {
    const { createHeadlessClient } = await import("@tagadapay/headless-sdk");
    const client = createHeadlessClient({ storeId: expected.storeId, timeout: 30000 });
    if (session.sessionToken) client.setSessionToken(session.sessionToken);
    checkout = {
      loadSession: (token, sessionToken) => readTagadaCheckoutPriceEvidence({ storeId: expected.storeId, checkoutToken: token }, sessionToken ?? session.sessionToken),
      updateCustomerAndAddress: (id, data) => client.checkout.updateCustomerAndAddress(id, data),
      getShippingRates: id => client.checkout.getShippingRates(id),
      selectShippingRate: (id, rateId) => client.checkout.selectShippingRate(id, rateId),
      applyPromoCode: (id, code) => client.checkout.applyPromoCode(id, code),
    };
  }
  const initial = object(await checkout.loadSession(session.checkoutToken, session.sessionToken ?? undefined));
  if (!initial || typeof initial.id !== "string" || !initial.id || initial.storeId !== expected.storeId ||
      initial.checkoutToken !== session.checkoutToken) throw new Error("The card checkout session binding could not be verified.");
  const id = initial.id;
  await checkout.updateCustomerAndAddress(id, {
    customer: { email: order.email, firstName: order.shipping.firstName, lastName: order.shipping.lastName },
    shippingAddress: { line1: order.shipping.address, city: order.shipping.city, state: order.shipping.state,
      postalCode: order.shipping.zip, country: order.shipping.country },
  });
  if (order.discountAmount > 0) {
    try { await checkout.applyPromoCode(id, promotionCode!); }
    catch (error) {
      // A transport timeout can occur after Tagada saved the promotion. Do not
      // repeat the mutation: only a fresh, exact provider summary below can
      // establish success. Authentication, validation and policy failures stay
      // failures rather than being treated as a transient transport result.
      if (!(error && typeof error === "object" && "code" in error && error.code === "network_error")) throw error;
    }
  }
  const rates = await checkout.getShippingRates(id);
  const rate = rates.find((value) => value.currency === order.currency && value.amount === minor(order.shippingCost));
  if (rate) await checkout.selectShippingRate(id, rate.id);
  const fresh = await checkout.loadSession(session.checkoutToken, session.sessionToken ?? undefined);
  if (!referralCardSessionMatchesOrder(order, { ...expected, checkoutToken: session.checkoutToken,
    expectedSessionId: id, customerEmail: order.email }, fresh)) {
    throw new Error("The provider card price does not match the referral order. No card charge was started.");
  }
}
