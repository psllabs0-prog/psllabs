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
  "glp-3-rt": {
    id: "glp-3-rt",
    name: "GLP-3 RT",
    description:
      "Lyophilized GLP-3 RT for laboratory and research use. Batch-specific COA included.",
    priceUsd: 94,
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
