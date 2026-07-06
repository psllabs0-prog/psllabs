import { catalogProducts } from "@/lib/products/catalog";
import { getProduct } from "@/lib/products";
import { PRODUCT_VIAL_IMAGE } from "@/lib/products/images";

import type { CartLineItem, CartLineWithMeta, CartProductMeta } from "./types";

export function getCartProductMeta(handle: string): CartProductMeta | null {
  const catalogItem = catalogProducts.find((product) => product.handle === handle);
  if (catalogItem) {
    return {
      handle: catalogItem.handle,
      name: catalogItem.name,
      strength: catalogItem.strength,
      unitPrice: catalogItem.price,
      imageSrc: catalogItem.imageSrc,
      imageAlt: catalogItem.imageAlt,
    };
  }

  const product = getProduct(handle);
  if (!product) return null;

  return {
    handle: product.handle,
    name: product.name,
    strength: product.tag,
    unitPrice: product.price,
    imageSrc: product.imageSrc ?? PRODUCT_VIAL_IMAGE.src,
    imageAlt: product.imageAlt ?? product.name,
  };
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
