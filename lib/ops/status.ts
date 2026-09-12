import {
  getSearchConsoleConnectorStatus,
  getSearchConsoleProperty,
} from "@/lib/external-metrics/search-console";
import {
  countSearchConsoleRows,
  getLatestExternalMetricSyncRun,
  getLatestSuccessfulExternalMetricSyncRun,
} from "@/lib/external-metrics/store";
import { getAllPaidProviderStatuses } from "@/lib/external-metrics/paid/providers";
import {
  getLatestFinanceJobRun,
  listOpenReconciliationWarnings,
} from "@/lib/finance/store";
import { getLatestJobRun as getLatestSupportJobRun } from "@/lib/support/store";
import { getLatestCeoBrief } from "@/lib/ceo-brief/store";
import { getSql } from "@/lib/db/sql";

import type { OpsException } from "./types";

export type OpsSystemStatusValue = "Healthy" | "Attention" | "Not configured";

export type OpsSystemStatus = {
  area: string;
  status: OpsSystemStatusValue;
  detail: string | null;
};

export async function collectOpsSystemStatuses(
  exceptions: OpsException[]
): Promise<OpsSystemStatus[]> {
  const open = exceptions.filter((e) => !e.acknowledged);

  const financeAttention = open.some((e) => e.area === "finance");
  const inventoryAttention = open.some((e) => e.area === "inventory");
  const supportAttention = open.some((e) => e.area === "support");
  const ceoAttention = open.some((e) => e.area === "ceo");

  let finance: OpsSystemStatus = {
    area: "Finance",
    status: financeAttention ? "Attention" : "Healthy",
    detail: null,
  };
  try {
    const [job, warnings] = await Promise.all([
      getLatestFinanceJobRun("finance_reconciliation"),
      listOpenReconciliationWarnings(1),
    ]);
    if (job?.status === "error" || warnings.length > 0) {
      finance = {
        area: "Finance",
        status: "Attention",
        detail: job?.status === "error" ? "Job failed" : "Open warnings",
      };
    }
  } catch {
    // keep
  }

  let inventory: OpsSystemStatus = {
    area: "Inventory",
    status: inventoryAttention ? "Attention" : "Healthy",
    detail: null,
  };
  try {
    const sql = getSql();
    const snap = (await sql`
      SELECT MAX(snapshot_date)::text AS d FROM inventory_monitor_snapshots
    `) as Array<{ d: string | null }>;
    if (!snap[0]?.d) {
      inventory = {
        area: "Inventory",
        status: "Healthy",
        detail: "No snapshots yet (Day-0 OK)",
      };
    }
  } catch {
    // keep
  }

  let support: OpsSystemStatus = {
    area: "Support",
    status: supportAttention ? "Attention" : "Healthy",
    detail: null,
  };
  try {
    const job = await getLatestSupportJobRun();
    if (job?.ok === false) {
      support = {
        area: "Support",
        status: "Attention",
        detail: "Inbox job failed",
      };
    }
  } catch {
    // keep
  }

  let ceo: OpsSystemStatus = {
    area: "CEO Brief",
    status: ceoAttention ? "Attention" : "Healthy",
    detail: null,
  };
  try {
    const latest = await getLatestCeoBrief();
    if (latest?.emailSendLastError && !latest.emailSentAt) {
      ceo = {
        area: "CEO Brief",
        status: "Attention",
        detail: "Email send error",
      };
    }
  } catch {
    // keep
  }

  let gsc: OpsSystemStatus = {
    area: "Search Console",
    status: "Not configured",
    detail: null,
  };
  try {
    const [rows, last, lastOk] = await Promise.all([
      countSearchConsoleRows(),
      getLatestExternalMetricSyncRun("search_console"),
      getLatestSuccessfulExternalMetricSyncRun("search_console"),
    ]);
    const connector = getSearchConsoleConnectorStatus({
      lastError: last?.status === "error" ? last.errorSummary : null,
      hasRows: rows > 0,
    });
    if (connector.status === "not_configured") {
      gsc = {
        area: "Search Console",
        status: "Not configured",
        detail: getSearchConsoleProperty(),
      };
    } else if (connector.status === "error" || last?.status === "error") {
      gsc = {
        area: "Search Console",
        status: "Attention",
        detail: (last?.errorSummary ?? connector.message).slice(0, 80),
      };
    } else if (lastOk || rows > 0) {
      gsc = {
        area: "Search Console",
        status: "Healthy",
        detail: lastOk?.completedAt ?? null,
      };
    } else {
      gsc = {
        area: "Search Console",
        status: "Attention",
        detail: "Configured — awaiting successful sync",
      };
    }
  } catch {
    // keep
  }

  const paid = await getAllPaidProviderStatuses().catch(() => []);
  const meta = paid.find((p) => p.provider === "meta");
  const tiktok = paid.find((p) => p.provider === "tiktok");

  return [
    finance,
    inventory,
    support,
    ceo,
    gsc,
    {
      area: "Meta",
      status:
        !meta || meta.state === "not_configured"
          ? "Not configured"
          : meta.state === "error"
            ? "Attention"
            : meta.state === "healthy"
              ? "Healthy"
              : "Attention",
      detail: meta?.message ?? null,
    },
    {
      area: "TikTok",
      status:
        !tiktok || tiktok.state === "not_configured"
          ? "Not configured"
          : tiktok.state === "error"
            ? "Attention"
            : tiktok.state === "healthy"
              ? "Healthy"
              : "Attention",
      detail: tiktok?.message ?? null,
    },
  ];
}
