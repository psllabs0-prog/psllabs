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
  price: 69.99,
  stockStatus: "in_stock" satisfies StockStatus,
  description:
    "Lyophilized research peptide for laboratory and in vitro use. Independent batch documentation available for selected lots.",
  shortDescription:
    "Investigational triple-receptor agonist for laboratory research. Not approved for human use.",
  purityBadge: "Batch-specific purity",
  href: "/products/retatrutide",
} as const;
