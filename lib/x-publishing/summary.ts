import { getSql } from "@/lib/db/sql";

import { getXPublishingConfig, type XGate } from "./config";
import { X_ACCOUNT_HANDLE, X_ACCOUNT_ID, X_DISPLAY_LABELS, xPostUrl, type XDisplayState } from "./constants";
import { displayState, getControl, mapPost, type XControl } from "./records";
import { getXPublishingSchemaState } from "./schema";

export type XPublishingPanel = {
  accountId: string;
  handle: string;
  live: XGate;
  expectedAccount: XGate;
  initialized: boolean;
  missing: string[];
  control: XControl | null;
  accountMismatch: boolean;
  counts: Partial<Record<XDisplayState, number>> | null;
  attention: Array<{ queueId: string; label: string; xPostId: string | null; note: string | null }>;
  recent: Array<{
    queueId: string;
    displayState: XDisplayState;
    label: string;
    scheduledFor: string | null;
    xPostId: string | null;
    xUrl: string | null;
    verifiedAt: string | null;
    updatedAt: string;
  }>;
  note: string | null;
};

/** Read-only Mission Control view of the live (non-test) X queue. */
export async function readXPublishingPanel(now: Date): Promise<XPublishingPanel> {
  const config = getXPublishingConfig();
  const base: XPublishingPanel = {
    accountId: X_ACCOUNT_ID,
    handle: X_ACCOUNT_HANDLE,
    live: config.live,
    expectedAccount: config.expectedAccount,
    initialized: false,
    missing: [],
    control: null,
    accountMismatch: false,
    counts: null,
    attention: [],
    recent: [],
    note: null,
  };
  const schema = await getXPublishingSchemaState();
  if (!schema.initialized) {
    return { ...base, missing: schema.missing, note: "X queue tables not initialized (explicit migration required)." };
  }
  const sql = getSql();
  const rows = (await sql`
    SELECT * FROM x_publishing_posts
    WHERE is_test = false
    ORDER BY updated_at DESC
    LIMIT 100
  `) as Record<string, unknown>[];
  const posts = rows.map(mapPost);
  const control = await getControl();
  const counts: Partial<Record<XDisplayState, number>> = {};
  for (const p of posts) {
    const s = displayState(p, now);
    counts[s] = (counts[s] ?? 0) + 1;
  }
  const accountMismatch = control.paused && control.updatedBy === "x-publisher";
  return {
    ...base,
    initialized: true,
    control,
    accountMismatch,
    counts,
    attention: posts
      .filter((p) => p.status === "uncertain" || p.reviewRequired)
      .map((p) => ({
        queueId: p.id,
        label: p.status === "uncertain" ? X_DISPLAY_LABELS.uncertain : "Review required",
        xPostId: p.xPostId,
        note: p.lastErrorMessage,
      })),
    recent: posts
      .filter((p) => p.status !== "draft")
      .slice(0, 5)
      .map((p) => {
        const s = displayState(p, now);
        return {
          queueId: p.id,
          displayState: s,
          label: X_DISPLAY_LABELS[s],
          scheduledFor: p.scheduledFor,
          xPostId: p.xPostId,
          xUrl: p.xPostId ? xPostUrl(p.xPostId) : null,
          verifiedAt: p.verifiedAt,
          updatedAt: p.updatedAt,
        };
      }),
    note: posts.length === 0 ? "Queue empty — nothing scheduled (not a failure)." : null,
  };
}
