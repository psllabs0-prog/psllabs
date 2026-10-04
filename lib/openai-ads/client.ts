// Server-only implementation: private configuration is read at call time.
import {
  prepareOpenAIOrderCreatedEvent,
  type OpenAIEventInvalidReason,
  type OpenAIOrderCreatedEvent,
} from "./events";

export type OpenAIAdsConfig = { pixelId: string; capiKey: string };
export type OpenAIAdsConfigResult =
  | { ok: true; config: OpenAIAdsConfig }
  | { ok: false; reason: "not_configured" | "invalid_configuration" };

function validateConfig(config: Partial<OpenAIAdsConfig>): OpenAIAdsConfigResult {
  if (!config.pixelId || !config.capiKey) return { ok: false, reason: "not_configured" };
  if (
    !/^[A-Za-z0-9_-]{1,256}$/.test(config.pixelId) ||
    !/^[\x21-\x7e]{1,4096}$/.test(config.capiKey)
  ) return { ok: false, reason: "invalid_configuration" };
  return { ok: true, config: { pixelId: config.pixelId, capiKey: config.capiKey } };
}

export function readOpenAIAdsConfig(
  environment: Record<string, string | undefined> = process.env,
): OpenAIAdsConfigResult {
  return validateConfig({
    pixelId: environment.OPENAI_ADS_PIXEL_ID,
    capiKey: environment.OPENAI_ADS_CAPI_KEY,
  });
}

/** Only sanitized codes may be recorded in the operations queue or logs. */
export type OpenAIAdsSendResult =
  | { ok: true; status: "accepted" | "validated"; httpStatus: number; eventId: string }
  | { ok: false; status: "skipped"; reason: "not_configured"; retryable: false }
  | {
      ok: false;
      status: "failed";
      reason: "invalid_configuration" | "server_only" | "invalid_timeout" |
        "http_error" | "timeout" | "transport_error" | OpenAIEventInvalidReason;
      retryable: boolean;
      httpStatus?: number;
    };

export type OpenAIAdsSendOptions = {
  config?: OpenAIAdsConfig;
  validateOnly?: boolean;
  nowMs?: number;
  timeoutMs?: number;
  /** Offline test seam. Production uses the server's fetch. */
  fetchImpl?: typeof fetch;
};

/**
 * Send one verified purchase; the caller owns durable retries. HTTP acceptance
 * does not prove attribution. validateOnly never saves or counts the event.
 */
export async function sendOpenAIOrderCreatedEvent(
  event: OpenAIOrderCreatedEvent,
  options: OpenAIAdsSendOptions = {},
): Promise<OpenAIAdsSendResult> {
  if (typeof window !== "undefined") {
    return { ok: false, status: "failed", reason: "server_only", retryable: false };
  }
  const configured = options.config ? validateConfig(options.config) : readOpenAIAdsConfig();
  if (!configured.ok) {
    return configured.reason === "not_configured"
      ? { ok: false, status: "skipped", reason: "not_configured", retryable: false }
      : { ok: false, status: "failed", reason: configured.reason, retryable: false };
  }
  const prepared = prepareOpenAIOrderCreatedEvent(event, options.nowMs ?? Date.now());
  if (!prepared.ok) {
    return { ok: false, status: "failed", reason: prepared.reason, retryable: false };
  }
  const timeoutMs = options.timeoutMs ?? 5000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 30000) {
    return { ok: false, status: "failed", reason: "invalid_timeout", retryable: false };
  }

  const controller = new AbortController();
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  // A bounded Promise also protects callers if a transport ignores AbortSignal.
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
      reject(new Error("OpenAI Ads transport timed out"));
    }, timeoutMs);
  });
  try {
    const endpoint = new URL("https://bzr.openai.com/v1/events");
    endpoint.searchParams.set("pid", configured.config.pixelId);
    const response = await Promise.race([
      (options.fetchImpl ?? fetch)(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${configured.config.capiKey}`,
          "Content-Type": "application/json",
        },
        // Never forward the bearer key to a redirect destination.
        redirect: "error",
        cache: "no-store",
        signal: controller.signal,
        body: JSON.stringify({
          validate_only: options.validateOnly === true,
          integration_source: "psl_labs_server",
          events: [prepared.event],
        }),
      }),
      timeout,
    ]);
    if (!response.ok) {
      return {
        ok: false,
        status: "failed",
        reason: "http_error",
        retryable: response.status === 408 || response.status === 429 || response.status >= 500,
        httpStatus: response.status,
      };
    }
    return {
      ok: true,
      status: options.validateOnly === true ? "validated" : "accepted",
      httpStatus: response.status,
      eventId: prepared.event.id,
    };
  } catch {
    // Provider bodies and exception messages can contain secrets/customer data.
    return {
      ok: false,
      status: "failed",
      reason: timedOut ? "timeout" : "transport_error",
      retryable: true,
    };
  } finally {
    clearTimeout(timer);
  }
}
