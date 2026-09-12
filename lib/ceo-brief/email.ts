import {
  createSmtpTransport,
  emailPageWrapper,
  escapeHtml,
  FROM_EMAIL,
  money,
} from "@/lib/email/shared";

import type { CeoWeeklyBrief } from "./types";

const DEFAULT_TO = "support@psllabs.org";

function actionLines(brief: CeoWeeklyBrief): string {
  if (brief.actions.length === 0) {
    return "<p style=\"margin:0 0 8px;\">No high-priority personal actions this week.</p>";
  }
  return brief.actions
    .map(
      (a) =>
        `<p style="margin:0 0 10px;"><strong>${a.rank}. ${escapeHtml(a.action)}</strong><br/>` +
        `<span style="color:#9CA3AF;">${escapeHtml(a.why)}</span>` +
        (a.urgency
          ? `<br/><span style="color:#2FB6E0;">${escapeHtml(a.urgency)}</span>`
          : "") +
        `</p>`
    )
    .join("");
}

export function formatCeoBriefEmailSubject(brief: CeoWeeklyBrief): string {
  const day = brief.periodLabel.split("→")[1]?.trim() || brief.periodLabel;
  return `PSL Labs Weekly CEO Brief — ${day}`;
}

export function formatCeoBriefEmailHtml(brief: CeoWeeklyBrief): string {
  const exec = brief.executiveSummary
    .map((b) => `<li style="margin:0 0 6px;">${escapeHtml(b)}</li>`)
    .join("");

  const sales = `<p style="margin:0 0 8px;">Orders ${brief.sales.legitimateOrders} · Gross ${money(brief.sales.grossRevenueUsd)} · Units ${brief.sales.unitsSold}` +
    (brief.sales.aovUsd != null ? ` · AOV ${money(brief.sales.aovUsd)}` : "") +
    `</p>`;

  const inv =
    brief.inventory.lowStockAlerts.length ||
    brief.inventory.reorderReviewSignals.length
      ? `<p style="margin:0 0 8px;">Sellable total ${brief.inventory.sellableUnitsTotal} · Low-stock ${brief.inventory.lowStockAlerts.length} · Reorder review ${brief.inventory.reorderReviewSignals.length} · Awaiting testing lots ${brief.inventory.awaitingTestingLots}</p>`
      : `<p style="margin:0 0 8px;">Sellable total ${brief.inventory.sellableUnitsTotal}. No urgent inventory flags.</p>`;

  const support = `<p style="margin:0 0 8px;">Genuine ${brief.support.genuineCustomerMessages} (G${brief.support.green}/Y${brief.support.yellow}/R${brief.support.red}) · ${escapeHtml(brief.support.unresolvedEscalationsLabel)}: ${brief.support.unresolvedEscalations} · Spam ${brief.support.spamSolicitations} · Vendor ${brief.support.vendorSolicitations}</p>`;

  const health =
    brief.health.warnings.length > 0
      ? `<ul>${brief.health.warnings
          .slice(0, 5)
          .map((w) => `<li>${escapeHtml(w)}</li>`)
          .join("")}</ul>`
      : `<p style="margin:0 0 8px;color:#9CA3AF;">No system warnings surfaced.</p>`;

  const inner = `
    <h1 style="margin:0 0 4px;font-size:20px;">PSL Labs Weekly CEO Brief</h1>
    <p style="margin:0 0 16px;color:#9CA3AF;">${escapeHtml(brief.periodLabel)} · Generated ${escapeHtml(brief.generatedAt)}</p>
    <h2 style="margin:16px 0 8px;font-size:15px;">Executive summary</h2>
    <ul style="margin:0 0 12px;padding-left:18px;">${exec || "<li>No meaningful changes recorded.</li>"}</ul>
    <h2 style="margin:16px 0 8px;font-size:15px;">Sales / Finance</h2>
    ${sales}
    <p style="margin:0 0 8px;color:#9CA3AF;">${escapeHtml(brief.acquisition.message)}</p>
    <h2 style="margin:16px 0 8px;font-size:15px;">Inventory</h2>
    ${inv}
    <h2 style="margin:16px 0 8px;font-size:15px;">Customer / Support</h2>
    ${support}
    <h2 style="margin:16px 0 8px;font-size:15px;">SEO / Authority</h2>
    <p style="margin:0 0 8px;color:#9CA3AF;">${escapeHtml(brief.seo.message)}</p>
    ${
      brief.seo.status === "available"
        ? `<p style="margin:0 0 8px;">Clicks ${brief.seo.clicks ?? 0}${brief.seo.clicksChangeNote ? ` (${escapeHtml(brief.seo.clicksChangeNote)})` : ""} · Impressions ${brief.seo.impressions ?? 0}${brief.seo.impressionsChangeNote ? ` (${escapeHtml(brief.seo.impressionsChangeNote)})` : ""} · Non-brand clicks ${brief.seo.nonBrandClicks ?? 0} · Non-brand impressions ${brief.seo.nonBrandImpressions ?? 0} · CTR ${brief.seo.ctr == null ? "—" : `${(brief.seo.ctr * 100).toFixed(2)}%`} · Avg position ${brief.seo.averagePosition == null ? "—" : brief.seo.averagePosition.toFixed(1)}</p>
    ${
      brief.seo.pagesGaining.length > 0
        ? `<p style="margin:0 0 8px;">Pages gaining: ${escapeHtml(brief.seo.pagesGaining.slice(0, 3).join(", "))}</p>`
        : ""
    }
    ${
      brief.seo.queryChanges.length > 0
        ? `<p style="margin:0 0 8px;">Queries gaining: ${escapeHtml(brief.seo.queryChanges.slice(0, 3).join(", "))}</p>`
        : ""
    }`
        : ""
    }
    <h2 style="margin:16px 0 8px;font-size:15px;">System health</h2>
    ${health}
    <h2 style="margin:16px 0 8px;font-size:15px;">Three actions for Luke</h2>
    ${actionLines(brief)}
    <p style="margin:20px 0 0;font-size:12px;color:#9CA3AF;">Decision brief only — does not execute refunds, POs, ad changes, or inventory releases.</p>
  `;

  return emailPageWrapper(inner);
}

export async function sendCeoBriefEmail(
  brief: CeoWeeklyBrief
): Promise<{ sent: boolean; skippedReason?: string }> {
  if (process.env.SUPPORT_TEST_MODE === "true" || process.env.CEO_BRIEF_TEST_MODE === "true") {
    console.log("[ceo-brief/email] TEST MODE skip send");
    return { sent: true };
  }

  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  if (!host || !user || !pass) {
    return { sent: false, skippedReason: "SMTP not configured" };
  }

  const to = process.env.ORDER_NOTIFICATION_EMAIL?.trim() || DEFAULT_TO;
  const transport = createSmtpTransport();
  await transport.sendMail({
    from: FROM_EMAIL,
    to,
    subject: formatCeoBriefEmailSubject(brief),
    html: formatCeoBriefEmailHtml(brief),
    text: [
      `PSL Labs Weekly CEO Brief — ${brief.periodLabel}`,
      "",
      ...brief.executiveSummary.map((b) => `• ${b}`),
      "",
      "Actions:",
      ...brief.actions.map(
        (a) => `${a.rank}. ${a.action} — ${a.why}${a.urgency ? ` (${a.urgency})` : ""}`
      ),
    ].join("\n"),
  });

  return { sent: true };
}
