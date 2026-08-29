import { Shippo } from "shippo";

import type { Order } from "@/lib/orders/types";

export type ShipmentTrackingStatus =
  | "label_created"
  | "in_transit"
  | "out_for_delivery"
  | "delivered"
  | "unknown";

export type CreateLabelResult = {
  trackingNumber: string;
  labelUrl: string;
  carrier: string;
};

export type TrackShipmentResult = {
  status: ShipmentTrackingStatus;
  statusLabel: string;
  statusDetails: string;
  carrier: string;
  trackingNumber: string;
  eta: string | null;
};

function getShippoClient(): Shippo {
  const apiKey = process.env.SHIPPO_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("SHIPPO_API_KEY is not configured.");
  }
  return new Shippo({ apiKeyHeader: apiKey });
}

function fromAddress() {
  return {
    name: process.env.SHIPPO_FROM_NAME?.trim() || "PSL Labs",
    street1: process.env.SHIPPO_FROM_STREET?.trim() || "123 Research Blvd",
    city: process.env.SHIPPO_FROM_CITY?.trim() || "Wilmington",
    state: process.env.SHIPPO_FROM_STATE?.trim() || "DE",
    zip: process.env.SHIPPO_FROM_ZIP?.trim() || "19801",
    country: process.env.SHIPPO_FROM_COUNTRY?.trim() || "US",
    phone: process.env.SHIPPO_FROM_PHONE?.trim() || "5555555555",
    email: process.env.SHIPPO_FROM_EMAIL?.trim() || "fulfillment@psllabs.org",
  };
}

export function mapShippoStatusToLabel(
  status: string | undefined,
  substatus?: string | null
): { status: ShipmentTrackingStatus; label: string } {
  const normalized = (status ?? "UNKNOWN").toUpperCase();
  const sub = (substatus ?? "").toLowerCase();

  if (normalized === "DELIVERED") {
    return { status: "delivered", label: "Delivered" };
  }
  if (
    normalized === "TRANSIT" &&
    (sub.includes("out_for_delivery") || sub.includes("out for delivery"))
  ) {
    return { status: "out_for_delivery", label: "Out for Delivery" };
  }
  if (normalized === "TRANSIT") {
    return { status: "in_transit", label: "In Transit" };
  }
  if (normalized === "PRE_TRANSIT" || normalized === "UNKNOWN") {
    return { status: "label_created", label: "Label Created" };
  }
  return { status: "unknown", label: "In Transit" };
}

/** Create a USPS shipping label for a paid order. */
export async function createLabel(order: Order): Promise<CreateLabelResult> {
  const shippo = getShippoClient();

  const shipment = await shippo.shipments.create({
    addressFrom: fromAddress(),
    addressTo: {
      name: `${order.shipping.firstName} ${order.shipping.lastName}`.trim(),
      street1: order.shipping.address,
      city: order.shipping.city,
      state: order.shipping.state,
      zip: order.shipping.zip,
      country: order.shipping.country || "US",
      phone: "5555555555",
      email: order.email,
    },
    parcels: [
      {
        length: "6",
        width: "4",
        height: "4",
        distanceUnit: "in",
        weight: "8",
        massUnit: "oz",
      },
    ],
    async: false,
  });

  const uspsRate =
    shipment.rates?.find(
      (rate) =>
        rate.provider?.toUpperCase() === "USPS" &&
        Boolean(rate.objectId) &&
        rate.amount
    ) ?? shipment.rates?.find((rate) => Boolean(rate.objectId));

  if (!uspsRate?.objectId) {
    throw new Error("No USPS shipping rate available for this address.");
  }

  const transaction = await shippo.transactions.create({
    rate: uspsRate.objectId,
    labelFileType: "PDF",
    async: false,
    metadata: order.orderId,
  });

  if (transaction.status !== "SUCCESS") {
    const message =
      transaction.messages?.map((entry) => entry.text).filter(Boolean).join("; ") ||
      "Shippo label purchase failed.";
    throw new Error(message);
  }

  const carrier = (uspsRate.provider ?? "usps").toLowerCase();

  return {
    trackingNumber: transaction.trackingNumber ?? "",
    labelUrl: transaction.labelUrl ?? "",
    carrier,
  };
}

export async function trackShipment(
  trackingNumber: string,
  carrier = "usps"
): Promise<TrackShipmentResult> {
  const shippo = getShippoClient();
  const track = await shippo.trackingStatus.get(
    trackingNumber.trim(),
    carrier.trim().toLowerCase()
  );

  const latest = track.trackingStatus;
  const mapped = mapShippoStatusToLabel(
    latest?.status,
    latest?.substatus?.code ?? latest?.substatus?.text
  );

  return {
    status: mapped.status,
    statusLabel: mapped.label,
    statusDetails: latest?.statusDetails ?? mapped.label,
    carrier: track.carrier ?? carrier,
    trackingNumber: track.trackingNumber ?? trackingNumber,
    eta: track.eta ? track.eta.toISOString() : null,
  };
}
