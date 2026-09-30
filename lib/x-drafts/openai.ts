import { X_DRAFT_LIMITS } from "./constants";

/**
 * OpenAI Chat Completions contract for the draft assistant. The n8n workflow
 * performs the same request and routing in its node expressions; the mocked
 * tests evaluate those expressions against this module on the same fixtures,
 * and the opt-in live-model test uses it directly.
 */
export const X_DRAFT_OPENAI_ENDPOINT = "https://api.openai.com/v1/chat/completions";
export const X_DRAFT_OPENAI_MODEL = "gpt-4o-mini";
export const X_DRAFT_OPENAI_MAX_COMPLETION_TOKENS = 2000;

export function buildOpenAIRequestBody(p: {
  model: string;
  maxCompletionTokens: number;
  prompt: { system: string; user: string };
  outputSchema: unknown;
}) {
  return {
    model: p.model,
    messages: [
      { role: "system", content: p.prompt.system },
      { role: "user", content: p.prompt.user },
    ],
    max_completion_tokens: p.maxCompletionTokens,
    n: 1,
    stream: false,
    store: false,
    temperature: 0.3,
    response_format: { type: "json_schema", json_schema: p.outputSchema },
  };
}

/** One HTTP attempt: a status and parsed body, or a transport-level failure (timeout, connection, unparsable body). */
export type OpenAIAttempt = { statusCode: number; body: unknown } | { transportError: string };

export type OpenAISubmission = {
  model: string;
  stopReason: string;
  usage: { inputTokens: number | null; outputTokens: number | null };
  modelOutput: string;
};

export type OpenAIDecision =
  | { action: "submit"; submission: OpenAISubmission }
  | { action: "retry"; reason: string }
  | { action: "stop"; reason: string };

/** Transient statuses. 429 is retried only for request/token rate limits, never for credit, quota, or spend limits. */
const RETRYABLE_STATUS = new Set([408, 500, 502, 503, 504]);

type ErrorBody = { error?: { code?: unknown; type?: unknown } };
type CompletionBody = {
  model?: unknown;
  choices?: Array<{ finish_reason?: unknown; message?: { content?: unknown; refusal?: unknown } }>;
  usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
};

function tokens(v: unknown): number | null {
  return Number.isInteger(v) ? (v as number) : null;
}

export function isRetryableOpenAIFailure(attempt: OpenAIAttempt): boolean {
  if (!("statusCode" in attempt)) return true;
  if (RETRYABLE_STATUS.has(attempt.statusCode)) return true;
  if (attempt.statusCode !== 429) return false;
  const e = (attempt.body as ErrorBody | null)?.error;
  if (!e || e.type === "insufficient_quota") return false;
  return e.code === "rate_limit_exceeded" || (!e.code && (e.type === "requests" || e.type === "tokens"));
}

/**
 * Only a single complete, non-refused completion from the configured model
 * becomes a submission. Refusals, truncation (finish_reason "length"),
 * content-filtered or otherwise incomplete output, and substituted models stop
 * the run with nothing saved.
 */
export function decideOpenAIAttempt(attempt: OpenAIAttempt, configuredModel: string): OpenAIDecision {
  if (!("statusCode" in attempt)) return { action: "retry", reason: `transport failure: ${attempt.transportError}` };
  if (attempt.statusCode !== 200) {
    const e = (attempt.body as ErrorBody | null)?.error;
    const detail = `HTTP ${attempt.statusCode}${e ? `: ${String(e.code || e.type || "error")}` : ""}`;
    return isRetryableOpenAIFailure(attempt) ? { action: "retry", reason: detail } : { action: "stop", reason: detail };
  }
  const body = (attempt.body ?? {}) as CompletionBody;
  const choices = Array.isArray(body.choices) ? body.choices : [];
  if (choices.length !== 1 || !choices[0]?.message) return { action: "stop", reason: `expected exactly one choice, got ${choices.length}` };
  const choice = choices[0];
  const message = choice.message!;
  if (message.refusal) return { action: "stop", reason: `the model refused: ${String(message.refusal).slice(0, 200)}` };
  if (choice.finish_reason === "length") return { action: "stop", reason: "output truncated at max_completion_tokens" };
  if (choice.finish_reason === "content_filter") return { action: "stop", reason: "output incomplete (content filter)" };
  if (choice.finish_reason !== "stop") return { action: "stop", reason: `finish_reason ${String(choice.finish_reason)}` };
  if (typeof body.model !== "string" || !body.model.startsWith(configuredModel)) {
    return { action: "stop", reason: `unexpected model ${String(body.model)}` };
  }
  const content = message.content;
  if (typeof content !== "string" || content.trim() === "") return { action: "stop", reason: "no content" };
  if (content.length > X_DRAFT_LIMITS.maxModelOutputChars) return { action: "stop", reason: "content exceeds the submission limit" };
  return {
    action: "submit",
    submission: {
      model: body.model,
      stopReason: "stop",
      usage: { inputTokens: tokens(body.usage?.prompt_tokens), outputTokens: tokens(body.usage?.completion_tokens) },
      modelOutput: content,
    },
  };
}
