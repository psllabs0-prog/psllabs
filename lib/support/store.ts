import { getSql } from "@/lib/db/sql";

import type { MessageStatus, SupportCategory, SupportRiskLevel } from "./constants";
import { ensureSupportSchema } from "./schema";
import type {
  ClassificationResult,
  DraftResult,
  SupportEscalationRow,
  SupportMessageRow,
  SupportThreadRow,
} from "./types";

function mapMessage(row: Record<string, unknown>): SupportMessageRow {
  return {
    id: Number(row.id),
    threadId: Number(row.thread_id),
    providerMessageId: String(row.provider_message_id),
    fromEmail: String(row.from_email),
    subject: String(row.subject),
    receivedAt: new Date(String(row.received_at)).toISOString(),
    normalizedBody: String(row.normalized_body),
    status: row.status as MessageStatus,
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

export async function findMessageByProviderId(
  providerMessageId: string
): Promise<SupportMessageRow | null> {
  await ensureSupportSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT * FROM support_messages
    WHERE provider_message_id = ${providerMessageId}
    LIMIT 1
  `) as Record<string, unknown>[];
  return rows[0] ? mapMessage(rows[0]) : null;
}

export async function upsertThread(input: {
  threadKey: string;
  fromEmail: string;
  subject: string;
}): Promise<SupportThreadRow> {
  await ensureSupportSchema();
  const sql = getSql();
  const rows = (await sql`
    INSERT INTO support_threads (thread_key, from_email, subject)
    VALUES (${input.threadKey}, ${input.fromEmail}, ${input.subject})
    ON CONFLICT (thread_key) DO UPDATE SET
      subject = COALESCE(EXCLUDED.subject, support_threads.subject),
      updated_at = now()
    RETURNING *
  `) as Record<string, unknown>[];
  const row = rows[0];
  return {
    id: Number(row.id),
    threadKey: String(row.thread_key),
    fromEmail: String(row.from_email),
    subject: row.subject ? String(row.subject) : null,
    autoSendDisabled: Boolean(row.auto_send_disabled),
    status: String(row.status),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

export async function insertInboundMessage(input: {
  threadId: number;
  providerMessageId: string;
  fromEmail: string;
  subject: string;
  receivedAt: string;
  normalizedBody: string;
}): Promise<{ message: SupportMessageRow; inserted: boolean }> {
  await ensureSupportSchema();
  const existing = await findMessageByProviderId(input.providerMessageId);
  if (existing) return { message: existing, inserted: false };

  const sql = getSql();
  try {
    const rows = (await sql`
      INSERT INTO support_messages (
        thread_id, provider_message_id, from_email, subject,
        received_at, normalized_body, status
      ) VALUES (
        ${input.threadId},
        ${input.providerMessageId},
        ${input.fromEmail},
        ${input.subject},
        ${input.receivedAt},
        ${input.normalizedBody},
        'ingested'
      )
      RETURNING *
    `) as Record<string, unknown>[];
    return { message: mapMessage(rows[0]), inserted: true };
  } catch (error) {
    // Unique race → treat as duplicate.
    const again = await findMessageByProviderId(input.providerMessageId);
    if (again) return { message: again, inserted: false };
    throw error;
  }
}

export async function saveClassification(
  messageId: number,
  c: ClassificationResult
): Promise<void> {
  await ensureSupportSchema();
  const sql = getSql();
  await sql`
    INSERT INTO support_classifications (
      message_id, category, risk_level, confidence,
      reasons_json, auto_response_allowed
    ) VALUES (
      ${messageId},
      ${c.category},
      ${c.riskLevel},
      ${c.confidence},
      ${JSON.stringify(c.reasons)}::jsonb,
      ${c.autoResponseAllowed}
    )
    ON CONFLICT (message_id) DO UPDATE SET
      category = EXCLUDED.category,
      risk_level = EXCLUDED.risk_level,
      confidence = EXCLUDED.confidence,
      reasons_json = EXCLUDED.reasons_json,
      auto_response_allowed = EXCLUDED.auto_response_allowed
  `;
  await sql`
    UPDATE support_messages
    SET status = 'classified', updated_at = now()
    WHERE id = ${messageId}
  `;
}

export async function saveDraftResponse(
  messageId: number,
  draft: DraftResult
): Promise<number> {
  await ensureSupportSchema();
  const sql = getSql();
  const rows = (await sql`
    INSERT INTO support_responses (
      message_id, draft_body, knowledge_sources, ai_drafted,
      human_approved, policy_decision
    ) VALUES (
      ${messageId},
      ${draft.bodyText},
      ${JSON.stringify(draft.knowledgeSources)}::jsonb,
      ${draft.aiDrafted},
      false,
      ${draft.policyDecision}
    )
    RETURNING id
  `) as { id: number | string }[];
  await sql`
    UPDATE support_messages
    SET status = 'drafted', updated_at = now()
    WHERE id = ${messageId}
  `;
  return Number(rows[0].id);
}

export async function markResponseSent(input: {
  responseId: number;
  messageId: number;
  sentBody: string;
  humanApproved: boolean;
  status: Extract<MessageStatus, "auto_sent" | "human_sent">;
}): Promise<{ updated: boolean }> {
  await ensureSupportSchema();
  const sql = getSql();
  const rows = (await sql`
    UPDATE support_responses
    SET sent_body = ${input.sentBody},
        sent_at = now(),
        human_approved = ${input.humanApproved}
    WHERE id = ${input.responseId}
      AND sent_at IS NULL
    RETURNING id
  `) as { id: number | string }[];
  if (!rows[0]) {
    return { updated: false };
  }
  await sql`
    UPDATE support_messages
    SET status = ${input.status}, updated_at = now()
    WHERE id = ${input.messageId}
  `;
  return { updated: true };
}

export async function createEscalation(input: {
  messageId: number;
  riskLevel: SupportRiskLevel;
  reason: string;
}): Promise<{ id: number; created: boolean }> {
  await ensureSupportSchema();
  const sql = getSql();
  const existing = (await sql`
    SELECT id FROM support_escalations
    WHERE message_id = ${input.messageId}
      AND resolved_at IS NULL
    ORDER BY id DESC
    LIMIT 1
  `) as { id: number | string }[];
  if (existing[0]) {
    return { id: Number(existing[0].id), created: false };
  }

  const rows = (await sql`
    INSERT INTO support_escalations (message_id, risk_level, reason)
    VALUES (${input.messageId}, ${input.riskLevel}, ${input.reason})
    RETURNING id
  `) as { id: number | string }[];
  await sql`
    UPDATE support_messages
    SET status = 'escalated', updated_at = now()
    WHERE id = ${input.messageId}
      AND status NOT IN ('auto_sent', 'human_sent', 'resolved')
  `;
  return { id: Number(rows[0].id), created: true };
}

export async function markEscalationNotified(id: number): Promise<void> {
  await ensureSupportSchema();
  const sql = getSql();
  await sql`
    UPDATE support_escalations
    SET notified_at = now()
    WHERE id = ${id}
  `;
}

export async function setMessageStatus(
  messageId: number,
  status: MessageStatus
): Promise<void> {
  await ensureSupportSchema();
  const sql = getSql();
  await sql`
    UPDATE support_messages
    SET status = ${status}, updated_at = now()
    WHERE id = ${messageId}
  `;
}

export async function setThreadAutoSendDisabled(
  threadId: number,
  disabled: boolean
): Promise<void> {
  await ensureSupportSchema();
  const sql = getSql();
  await sql`
    UPDATE support_threads
    SET auto_send_disabled = ${disabled}, updated_at = now()
    WHERE id = ${threadId}
  `;
}

export async function resolveEscalation(escalationId: number): Promise<void> {
  await ensureSupportSchema();
  const sql = getSql();
  await sql`
    UPDATE support_escalations
    SET resolved_at = now()
    WHERE id = ${escalationId}
  `;
}

export async function markMessageResolved(messageId: number): Promise<void> {
  await ensureSupportSchema();
  const sql = getSql();
  await sql`
    UPDATE support_messages
    SET status = 'resolved', updated_at = now()
    WHERE id = ${messageId}
  `;
  await sql`
    UPDATE support_escalations
    SET resolved_at = COALESCE(resolved_at, now())
    WHERE message_id = ${messageId} AND resolved_at IS NULL
  `;
}

export async function updateClassificationManual(input: {
  messageId: number;
  category: SupportCategory;
  riskLevel: SupportRiskLevel;
}): Promise<void> {
  await ensureSupportSchema();
  const sql = getSql();
  await sql`
    UPDATE support_classifications
    SET category = ${input.category},
        risk_level = ${input.riskLevel},
        auto_response_allowed = false
    WHERE message_id = ${input.messageId}
  `;
}

export async function listSupportInbox(limit = 50): Promise<
  Array<{
    message: SupportMessageRow;
    thread: SupportThreadRow;
    category: string | null;
    riskLevel: string | null;
    confidence: number | null;
    draftBody: string | null;
    responseId: number | null;
    sentAt: string | null;
    escalation: SupportEscalationRow | null;
  }>
> {
  await ensureSupportSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT
      m.*,
      t.id AS t_id,
      t.thread_key,
      t.from_email AS t_from_email,
      t.subject AS t_subject,
      t.auto_send_disabled,
      t.status AS t_status,
      t.created_at AS t_created_at,
      t.updated_at AS t_updated_at,
      c.category,
      c.risk_level,
      c.confidence,
      r.id AS response_id,
      r.draft_body,
      r.sent_at,
      e.id AS escalation_id,
      e.risk_level AS e_risk_level,
      e.reason AS e_reason,
      e.notified_at AS e_notified_at,
      e.resolved_at AS e_resolved_at,
      e.created_at AS e_created_at
    FROM support_messages m
    JOIN support_threads t ON t.id = m.thread_id
    LEFT JOIN support_classifications c ON c.message_id = m.id
    LEFT JOIN LATERAL (
      SELECT * FROM support_responses
      WHERE message_id = m.id
      ORDER BY id DESC
      LIMIT 1
    ) r ON true
    LEFT JOIN LATERAL (
      SELECT * FROM support_escalations
      WHERE message_id = m.id
      ORDER BY id DESC
      LIMIT 1
    ) e ON true
    ORDER BY m.received_at DESC
    LIMIT ${limit}
  `) as Record<string, unknown>[];

  return rows.map((row) => ({
    message: mapMessage(row),
    thread: {
      id: Number(row.t_id),
      threadKey: String(row.thread_key),
      fromEmail: String(row.t_from_email),
      subject: row.t_subject ? String(row.t_subject) : null,
      autoSendDisabled: Boolean(row.auto_send_disabled),
      status: String(row.t_status),
      createdAt: new Date(String(row.t_created_at)).toISOString(),
      updatedAt: new Date(String(row.t_updated_at)).toISOString(),
    },
    category: row.category ? String(row.category) : null,
    riskLevel: row.risk_level ? String(row.risk_level) : null,
    confidence: row.confidence !== null && row.confidence !== undefined
      ? Number(row.confidence)
      : null,
    draftBody: row.draft_body ? String(row.draft_body) : null,
    responseId: row.response_id !== null && row.response_id !== undefined
      ? Number(row.response_id)
      : null,
    sentAt: row.sent_at
      ? new Date(String(row.sent_at)).toISOString()
      : null,
    escalation: row.escalation_id
      ? {
          id: Number(row.escalation_id),
          messageId: Number(row.id),
          riskLevel: String(row.e_risk_level) as SupportRiskLevel,
          reason: String(row.e_reason),
          notifiedAt: row.e_notified_at
            ? new Date(String(row.e_notified_at)).toISOString()
            : null,
          resolvedAt: row.e_resolved_at
            ? new Date(String(row.e_resolved_at)).toISOString()
            : null,
          createdAt: new Date(String(row.e_created_at)).toISOString(),
        }
      : null,
  }));
}

export async function getLatestDraft(
  messageId: number
): Promise<{ id: number; draftBody: string; sentAt: string | null } | null> {
  await ensureSupportSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT id, draft_body, sent_at
    FROM support_responses
    WHERE message_id = ${messageId}
    ORDER BY id DESC
    LIMIT 1
  `) as { id: number | string; draft_body: string; sent_at: string | null }[];
  if (!rows[0]) return null;
  return {
    id: Number(rows[0].id),
    draftBody: rows[0].draft_body,
    sentAt: rows[0].sent_at
      ? new Date(rows[0].sent_at).toISOString()
      : null,
  };
}

export async function getClassificationForMessage(messageId: number): Promise<{
  category: SupportCategory;
  riskLevel: SupportRiskLevel;
  confidence: number;
  autoResponseAllowed: boolean;
} | null> {
  await ensureSupportSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT category, risk_level, confidence, auto_response_allowed
    FROM support_classifications
    WHERE message_id = ${messageId}
    LIMIT 1
  `) as Array<{
    category: string;
    risk_level: string;
    confidence: number | string;
    auto_response_allowed: boolean;
  }>;
  if (!rows[0]) return null;
  return {
    category: rows[0].category as SupportCategory,
    riskLevel: rows[0].risk_level as SupportRiskLevel,
    confidence: Number(rows[0].confidence),
    autoResponseAllowed: Boolean(rows[0].auto_response_allowed),
  };
}

export async function getOpenEscalation(
  messageId: number
): Promise<SupportEscalationRow | null> {
  await ensureSupportSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT *
    FROM support_escalations
    WHERE message_id = ${messageId}
      AND resolved_at IS NULL
    ORDER BY id DESC
    LIMIT 1
  `) as Record<string, unknown>[];
  if (!rows[0]) return null;
  const row = rows[0];
  return {
    id: Number(row.id),
    messageId: Number(row.message_id),
    riskLevel: String(row.risk_level) as SupportRiskLevel,
    reason: String(row.reason),
    notifiedAt: row.notified_at
      ? new Date(String(row.notified_at)).toISOString()
      : null,
    resolvedAt: row.resolved_at
      ? new Date(String(row.resolved_at)).toISOString()
      : null,
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}

/** Messages with unsent drafts that previously failed (or still need send). */
export async function listRetryableCustomerSendMessages(limit = 25): Promise<
  Array<{
    message: SupportMessageRow;
    responseId: number;
    draftBody: string;
  }>
> {
  await ensureSupportSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT m.*, r.id AS response_id, r.draft_body
    FROM support_messages m
    JOIN LATERAL (
      SELECT id, draft_body, sent_at
      FROM support_responses
      WHERE message_id = m.id
      ORDER BY id DESC
      LIMIT 1
    ) r ON true
    WHERE m.status = 'failed'
      AND r.sent_at IS NULL
    ORDER BY m.updated_at ASC
    LIMIT ${limit}
  `) as Record<string, unknown>[];

  return rows.map((row) => ({
    message: mapMessage(row),
    responseId: Number(row.response_id),
    draftBody: String(row.draft_body),
  }));
}

export async function listUnnotifiedEscalations(limit = 25): Promise<
  Array<{
    escalation: SupportEscalationRow;
    message: SupportMessageRow;
    draftBody: string | null;
    category: string | null;
    confidence: number | null;
  }>
> {
  await ensureSupportSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT
      e.id AS e_id,
      e.message_id,
      e.risk_level AS e_risk_level,
      e.reason AS e_reason,
      e.notified_at AS e_notified_at,
      e.resolved_at AS e_resolved_at,
      e.created_at AS e_created_at,
      m.*,
      c.category,
      c.confidence,
      r.draft_body
    FROM support_escalations e
    JOIN support_messages m ON m.id = e.message_id
    LEFT JOIN support_classifications c ON c.message_id = m.id
    LEFT JOIN LATERAL (
      SELECT draft_body FROM support_responses
      WHERE message_id = m.id
      ORDER BY id DESC
      LIMIT 1
    ) r ON true
    WHERE e.resolved_at IS NULL
      AND e.notified_at IS NULL
    ORDER BY e.created_at ASC
    LIMIT ${limit}
  `) as Record<string, unknown>[];

  return rows.map((row) => ({
    escalation: {
      id: Number(row.e_id),
      messageId: Number(row.message_id),
      riskLevel: String(row.e_risk_level) as SupportRiskLevel,
      reason: String(row.e_reason),
      notifiedAt: null,
      resolvedAt: null,
      createdAt: new Date(String(row.e_created_at)).toISOString(),
    },
    message: mapMessage(row),
    draftBody: row.draft_body ? String(row.draft_body) : null,
    category: row.category ? String(row.category) : null,
    confidence:
      row.confidence !== null && row.confidence !== undefined
        ? Number(row.confidence)
        : null,
  }));
}

export async function getLatestJobRun(): Promise<{
  ok: boolean | null;
  errorSummary: string | null;
  finishedAt: string | null;
  failed: number;
} | null> {
  await ensureSupportSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT ok, error_summary, finished_at, failed
    FROM support_job_runs
    ORDER BY id DESC
    LIMIT 1
  `) as Array<{
    ok: boolean | null;
    error_summary: string | null;
    finished_at: string | null;
    failed: number;
  }>;
  if (!rows[0]) return null;
  return {
    ok: rows[0].ok,
    errorSummary: rows[0].error_summary,
    finishedAt: rows[0].finished_at
      ? new Date(rows[0].finished_at).toISOString()
      : null,
    failed: Number(rows[0].failed ?? 0),
  };
}

export async function getMessageWithThread(messageId: number): Promise<{
  message: SupportMessageRow;
  thread: SupportThreadRow;
} | null> {
  await ensureSupportSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT m.*, t.id AS t_id, t.thread_key, t.from_email AS t_from_email,
      t.subject AS t_subject, t.auto_send_disabled, t.status AS t_status,
      t.created_at AS t_created_at, t.updated_at AS t_updated_at
    FROM support_messages m
    JOIN support_threads t ON t.id = m.thread_id
    WHERE m.id = ${messageId}
    LIMIT 1
  `) as Record<string, unknown>[];
  if (!rows[0]) return null;
  const row = rows[0];
  return {
    message: mapMessage(row),
    thread: {
      id: Number(row.t_id),
      threadKey: String(row.thread_key),
      fromEmail: String(row.t_from_email),
      subject: row.t_subject ? String(row.t_subject) : null,
      autoSendDisabled: Boolean(row.auto_send_disabled),
      status: String(row.t_status),
      createdAt: new Date(String(row.t_created_at)).toISOString(),
      updatedAt: new Date(String(row.t_updated_at)).toISOString(),
    },
  };
}

export async function recordJobRun(
  summary: {
    ok: boolean;
    messagesChecked: number;
    newMessages: number;
    autoSent: number;
    escalated: number;
    failed: number;
    skipped: number;
    errorSummary?: string;
    details?: Record<string, unknown>;
  }
): Promise<void> {
  await ensureSupportSchema();
  const sql = getSql();
  await sql`
    INSERT INTO support_job_runs (
      finished_at, ok, messages_checked, new_messages, auto_sent,
      escalated, failed, skipped, error_summary, details_json
    ) VALUES (
      now(),
      ${summary.ok},
      ${summary.messagesChecked},
      ${summary.newMessages},
      ${summary.autoSent},
      ${summary.escalated},
      ${summary.failed},
      ${summary.skipped},
      ${summary.errorSummary ?? null},
      ${summary.details ? JSON.stringify(summary.details) : null}::jsonb
    )
  `;
}
