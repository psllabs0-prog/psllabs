import { getCatalogProductByHandle } from "@/lib/products/catalog";

export type CheckoutProduct = {
  id: string;
  name: string;
  description: string;
  priceUsd: number;
};

const catalog: Record<string, CheckoutProduct> = {
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
  retatrutide: {
    id: "retatrutide",
    name: "Retatrutide",
    description:
      "Lyophilized Retatrutide for laboratory and research use. Independent batch documentation available for selected lots.",
    priceUsd: getCatalogProductByHandle("retatrutide")!.price,
  },
};

export function getCheckoutProduct(
  productId: string
): CheckoutProduct | undefined {
  return catalog[productId];
}

export function getAllCheckoutProducts(): CheckoutProduct[] {
  return Object.values(catalog);
}
