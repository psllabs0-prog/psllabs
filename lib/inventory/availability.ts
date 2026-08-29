import type { StockStatus } from "@/lib/products/stock";
import { getCatalogProductByHandle } from "@/lib/products/catalog";

import {
  getAvailabilityForHandles,
  getStockBySku,
  isInventoryTracked,
} from "./store";

export type ProductAvailability = {
  handle: string;
  tracked: boolean;
  stock: number;
  reserved: number;
  available: number;
  status: StockStatus;
};

export { availabilityToStockStatus } from "./constants";

export async function getProductAvailability(
  handle: string,
  fallbackStatus: StockStatus = "in_stock"
): Promise<ProductAvailability> {
  const [row] = await getAvailabilityForHandles([handle], fallbackStatus);
  return row;
}

export async function isProductInventoryTracked(
  handle: string
): Promise<boolean> {
  return isInventoryTracked(handle);
}

/** Availability for a catalog SKU (queries DB stock by SKU, reservations by handle). */
export async function getProductAvailabilityBySku(
  sku: string,
  fallbackStatus: StockStatus = "in_stock"
): Promise<ProductAvailability | null> {
  const row = await getStockBySku(sku);
  if (!row) return null;

  const catalog = getCatalogProductByHandle(row.handle);
  const [availability] = await getAvailabilityForHandles(
    [row.handle],
    catalog?.status === "coming_soon" ? "out_of_stock" : fallbackStatus
  );

  return availability ?? null;
}

export async function getAvailabilityForCatalogHandles(
  handles: string[]
): Promise<Map<string, ProductAvailability>> {
  const rows = await getAvailabilityForHandles(handles);
  return new Map(rows.map((row) => [row.handle, row]));
}
