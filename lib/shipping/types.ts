export type ShippingMethod = "standard" | "priority";

export type ShippingPackage = {
  weightOz: number;
  lengthIn: number;
  widthIn: number;
  heightIn: number;
};

/** A server-validated service snapshot, not a promised delivery date. */
export type ShippingSelection = {
  method: ShippingMethod;
  carrier: "USPS" | null;
  providerServiceCode: string | null;
  serviceDisplayName: string;
  transitDays: number | null;
  deliveryEstimate: string | null;
  quotedPostageUsd: number | null;
  package: ShippingPackage | null;
  quotedAt: string | null;
  quoteExpiresAt: string | null;
  tagadaShippingRateId?: string;
};

export type PublicShippingSelection = Pick<ShippingSelection,
  "method" | "carrier" | "serviceDisplayName" | "deliveryEstimate">;

export type ShippingOptionsResponse = {
  standard: { method: "standard"; priceUsd: number };
  priority:
    | { available: false; reason: string }
    | { available: true; method: "priority"; priceUsd: number; quoteToken: string;
        expiresAt: string; selection: ShippingSelection };
};
