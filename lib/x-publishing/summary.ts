import { getSql } from "@/lib/db/sql";

import { getXPublishingConfig, type XGate } from "./config";
import { X_ACCOUNT_HANDLE, X_ACCOUNT_ID, X_DISPLAY_LABELS, xPostUrl, type XDisplayState } from "./constants";
import { foldTally, readOnlySnapshot, recentQuery, sectionPageQuery, tallyQuery } from "./reads";
import { displayState, getControl, mapPost, type XControl } from "./records";
import { getXPublishingSchemaState } from "./schema";

/** Attention rows listed in Mission Control; the total is always exact and links to /admin-social for the rest. */
export const X_PANEL_ATTENTION_LIMIT = 20;
export const X_PANEL_RECENT_LIMIT = 5;

export type XPublishingPanel = {
  accountId: string;
  handle: string;
  live: XGate;
  expectedAccount: XGate;
  initialized: boolean;
  missing: string[];
  control: XControl | null;
  accountMismatch: boolean;
  /** Exact counts over all live items (not a window). */
  counts: Partial<Record<XDisplayState, number>> | null;
  totalPosts: number;
  /** Exact number of unresolved live items (uncertain, review required, or dispatched past deadline without a result). */
  attentionTotal: number;
  /** Oldest unresolved first, at most X_PANEL_ATTENTION_LIMIT; see attentionTotal. */
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
    totalPosts: 0,
    attentionTotal: 0,
    attention: [],
    recent: [],
    note: null,
  };
  const schema = await getXPublishingSchemaState();
  if (!schema.initialized) {
    return { ...base, missing: schema.missing, note: "X queue tables not initialized (explicit migration required)." };
  }
  const sql = getSql();
  const at = now.toISOString();
  const [tallyRows, attentionRows, recentRows] = await readOnlySnapshot(sql, [
    tallyQuery(sql, false, at),
    sectionPageQuery(sql, false, at, "review", X_PANEL_ATTENTION_LIMIT, 0),
    recentQuery(sql, false, at, X_PANEL_RECENT_LIMIT),
  ]);
  const tally = foldTally(tallyRows);
  const control = await getControl();
  const accountMismatch = control.paused && control.updatedBy === "x-publisher";
  return {
    ...base,
    initialized: true,
    control,
    accountMismatch,
    counts: tally.counts,
    totalPosts: tally.total,
    attentionTotal: tally.sections.review,
    attention: attentionRows.map(mapPost).map((p) => {
      const s = displayState(p, now);
      return {
        queueId: p.id,
        label: s === "uncertain" ? X_DISPLAY_LABELS.uncertain : `Review required — ${X_DISPLAY_LABELS[s]}`,
        xPostId: p.xPostId,
        note: p.lastErrorMessage ?? (s === "uncertain" ? "Dispatched past its deadline with no recorded result." : null),
      };
    }),
    recent: recentRows.map(mapPost).map((p) => {
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
    note: tally.total === 0 ? "Queue empty — nothing scheduled (not a failure)." : null,
  };
}
