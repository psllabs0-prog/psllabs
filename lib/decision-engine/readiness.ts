/**
 * Extended system readiness matrix for Decision Engine + /admin-ops.
 */

import { getRetentionReadiness } from "@/lib/retention/config";
import { getDiscordAdminStatusSafe } from "@/lib/discord/config";
import { collectOpsExceptions } from "@/lib/ops/exceptions";
import {
  collectOpsSystemStatuses,
  type OpsSystemStatus,
} from "@/lib/ops/status";
import { getLatestDecisionRun } from "./store";
import { getLatestCustomerIntelSnapshot } from "@/lib/customer-intelligence/signals-store";
import { getLatestCeoBrief } from "@/lib/ceo-brief/store";

export type SystemReadinessStatus =
  | "Healthy"
  | "Attention"
  | "Not configured"
  | "Intentionally disabled"
  | "Insufficient data";

export type SystemReadinessRow = {
  area: string;
  status: SystemReadinessStatus;
  detail: string | null;
};

const MS_DAY = 24 * 60 * 60 * 1000;

function ageDays(iso: string | null | undefined, asOf = new Date()): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return (asOf.getTime() - t) / MS_DAY;
}

function mapOps(s: OpsSystemStatus): SystemReadinessRow {
  return {
    area: s.area,
    status: s.status as SystemReadinessStatus,
    detail: s.detail,
  };
}

export async function collectSystemReadinessMatrix(): Promise<
  SystemReadinessRow[]
> {
  const exceptions = await collectOpsExceptions().catch(() => []);
  const base = await collectOpsSystemStatuses(exceptions).catch(() => []);

  const byArea = new Map(base.map((b) => [b.area, mapOps(b)]));

  const commerceAttention = exceptions.some(
    (e) =>
      !e.acknowledged &&
      (e.area === "finance" || /checkout|payment|order/i.test(e.sourceType))
  );
  byArea.set("Commerce", {
    area: "Commerce",
    status: commerceAttention ? "Attention" : "Healthy",
    detail: null,
  });

  const retention = getRetentionReadiness();
  byArea.set("Retention", {
    area: "Retention",
    status: !retention.autoSendEnabled
      ? "Intentionally disabled"
      : !retention.ready
        ? "Not configured"
        : "Healthy",
    detail: retention.ready
      ? null
      : retention.reasons.slice(0, 2).join("; "),
  });

  const fulfillAttention = exceptions.some(
    (e) => !e.acknowledged && e.area === "fulfillment"
  );
  byArea.set("Fulfillment", {
    area: "Fulfillment",
    status: fulfillAttention ? "Attention" : "Healthy",
    detail: null,
  });

  const meta = byArea.get("Meta");
  const tiktok = byArea.get("TikTok");
  const paidStates = [meta?.status, tiktok?.status].filter(Boolean);
  let paidStatus: SystemReadinessStatus = "Not configured";
  if (paidStates.every((s) => s === "Not configured")) {
    paidStatus = "Not configured";
  } else if (paidStates.some((s) => s === "Attention")) {
    paidStatus = "Attention";
  } else if (paidStates.some((s) => s === "Healthy")) {
    paidStatus = "Healthy";
  }
  byArea.set("Paid Acquisition", {
    area: "Paid Acquisition",
    status: paidStatus,
    detail: null,
  });

  const authAttention = exceptions.some(
    (e) =>
      !e.acknowledged &&
      (e.area === "seo" || /authority/i.test(e.sourceType))
  );
  const gsc = byArea.get("Search Console");
  byArea.set("Authority", {
    area: "Authority",
    status: authAttention
      ? "Attention"
      : gsc?.status === "Not configured"
        ? "Not configured"
        : gsc?.status === "Healthy"
          ? "Healthy"
          : "Attention",
    detail: null,
  });

  try {
    const snap = await getLatestCustomerIntelSnapshot();
    if (!snap) {
      byArea.set("Customer Intelligence", {
        area: "Customer Intelligence",
        status: "Insufficient data",
        detail: "No CI snapshot yet",
      });
    } else {
      const age = ageDays(snap.generatedAt);
      byArea.set("Customer Intelligence", {
        area: "Customer Intelligence",
        status: age != null && age > 10 ? "Attention" : "Healthy",
        detail:
          age != null && age > 10
            ? `Snapshot age ${age.toFixed(1)}d (>10d)`
            : snap.generatedAt,
      });
    }
  } catch {
    byArea.set("Customer Intelligence", {
      area: "Customer Intelligence",
      status: "Attention",
      detail: "CI snapshot retrieval failed",
    });
  }

  const discord = getDiscordAdminStatusSafe();
  byArea.set("Discord", {
    area: "Discord",
    status: !discord.enabled
      ? "Intentionally disabled"
      : !discord.ready
        ? "Not configured"
        : "Healthy",
    detail: !discord.enabled
      ? null
      : !discord.ready
        ? "Incomplete bot config"
        : discord.testMode
          ? "TEST MODE"
          : null,
  });

  try {
    const last = await getLatestDecisionRun();
    if (!last) {
      byArea.set("Decision Engine", {
        area: "Decision Engine",
        status: "Insufficient data",
        detail: null,
      });
    } else if (last.status === "error") {
      byArea.set("Decision Engine", {
        area: "Decision Engine",
        status: "Attention",
        detail: "Last run failed",
      });
    } else {
      const age = ageDays(last.completedAt);
      byArea.set("Decision Engine", {
        area: "Decision Engine",
        status: age != null && age > 2 ? "Attention" : "Healthy",
        detail:
          age != null && age > 2
            ? `No successful run in ${age.toFixed(1)}d`
            : last.completedAt,
      });
    }
  } catch {
    byArea.set("Decision Engine", {
      area: "Decision Engine",
      status: "Attention",
      detail: "Decision run status retrieval failed",
    });
  }

  // Always set CEO Brief explicitly (override ops base if present)
  try {
    const latest = await getLatestCeoBrief();
    if (!latest) {
      byArea.set("CEO Brief", {
        area: "CEO Brief",
        status: "Insufficient data",
        detail: "No CEO brief yet",
      });
    } else if (latest.emailSendLastError && !latest.emailSentAt) {
      byArea.set("CEO Brief", {
        area: "CEO Brief",
        status: "Attention",
        detail: "Email send error",
      });
    } else {
      byArea.set("CEO Brief", {
        area: "CEO Brief",
        status: "Healthy",
        detail: latest.generatedAt,
      });
    }
  } catch {
    byArea.set("CEO Brief", {
      area: "CEO Brief",
      status: "Attention",
      detail: "CEO brief retrieval failed",
    });
  }

  const order = [
    "Commerce",
    "Finance",
    "Inventory",
    "Support",
    "Retention",
    "Fulfillment",
    "Search Console",
    "Paid Acquisition",
    "Authority",
    "Customer Intelligence",
    "Discord",
    "Decision Engine",
    "CEO Brief",
  ];

  return order.map(
    (name) =>
      byArea.get(name) ?? {
        area: name,
        status: "Insufficient data" as SystemReadinessStatus,
        detail: null,
      }
  );
}
