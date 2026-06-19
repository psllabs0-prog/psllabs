import type { Product } from "./types";

export const defaultBullets = [
  "60 capsules / 30-day supply",
  "60-day guarantee",
  "Free US shipping over $60",
] as const;

export function getOtherProducts(handle: string, catalog: Record<string, Product>): Product[] {
  return Object.values(catalog).filter((p) => p.handle !== handle);
}
