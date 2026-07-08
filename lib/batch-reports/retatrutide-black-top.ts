import type { BatchReport } from "./types";
import { retatrutideSource } from "@/lib/products/retatrutide-source";

export const retatrutideBlackTopReport: BatchReport = {
  product: retatrutideSource.name,
  productHandle: retatrutideSource.handle,
  sku: retatrutideSource.sku,
  batch: "Black Top",
  taskNumber: "199788",
  laboratory: "Janoshik",
  manufacturer: "HXTNT",
  identityResult: "Retatrutide",
  nominalStrength: retatrutideSource.nominalStrength,
  reportedAmountMg: 13.03,
  purityPercent: 99.805,
  testingOrderedDate: "June 25, 2026",
  sampleReceivedDate: "July 1, 2026",
  analysisDate: "July 8, 2026",
  reportUrl: "/coas/Reta blacktop 10mg coa.png",
  verificationUrl: "https://janoshik.com/verify/",
  status: "report_available",
  reportAltText:
    "Janoshik laboratory test report for PSL Labs Retatrutide, Batch Black Top, Task Number 199788. Laboratory-reported identity Retatrutide, amount 13.03 mg, purity 99.805%. Analysis conducted July 8, 2026.",
};
