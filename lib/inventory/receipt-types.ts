export type InventoryReceiptInput = {
  reference: string;
  sourceNote: string;
  lines: { sku: string; quantity: number; unitCostUsd: number }[];
  releaseToSellable: boolean;
  closeInboundLotIds: number[];
};

export type ReceiptInventoryProduct = {
  sku: string;
  handle: string;
  name: string;
  stock: number;
  awaitingTesting: number;
  physicalOnHand: number;
  listedForSale: boolean;
};

export type InventoryReceiptLine = {
  sku: string;
  handle: string;
  name: string;
  quantity: number;
  unitCostUsd: number;
  lineTotalUsd: number;
  disposition: "sellable" | "awaiting_testing" | "internal_unlisted";
  pipelineLotId: number | null;
  oldStock: number;
  newStock: number;
};

export type InventoryReceipt = {
  id: string;
  reference: string;
  sourceNote: string;
  createdAt: string;
  merchandiseTotalUsd: number;
  totalQuantity: number;
  releaseToSellable: boolean;
  ledgerEntryId: number;
  closedInboundLotIds: number[];
  lines: InventoryReceiptLine[];
};

export type ReceiptOpenInboundLot = {
  id: number;
  sku: string;
  quantityOrdered: number;
  status: "ordered" | "in_transit";
  supplierLotReference: string | null;
  orderedAt: string;
  notes: string | null;
};

export type InventoryReceiptSnapshot = {
  products: ReceiptInventoryProduct[];
  receipts: InventoryReceipt[];
  openInboundLots: ReceiptOpenInboundLot[];
};

export type InventoryReceiptResult = {
  ok: true;
  receipt: InventoryReceipt;
  replayed: boolean;
};
