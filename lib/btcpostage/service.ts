import { getOrder } from "@/lib/orders/store";
import type { Order } from "@/lib/orders/types";
import { isPriorityServiceCode, PRIORITY_ORIGIN_ZIP, priorityCostCovered } from "@/lib/shipping/policy";
import { isPhysicalUSShippingAddress } from "@/lib/shipping/request";

import {
  BtcpostageApiError,
  createPurchase,
  getRates,
  retrievePurchase,
  verifyAddress,
} from "./client";
import {
  getBtcpostageFromAddress,
  isBtcpostageTestMode,
} from "./config";
import {
  claimLabelPurchase,
  ensureLabelRow,
  getBtcpostageLabel,
  markPurchaseFailed,
  markPurchaseNeedsReview,
  markPurchaseSucceeded,
  saveVerifiedAddress,
  toPublicLabel,
} from "./store";
import type {
  BtcpostageAddress,
  BtcpostageLabelPublic,
  BtcpostagePackage,
  BtcpostageRate,
} from "./types";
import { DEFAULT_PACKAGE } from "./types";
import { assertLabelMatchesOrderShipping, assertReturnedPurchaseMatchesOrder, labelRateMatchesShippingSelection } from "./shipping-guard";

function assertPaidUnshipped(order: Order): void {
  if (order.status !== "paid") {
    throw new Error("Order must be paid and unshipped for BTCPostage actions.");
  }
  if (order.trackingNumber?.trim()) {
    throw new Error("Order already has a tracking number on the PSL order.");
  }
}

function assertStoredLabelService(order: Order, label: { carrier: string | null; service: string | null }): void {
  if (order.shipping.selection && (!label.carrier || !label.service ||
      !labelRateMatchesShippingSelection(order.shipping.selection, { carrier: label.carrier, service: label.service }))) {
    throw new Error("The stored label does not match the order's selected shipping service. Review the existing shipment; do not buy another label.");
  }
}

function destinationFromOrder(order: Order): BtcpostageAddress {
  return {
    name: `${order.shipping.firstName} ${order.shipping.lastName}`.trim(),
    street1: order.shipping.address,
    street2: "",
    city: order.shipping.city,
    state: order.shipping.state,
    zip: order.shipping.zip,
    country: (order.shipping.country || "US").toUpperCase(),
    phone: "",
  };
}

async function resolveToAddress(
  order: Order,
  override?: Partial<BtcpostageAddress> | null
): Promise<BtcpostageAddress> {
  const label = await getBtcpostageLabel(order.orderId);
  const base = destinationFromOrder(order);
  if (label?.verifiedStreet1) {
    return {
      ...base,
      street1: label.verifiedStreet1,
      street2: label.verifiedStreet2 ?? "",
      city: label.verifiedCity ?? base.city,
      state: label.verifiedState ?? base.state,
      zip: label.verifiedZip ?? base.zip,
      country: label.verifiedCountry ?? base.country,
      ...override,
    };
  }
  return { ...base, ...override };
}

function normalizePackage(input?: Partial<BtcpostagePackage> | null): BtcpostagePackage {
  return {
    weightLbs: Math.max(0, Number(input?.weightLbs ?? DEFAULT_PACKAGE.weightLbs)),
    weightOz: Math.max(0, Number(input?.weightOz ?? DEFAULT_PACKAGE.weightOz)),
    heightIn: Math.max(0.1, Number(input?.heightIn ?? DEFAULT_PACKAGE.heightIn)),
    widthIn: Math.max(0.1, Number(input?.widthIn ?? DEFAULT_PACKAGE.widthIn)),
    depthIn: Math.max(0.1, Number(input?.depthIn ?? DEFAULT_PACKAGE.depthIn)),
    packageType: (input?.packageType || DEFAULT_PACKAGE.packageType).trim() || "Parcel",
  };
}

/** Recheck paid Priority orders even when new Priority sales are paused. */
async function assertCurrentPriorityPostageCovered(
  order: Order, from: BtcpostageAddress, to: BtcpostageAddress, pkg: BtcpostagePackage
): Promise<void> {
  const selection = order.shipping.selection;
  if (selection?.method !== "priority") return;
  if (order.currency !== "USD" || !isPriorityServiceCode(selection.providerServiceCode) ||
      from.country.trim().toUpperCase() !== "US" || from.zip.trim().slice(0, 5) !== PRIORITY_ORIGIN_ZIP ||
      !isPhysicalUSShippingAddress({ ...order.shipping, address: [to.street1, to.street2].filter(Boolean).join("\n"),
        city: to.city, state: to.state, zip: to.zip, country: to.country.trim().toUpperCase() })) {
    throw new Error("The current Priority shipping origin or destination could not be verified.");
  }
  const reserveRaw = process.env.PSL_PRIORITY_EXTRA_COST_RESERVE_USD?.trim() ?? "";
  // The user approved a $2 reserve. Missing settings must not prevent already-
  // paid Priority orders being fulfilled when the new-offer flag is paused.
  // An explicitly malformed setting is held for review instead of ignored.
  const reserve = reserveRaw === "" ? 2 : /^\d+(?:\.\d{1,5})?$/.test(reserveRaw) ? Number(reserveRaw) : Number.NaN;
  if (!Number.isFinite(reserve) || reserve < 0 || reserve > 100) throw new Error("The Priority shipping cost reserve is invalid.");
  const rates = await getRates({ from, to, pkg, carrier: "USPS" });
  const exact = rates.filter(rate => rate.carrier.trim().toUpperCase() === "USPS" &&
    rate.service === selection.providerServiceCode && rate.currency === "USD" &&
    /^\d+(?:\.\d{1,2})?$/.test(rate.rate) && Number(rate.rate) > 0);
  if (exact.length !== 1 || !priorityCostCovered(Number(exact[0].rate), order.shippingCost, reserve)) {
    throw new Error("The current exact USPS Priority Mail rate is unavailable or exceeds the collected shipping fee including packaging and reserve.");
  }
}

export async function verifyOrderAddress(orderId: string): Promise<{
  orderId: string;
  destination: BtcpostageAddress;
  isValid: boolean;
  standardized: BtcpostageAddress | null;
  errors: string[];
}> {
  const order = await getOrder(orderId);
  if (!order) throw new Error("Order not found.");
  assertPaidUnshipped(order);

  const destination = destinationFromOrder(order);
  const result = await verifyAddress(destination);
  if (result.standardized) {
    await saveVerifiedAddress(orderId, result.standardized);
  }
  return {
    orderId,
    destination,
    isValid: result.isValid,
    standardized: result.standardized,
    errors: result.errors,
  };
}

export async function getOrderRates(
  orderId: string,
  pkgInput?: Partial<BtcpostagePackage> | null
): Promise<{
  orderId: string;
  rates: BtcpostageRate[];
  package: BtcpostagePackage;
  to: BtcpostageAddress;
  testMode: boolean;
}> {
  const order = await getOrder(orderId);
  if (!order) throw new Error("Order not found.");
  assertPaidUnshipped(order);

  const pkg = normalizePackage(pkgInput);
  const to = await resolveToAddress(order);
  const from = getBtcpostageFromAddress();
  const rates = await getRates({ to, from, pkg, carrier: "USPS" });
  return {
    orderId,
    rates,
    package: pkg,
    to,
    testMode: isBtcpostageTestMode(),
  };
}

function applyPurchaseResult(
  order: Order,
  purchase: Awaited<ReturnType<typeof createPurchase>>,
  pkg: BtcpostagePackage,
  testMode: boolean,
  recovery?: { requestedPurchaseId: string; recordedPurchaseId: string | null }
) {
  try {
    assertReturnedPurchaseMatchesOrder({
      orderId: order.orderId, selection: order.shipping.selection,
      destinationName: `${order.shipping.firstName} ${order.shipping.lastName}`,
      purchase, recovery,
    });
  } catch (error) {
    throw new BtcpostageApiError(error instanceof Error ? error.message : "The returned shipment could not be verified.", { uncertain: true });
  }
  const item = purchase.items[0];
  return markPurchaseSucceeded({
    pslOrderId: order.orderId,
    btcpOrderId: purchase.orderId,
    shipmentId: item.shipmentId || null,
    carrier: item.carrier || null,
    service: item.service || null,
    postageCost: item.price ? Number(item.price) : null,
    trackingNumber: item.trackingNo || null,
    labelUrl: item.filename || null,
    labelFormat: "PDF",
    testMode,
    weightLbs: pkg.weightLbs,
    weightOz: pkg.weightOz,
    heightIn: pkg.heightIn,
    widthIn: pkg.widthIn,
    depthIn: pkg.depthIn,
    rawResponse: purchase,
  });
}

export async function buyOrderLabel(input: {
  orderId: string;
  carrier: string;
  service: string;
  confirmPurchase: boolean;
  pkg?: Partial<BtcpostagePackage> | null;
}): Promise<{
  label: BtcpostageLabelPublic;
  alreadyPurchased?: boolean;
}> {
  if (!input.confirmPurchase) {
    throw new Error(
      "Explicit confirmation required: set confirmPurchase=true before buying a label."
    );
  }

  const order = await getOrder(input.orderId);
  if (!order) throw new Error("Order not found.");
  assertPaidUnshipped(order);

  const pkg = normalizePackage(input.pkg);
  const carrier = input.carrier.trim();
  const service = input.service.trim();
  assertLabelMatchesOrderShipping({
    selection: order.shipping.selection,
    carrier,
    service,
    pkg,
  });

  const existing = await getBtcpostageLabel(input.orderId);
  if (existing?.purchaseStatus === "purchased") {
    assertStoredLabelService(order, existing);
    return { label: toPublicLabel(existing), alreadyPurchased: true };
  }

  const claim = await claimLabelPurchase(input.orderId);
  if (!claim.ok) {
    if (claim.reason === "already_purchased") {
      assertStoredLabelService(order, claim.label);
      return { label: toPublicLabel(claim.label), alreadyPurchased: true };
    }
    if (claim.reason === "needs_review") {
      throw new Error(
        claim.label.lastError ||
          "Prior BTCPostage purchase is uncertain — retrieve/review before buying again."
      );
    }
    throw new Error(
      "A BTCPostage purchase is already in progress for this order. Do not retry blindly."
    );
  }

  if (!carrier || !service) {
    await markPurchaseFailed(input.orderId, "Carrier and service are required.");
    throw new Error("Carrier and service are required.");
  }

  const testMode = isBtcpostageTestMode();
  if (testMode && carrier.toUpperCase() !== "USPS") {
    await markPurchaseFailed(
      input.orderId,
      "Test mode only supports USPS label purchases."
    );
    throw new Error("BTCPOSTAGE_TEST_MODE only supports USPS label purchases.");
  }

  let to: BtcpostageAddress;
  let from: BtcpostageAddress;
  try {
    to = await resolveToAddress(order);
    from = getBtcpostageFromAddress();
    await assertCurrentPriorityPostageCovered(order, from, to, pkg);
  } catch (error) {
    if (order.shipping.selection?.method === "priority") {
      const message = error instanceof Error ? error.message : "Current postage could not be checked.";
      await markPurchaseNeedsReview(input.orderId, `Priority shipping review before purchase: ${message}`);
      throw new Error(`Priority shipping needs review. No label was purchased. ${message}`);
    }
    throw error;
  }

  let returnedPurchaseId: string | null = null;
  try {
    const purchase = await createPurchase({
      to,
      from,
      pkg,
      carrier,
      service,
      labelFormat: "PDF",
      testMode: testMode || undefined,
      orderNotes: `PSL ${input.orderId}`,
    });
    returnedPurchaseId = purchase.orderId || null;
    const record = await applyPurchaseResult(
      order,
      purchase,
      pkg,
      testMode
    );
    return { label: toPublicLabel(record) };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "BTCPostage purchase failed.";
    const uncertain =
      error instanceof BtcpostageApiError ? error.uncertain : false;

    if (uncertain) {
      await markPurchaseNeedsReview(
        input.orderId,
        `Uncertain after purchase attempt: ${message}`,
        { btcpOrderId: returnedPurchaseId }
      );
      throw new Error(
        `Purchase result uncertain — do not retry. Review BTCPostage or use retrieve. (${message})`
      );
    }

    await markPurchaseFailed(input.orderId, message);
    throw error instanceof Error ? error : new Error(message);
  }
}

export async function recoverOrderPurchase(input: {
  orderId: string;
  btcpOrderId?: string | null;
}): Promise<{ label: BtcpostageLabelPublic }> {
  const order = await getOrder(input.orderId);
  if (!order) throw new Error("Order not found.");

  const existing = await getBtcpostageLabel(input.orderId);
  if (existing?.purchaseStatus === "purchased") {
    assertStoredLabelService(order, existing);
    return { label: toPublicLabel(existing) };
  }

  const btcpOrderId =
    input.btcpOrderId?.trim() || existing?.btcpOrderId?.trim() || "";
  if (!btcpOrderId) {
    throw new Error(
      "No BTCPostage order ID available to retrieve. Check BTCPostage dashboard, then provide btcpOrderId."
    );
  }

  assertPaidUnshipped(order);
  await ensureLabelRow(input.orderId);
  // A retrieval may concern an existing paid purchase. Keep duplicate-buy
  // protection even if the provider read fails or cannot establish its identity.
  await markPurchaseNeedsReview(input.orderId, "Retrieving an existing shipment for review. Do not buy another label until it is resolved.");
  const purchase = await retrievePurchase(btcpOrderId);
  const pkg = normalizePackage({
    weightLbs: existing?.weightLbs ?? undefined,
    weightOz: existing?.weightOz ?? undefined,
    heightIn: existing?.heightIn ?? undefined,
    widthIn: existing?.widthIn ?? undefined,
    depthIn: existing?.depthIn ?? undefined,
  });
  try {
    const record = await applyPurchaseResult(
      order,
      purchase,
      pkg,
      existing?.testMode ?? isBtcpostageTestMode(),
      { requestedPurchaseId: btcpOrderId, recordedPurchaseId: existing?.btcpOrderId ?? null }
    );
    return { label: toPublicLabel(record) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "The retrieved purchase could not be verified.";
    await markPurchaseNeedsReview(input.orderId, `Retrieved shipment needs review: ${message}`);
    throw new Error(`Retrieved shipment needs review — do not buy another label. ${message}`);
  }
}

export async function getOrderLabelPublic(
  orderId: string
): Promise<BtcpostageLabelPublic | null> {
  const label = await getBtcpostageLabel(orderId);
  return label ? toPublicLabel(label) : null;
}
