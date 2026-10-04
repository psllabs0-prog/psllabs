// Node-only: never import this module from a client component.
import { createHash } from "node:crypto";
import type { Order } from "../orders/types";

export const OPENAI_PURCHASE_SOURCE_URL = "https://www.psllabs.org/success";
export const OPENAI_EVENT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const OPENAI_EVENT_MAX_FUTURE_MS = 10 * 60 * 1000;

/** A trusted database order read AFTER the provider-verified settlement succeeds. */
export type PaidOrderForAds = Pick<
  Order,
  "orderId" | "status" | "paidAt" | "currency" | "total"
>;

/** Deliberately excludes customer identifiers, addresses, IPs and product details. */
export type OpenAIOrderCreatedEvent = {
  id: string;
  type: "order_created";
  timestamp_ms: number;
  action_source: "web";
  source_url: typeof OPENAI_PURCHASE_SOURCE_URL;
  oppref?: string;
  opt_out: boolean;
  data: { type: "contents"; amount: number; currency: "USD" };
};

export type OpenAIEventInvalidReason =
  | "unpaid_order"
  | "invalid_order_id"
  | "invalid_paid_at"
  | "unsupported_currency"
  | "invalid_amount"
  | "invalid_event"
  | "invalid_oppref"
  | "invalid_clock"
  | "event_too_old"
  | "event_in_future";

export type OpenAIEventBuildResult =
  | { ok: true; event: OpenAIOrderCreatedEvent }
  | { ok: false; reason: OpenAIEventInvalidReason };

function timestampProblem(timestampMs: number, nowMs: number): OpenAIEventInvalidReason | null {
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) return "invalid_clock";
  if (!Number.isSafeInteger(timestampMs) || timestampMs < 0) return "invalid_paid_at";
  if (timestampMs < nowMs - OPENAI_EVENT_MAX_AGE_MS) return "event_too_old";
  if (timestampMs > nowMs + OPENAI_EVENT_MAX_FUTURE_MS) return "event_in_future";
  return null;
}

function hasValidOppref(oppref: unknown): oppref is string | undefined {
  // Check for a nonblank value, but forward its original bytes unchanged.
  return oppref === undefined || (typeof oppref === "string" && oppref.trim().length > 0);
}

/** Preserve this ID for every retry and any future browser copy of the same purchase. */
export function openAIOrderCreatedEventId(orderId: string): string {
  return `psl_order_created_${createHash("sha256").update(orderId, "utf8").digest("hex")}`;
}

/**
 * This builder does not verify payment. Its caller must use the settled database
 * order, never browser payment hints or an unsigned webhook payload.
 */
export function buildOpenAIOrderCreatedEvent(
  order: PaidOrderForAds,
  options: { oppref?: string; optOut?: boolean; nowMs?: number } = {},
): OpenAIEventBuildResult {
  if (order.status !== "paid" && order.status !== "shipped") {
    return { ok: false, reason: "unpaid_order" };
  }
  if (typeof order.orderId !== "string" || order.orderId.trim().length === 0) {
    return { ok: false, reason: "invalid_order_id" };
  }
  if (
    typeof order.paidAt !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(order.paidAt)
  ) {
    return { ok: false, reason: "invalid_paid_at" };
  }
  const timestampMs = Date.parse(order.paidAt);
  const problem = timestampProblem(timestampMs, options.nowMs ?? Date.now());
  if (problem) return { ok: false, reason: problem };
  // PSL checkout is USD. Do not silently apply cents to zero/three-decimal currencies.
  if (typeof order.currency !== "string" || order.currency.toUpperCase() !== "USD") {
    return { ok: false, reason: "unsupported_currency" };
  }
  const amount = Math.round(order.total * 100);
  if (
    !Number.isFinite(order.total) || order.total <= 0 ||
    !Number.isSafeInteger(amount) || amount <= 0 ||
    Math.abs(order.total - amount / 100) > 1e-9
  ) {
    return { ok: false, reason: "invalid_amount" };
  }
  if (!hasValidOppref(options.oppref)) return { ok: false, reason: "invalid_oppref" };
  if (options.optOut !== undefined && typeof options.optOut !== "boolean") {
    return { ok: false, reason: "invalid_event" };
  }
  return {
    ok: true,
    event: {
      id: openAIOrderCreatedEventId(order.orderId),
      type: "order_created",
      timestamp_ms: timestampMs,
      action_source: "web",
      source_url: OPENAI_PURCHASE_SOURCE_URL,
      ...(options.oppref === undefined ? {} : { oppref: options.oppref }),
      opt_out: options.optOut ?? true,
      data: { type: "contents", amount, currency: "USD" },
    },
  };
}

/** Revalidate persisted retry payloads and allowlist fields before transport. */
export function prepareOpenAIOrderCreatedEvent(
  event: OpenAIOrderCreatedEvent,
  nowMs: number = Date.now(),
): OpenAIEventBuildResult {
  if (
    !event || typeof event !== "object" ||
    typeof event.id !== "string" || !/^psl_order_created_[a-f0-9]{64}$/.test(event.id) ||
    event.type !== "order_created" || event.action_source !== "web" ||
    event.source_url !== OPENAI_PURCHASE_SOURCE_URL ||
    typeof event.opt_out !== "boolean" ||
    !event.data || event.data.type !== "contents" || event.data.currency !== "USD"
  ) return { ok: false, reason: "invalid_event" };
  const problem = timestampProblem(event.timestamp_ms, nowMs);
  if (problem) return { ok: false, reason: problem };
  if (!Number.isSafeInteger(event.data.amount) || event.data.amount <= 0) {
    return { ok: false, reason: "invalid_amount" };
  }
  if (!hasValidOppref(event.oppref)) return { ok: false, reason: "invalid_oppref" };
  return {
    ok: true,
    event: {
      id: event.id,
      type: "order_created",
      timestamp_ms: event.timestamp_ms,
      action_source: "web",
      source_url: OPENAI_PURCHASE_SOURCE_URL,
      ...(event.oppref === undefined ? {} : { oppref: event.oppref }),
      opt_out: event.opt_out,
      data: { type: "contents", amount: event.data.amount, currency: "USD" },
    },
  };
}
