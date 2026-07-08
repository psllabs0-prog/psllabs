import type { StockStatus } from "@/lib/products/stock";

export const LOW_STOCK_THRESHOLD = Number(process.env.LOW_STOCK_THRESHOLD ?? 5);

export const INVOICE_EXPIRY_MINUTES = Number(
  process.env.BTCPAY_INVOICE_EXPIRY_MINUTES ?? 15
);

/** Grace for pending orders awaiting invoice link after checkout. */
export const PENDING_GRACE_MINUTES = 5;

export function availabilityToStockStatus(
  available: number,
  threshold = LOW_STOCK_THRESHOLD
): StockStatus {
  if (available <= 0) return "out_of_stock";
  if (available <= threshold) return "low_stock";
  return "in_stock";
}
