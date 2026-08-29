/** URL slug from catalog SKU (e.g. PSL-RT-10MG → psl-rt-10mg). */
export function skuToSlug(sku: string): string {
  return sku.toLowerCase();
}

export function productPathFromSku(sku: string): string {
  return `/products/${skuToSlug(sku)}`;
}
