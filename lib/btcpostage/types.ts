export type BtcpostagePurchaseStatus =
  | "none"
  | "purchasing"
  | "purchased"
  | "failed"
  | "needs_review";

export type BtcpostageAddress = {
  name?: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  phone?: string;
  company?: string | null;
  residential?: boolean;
};

export type BtcpostagePackage = {
  weightLbs: number;
  weightOz: number;
  heightIn: number;
  widthIn: number;
  depthIn: number;
  packageType: string;
};

export type BtcpostageRate = {
  service: string;
  serviceDisplay: string;
  rate: string;
  carrier: string;
  estDeliveryDays: string | number | null;
  currency: string;
};

export type BtcpostagePurchaseItem = {
  shipmentId: string;
  carrier: string;
  service: string;
  price: string;
  currency: string;
  filename: string;
  trackingNo: string;
  fromName?: string;
  toName?: string;
};

export type BtcpostagePurchase = {
  orderId: string;
  orderTimestamp: string | null;
  remainingCredits: number | null;
  orderNotes: string | null;
  items: BtcpostagePurchaseItem[];
};

export type BtcpostageLabelRecord = {
  pslOrderId: string;
  purchaseStatus: BtcpostagePurchaseStatus;
  btcpOrderId: string | null;
  shipmentId: string | null;
  carrier: string | null;
  service: string | null;
  postageCost: number | null;
  trackingNumber: string | null;
  labelUrl: string | null;
  labelFormat: string | null;
  testMode: boolean;
  purchasedAt: string | null;
  purchaseClaimedAt: string | null;
  lastError: string | null;
  verifiedStreet1: string | null;
  verifiedStreet2: string | null;
  verifiedCity: string | null;
  verifiedState: string | null;
  verifiedZip: string | null;
  verifiedCountry: string | null;
  weightLbs: number | null;
  weightOz: number | null;
  heightIn: number | null;
  widthIn: number | null;
  depthIn: number | null;
  updatedAt: string | null;
};

/** Safe subset for admin UI / client — never includes API secrets. */
export type BtcpostageLabelPublic = {
  pslOrderId: string;
  purchaseStatus: BtcpostagePurchaseStatus;
  btcpOrderId: string | null;
  shipmentId: string | null;
  carrier: string | null;
  service: string | null;
  postageCost: number | null;
  trackingNumber: string | null;
  labelUrl: string | null;
  testMode: boolean;
  purchasedAt: string | null;
  lastError: string | null;
  isRealShipment: boolean;
};

export const DEFAULT_PACKAGE: BtcpostagePackage = {
  weightLbs: 0,
  weightOz: 4,
  heightIn: 3,
  widthIn: 4,
  depthIn: 6,
  packageType: "Parcel",
};
