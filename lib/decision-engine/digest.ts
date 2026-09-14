import { createHash } from "node:crypto";

import {
  createSmtpTransport,
  emailPageWrapper,
  escapeHtml,
  FROM_EMAIL,
} from "@/lib/email/shared";

import { sortByPriorityThenConfidence } from "./confidence";
import { isLukeOwnerAttention } from "./owner-count";
import {
  listDecisionSignals,
  markDecisionSignalsNotified,
} from "./store";
import {
  getDecisionDigestRecipient,
  isDecisionDailyDigestEnabled,
} from "./thresholds";
import type { DecisionSignalRow } from "./types";

function hashFromRow(signal: DecisionSignalRow): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        priority: signal.priority,
        confidence: signal.confidence,
        evidence: signal.evidenceJson,
        recommendation: signal.recommendation,
      })
    )
    .digest("hex")
    .slice(0, 32);
}

function isOwnerRequiredOperational(signal: DecisionSignalRow): boolean {
  return (
    signal.signalType === "SOURCE_STALE" ||
    signal.signalType === "SOURCE_UNAVAILABLE" ||
    signal.signalType === "DATA_QUALITY" ||
    signal.signalType === "SYSTEM_HEALTH_RISK" ||
    signal.signalType === "PAYMENT_CHECKOUT" ||
    signal.signalType === "INVENTORY_DEMAND_RISK" ||
    signal.signalType === "FULFILLMENT_HOLDS" ||
    signal.area === "regulatory"
  );
}

function shouldNotify(signal: DecisionSignalRow): boolean {
  if (signal.status !== "active") return false;
  if (signal.priority === "P3") return false;

  const hash = hashFromRow(signal);
  const changed =
    !signal.lastNotifiedAt || signal.lastNotifiedEvidenceHash !== hash;

  if (signal.priority === "P0" || signal.priority === "P1") {
    return changed;
  }

  // P2: only Luke / regulatory_counsel, with moderate/high OR owner-required ops
  if (signal.priority === "P2") {
    if (!isLukeOwnerAttention(signal.recommendedOwner)) return false;
    if (
      signal.confidence !== "moderate" &&
      signal.confidence !== "high" &&
      !isOwnerRequiredOperational(signal)
    ) {
      return false;
    }
    return changed;
  }

  return false;
}

/** Pure helper for tests — notify eligibility without SMTP. */
export function decideDigestNotifications(
  signals: DecisionSignalRow[]
): DecisionSignalRow[] {
  return sortByPriorityThenConfidence(signals.filter(shouldNotify)).slice(0, 3);
}

export async function maybeSendDecisionDigest(): Promise<{
  sent: boolean;
  skippedReason?: string;
  notifiedKeys?: string[];
}> {
  if (!isDecisionDailyDigestEnabled()) {
    return {
      sent: false,
      skippedReason: "DECISION_DAILY_DIGEST_ENABLED is not true",
    };
  }

  const to = getDecisionDigestRecipient();
  if (!to) {
    return { sent: false, skippedReason: "digest recipient not configured" };
  }

  if (
    process.env.SUPPORT_TEST_MODE === "true" ||
    process.env.CEO_BRIEF_TEST_MODE === "true" ||
    process.env.DECISION_DIGEST_TEST_MODE === "true"
  ) {
    return { sent: false, skippedReason: "test mode" };
  }

  const active = await listDecisionSignals({
    statuses: ["active"],
    limit: 50,
  });
  const notify = decideDigestNotifications(active);
  if (notify.length === 0) {
    return {
      sent: false,
      skippedReason: "nothing changed / no P0–P2 to notify",
    };
  }

  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  if (!host || !user || !pass) {
    return { sent: false, skippedReason: "SMTP not configured" };
  }

  const items = notify
    .map(
      (s, i) =>
        `<p style="margin:0 0 12px;"><strong>${i + 1}. [${escapeHtml(s.priority)}] ${escapeHtml(s.title)}</strong><br/>` +
        `<span style="color:#9CA3AF;">${escapeHtml(s.recommendation)}</span></p>`
    )
    .join("");

  const html = emailPageWrapper(`
    <h1 style="margin:0 0 8px;font-size:18px;">PSL Labs Decision Digest</h1>
    <p style="margin:0 0 16px;color:#9CA3AF;">Owner decisions only — no customer/marketing content.</p>
    ${items}
    <p style="margin:16px 0 0;font-size:12px;color:#9CA3AF;">Does not execute refunds, POs, ad changes, inventory releases, or content publishing.</p>
  `);

  const transport = createSmtpTransport();
  await transport.sendMail({
    from: FROM_EMAIL,
    to,
    subject: `PSL Labs — ${notify.length} decision(s) need review`,
    html,
    text: notify
      .map((s, i) => `${i + 1}. [${s.priority}] ${s.title} — ${s.recommendation}`)
      .join("\n"),
  });

  await markDecisionSignalsNotified(
    notify.map((s) => ({
      signalKey: s.signalKey,
      evidenceHash: hashFromRow(s),
    }))
  );

  return {
    sent: true,
    notifiedKeys: notify.map((s) => s.signalKey),
  };
}
