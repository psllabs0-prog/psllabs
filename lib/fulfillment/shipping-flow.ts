import { randomBytes } from "node:crypto";
import { getOrder } from "@/lib/orders/store";
import type { Order } from "@/lib/orders/types";
import { getBtcpostageFromAddress, getBtcpostagePublicConfig } from "@/lib/btcpostage/config";
import { getOrderLabelPublic, getOrderRates, verifyOrderAddress, buyOrderLabel } from "@/lib/btcpostage/service";
import { getBtcpostageLabel } from "@/lib/btcpostage/store";
import { getRates } from "@/lib/btcpostage/client";
import { assertLabelMatchesOrderShipping, labelRateMatchesShippingSelection } from "@/lib/btcpostage/shipping-guard";
import type { BtcpostageAddress, BtcpostagePackage, BtcpostageRate } from "@/lib/btcpostage/types";
import { PRIORITY_ORIGIN_ZIP, priorityCostCovered } from "@/lib/shipping/policy";
import { isPhysicalUSShippingAddress } from "@/lib/shipping/request";
import { getFulfillmentWorkflow } from "./store";
import { consumeLabelPreview, getTrackingNotification, privateDigest, saveLabelPreview, saveTrackingAndQueue, shippingPaymentBlocked } from "./shipping-flow-store";
import { dispatchTrackingNotification } from "./tracking-notification";
import type { FulfillmentShippingPreview, FulfillmentShippingResult, FulfillmentShippingStatus } from "./shipping-flow-types";
import { getManualFulfillmentTestScope } from "@/lib/db/sql";

const MAX_UNITS = 10;
const PREVIEW_TTL_MS = 5 * 60 * 1000;
export const VERIFIED_LABEL_PACKAGE: BtcpostagePackage = {
  weightLbs: 0, weightOz: 8, heightIn: 3, widthIn: 4, depthIn: 6, packageType: "Parcel",
};
export function shippingFlowConfig() {
  const manualTest = getManualFulfillmentTestScope();
  return { ...getBtcpostagePublicConfig(), enabled: Boolean(manualTest) || process.env.PSL_FULFILLMENT_LABEL_FLOW_ENABLED === "true",
    trackingEmailEnabled: manualTest ? false : process.env.PSL_FULFILLMENT_TRACKING_EMAIL_ENABLED === "true" };
}

export function shippingOrderBlockers(order: Order, workflow: { workflowStatus: string } | null): string[] {
  const blockers: string[] = [];
  if (order.status !== "paid" || !order.paidAt || !order.stockDecremented) blockers.push("Payment and inventory settlement must be complete.");
  if (workflow?.workflowStatus !== "packed") blockers.push("Mark the order packed before preparing its label.");
  if (order.trackingNumber) blockers.push("Tracking is already saved. Review the existing shipment without buying another label.");
  if (order.currency !== "USD" || !Number.isFinite(order.total) || order.total <= 0) blockers.push("The paid USD order total could not be verified.");
  if (!order.email.trim() || !order.email.includes("@")) blockers.push("A valid customer notification address is required.");
  const count = order.items.reduce((sum, item) => sum + item.quantity, 0);
  if (!order.items.length || !order.items.every(item => Number.isSafeInteger(item.quantity) && item.quantity > 0) || count > MAX_UNITS) {
    blockers.push("The verified 8 oz, 6 × 4 × 3 in package supports up to 10 vials. Use manual review for this order.");
  }
  if (!isPhysicalUSShippingAddress(order.shipping)) blockers.push("A supported physical U.S. destination is required.");
  const selection = order.shipping.selection;
  if (!selection || selection.carrier !== "USPS" || !selection.providerServiceCode) blockers.push("This order has no verified saved carrier service. Review it manually.");
  else {
    try { assertLabelMatchesOrderShipping({ selection, carrier: "USPS", service: selection.providerServiceCode, pkg: VERIFIED_LABEL_PACKAGE }); }
    catch { blockers.push("The saved shipping service or package needs manual review."); }
  }
  return blockers;
}

function fingerprint(order: Order, from: BtcpostageAddress, to: BtcpostageAddress, pkg: BtcpostagePackage, testMode: boolean) {
  return privateDigest({ id: order.orderId, status: order.status, paidAt: order.paidAt, stockDecremented: order.stockDecremented,
    email: order.email, items: order.items, shipping: order.shipping, total: order.total, currency: order.currency,
    shippingCost: order.shippingCost, from, to, pkg, testMode });
}

export function exactShippingRate(order: Order, rates: BtcpostageRate[]) {
  const exact = rates.filter(rate => labelRateMatchesShippingSelection(order.shipping.selection, rate) &&
    rate.currency === "USD" && /^\d+(?:\.\d{1,2})?$/.test(rate.rate) && Number(rate.rate) > 0);
  if (exact.length !== 1) throw new Error("One unambiguous rate for the customer's saved USPS service is required. No cheaper service will be substituted.");
  return exact[0];
}

export async function getFulfillmentShippingStatus(orderId: string): Promise<FulfillmentShippingStatus> {
  const order = await getOrder(orderId);
  if (!order) throw new Error("Order not found.");
  return { ...shippingFlowConfig(), label: await getOrderLabelPublic(orderId),
    trackingSaved: Boolean(order.trackingNumber?.trim()), notification: await getTrackingNotification(orderId) };
}

export async function prepareFulfillmentLabel(orderId: string) {
  const order = await getOrder(orderId);
  if (!order) throw new Error("Order not found.");
  const config = shippingFlowConfig();
  const workflow = await getFulfillmentWorkflow(orderId);
  const blockers = shippingOrderBlockers(order, workflow);
  const label = await getOrderLabelPublic(orderId);
  if (await shippingPaymentBlocked(orderId)) blockers.push("Payment reconciliation or reporting exclusion requires review.");
  if (label && label.purchaseStatus !== "none" && label.purchaseStatus !== "failed") blockers.push("A label exists or a purchase needs review. Check its status before preparing another.");
  if (!config.configured) blockers.push("BTCPostage credentials are not configured.");
  let postageUsd: number | null = null, token: string | null = null, expiresAt: string | null = null;
  if (!blockers.length) {
    const from = getBtcpostageFromAddress();
    if (from.country !== "US" || from.zip.slice(0, 5) !== PRIORITY_ORIGIN_ZIP) throw new Error("The saved shipping origin must match the verified Phoenix 85016 location.");
    const verified = await verifyOrderAddress(orderId);
    if (!verified.isValid || !verified.standardized) blockers.push("The carrier could not verify this destination. Review the address.");
    else {
      const quote = await getOrderRates(orderId, VERIFIED_LABEL_PACKAGE);
      const rate = exactShippingRate(order, quote.rates);
      postageUsd = Number(rate.rate);
      if (order.shipping.selection?.method === "priority" && !priorityCostCovered(postageUsd, order.shippingCost, 2)) {
        blockers.push("Priority postage, packaging and the approved reserve exceed the collected shipping fee. Review this shipment.");
      } else {
        token = randomBytes(32).toString("hex");
        expiresAt = new Date(Date.now() + PREVIEW_TTL_MS).toISOString();
        await saveLabelPreview({ token, orderId, fingerprint: fingerprint(order, from, quote.to, quote.package, config.testMode), postageUsd, expiresAt });
      }
    }
  }
  if (!config.enabled) blockers.push("Label purchase automation is off. Review and enable the server setting before buying.");
  const preview: FulfillmentShippingPreview = { token, expiresAt, orderId,
    serviceName: order.shipping.selection?.serviceDisplayName || "Service requires review", carrier: "USPS",
    service: order.shipping.selection?.providerServiceCode || "", postageUsd,
    package: { ...VERIFIED_LABEL_PACKAGE }, destinationSummary: `${order.shipping.city}, ${order.shipping.state} ${order.shipping.zip}`,
    canPurchase: blockers.length === 0, blockers, testMode: config.testMode };
  return { ok: true as const, preview, label, notification: await getTrackingNotification(orderId) };
}

/** This action never buys. It is also the recovery path after a response/DB/email failure. */
export async function completeFulfillmentTracking(orderId: string): Promise<FulfillmentShippingResult> {
  const order = await getOrder(orderId);
  const label = await getOrderLabelPublic(orderId);
  if (!order || !label || label.purchaseStatus !== "purchased") throw new Error("A verified saved purchase is required before completing tracking.");
  if (label.testMode) return { ok: true, label, trackingSaved: false, notification: null, testMode: true };
  if (!["paid", "shipped"].includes(order.status) || await shippingPaymentBlocked(orderId)) throw new Error("The order's payment state needs review before tracking is attached.");
  if (!label.carrier || !label.service || !labelRateMatchesShippingSelection(order.shipping.selection, { carrier: label.carrier, service: label.service })) throw new Error("Saved label service does not match this order. Review without buying another label.");
  const tracking = label.trackingNumber?.trim() || "";
  if (!tracking || tracking.length > 64) throw new Error("The saved purchase has no usable tracking number. Retrieve and review the existing purchase; do not buy again.");
  await saveTrackingAndQueue({ orderId, trackingNumber: tracking, carrier: label.carrier.toUpperCase(), recipientHash: privateDigest(order.email.trim().toLowerCase()), recipientEmail: order.email });
  const notification = await dispatchTrackingNotification(orderId, shippingFlowConfig().trackingEmailEnabled);
  return { ok: true, label, trackingSaved: true, notification, testMode: false };
}

export async function purchaseFulfillmentLabel(input: { orderId: string; previewToken: string; confirmPurchase: boolean }): Promise<FulfillmentShippingResult> {
  if (!input.confirmPurchase) throw new Error("Confirm the reviewed label cost before purchase.");
  const config = shippingFlowConfig();
  if (!config.enabled || !config.configured) throw new Error("Label purchase automation is not enabled and configured.");
  const existing = await getBtcpostageLabel(input.orderId);
  if (existing?.purchaseStatus === "purchased") return { ...await completeFulfillmentTracking(input.orderId), alreadyPurchased: true };
  if (!/^[a-f0-9]{64}$/.test(input.previewToken)) throw new Error("A current label preview is required.");
  const preview = await consumeLabelPreview(input.orderId, input.previewToken);
  const order = await getOrder(input.orderId);
  if (!order) throw new Error("Order not found.");
  const blockers = shippingOrderBlockers(order, await getFulfillmentWorkflow(input.orderId));
  if (blockers.length || await shippingPaymentBlocked(input.orderId)) throw new Error(blockers[0] || "Payment needs review.");
  const result = await buyOrderLabel({ orderId: input.orderId, carrier: "USPS", service: order.shipping.selection!.providerServiceCode!,
    confirmPurchase: true, pkg: VERIFIED_LABEL_PACKAGE,
    validateBeforePurchase: async current => {
      // Current server order, normalized destination, sender, test/live mode and rate
      // must still match what the owner reviewed. No browser-supplied address/cost.
      if (fingerprint(current.order, current.from, current.to, current.pkg, config.testMode) !== preview.fingerprint) throw new Error("Order, address or shipping settings changed. Prepare a fresh label preview.");
      if (shippingOrderBlockers(current.order, await getFulfillmentWorkflow(input.orderId)).length || await shippingPaymentBlocked(input.orderId)) throw new Error("This order is no longer ready for label purchase.");
      const rates = await getRates({ ...current, carrier: "USPS" });
      const rate = exactShippingRate(current.order, rates);
      if (Number(rate.rate) > preview.postageUsd) throw new Error("Postage increased after the preview. Review the new cost before buying.");
    } });
  if (result.label.testMode) return { ok: true, label: result.label, testMode: true, trackingSaved: false, notification: null };
  // Purchase is already durably stored. Tracking failures must not return to buy.
  return { ...await completeFulfillmentTracking(input.orderId), ...(result.alreadyPurchased ? { alreadyPurchased: true } : {}) };
}
