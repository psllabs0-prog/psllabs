import {
  appendRevenueSheetRow,
  findSheetRowByOrderId,
  isGoogleSheetsConfigured,
  updateRevenueSheetRow,
} from "./google-sheets";
import {
  listFinanceTransactionsNeedingSheetSync,
  markFinanceSheetFailed,
  markFinanceSheetSkipped,
  markFinanceSheetSynced,
} from "./store";
import type { FinanceTransactionRow } from "./types";

function rowValues(tx: FinanceTransactionRow, syncedAt: string) {
  return {
    date: tx.eventTimestamp.slice(0, 10),
    pslOrderId: tx.pslOrderId,
    provider: tx.provider,
    providerPaymentId: tx.providerPaymentId ?? "",
    paymentMethod: tx.paymentMethod ?? "",
    grossRevenue: tx.grossAmount.toFixed(2),
    currency: tx.currency,
    products: tx.products ?? "",
    quantities: tx.quantities ?? "",
    utmSource: tx.utmSource ?? "",
    utmMedium: tx.utmMedium ?? "",
    campaign: tx.utmCampaign ?? "",
    creative: tx.utmContent ?? "",
    landingPage: tx.landingPage ?? "",
    syncStatus: "synced",
    lastSynced: syncedAt,
  };
}

export async function syncFinanceTransactionToSheet(
  tx: FinanceTransactionRow
): Promise<"synced" | "skipped" | "failed"> {
  if (!isGoogleSheetsConfigured()) {
    await markFinanceSheetSkipped(tx.id, "Google Sheets not configured");
    return "skipped";
  }

  try {
    const syncedAt = new Date().toISOString();
    const values = rowValues(tx, syncedAt);
    const existingRow = await findSheetRowByOrderId(tx.pslOrderId);
    if (existingRow) {
      await updateRevenueSheetRow(existingRow, values);
    } else {
      await appendRevenueSheetRow(values);
    }
    await markFinanceSheetSynced(tx.id);
    return "synced";
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Sheets sync failed";
    console.error(
      `[finance/sheets] sync failed for ${tx.pslOrderId}:`,
      message
    );
    await markFinanceSheetFailed(tx.id, message);
    return "failed";
  }
}

export async function syncPendingFinanceTransactionsToSheet(
  limit = 40
): Promise<{ synced: number; failed: number; skipped: number }> {
  const pending = await listFinanceTransactionsNeedingSheetSync(limit);
  let synced = 0;
  let failed = 0;
  let skipped = 0;

  for (const tx of pending) {
    const result = await syncFinanceTransactionToSheet(tx);
    if (result === "synced") synced += 1;
    else if (result === "failed") failed += 1;
    else skipped += 1;
  }

  return { synced, failed, skipped };
}
