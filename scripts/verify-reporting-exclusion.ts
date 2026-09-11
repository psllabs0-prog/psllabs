import { loadEnvLocal } from "./_env";
import {
  listFinanceTransactionsNeedingSheetSync,
  sumBusinessGrossRevenueUsd,
} from "@/lib/finance/store";
import { getSql } from "@/lib/db/sql";
import { ensureFinanceSchema } from "@/lib/finance/schema";
import { getLedgerKpi } from "@/lib/ledger/store";

loadEnvLocal();

async function main() {
  await ensureFinanceSchema();
  const sql = getSql();

  const excluded = (await sql`
    SELECT psl_order_id, reporting_excluded, reporting_exclusion_reason, sheet_sync_error
    FROM finance_transactions
    WHERE psl_order_id IN (
      'psl_1787930970857_3jenqbhc',
      'psl_1788062270276_p52p38o8',
      'psl_1788327024394_5mkdfvn4'
    )
    ORDER BY psl_order_id
  `) as Array<{
    psl_order_id: string;
    reporting_excluded: boolean;
    reporting_exclusion_reason: string | null;
    sheet_sync_error: string | null;
  }>;

  const needing = await listFinanceTransactionsNeedingSheetSync(50);
  const business = await sumBusinessGrossRevenueUsd();
  const allGross = (await sql`
    SELECT COALESCE(SUM(gross_amount), 0) AS total FROM finance_transactions
  `) as { total: string | number }[];
  const kpi = await getLedgerKpi();

  console.log(
    JSON.stringify(
      {
        excludedRows: excluded,
        sheetRetryEligible: needing.map((t) => t.pslOrderId),
        businessGrossRevenueUsd: business,
        allFinanceGrossIncludingExcluded: Number(allGross[0]?.total ?? 0),
        ledgerKpiTotalRevenue: kpi.totalRevenue,
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
