import assert from "node:assert/strict";
import { getManualFulfillmentTestScope } from "@/lib/db/sql";
import { getBtcpostageFromAddress } from "@/lib/btcpostage/config";
import type { BtcpostageAddress } from "@/lib/btcpostage/types";
import type { Order } from "@/lib/orders/types";
import { MANUAL_TEST_ORDER, MANUAL_TEST_RECIPIENT } from "./manual-test-constants";

/** Restore the real configured suite to street2 for the fixed sender-as-destination fixture. */
export function manualTestDestination(order: Order): BtcpostageAddress | null {
  if (!getManualFulfillmentTestScope()) return null;
  const from = getBtcpostageFromAddress();
  assert(order.orderId === MANUAL_TEST_ORDER && order.email === MANUAL_TEST_RECIPIENT &&
    order.shipping.address === [from.street1, from.street2].filter(Boolean).join(", ") &&
    order.shipping.city === from.city && order.shipping.state === from.state && order.shipping.zip === from.zip &&
    order.shipping.country === "US" && from.country === "US" && from.zip.slice(0, 5) === "85016",
  "The manual destination must remain the fixed fixture's configured sender address.");
  return { name: `${order.shipping.firstName} ${order.shipping.lastName}`.trim(),
    street1: from.street1, street2: from.street2 || "", city: from.city, state: from.state, zip: from.zip,
    country: "US", phone: "" };
}
