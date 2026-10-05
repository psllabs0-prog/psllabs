import { getCartProductMeta } from "./products";
import type { CartLineItem } from "./types";

/** Remove retired, unknown and unreleased products without changing valid quantities. */
export function normalizeCartItems(items: CartLineItem[]): CartLineItem[] {
  return items.filter((item) => getCartProductMeta(item.handle) !== null);
}
