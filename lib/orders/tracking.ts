import { getCatalogProductByHandle } from "@/lib/products/catalog";

import type { Order, OrderItem, OrderShippingAddress } from "./types";

export type OrderDisplayStatus =
  | "pending"
  | "paid"
  | "shipped"
  | "cancelled"
  | "failed";

export type TrackedOrderItem = OrderItem & {
  sku: string;
};

export type TrackedOrder = {
  orderId: string;
  createdAt: string;
  displayStatus: OrderDisplayStatus;
  items: TrackedOrderItem[];
  shippingSummary: string;
  trackingNumber: string | null;
  trackingCarrier: string | null;
  subtotal: number;
  discountCode: string | null;
  discountAmount: number;
  shippingCost: number;
  total: number;
};

/** City, state, ZIP, and name — street address omitted for privacy. */
export function formatPartialShippingAddress(
  shipping: OrderShippingAddress
): string {
  const name = `${shipping.firstName} ${shipping.lastName}`.trim();
  return `${name}\n${shipping.city}, ${shipping.state} ${shipping.zip}\n${shipping.country}`;
}

export function orderDisplayStatus(order: {
  status: Order["status"];
  shippedAt: string | null;
}): OrderDisplayStatus {
  if (order.status === "shipped" || order.shippedAt) return "shipped";
  if (order.status === "paid") return "paid";
  if (order.status === "cancelled") return "cancelled";
  if (order.status === "failed") return "failed";
  return "pending";
}

export function displayStatusLabel(status: OrderDisplayStatus): string {
  switch (status) {
    case "pending":
      return "Pending payment";
    case "paid":
      return "Paid — preparing for shipment";
    case "shipped":
      return "Shipped";
    case "cancelled":
      return "Cancelled";
    case "failed":
      return "Payment failed";
  }
}

function itemWithSku(item: OrderItem): TrackedOrderItem {
  const catalog = getCatalogProductByHandle(item.handle);
  return {
    ...item,
    sku: catalog?.sku ?? item.handle.toUpperCase(),
  };
}

export function toTrackedOrder(order: Order): TrackedOrder {
  return {
    orderId: order.orderId,
    createdAt: order.createdAt,
    displayStatus: orderDisplayStatus(order),
    items: order.items.map(itemWithSku),
    shippingSummary: formatPartialShippingAddress(order.shipping),
    trackingNumber: order.trackingNumber,
    trackingCarrier: order.trackingCarrier,
    subtotal: order.subtotal,
    discountCode: order.discountCode,
    discountAmount: order.discountAmount,
    shippingCost: order.shippingCost,
    total: order.total,
  };
}

export function formatOrderDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(iso));
}
