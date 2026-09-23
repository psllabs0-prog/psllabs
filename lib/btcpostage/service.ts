import { getOrder } from "@/lib/orders/store";
import type { Order } from "@/lib/orders/types";

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

function assertPaidUnshipped(order: Order): void {
  if (order.status !== "paid") {
    throw new Error("Order must be paid and unshipped for BTCPostage actions.");
  }
  if (order.trackingNumber?.trim()) {
    throw new Error("Order already has a tracking number on the PSL order.");
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
  orderId: string,
  purchase: Awaited<ReturnType<typeof createPurchase>>,
  pkg: BtcpostagePackage,
  testMode: boolean
) {
  const item = purchase.items[0];
  if (!item) {
    throw new BtcpostageApiError("BTCPostage purchase returned no label items.", {
      uncertain: true,
    });
  }
  return markPurchaseSucceeded({
    pslOrderId: orderId,
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

  const existing = await getBtcpostageLabel(input.orderId);
  if (existing?.purchaseStatus === "purchased") {
    return { label: toPublicLabel(existing), alreadyPurchased: true };
  }

  const claim = await claimLabelPurchase(input.orderId);
  if (!claim.ok) {
    if (claim.reason === "already_purchased") {
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

  const pkg = normalizePackage(input.pkg);
  const to = await resolveToAddress(order);
  const from = getBtcpostageFromAddress();
  const carrier = input.carrier.trim();
  const service = input.service.trim();
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
    const record = await applyPurchaseResult(
      input.orderId,
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
        `Uncertain after purchase attempt: ${message}`
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
    return { label: toPublicLabel(existing) };
  }

  const btcpOrderId =
    input.btcpOrderId?.trim() || existing?.btcpOrderId?.trim() || "";
  if (!btcpOrderId) {
    throw new Error(
      "No BTCPostage order ID available to retrieve. Check BTCPostage dashboard, then provide btcpOrderId."
    );
  }

  const purchase = await retrievePurchase(btcpOrderId);
  const pkg = normalizePackage({
    weightLbs: existing?.weightLbs ?? undefined,
    weightOz: existing?.weightOz ?? undefined,
    heightIn: existing?.heightIn ?? undefined,
    widthIn: existing?.widthIn ?? undefined,
    depthIn: existing?.depthIn ?? undefined,
  });
  const record = await applyPurchaseResult(
    input.orderId,
    purchase,
    pkg,
    existing?.testMode ?? isBtcpostageTestMode()
  );
  return { label: toPublicLabel(record) };
}

export async function getOrderLabelPublic(
  orderId: string
): Promise<BtcpostageLabelPublic | null> {
  const label = await getBtcpostageLabel(orderId);
  return label ? toPublicLabel(label) : null;
}
