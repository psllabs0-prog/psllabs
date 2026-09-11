/**
 * Finance Phase 1 cleanup diagnostics (read-mostly).
 * Does NOT write Google Sheet rows.
 *
 * Usage: npx tsx scripts/diagnose-finance-cleanup.ts
 */
import { loadEnvLocal } from "./_env";
import { getSql } from "@/lib/db/sql";
import { ensureFinanceSchema } from "@/lib/finance/schema";
import {
  listFinanceTransactionsNeedingSheetSync,
  SHEETS_NOT_CONFIGURED_ERROR,
} from "@/lib/finance/store";
import { BTCPayProcessor } from "@/lib/payments/btcpay";
import { getOrder } from "@/lib/orders/store";

loadEnvLocal();

const KNOWN_ORDER_IDS = [
  "psl_1787930970857_3jenqbhc",
  "psl_1788062270276_p52p38o8",
  "psl_1788327024394_5mkdfvn4",
];

async function main() {
  await ensureFinanceSchema();
  const sql = getSql();

  console.log("=== Open BTCPay warnings ===");
  const warnings = (await sql`
    SELECT warning_key, warning_type, psl_order_id, message, status
    FROM finance_reconciliation_warnings
    WHERE status = 'open'
      AND provider = 'btcpay'
    ORDER BY created_at ASC
  `) as Array<{
    warning_key: string;
    warning_type: string;
    psl_order_id: string | null;
    message: string;
    status: string;
  }>;
  for (const w of warnings) {
    console.log(`- ${w.warning_key}: ${w.message}`);
  }
  if (!warnings.length) console.log("(none)");

  console.log("\n=== BTCPay invoice lookup with current BTCPAY_API_KEY ===");
  let btcpayOk = false;
  let btcpay: BTCPayProcessor | null = null;
  try {
    btcpay = new BTCPayProcessor();
    btcpayOk = true;
  } catch (error) {
    console.log(
      "BTCPay processor init failed:",
      error instanceof Error ? error.message : error
    );
  }

  const lookupResults: Array<{
    orderId: string;
    warningKey: string;
    ok: boolean;
    status?: string;
    error?: string;
  }> = [];

  for (const w of warnings) {
    const orderId = w.psl_order_id;
    if (!orderId || !btcpay) continue;
    const order = await getOrder(orderId);
    const invoiceId = order?.invoiceId;
    if (!invoiceId) {
      lookupResults.push({
        orderId,
        warningKey: w.warning_key,
        ok: false,
        error: "missing invoice id",
      });
      continue;
    }
    try {
      const invoice = await btcpay.getInvoiceStatus(invoiceId);
      lookupResults.push({
        orderId,
        warningKey: w.warning_key,
        ok: true,
        status: invoice.status,
      });
      console.log(
        `OK lookup order=${orderId} invoice=${invoiceId} status=${invoice.status}`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      lookupResults.push({
        orderId,
        warningKey: w.warning_key,
        ok: false,
        error: message,
      });
      console.log(`FAIL lookup order=${orderId}: ${message}`);
    }
  }

  console.log("\n=== Known finance rows (Sheet eligibility) ===");
  for (const orderId of KNOWN_ORDER_IDS) {
    const rows = (await sql`
      SELECT psl_order_id, sheet_sync_status, sheet_sync_error, gross_amount, provider
      FROM finance_transactions
      WHERE psl_order_id = ${orderId}
      LIMIT 1
    `) as Array<{
      psl_order_id: string;
      sheet_sync_status: string;
      sheet_sync_error: string | null;
      gross_amount: string | number;
      provider: string;
    }>;
    const row = rows[0];
    if (!row) {
      console.log(`${orderId}: NO finance_transactions row`);
      continue;
    }
    const eligibleSkipped =
      row.sheet_sync_status === "skipped" &&
      row.sheet_sync_error === SHEETS_NOT_CONFIGURED_ERROR;
    const eligible =
      row.sheet_sync_status === "pending" ||
      row.sheet_sync_status === "failed" ||
      eligibleSkipped;
    console.log(
      `${orderId}: status=${row.sheet_sync_status} error=${JSON.stringify(row.sheet_sync_error)} provider=${row.provider} amount=${row.gross_amount} sheetRetryEligible=${eligible}`
    );
  }

  const needing = await listFinanceTransactionsNeedingSheetSync(50);
  console.log("\n=== All rows currently eligible for Sheet retry ===");
  for (const tx of needing) {
    console.log(
      `${tx.pslOrderId} status=${tx.sheetSyncStatus} error=${JSON.stringify(tx.sheetSyncError)}`
    );
  }
  if (!needing.length) console.log("(none)");

  console.log("\n=== Test-order signal ===");
  console.log(
    "No durable test-order marker found on orders (no is_test / QA metadata). Do not auto-classify by amount."
  );

  console.log("\n=== JSON summary ===");
  console.log(
    JSON.stringify(
      {
        btcpayProcessorInitOk: btcpayOk,
        openBtcpayWarnings: warnings.length,
        lookupResults,
        sheetRetryEligibleOrderIds: needing.map((t) => t.pslOrderId),
        knownOrderIds: KNOWN_ORDER_IDS,
        sheetsConfigured: Boolean(
          process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim()
        ),
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
