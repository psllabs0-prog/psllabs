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
    "Freeze dried Retatrutide for laboratory research, with a published third-party batch report.",
  shortDescription:
    "Freeze dried Retatrutide for laboratory research. Review the original batch report below, including the lab’s measured purity and amount. Not for human or animal use.",
  purityBadge: "Batch-specific purity",
  href: productPathFromSku("PSL-RT-10MG"),
} as const;
