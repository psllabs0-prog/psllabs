import { getOrderByEmailAndId } from "@/lib/orders/store";
import {
  displayStatusLabel,
  toTrackedOrder,
  type TrackedOrder,
} from "@/lib/orders/tracking";

/**
 * Customer-safe order lookup. Requires matching order email.
 * Never returns another customer's order.
 */
export async function lookupOrderForSupport(input: {
  fromEmail: string;
  orderId: string | null;
}): Promise<{ found: boolean; order: TrackedOrder | null; reason: string }> {
  if (!input.orderId) {
    return {
      found: false,
      order: null,
      reason: "No order ID found in the message.",
    };
  }

  const order = await getOrderByEmailAndId(input.fromEmail, input.orderId);
  if (!order) {
    return {
      found: false,
      order: null,
      reason:
        "No matching order for that order ID and the email that wrote in. We will not disclose other accounts.",
    };
  }

  return {
    found: true,
    order: toTrackedOrder(order),
    reason: "Verified against Neon with email + order ID.",
  };
}

export function formatOrderStatusFacts(order: TrackedOrder): string {
  const lines = [
    `Order: ${order.orderId}`,
    `Status: ${displayStatusLabel(order.displayStatus)}`,
    `Placed: ${new Date(order.createdAt).toISOString().slice(0, 10)}`,
  ];
  if (order.trackingNumber) {
    lines.push(
      `Tracking: ${order.trackingNumber}${
        order.trackingCarrier ? ` (${order.trackingCarrier})` : ""
      }`
    );
  } else {
    lines.push("Tracking: not yet available in our system.");
  }
  lines.push(`Ship-to summary: ${order.shippingSummary.replace(/\n/g, ", ")}`);
  return lines.join("\n");
}
