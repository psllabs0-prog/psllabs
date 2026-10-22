import { FLAT_SHIPPING_USD, FREE_SHIPPING_THRESHOLD } from "@/lib/cart/constants";
import type { ProductAvailability } from "@/lib/inventory/availability";
import type { Product } from "@/lib/products";
import type { CatalogProduct } from "@/lib/products/catalog";
import { getProductImage } from "@/lib/products/images";
import { getProductRender } from "@/lib/products/renders";
import { SITE_URL } from "@/lib/seo";

/** Use the same product, image and inventory record as the visible purchase page. */
export function createProductData({
  product,
  catalog,
  availability,
}: {
  product: Product;
  catalog: CatalogProduct;
  availability: ProductAvailability;
}) {
  const url = `${SITE_URL}${catalog.href}`;
  const image = getProductRender(product.handle)?.src ?? product.imageSrc ?? getProductImage(product.handle).src;
  const strength = catalog.strength.replace(/(\d)(mg|ml)$/i, "$1 $2");

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${url}#product`,
    name: `${product.name} ${strength}`,
    sku: catalog.sku,
    description: product.shortDescription,
    url,
    image: new URL(image, SITE_URL).toString(),
    brand: { "@type": "Brand", name: "PSL Labs" },
    offers: {
      "@type": "Offer",
      price: product.price.toFixed(2),
      priceCurrency: "USD",
      url,
      itemCondition: "https://schema.org/NewCondition",
      seller: { "@type": "Organization", "@id": `${SITE_URL}/#organization`, name: "PSL Labs" },
      // Facts from lib/cart/constants.ts (U.S. only, flat standard rate, free at the product
      // subtotal threshold). No delivery-time promise: carrier estimates are not guaranteed.
      shippingDetails: {
        "@type": "OfferShippingDetails",
        shippingRate: {
          "@type": "MonetaryAmount",
          value: (product.price >= FREE_SHIPPING_THRESHOLD ? 0 : FLAT_SHIPPING_USD).toFixed(2),
          currency: "USD",
        },
        shippingDestination: { "@type": "DefinedRegion", addressCountry: "US" },
      },
      // An inventory fallback is not a verified stock count. Omit this field
      // when the inventory read fails or no tracked stock record exists.
      ...(availability.tracked ? {
        availability: availability.status === "out_of_stock"
          ? "https://schema.org/OutOfStock"
          : "https://schema.org/InStock",
      } : {}),
    },
  };
}
