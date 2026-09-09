import type { StockStatus } from "./stock";
import { productPathFromSku } from "./slug";

export const retatrutideSource = {
  handle: "retatrutide",
  sku: "PSL-RT-10MG",
  name: "Retatrutide",
  tag: "RESEARCH PEPTIDE",
  nominalStrength: "10mg",
  price: 59.99,
  stockStatus: "in_stock" satisfies StockStatus,
  description:
    "Synthetic peptide reference standard for laboratory research. Third party COA lists purity for the published batch.",
  shortDescription:
    "Retatrutide (CAS 2381089-83-2) reference standard for laboratory research. Third party COA lists purity for the published batch. Not for human or animal use.",
  purityBadge: "Batch-specific purity",
  href: productPathFromSku("PSL-RT-10MG"),
} as const;
