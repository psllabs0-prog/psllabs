import type { FulfillmentShippingPreview, FulfillmentShippingStatus } from "./shipping-flow-types";
import type { BtcpostagePackage } from "@/lib/btcpostage/types";

export type ManualFulfillmentTestStatus = {
  exists: boolean;
  testOnly: true;
  orderId: string;
  recipient: string;
  package: BtcpostagePackage;
  serviceName: "USPS Ground Advantage";
  providerConfigured: boolean;
  senderReady: boolean;
  smtpReady: boolean;
  shippingStatus: FulfillmentShippingStatus | null;
  testEmail: { status: "none" | "claimed" | "smtp_accepted" | "needs_review" };
};
export type ManualFulfillmentTestReply = ManualFulfillmentTestStatus & {
  preview?: FulfillmentShippingPreview;
  error?: string;
};
