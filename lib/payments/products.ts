import {
  getActiveCatalogProducts,
  getCatalogProductByHandle,
} from "@/lib/products/catalog";

export type CheckoutProduct = {
  id: string;
  name: string;
  description: string;
  priceUsd: number;
};

const legacyCatalog: Record<string, CheckoutProduct> = {
  foundation: {
    id: "foundation",
    name: "Foundation",
    description:
      "The base layer. Trans-resveratrol, spermidine, fisetin, and methylated B-complex. 60 capsules / 30-day supply.",
    priceUsd: 52,
  },
  "cellular-energy": {
    id: "cellular-energy",
    name: "Cellular Energy",
    description:
      "NMN and NR with TMG for methylation support. Targets NAD+ decline. 60 capsules / 30-day supply.",
    priceUsd: 68,
  },
  recovery: {
    id: "recovery",
    name: "Recovery",
    description:
      "Urolithin A, ubiquinol, and PQQ. The mitochondrial biogenesis stack. 60 capsules / 30-day supply.",
    priceUsd: 84,
  },
};

function fromCatalogHandle(handle: string): CheckoutProduct | undefined {
  const catalog = getCatalogProductByHandle(handle);
  if (!catalog || catalog.status !== "active") return undefined;
  return {
    id: catalog.handle,
    name: catalog.name,
    description: catalog.description,
    priceUsd: catalog.price,
  };
}

export function getCheckoutProduct(
  productId: string
): CheckoutProduct | undefined {
  return legacyCatalog[productId] ?? fromCatalogHandle(productId);
}

export function getAllCheckoutProducts(): CheckoutProduct[] {
  const byId = new Map<string, CheckoutProduct>();

  for (const product of Object.values(legacyCatalog)) {
    byId.set(product.id, product);
  }

  for (const catalog of getActiveCatalogProducts()) {
    byId.set(catalog.handle, {
      id: catalog.handle,
      name: catalog.name,
      description: catalog.description,
      priceUsd: catalog.price,
    });
  }

  return [...byId.values()];
}
