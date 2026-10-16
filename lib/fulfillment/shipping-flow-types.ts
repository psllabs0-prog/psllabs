import type { BtcpostageLabelPublic, BtcpostagePackage } from "@/lib/btcpostage/types";

export type ShippingNotificationStatus = {
  status: "none" | "pending" | "sending" | "sent" | "needs_review";
  lastError: string | null;
};
export type FulfillmentShippingStatus = {
  enabled: boolean;
  testMode: boolean;
  configured: boolean;
  trackingEmailEnabled: boolean;
  trackingSaved: boolean;
  label: BtcpostageLabelPublic | null;
  notification: ShippingNotificationStatus | null;
};
export type FulfillmentShippingPreview = {
  token: string | null;
  expiresAt: string | null;
  orderId: string;
  serviceName: string;
  carrier: "USPS";
  service: string;
  postageUsd: number | null;
  package: BtcpostagePackage;
  destinationSummary: string;
  canPurchase: boolean;
  blockers: string[];
  testMode: boolean;
};
export type FulfillmentShippingResult = {
  ok: true;
  label: BtcpostageLabelPublic;
  trackingSaved: boolean;
  notification: ShippingNotificationStatus | null;
  testMode: boolean;
  alreadyPurchased?: boolean;
};
