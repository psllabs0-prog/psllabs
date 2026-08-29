import { NextResponse } from "next/server";

import { verifyCronRequest } from "@/lib/cron/auth";
import { sendLowStockAlertEmail } from "@/lib/email/low-stock-alert";
import {
  getLowStockProducts,
  markLowStockAlertSent,
  shouldSendLowStockAlert,
} from "@/lib/inventory/store";
import { LOW_STOCK_THRESHOLD } from "@/lib/inventory/constants";
import { getActiveCatalogProducts } from "@/lib/products/catalog";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const authError = verifyCronRequest(request);
  if (authError) return authError;

  try {
    const activeHandles = new Set(
      getActiveCatalogProducts().map((p) => p.handle)
    );
    const lowStock = await getLowStockProducts(LOW_STOCK_THRESHOLD);

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const row of lowStock) {
      if (!activeHandles.has(row.handle)) {
        skipped += 1;
        continue;
      }

      if (!(await shouldSendLowStockAlert(row.handle))) {
        skipped += 1;
        continue;
      }

      try {
        await sendLowStockAlertEmail(row.handle, row.name, row.stock);
        await markLowStockAlertSent(row.handle);
        sent += 1;
      } catch (error) {
        failed += 1;
        const message =
          error instanceof Error ? error.message : "low stock email failed";
        console.error(
          `[cron/low-stock] failed for ${row.handle}:`,
          message
        );
      }
    }

    return NextResponse.json({
      ok: true,
      threshold: LOW_STOCK_THRESHOLD,
      candidates: lowStock.length,
      sent,
      failed,
      skipped,
    });
  } catch (error) {
    console.error("[cron/low-stock] job error:", error);
    return NextResponse.json({ error: "Job failed" }, { status: 500 });
  }
}
