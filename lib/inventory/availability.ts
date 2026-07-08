import type { StockStatus } from "@/lib/products/stock";

import {
  getAvailabilityForHandles,
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
