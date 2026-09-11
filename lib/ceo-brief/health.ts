import {
  getLatestFinanceJobRun,
  listOpenReconciliationWarnings,
  listFinanceTransactionsNeedingSheetSync,
} from "@/lib/finance/store";
import { isGoogleSheetsConfigured } from "@/lib/finance/google-sheets";
import { getLatestJobRun as getLatestSupportJobRun } from "@/lib/support/store";

import type { CeoHealthSnapshot, CeoSupportSnapshot } from "./types";

export async function collectHealthSnapshot(input: {
  support: CeoSupportSnapshot;
}): Promise<CeoHealthSnapshot> {
  const warnings: string[] = [];

  const [financeJob, supportJob, openWarnings] = await Promise.all([
    getLatestFinanceJobRun("finance_reconciliation").catch(() => null),
    getLatestSupportJobRun().catch(() => null),
    listOpenReconciliationWarnings(10),
  ]);

  if (financeJob?.status === "error") {
    warnings.push(
      `Finance reconciliation failed: ${financeJob.error ?? "unknown"}`
    );
  }
  if (openWarnings.length > 0) {
    warnings.push(
      `${openWarnings.length} open finance reconciliation warning(s)`
    );
  }
  if (supportJob?.ok === false) {
    warnings.push(
      `Support inbox automation failed: ${supportJob.errorSummary ?? "unknown"}`
    );
  }
  for (const f of input.support.systemFailures) warnings.push(f);
  for (const a of input.support.automationIssues) warnings.push(a);

  if (isGoogleSheetsConfigured()) {
    try {
      const pending = await listFinanceTransactionsNeedingSheetSync(5);
      const failed = pending.filter((t) => t.sheetSyncStatus === "failed");
      if (failed.length > 0) {
        warnings.push(
          `Finance Sheets sync has ${failed.length}+ failed row(s)`
        );
      }
    } catch {
      // ignore optional sync probe failures
    }
  }

  return { warnings: [...new Set(warnings)] };
}
