import { catalogProducts } from "@/lib/products/catalog";

import type { CartLineItem, CartLineWithMeta, CartProductMeta } from "./types";

export function getCartProductMeta(handle: string): CartProductMeta | null {
  const catalogItem = catalogProducts.find((product) => product.handle === handle);
  if (catalogItem) {
    if (catalogItem.status === "coming_soon") return null;
    return {
      handle: catalogItem.handle,
      name: catalogItem.name,
      strength: catalogItem.strength,
      unitPrice: catalogItem.price,
      imageSrc: catalogItem.imageSrc,
      imageAlt: catalogItem.imageAlt,
    };
  }

  return null;
}

export function resolveCartLines(items: CartLineItem[]): CartLineWithMeta[] {
  return items
    .map((item) => {
      const meta = getCartProductMeta(item.handle);
      if (!meta) return null;
      return { ...item, ...meta };
    })
    .filter((line): line is CartLineWithMeta => line !== null);
}
