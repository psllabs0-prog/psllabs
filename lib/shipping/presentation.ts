import {
  ORDER_PROCESSING_NOTICE,
  PRIORITY_TRANSIT_NOTICE,
  STANDARD_TRANSIT_NOTICE,
} from "@/lib/content/shipping";

/** Customer-safe fields: no address, provider cost, credentials or quote token. */
export type ShippingPresentationSource = {
  method: "standard" | "priority";
  carrier: string | null;
  serviceDisplayName: string;
  deliveryEstimate: string | null;
};

export type ShippingPresentation = {
  serviceName: string;
  deliveryEstimate: string | null;
  processingNotice: string;
  legacy: boolean;
};

export function getShippingSelectionPresentation(
  selection?: ShippingPresentationSource | null
): ShippingPresentation {
  if (!selection) {
    return {
      serviceName: "Standard shipping",
      deliveryEstimate: null,
      processingNotice: ORDER_PROCESSING_NOTICE,
      legacy: true,
    };
  }

  const estimate = selection.deliveryEstimate ||
    (selection.carrier === "USPS"
      ? selection.method === "priority" ? PRIORITY_TRANSIT_NOTICE : STANDARD_TRANSIT_NOTICE
      : null);
  return {
    serviceName: selection.serviceDisplayName ||
      (selection.method === "priority" ? "USPS Priority Mail" : "Standard shipping"),
    deliveryEstimate: estimate && !/not guaranteed/i.test(estimate)
      ? `${estimate} Carrier estimates are not guaranteed.` : estimate,
    processingNotice: ORDER_PROCESSING_NOTICE,
    legacy: false,
  };
}

/** Historic orders have no inferred carrier or service based on their price. */
export function getOrderShippingPresentation(shipping: {
  selection?: ShippingPresentationSource | null;
}): ShippingPresentation {
  return getShippingSelectionPresentation(shipping.selection);
}
