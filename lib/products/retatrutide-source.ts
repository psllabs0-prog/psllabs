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
    "Synthetic peptide reference standard for laboratory research. Laboratory-reported purity on third-party COA. Batch-specific documentation available.",
  shortDescription:
    "Retatrutide (CAS 2381089-83-2) — synthetic peptide reference standard for laboratory research. Laboratory-reported purity on third-party COA. Batch-specific Certificate of Analysis available. Not for human or animal use.",
  purityBadge: "Batch-specific purity",
  href: productPathFromSku("PSL-RT-10MG"),
} as const;
