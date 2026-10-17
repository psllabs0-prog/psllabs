import type { InventoryReceiptInput } from "./receipt-types";
import type { ReceiptProductDefinition } from "./receipt-products";

export class InventoryReceiptError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
    this.name = "InventoryReceiptError";
  }
}

export type ValidatedInventoryReceipt = {
  reference: string;
  referenceKey: string;
  sourceNote: string;
  lines: (ReceiptProductDefinition & { quantity: number; unitCostCents: number })[];
  releaseToSellable: boolean;
  closeInboundLotIds: number[];
  merchandiseTotalCents: number;
  totalQuantity: number;
};

export function inventoryReceiptReferenceKey(value: string): string {
  return value.normalize("NFKC").trim().toUpperCase();
}

export function validateInventoryReceipt(
  input: unknown,
  products: ReceiptProductDefinition[],
): ValidatedInventoryReceipt {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new InventoryReceiptError("A receipt object is required.");
  }
  const body = input as Partial<InventoryReceiptInput>;
  const allowed = new Set(["reference", "sourceNote", "lines", "releaseToSellable", "closeInboundLotIds"]);
  if (Object.keys(body).some((key) => !allowed.has(key))) {
    throw new InventoryReceiptError("Unexpected receipt field.");
  }
  const reference = typeof body.reference === "string" ? body.reference.normalize("NFKC").trim() : "";
  const sourceNote = typeof body.sourceNote === "string" ? body.sourceNote.trim() : "";
  if (reference.length < 3 || reference.length > 120 || /[\u0000-\u001f\u007f]/.test(reference)) {
    throw new InventoryReceiptError("Use a receipt reference between 3 and 120 characters.");
  }
  if (!sourceNote || sourceNote.length > 2000 || sourceNote.includes("\0")) {
    throw new InventoryReceiptError("A source note of at most 2,000 characters is required.");
  }
  if (typeof body.releaseToSellable !== "boolean" || !Array.isArray(body.closeInboundLotIds)) {
    throw new InventoryReceiptError("Explicit release and inbound tracking choices are required.");
  }
  if (!Array.isArray(body.lines) || body.lines.length < 1 || body.lines.length > products.length) {
    throw new InventoryReceiptError("Select at least one registered inventory item.");
  }
  const seen = new Set<string>();
  const lines = body.lines.map((line) => {
    if (!line || typeof line !== "object" || Array.isArray(line) ||
      Object.keys(line).some((key) => !["sku", "quantity", "unitCostUsd"].includes(key))) {
      throw new InventoryReceiptError("Invalid receipt line.");
    }
    const sku = typeof line.sku === "string" ? line.sku.trim().toUpperCase() : "";
    const product = products.find((candidate) => candidate.sku === sku);
    if (!product || seen.has(sku)) throw new InventoryReceiptError("Unknown or duplicate inventory SKU.");
    seen.add(sku);
    if (!Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > 1_000_000) {
      throw new InventoryReceiptError("Quantity must be a positive whole number of at most 1,000,000.");
    }
    if (typeof line.unitCostUsd !== "number" || !Number.isFinite(line.unitCostUsd) || line.unitCostUsd <= 0) {
      throw new InventoryReceiptError("A positive merchandise unit cost is required.");
    }
    const cents = Math.round(line.unitCostUsd * 100);
    if (!Number.isSafeInteger(cents) || cents < 1 || cents > 100_000_000 || Math.abs(line.unitCostUsd * 100 - cents) > 0.000001) {
      throw new InventoryReceiptError("Unit cost must use whole cents and be within the supported range.");
    }
    return { ...product, quantity: line.quantity, unitCostCents: cents };
  }).sort((a, b) => a.sku.localeCompare(b.sku));
  if (body.closeInboundLotIds.length > 150 || body.closeInboundLotIds.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
    throw new InventoryReceiptError("Invalid inbound tracking IDs.");
  }
  const closeInboundLotIds = [...new Set(body.closeInboundLotIds)].sort((a, b) => a - b);
  if (closeInboundLotIds.length !== body.closeInboundLotIds.length) {
    throw new InventoryReceiptError("Inbound tracking IDs must be unique.");
  }
  const merchandiseTotalCents = lines.reduce((sum, line) => sum + line.quantity * line.unitCostCents, 0);
  const totalQuantity = lines.reduce((sum, line) => sum + line.quantity, 0);
  // financial_ledger NUMERIC(10,2), with headroom for arithmetic and UI serialization.
  if (!Number.isSafeInteger(merchandiseTotalCents) || merchandiseTotalCents > 9_999_999_999) {
    throw new InventoryReceiptError("Receipt merchandise total exceeds the supported range.");
  }
  return { reference, referenceKey: inventoryReceiptReferenceKey(reference), sourceNote, lines,
    releaseToSellable: body.releaseToSellable, closeInboundLotIds, merchandiseTotalCents, totalQuantity };
}
