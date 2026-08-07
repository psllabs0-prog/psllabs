import type { StockStatus } from "./stock";

/**
 * Single source of truth for Retatrutide listing data.
 * Batch/lab results live in lib/batch-reports (linked via handle).
 */
export const retatrutideSource = {
  handle: "retatrutide",
  sku: "PSL-RT-10MG",
  name: "Retatrutide",
  tag: "RESEARCH PEPTIDE",
  nominalStrength: "10mg",
  price: 49.99,
  stockStatus: "in_stock" satisfies StockStatus,
  description:
    "Synthetic peptide reference standard for laboratory research. HPLC-verified purity. Batch-specific documentation available for selected lots.",
  shortDescription:
    "Retatrutide (CAS 2381089-83-2) — synthetic peptide reference standard for laboratory research. HPLC-verified purity. Batch-specific Certificate of Analysis available. Not for human or animal use.",
  purityBadge: "Batch-specific purity",
  href: "/products/retatrutide",
} as const;
