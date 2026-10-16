import type { ShippingSelection } from "@/lib/shipping/types";
import type { BtcpostagePackage, BtcpostagePurchase } from "./types";

/** Match exact server-saved provider codes, never a price or a display-name guess. */
export function labelRateMatchesShippingSelection(
  selection: ShippingSelection | null | undefined,
  rate: { carrier: string; service: string }
): boolean {
  if (!selection) return true;
  return selection.carrier === "USPS" &&
    rate.carrier.trim().toUpperCase() === "USPS" &&
    Boolean(selection.providerServiceCode) &&
    rate.service.trim() === selection.providerServiceCode;
}

/** Called before purchase is claimed or any paid provider request can run. */
export function assertLabelMatchesOrderShipping(input: {
  selection: ShippingSelection | null | undefined;
  carrier: string;
  service: string;
  pkg: BtcpostagePackage;
}): void {
  const { selection, pkg } = input;
  // Historical orders preserve their existing manual label workflow.
  if (!selection) return;
  if (!labelRateMatchesShippingSelection(selection, input)) {
    throw new Error(
      `Label service must match the order's selected ${selection.serviceDisplayName}. Review the order before changing its shipping service.`
    );
  }

  const weightOz = pkg.weightLbs * 16 + pkg.weightOz;
  if (![weightOz, pkg.depthIn, pkg.widthIn, pkg.heightIn].every(
    (value) => Number.isFinite(value) && value > 0
  ) || weightOz > 70 * 16) {
    throw new Error("A valid, measured package is required before buying this order's label.");
  }

  if (selection.method !== "priority") return;
  const quoted = selection.package;
  if (!quoted || !Number.isFinite(selection.quotedPostageUsd) ||
      Number(selection.quotedPostageUsd) <= 0 ||
      !selection.quotedAt || !Number.isFinite(Date.parse(selection.quotedAt))) {
    throw new Error("Priority shipping is missing its verified package and postage snapshot. Review before purchasing a label.");
  }
  const actual = [weightOz, pkg.depthIn, pkg.widthIn, pkg.heightIn];
  const snapshot = [quoted.weightOz, quoted.lengthIn, quoted.widthIn, quoted.heightIn];
  if (!snapshot.every((value) => Number.isFinite(value) && value > 0) ||
      !actual.every((value, index) => Math.abs(value - snapshot[index]) < 0.0001) ||
      pkg.packageType !== "Parcel") {
    throw new Error("The measured package differs from the paid Priority shipping quote. Review its package and shipping terms before purchasing a label.");
  }
}

/** A response is not proof of a matching shipment merely because it has a label URL. */
export function assertReturnedPurchaseMatchesOrder(input: {
  orderId: string;
  selection: ShippingSelection | null | undefined;
  destinationName: string;
  purchase: BtcpostagePurchase;
  recovery?: { requestedPurchaseId: string; recordedPurchaseId: string | null; recordedOrderReference?: string | null };
}): void {
  const { purchase, recovery } = input;
  if (!purchase.orderId?.trim() || purchase.items.length !== 1) {
    throw new Error("The provider purchase must identify exactly one label. Review the purchase before attaching a shipment.");
  }
  if (recovery && purchase.orderId !== recovery.requestedPurchaseId) {
    throw new Error("The returned provider purchase ID differs from the requested purchase. Review before attaching a shipment.");
  }
  const reference = purchase.orderNotes?.trim() || null;
  const expectedReference = `PSL ${input.orderId}`;
  if (recovery?.recordedOrderReference?.trim() && recovery.recordedOrderReference.trim() !== expectedReference) {
    throw new Error("The original provider purchase references a different PSL order. Review its original response before attaching this shipment.");
  }
  if (reference && reference !== expectedReference) {
    throw new Error("The provider purchase references a different PSL order. Do not attach this shipment.");
  }
  if (recovery && reference !== expectedReference && recovery.recordedPurchaseId !== purchase.orderId) {
    throw new Error("The retrieved purchase has no verified link to this PSL order. Review its original order reference before attaching a shipment.");
  }
  const item = purchase.items[0];
  const normalizedName = (value: string) => value.trim().replace(/\s+/g, " ").toUpperCase();
  if (item.toName && normalizedName(item.toName) !== normalizedName(input.destinationName)) {
    throw new Error("The provider label names a different recipient. Review the destination before attaching this shipment.");
  }
  if (!labelRateMatchesShippingSelection(input.selection, item)) {
    throw new Error("The provider label does not match the order's selected carrier and shipping service. Review before attaching this shipment.");
  }
}
